import { describe, expect, it } from 'vitest'
import type { TmpImage } from '../TmpImage'
import { blitTmpToRgba, composeFa2TmpPreview, composeTmpFilePreview, fa2TmpPreviewCellDest, tmpDrawOffset, tmpFilePreviewDest } from './tmpBlit'
import type { IndexedRgba } from './shpBlit'

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

function solidRgba(width: number, height: number, r: number, g: number, b: number): IndexedRgba {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    rgba[offset] = r
    rgba[offset + 1] = g
    rgba[offset + 2] = b
    rgba[offset + 3] = 255
  }
  return { width, height, rgba }
}

function pixelAt(image: IndexedRgba, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4
  return [
    image.rgba[offset] ?? 0,
    image.rgba[offset + 1] ?? 0,
    image.rgba[offset + 2] ?? 0,
    image.rgba[offset + 3] ?? 0,
  ]
}

describe('composeFa2TmpPreview', () => {
  it('returns the same pixels for a 1×1 tile as subtile 0', () => {
    const cell = solidRgba(12, 10, 10, 20, 30)
    expect(composeFa2TmpPreview([{ col: 0, row: 0, pixels: cell }])).toBe(cell)
  })

  it('places a 2×1 TMP on FA2 iso offsets instead of stacking subtile 0', () => {
    const first = solidRgba(8, 8, 255, 0, 0)
    const second = solidRgba(8, 8, 0, 0, 255)
    expect(fa2TmpPreviewCellDest(1, 0)).toEqual({ x: -30, y: 15 })
    const preview = composeFa2TmpPreview([
      { col: 0, row: 0, pixels: first },
      { col: 1, row: 0, pixels: second },
    ])
    expect(preview).not.toBeNull()
    expect(preview?.width).toBe(38)
    expect(preview?.height).toBe(23)
    expect(pixelAt(preview!, 30, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(preview!, 0, 15)).toEqual([0, 0, 255, 255])
    expect(pixelAt(preview!, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('uses FA2 extra pad as sX/sY, not TMP header x/y', () => {
    expect(fa2TmpPreviewCellDest(0, 0, { sX: 0, sY: 0 })).toEqual({ x: 0, y: 0 })
    expect(fa2TmpPreviewCellDest(1, 0, { sX: -12, sY: -8 })).toEqual({ x: -42, y: 7 })
    const first = solidRgba(8, 8, 255, 0, 0)
    const second = solidRgba(8, 8, 0, 0, 255)
    const scattered = composeFa2TmpPreview([
      { col: 0, row: 0, pixels: first, sX: 0, sY: 0 },
      { col: 1, row: 0, pixels: second, sX: 180, sY: 90 },
    ])
    expect(scattered?.width).toBeGreaterThan(100)
    const packed = composeFa2TmpPreview([
      { col: 0, row: 0, pixels: first },
      { col: 1, row: 0, pixels: second },
    ])
    expect(packed?.width).toBe(38)
  })
})

describe('composeTmpFilePreview', () => {
  it('returns the same pixels for a 1×1 tile as subtile 0', () => {
    const cell = solidRgba(12, 10, 10, 20, 30)
    expect(composeTmpFilePreview([{ pixels: cell, x: 0, y: 0, zHeight: 0 }])).toBe(cell)
  })

  it('places a 2×1 TMP on header x/y instead of stacking subtile 0', () => {
    const first = solidRgba(8, 8, 255, 0, 0)
    const second = solidRgba(8, 8, 0, 0, 255)
    expect(tmpFilePreviewDest({ pixels: second, x: 30, y: 15, zHeight: 0 }, 0)).toEqual({ x: 30, y: 15 })
    const preview = composeTmpFilePreview([
      { pixels: first, x: 0, y: 0, zHeight: 0 },
      { pixels: second, x: 30, y: 15, zHeight: 0 },
    ])
    expect(preview).not.toBeNull()
    expect(preview?.width).toBe(38)
    expect(preview?.height).toBe(23)
    expect(pixelAt(preview!, 0, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(preview!, 30, 15)).toEqual([0, 0, 255, 255])
    expect(pixelAt(preview!, 30, 0)).toEqual([0, 0, 0, 0])
  })

  it('keeps shared extra graphics on the same origin instead of stamping them per iso cell', () => {
    const extra = solidRgba(40, 8, 0, 255, 0)
    const preview = composeTmpFilePreview([
      { pixels: extra, x: 0, y: 0, zHeight: 0, drawOffsetX: -20 },
      { pixels: extra, x: 30, y: 15, zHeight: 0, drawOffsetX: -50 },
    ])
    expect(tmpFilePreviewDest({ pixels: extra, x: 0, y: 0, zHeight: 0, drawOffsetX: -20 }, 0).x).toBe(-20)
    expect(tmpFilePreviewDest({ pixels: extra, x: 30, y: 15, zHeight: 0, drawOffsetX: -50 }, 0).x).toBe(-20)
    expect(preview?.width).toBe(40)
    expect(pixelAt(preview!, 0, 0)).toEqual([0, 255, 0, 255])
  })
})
