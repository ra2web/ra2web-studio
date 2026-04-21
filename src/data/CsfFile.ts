import { DataStream } from './DataStream'
import { VirtualFile } from './vfs/VirtualFile'

const CSF_HEADER_SIZE = 24
// Tag constants are compared against readUint32() (little-endian stream).
// These values match XCC fourcc style literals: 'CSF ', 'LBL ', 'STR ', 'STRW'.
const CSF_MAGIC = 0x43534620
const CSF_LABEL_MAGIC = 0x4c424c20
const CSF_STRING_MAGIC = 0x53545220
const CSF_STRING_W_MAGIC = 0x53545257
const MAX_REASONABLE_LABELS = 500000
const MAX_REASONABLE_STRING_CHARS = 10 * 1024 * 1024

export enum CsfLanguage {
  EnglishUS = 0,
  EnglishUK = 1,
  German = 2,
  French = 3,
  Spanish = 4,
  Italian = 5,
  Japanese = 6,
  Jabberwockie = 7,
  Korean = 8,
  Unknown = 9,
  ChineseCN = 100,
  ChineseTW = 101,
}

export interface CsfEntry {
  key: string
  value: string
  extraValue?: string
}

/**
 * 编辑器使用的可写 draft 形态：从 CsfFile 解析后克隆得到，编辑期间维护脏状态比较，
 * 保存时再交给 CsfEncoder 重新编码成原始 CSF 字节。
 */
export interface CsfDraft {
  version: number
  language: CsfLanguage
  entries: CsfEntry[]
}

export interface CsfStats {
  declaredLabels: number
  declaredValues: number
  parsedLabels: number
}

const CSF_LANGUAGE_NAME: Record<number, string> = {
  [CsfLanguage.EnglishUS]: 'English (US)',
  [CsfLanguage.EnglishUK]: 'English (UK)',
  [CsfLanguage.German]: 'German',
  [CsfLanguage.French]: 'French',
  [CsfLanguage.Spanish]: 'Spanish',
  [CsfLanguage.Italian]: 'Italian',
  [CsfLanguage.Japanese]: 'Japanese',
  [CsfLanguage.Jabberwockie]: 'Jabberwockie',
  [CsfLanguage.Korean]: 'Korean',
  [CsfLanguage.Unknown]: 'Unknown',
  [CsfLanguage.ChineseCN]: 'Chinese (Simplified)',
  [CsfLanguage.ChineseTW]: 'Chinese (Traditional)',
}

function ensureRemaining(stream: DataStream, bytes: number, context: string): void {
  if (bytes < 0 || stream.position + bytes > stream.byteLength) {
    throw new Error(`Invalid CSF: ${context} exceeds file bounds`)
  }
}

function decodeUtf16XorBytes(input: Uint8Array): string {
  if (input.length % 2 !== 0) {
    throw new Error('Invalid CSF: string byte length must be even')
  }
  let out = ''
  for (let i = 0; i < input.length; i += 2) {
    const lo = (~input[i]) & 0xff
    const hi = (~input[i + 1]) & 0xff
    out += String.fromCharCode(lo | (hi << 8))
  }
  return out
}

function autoDetectLanguage(data: Record<string, string>, language: CsfLanguage): CsfLanguage {
  if (language !== CsfLanguage.Unknown && language !== CsfLanguage.EnglishUS) return language
  const intro = data['THEME:INTRO']
  if (intro === '開場') return CsfLanguage.ChineseTW
  if (intro === '开场') return CsfLanguage.ChineseCN
  return language
}

export function csfLanguageName(language: number): string {
  return CSF_LANGUAGE_NAME[language] ?? `Unknown (${language})`
}

export class CsfFile {
  public filename = ''
  public version = 0
  public language: CsfLanguage = CsfLanguage.Unknown
  public entries: CsfEntry[] = []
  public data: Record<string, string> = {}
  public stats: CsfStats = {
    declaredLabels: 0,
    declaredValues: 0,
    parsedLabels: 0,
  }

  static fromVirtualFile(file: VirtualFile): CsfFile {
    const parsed = new CsfFile()
    parsed.parseVirtualFile(file)
    return parsed
  }

  constructor(file?: VirtualFile) {
    if (file) {
      this.parseVirtualFile(file)
    }
  }

  get languageName(): string {
    return csfLanguageName(this.language)
  }

  public parseVirtualFile(file: VirtualFile): void {
    this.filename = file.filename
    this.entries = []
    this.data = {}
    this.language = CsfLanguage.Unknown
    this.version = 0
    this.stats = {
      declaredLabels: 0,
      declaredValues: 0,
      parsedLabels: 0,
    }

    const stream = file.stream as DataStream
    stream.seek(0)
    ensureRemaining(stream, CSF_HEADER_SIZE, 'header')

    const magic = stream.readUint32()
    if (magic !== CSF_MAGIC) {
      throw new Error('Invalid CSF: bad magic')
    }

    this.version = stream.readInt32()
    const declaredLabels = stream.readInt32()
    const declaredValues = stream.readInt32()
    stream.readInt32() // unused/reserved
    this.language = stream.readInt32() as CsfLanguage

    if (
      declaredLabels < 0
      || declaredValues < 0
      || declaredLabels > MAX_REASONABLE_LABELS
      || declaredValues > MAX_REASONABLE_LABELS
    ) {
      throw new Error('Invalid CSF: unreasonable label/value count')
    }

    this.stats.declaredLabels = declaredLabels
    this.stats.declaredValues = declaredValues

    for (let i = 0; i < declaredLabels; i++) {
      ensureRemaining(stream, 12, `label header #${i}`)
      const labelMagic = stream.readUint32()
      if (labelMagic !== CSF_LABEL_MAGIC) {
        throw new Error(`Invalid CSF: expected LBL record at index ${i}`)
      }

      const pairCount = stream.readInt32()
      const keyLength = stream.readInt32()
      if (pairCount < 0 || keyLength < 0) {
        throw new Error(`Invalid CSF: negative label metadata at index ${i}`)
      }

      ensureRemaining(stream, keyLength, `label key #${i}`)
      const key = stream.readString(keyLength).toUpperCase()

      let value = ''
      let extraValue: string | undefined

      for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
        ensureRemaining(stream, 8, `string pair header #${i}:${pairIndex}`)
        const valueMagic = stream.readUint32()
        const charLength = stream.readInt32()
        if (charLength < 0 || charLength > MAX_REASONABLE_STRING_CHARS) {
          throw new Error(`Invalid CSF: invalid char length at label ${i}, pair ${pairIndex}`)
        }

        const byteLength = charLength * 2
        ensureRemaining(stream, byteLength, `string body #${i}:${pairIndex}`)
        const rawBytes = stream.readUint8Array(byteLength)
        const decodedValue = decodeUtf16XorBytes(rawBytes)

        let decodedExtraValue: string | undefined
        if (valueMagic === CSF_STRING_W_MAGIC) {
          ensureRemaining(stream, 4, `STRW extra length #${i}:${pairIndex}`)
          const extraLength = stream.readInt32()
          if (extraLength < 0) {
            throw new Error(`Invalid CSF: negative STRW extra length at label ${i}, pair ${pairIndex}`)
          }
          ensureRemaining(stream, extraLength, `STRW extra body #${i}:${pairIndex}`)
          decodedExtraValue = extraLength > 0 ? stream.readString(extraLength) : ''
        } else if (valueMagic !== CSF_STRING_MAGIC) {
          // 非标准 value magic，保持兼容：按普通字符串读取后继续，不额外报错中断。
        }

        if (pairIndex === 0) {
          value = decodedValue
          extraValue = decodedExtraValue
        }
      }

      const entry: CsfEntry = { key, value }
      if (typeof extraValue === 'string' && extraValue.length > 0) {
        entry.extraValue = extraValue
      }
      this.entries.push(entry)
      this.data[key] = value
    }

    this.stats.parsedLabels = this.entries.length
    this.language = autoDetectLanguage(this.data, this.language)
  }
}

