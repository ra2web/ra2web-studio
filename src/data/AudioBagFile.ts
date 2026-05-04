import { DataStream } from './DataStream'
import { IdxFile, type IdxEntry } from './IdxFile'

export function getAudioBagChannelCount(entry: IdxEntry): number {
  return (entry.flags & 0x01) !== 0 ? 2 : 1
}

export function getAudioBagEncoding(entry: IdxEntry): 'PCM 16-bit' | 'IMA ADPCM' | 'Unknown' {
  if ((entry.flags & 0x02) !== 0) return 'PCM 16-bit'
  if ((entry.flags & 0x08) !== 0) return 'IMA ADPCM'
  return 'Unknown'
}

function createBytes(source: DataStream | Uint8Array): Uint8Array {
  if (source instanceof DataStream) {
    source.seek(0)
    const bytes = new Uint8Array(source.byteLength)
    bytes.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength))
    return bytes
  }
  return source
}

function ensureBagRange(bytes: Uint8Array, entry: IdxEntry): void {
  const end = entry.offset + entry.length
  if (entry.offset < 0 || entry.length < 0 || end > bytes.byteLength) {
    throw new Error(`${entry.filename}: IDX entry points outside BAG data`)
  }
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function getIdxStem(filename: string): string {
  const lower = filename.toLowerCase()
  return lower.endsWith('.wav') ? filename.slice(0, -4) : filename
}

function writeFixedAscii(bytes: Uint8Array, offset: number, value: string, length: number): void {
  const actualLength = Math.min(value.length, length)
  for (let i = 0; i < actualLength; i++) {
    bytes[offset + i] = value.charCodeAt(i) & 0xff
  }
}

export class AudioBagFile {
  private readonly bagBytes: Uint8Array
  private readonly idx: IdxFile

  constructor(bagSource: DataStream | Uint8Array, idx: IdxFile) {
    this.bagBytes = createBytes(bagSource)
    this.idx = idx
  }

  getEntries(): IdxEntry[] {
    return this.idx.getEntries()
  }

  containsFile(filename: string): boolean {
    return this.idx.entries.has(filename)
  }

  private resolveEntry(filenameOrEntry: string | IdxEntry): IdxEntry {
    const entry = typeof filenameOrEntry === 'string'
      ? this.idx.entries.get(filenameOrEntry)
      : filenameOrEntry
    if (!entry) {
      throw new Error(`Audio entry "${filenameOrEntry}" not found`)
    }
    return entry
  }

  private getRawEntrySlice(filenameOrEntry: string | IdxEntry): Uint8Array {
    const entry = this.resolveEntry(filenameOrEntry)
    ensureBagRange(this.bagBytes, entry)
    return this.bagBytes.subarray(entry.offset, entry.offset + entry.length)
  }

  getRawEntryBytes(filenameOrEntry: string | IdxEntry): Uint8Array {
    return cloneBytes(this.getRawEntrySlice(filenameOrEntry))
  }

  buildSplitPackage(entries: IdxEntry[]): { idxBytes: Uint8Array; bagBytes: Uint8Array } {
    const headerSize = 12
    const idxEntrySize = 36
    const bagByteLength = entries.reduce((sum, entry) => {
      ensureBagRange(this.bagBytes, entry)
      return sum + entry.length
    }, 0)
    if (bagByteLength > 0xffffffff) {
      throw new Error('拆分后的 BAG 超过 4GB，无法写入 IDX 偏移')
    }

    const idxBytes = new Uint8Array(headerSize + entries.length * idxEntrySize)
    const bagBytes = new Uint8Array(bagByteLength)
    const view = new DataView(idxBytes.buffer)

    writeFixedAscii(idxBytes, 0, 'GABA', 4)
    view.setInt32(4, 2, true)
    view.setInt32(8, entries.length, true)

    let idxOffset = headerSize
    let bagOffset = 0
    for (const entry of entries) {
      const rawBytes = this.getRawEntrySlice(entry)
      writeFixedAscii(idxBytes, idxOffset, getIdxStem(entry.filename).slice(0, 16), 16)
      idxOffset += 16
      view.setUint32(idxOffset, bagOffset >>> 0, true)
      idxOffset += 4
      view.setUint32(idxOffset, rawBytes.byteLength >>> 0, true)
      idxOffset += 4
      view.setUint32(idxOffset, entry.sampleRate >>> 0, true)
      idxOffset += 4
      view.setUint32(idxOffset, entry.flags >>> 0, true)
      idxOffset += 4
      view.setUint32(idxOffset, entry.chunkSize >>> 0, true)
      idxOffset += 4
      bagBytes.set(rawBytes, bagOffset)
      bagOffset += rawBytes.byteLength
    }

    return { idxBytes, bagBytes }
  }

  buildWavBytes(filenameOrEntry: string | IdxEntry): Uint8Array {
    const entry = typeof filenameOrEntry === 'string'
      ? this.idx.entries.get(filenameOrEntry)
      : filenameOrEntry
    if (!entry) {
      throw new Error(`Audio entry "${filenameOrEntry}" not found`)
    }
    return this.buildWavData(entry)
  }

  private buildWavData(entry: IdxEntry): Uint8Array {
    ensureBagRange(this.bagBytes, entry)

    const channels = getAudioBagChannelCount(entry)
    const encoding = getAudioBagEncoding(entry)
    const data = this.bagBytes.subarray(entry.offset, entry.offset + entry.length)
    const stream = new DataStream()

    if (encoding === 'PCM 16-bit') {
      stream.writeString('RIFF')
      stream.writeUint32(entry.length + 36)
      stream.writeString('WAVE')
      stream.writeString('fmt ')
      stream.writeUint32(16)
      stream.writeUint16(1)
      stream.writeUint16(channels)
      stream.writeUint32(entry.sampleRate)
      stream.writeUint32(2 * channels * entry.sampleRate)
      stream.writeUint16(2 * channels)
      stream.writeUint16(16)
      stream.writeString('data')
      stream.writeUint32(entry.length)
      stream.writeUint8Array(data)
      return stream.toUint8Array()
    }

    if (encoding === 'IMA ADPCM') {
      const chunkSize = Math.max(1, entry.chunkSize)
      const blockCount = Math.max(2, Math.ceil(entry.length / chunkSize))
      const paddedDataLength = blockCount * chunkSize
      const sampleCount = 1017 * blockCount
      const byteRate = 11100 * channels * Math.max(1, Math.floor(entry.sampleRate / 22050))

      stream.writeString('RIFF')
      stream.writeUint32(52 + paddedDataLength)
      stream.writeString('WAVE')
      stream.writeString('fmt ')
      stream.writeUint32(20)
      stream.writeUint16(17)
      stream.writeUint16(channels)
      stream.writeUint32(entry.sampleRate)
      stream.writeUint32(byteRate)
      stream.writeUint16(chunkSize)
      stream.writeUint16(4)
      stream.writeUint16(2)
      stream.writeUint16(1017)
      stream.writeString('fact')
      stream.writeUint32(4)
      stream.writeUint32(sampleCount)
      stream.writeString('data')
      stream.writeUint32(paddedDataLength)
      stream.writeUint8Array(data)
      for (let i = entry.length; i < paddedDataLength; i++) {
        stream.writeUint8(0)
      }
      return stream.toUint8Array()
    }

    if (
      data.byteLength >= 4
      && data[0] === 0x52
      && data[1] === 0x49
      && data[2] === 0x46
      && data[3] === 0x46
    ) {
      const copy = new Uint8Array(data.byteLength)
      copy.set(data)
      return copy
    }

    throw new Error(`${entry.filename}: unsupported BAG audio flags 0x${entry.flags.toString(16)}`)
  }
}
