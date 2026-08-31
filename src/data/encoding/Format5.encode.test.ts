import { describe, expect, it } from 'vitest'
import { Format5 } from './Format5'
import { Format80 } from './Format80'
import { MiniLzo } from './MiniLzo'

function roundtripLzo(bytes: Uint8Array): Uint8Array {
  const packed = MiniLzo.compress(bytes)
  return MiniLzo.decompress(packed, bytes.length)
}

describe('MiniLzo.compress', () => {
  it.each([
    0, 1, 2, 3, 4, 17, 18, 238, 239, 8192,
  ])('round-trips %s bytes', (length) => {
    const input = new Uint8Array(length)
    for (let i = 0; i < length; i++) input[i] = (i * 13 + 7) & 0xff
    const output = roundtripLzo(input)
    expect(Array.from(output)).toEqual(Array.from(input))
  })
})

describe('Format80.encode', () => {
  it('round-trips overlay-sized empty plane prefix', () => {
    const input = new Uint8Array(1024)
    input.fill(0xff)
    const packed = Format80.encode(input)
    const output = Format80.decode(packed, input.length)
    expect(Array.from(output)).toEqual(Array.from(input))
  })
})

describe('Format5.encode', () => {
  it('round-trips LZO sections', () => {
    const input = new Uint8Array(9000)
    for (let i = 0; i < input.length; i++) input[i] = i & 0xff
    const packed = Format5.encode(input, 5)
    const output = Format5.decode(packed, input.length, 5)
    expect(Array.from(output)).toEqual(Array.from(input))
  })

  it('round-trips Format80 overlay sections', () => {
    const input = new Uint8Array(1 << 18)
    input.fill(0xff)
    input[100] = 102
    input[101] = 103
    const packed = Format5.encode(input, 80)
    const output = Format5.decode(packed, input.length, 80)
    expect(output[100]).toBe(102)
    expect(output[101]).toBe(103)
    expect(output[0]).toBe(0xff)
  })
})
