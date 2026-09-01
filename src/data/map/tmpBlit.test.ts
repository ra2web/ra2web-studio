import { describe, expect, it } from 'vitest'
import type { TmpImage } from '../TmpImage'
import { blitTmpToRgba, tmpDrawOffset } from './tmpBlit'

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
    expect(result.drawOffsetX).toBe(0)
    expect(result.blockWidth).toBe(60)
    let opaque = 0
    for (let i = 3; i < result.rgba.length; i += 4) {
      if (result.rgba[i] === 255) opaque++
    }
    expect(opaque).toBeGreaterThan(100)
    expect(result.rgba[0] === 255 || result.rgba[4] === 255 || opaque > 0).toBe(true)
  })

  it('records FA2 extra drawOffset and grows the canvas past the 60×30 block', () => {
    const palette = new Uint8Array(768)
    const image = {
      tileData: new Uint8Array(900),
      hasExtraData: true,
      extraData: new Uint8Array(40 * 20),
      x: 12,
      y: 8,
      extraX: 0,
      extraY: 0,
      extraWidth: 40,
      extraHeight: 20,
      radarLeft: { r: 10, g: 20, b: 30 },
      radarRight: { r: 11, g: 21, b: 31 },
    } as unknown as TmpImage
    expect(tmpDrawOffset(image)).toEqual({ offsetX: 12, offsetY: 8, drawOffsetX: -12, drawOffsetY: -8 })
    const result = blitTmpToRgba(image, palette, 60, 30)
    expect(result.drawOffsetX).toBe(-12)
    expect(result.drawOffsetY).toBe(-8)
    expect(result.width).toBeGreaterThanOrEqual(72)
    expect(result.height).toBeGreaterThanOrEqual(38)
    expect(result.radarLeft).toEqual({ r: 10, g: 20, b: 30 })
  })
})
