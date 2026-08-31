import { describe, expect, it } from 'vitest'
import { blitIndexedToRgba } from './shpBlit'

describe('blitIndexedToRgba', () => {
  it('skips color index 0 and writes palette RGB', () => {
    const palette = new Uint8Array(768)
    palette[3] = 10
    palette[4] = 20
    palette[5] = 30
    const indexed = new Uint8Array([0, 1, 1, 0])
    const result = blitIndexedToRgba(indexed, 2, 2, palette)
    expect(result.rgba[3]).toBe(0)
    expect(result.rgba[4]).toBe(10)
    expect(result.rgba[5]).toBe(20)
    expect(result.rgba[6]).toBe(30)
    expect(result.rgba[7]).toBe(255)
  })
})
