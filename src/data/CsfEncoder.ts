import { DataStream } from './DataStream'
import type { CsfEntry, CsfLanguage } from './CsfFile'

/**
 * 把内存里的 CSF draft 编码回原始 CSF 字节，对称 [src/data/CsfFile.ts](src/data/CsfFile.ts)
 * 的解析逻辑：
 *
 * 文件头 24 字节（小端）：
 *   uint32 magic = 0x43534620（XCC 风格 fourcc 'CSF '；磁盘字节序为 ' FSC'）
 *   int32  version            // 通常为 3
 *   int32  numLabels          // 我们一律 = entries.length
 *   int32  numStrings         // 我们一律 = entries.length（每个 label 1 个 string pair）
 *   int32  reserved = 0
 *   int32  language           // CsfLanguage 枚举值
 *
 * 每条 label：
 *   uint32 magic = 0x4c424c20 ('LBL ')
 *   int32  pairCount = 1
 *   int32  keyLength
 *   bytes  key（ASCII，逐字节 charCodeAt & 0xFF；与解析侧 readString 对齐；写出前已 toUpperCase）
 *
 * 每条 string pair：
 *   uint32 magic：有 extraValue → 0x53545257 ('STRW')；否则 → 0x53545220 ('STR ')
 *   int32  charLength = value.length（UTF-16 code units 数；非字节数）
 *   bytes  body（charLength*2 字节，UTF-16LE，每字节 XOR 0xFF；与 decodeUtf16XorBytes 反向）
 *   STRW 额外：
 *     int32 extraLength（字节数，ASCII byte length）
 *     bytes extra（ASCII，不 XOR；与解析侧 readString(extraLength) 对齐）
 */

const CSF_MAGIC = 0x43534620
const CSF_LABEL_MAGIC = 0x4c424c20
const CSF_STRING_MAGIC = 0x53545220
const CSF_STRING_W_MAGIC = 0x53545257

export interface CsfEncodeArgs {
  /** 头里的 version 字段，通常 3 */
  version: number
  /** 头里的 language 枚举值 */
  language: CsfLanguage
  /** 待编码的 entries；key 会被入口 toUpperCase()；不允许重复 key */
  entries: CsfEntry[]
}

export class CsfEncoder {
  static encode(args: CsfEncodeArgs): Uint8Array {
    // 1) key 规范化 + 重复检测
    const seen = new Set<string>()
    const normalized: Array<CsfEntry & { _keyBytes: number; _valueChars: number; _extraBytes: number }> = []
    for (const entry of args.entries) {
      const upperKey = (entry.key ?? '').toUpperCase()
      if (!upperKey) {
        throw new Error('CsfEncoder: empty CSF key')
      }
      if (seen.has(upperKey)) {
        throw new Error(`CsfEncoder: duplicate CSF key "${upperKey}"`)
      }
      seen.add(upperKey)
      const value = entry.value ?? ''
      const extra = entry.extraValue
      normalized.push({
        ...entry,
        key: upperKey,
        value,
        extraValue: extra,
        _keyBytes: upperKey.length, // ASCII 1 字节/字符
        _valueChars: value.length,  // UTF-16 code units
        _extraBytes: typeof extra === 'string' ? extra.length : 0,
      })
    }

    // 2) 预算总字节数，一次性分配缓冲，避免 DataStream 多次扩容
    const HEADER_SIZE = 24
    const LABEL_FIXED = 12 // magic(4) + pairCount(4) + keyLength(4)
    const STR_FIXED = 8    // magic(4) + charLength(4)
    let total = HEADER_SIZE
    for (const e of normalized) {
      total += LABEL_FIXED + e._keyBytes
      total += STR_FIXED + e._valueChars * 2
      if (typeof e.extraValue === 'string') {
        total += 4 + e._extraBytes // extraLength(4) + extra bytes
      }
    }

    const stream = new DataStream(new ArrayBuffer(total))
    stream.endianness = DataStream.LITTLE_ENDIAN

    // 3) 文件头
    stream.writeUint32(CSF_MAGIC)
    stream.writeInt32(args.version)
    stream.writeInt32(normalized.length) // numLabels
    stream.writeInt32(normalized.length) // numStrings (每 label 1 个 pair)
    stream.writeInt32(0)
    stream.writeInt32(args.language as number)

    // 4) 每条 label + 1 string pair
    for (const e of normalized) {
      stream.writeUint32(CSF_LABEL_MAGIC)
      stream.writeInt32(1) // pairCount
      stream.writeInt32(e._keyBytes)
      // ASCII key；用 writeString 默认 ASCII 路径（每字符 1 字节，charCodeAt & 0xFF）
      stream.writeString(e.key)

      const isStrw = typeof e.extraValue === 'string'
      stream.writeUint32(isStrw ? CSF_STRING_W_MAGIC : CSF_STRING_MAGIC)
      stream.writeInt32(e._valueChars)

      // UTF-16LE + XOR 0xFF（与解析侧 decodeUtf16XorBytes 反向）
      const encoded = encodeUtf16XorBytes(e.value)
      stream.writeUint8Array(encoded)

      if (isStrw) {
        stream.writeInt32(e._extraBytes)
        if (e._extraBytes > 0) {
          // ASCII extra；与解析侧 readString(extraLength) 对齐
          stream.writeString(e.extraValue as string)
        }
      }
    }

    // 5) 完整切片返回
    if (stream.position !== total) {
      throw new Error(
        `CsfEncoder: position mismatch (wrote ${stream.position}, expected ${total})`,
      )
    }
    return new Uint8Array(stream.buffer, 0, total)
  }
}

/**
 * 把字符串按 UTF-16LE 拆 lo/hi 两个字节，每个字节 XOR 0xFF。
 * 严格对应 [src/data/CsfFile.ts](src/data/CsfFile.ts) 里的 decodeUtf16XorBytes 反向。
 */
function encodeUtf16XorBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const lo = code & 0xff
    const hi = (code >> 8) & 0xff
    out[i * 2] = (~lo) & 0xff
    out[i * 2 + 1] = (~hi) & 0xff
  }
  return out
}
