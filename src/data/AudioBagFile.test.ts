import { describe, expect, it } from 'vitest'
import { DataStream } from './DataStream'
import { AudioBagFile, getAudioBagEncoding } from './AudioBagFile'
import { IdxFile } from './IdxFile'

function writeFixedName(stream: DataStream, name: string): void {
  stream.writeString(name, undefined, 16)
}

function makeIdxBytes(args: {
  name: string
  offset: number
  length: number
  sampleRate: number
  flags: number
  chunkSize: number
}): Uint8Array {
  const stream = new DataStream()
  stream.writeString('GABA')
  stream.writeInt32(2)
  stream.writeInt32(1)
  writeFixedName(stream, args.name)
  stream.writeUint32(args.offset)
  stream.writeUint32(args.length)
  stream.writeUint32(args.sampleRate)
  stream.writeUint32(args.flags)
  stream.writeUint32(args.chunkSize)
  return stream.toUint8Array()
}

describe('AudioBagFile', () => {
  it('parses IDX entries and wraps PCM BAG data as WAV', () => {
    const idx = new IdxFile(makeIdxBytes({
      name: 'sound01',
      offset: 0,
      length: 4,
      sampleRate: 22050,
      flags: 0x02,
      chunkSize: 0,
    }))
    const bag = new AudioBagFile(new Uint8Array([0, 0, 1, 0]), idx)
    const entry = idx.getEntries()[0]
    const wav = bag.buildWavBytes(entry)
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

    expect(entry.filename).toBe('sound01.wav')
    expect(getAudioBagEncoding(entry)).toBe('PCM 16-bit')
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe('WAVE')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(22050)
    expect(view.getUint32(40, true)).toBe(4)
  })

  it('wraps IMA ADPCM BAG data with a WAV fact chunk and padded data size', () => {
    const idx = new IdxFile(makeIdxBytes({
      name: 'adpcm01',
      offset: 0,
      length: 5,
      sampleRate: 22050,
      flags: 0x08,
      chunkSize: 4,
    }))
    const bag = new AudioBagFile(new Uint8Array([1, 2, 3, 4, 5]), idx)
    const entry = idx.getEntries()[0]
    const wav = bag.buildWavBytes(entry)
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

    expect(getAudioBagEncoding(entry)).toBe('IMA ADPCM')
    expect(view.getUint16(20, true)).toBe(17)
    expect(view.getUint16(34, true)).toBe(4)
    expect(view.getUint16(38, true)).toBe(1017)
    expect(new TextDecoder().decode(wav.slice(40, 44))).toBe('fact')
    expect(new TextDecoder().decode(wav.slice(52, 56))).toBe('data')
    expect(view.getUint32(56, true)).toBe(8)
    expect(wav.byteLength).toBe(68)
  })

  it('builds a split IDX/BAG package with sequential offsets', () => {
    const idxStream = new DataStream()
    idxStream.writeString('GABA')
    idxStream.writeInt32(2)
    idxStream.writeInt32(2)
    writeFixedName(idxStream, 'first')
    idxStream.writeUint32(2)
    idxStream.writeUint32(3)
    idxStream.writeUint32(22050)
    idxStream.writeUint32(0x02)
    idxStream.writeUint32(0)
    writeFixedName(idxStream, 'second')
    idxStream.writeUint32(6)
    idxStream.writeUint32(2)
    idxStream.writeUint32(44100)
    idxStream.writeUint32(0x03)
    idxStream.writeUint32(8)

    const idx = new IdxFile(idxStream.toUint8Array())
    const bag = new AudioBagFile(new Uint8Array([9, 9, 1, 2, 3, 9, 4, 5]), idx)
    const [first, second] = idx.getEntries()
    const split = bag.buildSplitPackage([second, first])
    const splitIdx = new IdxFile(split.idxBytes)
    const splitEntries = splitIdx.getEntries()

    expect(Array.from(split.bagBytes)).toEqual([4, 5, 1, 2, 3])
    expect(splitEntries.map((entry) => entry.filename)).toEqual(['second.wav', 'first.wav'])
    expect(splitEntries.map((entry) => entry.offset)).toEqual([0, 2])
    expect(splitEntries.map((entry) => entry.length)).toEqual([2, 3])
    expect(splitEntries.map((entry) => entry.sampleRate)).toEqual([44100, 22050])
    expect(splitEntries.map((entry) => entry.flags)).toEqual([0x03, 0x02])
    expect(splitEntries.map((entry) => entry.chunkSize)).toEqual([8, 0])
  })
})
