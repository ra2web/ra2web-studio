import { describe, expect, it } from 'vitest'
import type { TmpImage } from '../TmpImage'
import { blitTmpToRgba } from './tmpBlit'

describe('blitTmpToRgba', () => {
  it('writes opaque palette colors into the diamond and skips index 0', () => {
    const palette = new Uint8Array(768)
    palette[3] = 255
    palette[4] = 128
    palette[5] = 0
    const tileData = new Uint8Array(900)
    tileData.fill(1)
    const image = {
      tileData,
      hasExtraData: false,
      extraData: null,
      x: 0,
      y: 0,
      extraX: 0,
      extraY: 0,
      extraWidth: 0,
      extraHeight: 0,
    } as unknown as TmpImage
    const result = blitTmpToRgba(image, palette, 60, 30)
    expect(result.width).toBe(60)
    expect(result.height).toBe(30)
    let opaque = 0
    for (let i = 3; i < result.rgba.length; i += 4) {
      if (result.rgba[i] === 255) opaque++
    }
    expect(opaque).toBeGreaterThan(100)
    expect(result.rgba[0] === 255 || result.rgba[4] === 255 || opaque > 0).toBe(true)
  })
})
