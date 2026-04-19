import { beforeAll, describe, expect, it } from 'vitest'
import { renderShpFrameToBlob } from './shpToImage'
import { ShpEncoder } from '../shp/ShpEncoder'
import type { Rgb } from '../palette/PaletteTypes'
import { installCanvasStubs } from '../../test/mocks/canvasStub'

beforeAll(() => {
  installCanvasStubs()
})

function makePalette(): Rgb[] {
  // 0 = 透明（黑），1 = 红，2 = 绿，3 = 蓝，4 = 白，其余灰阶
  const pal: Rgb[] = []
  pal.push({ r: 0, g: 0, b: 0 })
  pal.push({ r: 255, g: 0, b: 0 })
  pal.push({ r: 0, g: 255, b: 0 })
  pal.push({ r: 0, g: 0, b: 255 })
  pal.push({ r: 255, g: 255, b: 255 })
  for (let i = 5; i < 256; i++) pal.push({ r: i, g: i, b: i })
  return pal
}

/** 取出 mock toBlob 注入的原始 RGBA buf（仅 jsdom 测试期间存在）。 */
function readMockPixels(blob: Blob): Uint8ClampedArray {
  const px = (blob as any).__mockPixels as Uint8ClampedArray | undefined
  if (!px) throw new Error('Test setup error: blob.__mockPixels not present (canvasStub.toBlob polyfill missing?)')
  return px
}

describe('renderShpFrameToBlob', () => {
  it('single-frame round-trip: indexed → palette RGBA pixel-by-pixel', () => {
    // 4x2 棋盘：x=0/2 用索引 1（红），x=1/3 用索引 2（绿）
    const w = 4
    const h = 2
    const indexed = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        indexed[y * w + x] = x % 2 === 0 ? 1 : 2
      }
    }
    const bytes = ShpEncoder.encodeType0({
      canvasWidth: w,
      canvasHeight: h,
      frames: [{ width: w, height: h, indexedPixels: indexed }],
    })

    return renderShpFrameToBlob(bytes, 'test.shp', makePalette()).then((res) => {
      expect(res.numFrames).toBe(1)
      expect(res.width).toBe(w)
      expect(res.height).toBe(h)
      expect(res.frameIndex).toBe(0)

      const px = readMockPixels(res.blob)
      // (0,0) 索引 1 = 红 不透明
      expect([px[0], px[1], px[2], px[3]]).toEqual([255, 0, 0, 255])
      // (1,0) 索引 2 = 绿 不透明
      const off1 = (0 * w + 1) * 4
      expect([px[off1], px[off1 + 1], px[off1 + 2], px[off1 + 3]]).toEqual([0, 255, 0, 255])
      // (3,1) 索引 2 = 绿 不透明
      const off2 = (1 * w + 3) * 4
      expect([px[off2], px[off2 + 1], px[off2 + 2], px[off2 + 3]]).toEqual([0, 255, 0, 255])
    })
  })

  it('renders index 0 as fully transparent', () => {
    const w = 2
    const h = 1
    const indexed = new Uint8Array([1, 0]) // 像素 0 红，像素 1 透明
    const bytes = ShpEncoder.encodeType0({
      canvasWidth: w,
      canvasHeight: h,
      frames: [{ width: w, height: h, indexedPixels: indexed }],
    })

    return renderShpFrameToBlob(bytes, 'a.shp', makePalette()).then((res) => {
      const px = readMockPixels(res.blob)
      // px0: 红 + alpha=255
      expect([px[0], px[1], px[2], px[3]]).toEqual([255, 0, 0, 255])
      // px1: alpha=0（颜色不重要，只断言透明）
      expect(px[7]).toBe(0)
    })
  })

  it('multi-frame: numFrames is reported and frameIndex selects the right frame', () => {
    // 3 帧 2x1：分别用索引 1, 2, 3
    const w = 2
    const h = 1
    const f0 = new Uint8Array([1, 1])
    const f1 = new Uint8Array([2, 2])
    const f2 = new Uint8Array([3, 3])
    const bytes = ShpEncoder.encodeType0({
      canvasWidth: w,
      canvasHeight: h,
      frames: [
        { width: w, height: h, indexedPixels: f0 },
        { width: w, height: h, indexedPixels: f1 },
        { width: w, height: h, indexedPixels: f2 },
      ],
    })
    const palette = makePalette()

    return Promise.all([
      renderShpFrameToBlob(bytes, 'multi.shp', palette, 0),
      renderShpFrameToBlob(bytes, 'multi.shp', palette, 1),
      renderShpFrameToBlob(bytes, 'multi.shp', palette, 2),
    ]).then(([r0, r1, r2]) => {
      expect(r0.numFrames).toBe(3)
      expect(r1.numFrames).toBe(3)
      expect(r2.numFrames).toBe(3)
      expect(r0.frameIndex).toBe(0)
      expect(r1.frameIndex).toBe(1)
      expect(r2.frameIndex).toBe(2)
      // frame 0 → 红
      expect(readMockPixels(r0.blob).slice(0, 4)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
      // frame 1 → 绿
      expect(readMockPixels(r1.blob).slice(0, 4)).toEqual(new Uint8ClampedArray([0, 255, 0, 255]))
      // frame 2 → 蓝
      expect(readMockPixels(r2.blob).slice(0, 4)).toEqual(new Uint8ClampedArray([0, 0, 255, 255]))
    })
  })

  it('throws RangeError when frameIndex is out of range', async () => {
    const bytes = ShpEncoder.encodeType0({
      canvasWidth: 1,
      canvasHeight: 1,
      frames: [{ width: 1, height: 1, indexedPixels: new Uint8Array([1]) }],
    })
    await expect(
      renderShpFrameToBlob(bytes, 'a.shp', makePalette(), 99),
    ).rejects.toThrow(RangeError)
    await expect(
      renderShpFrameToBlob(bytes, 'a.shp', makePalette(), -1),
    ).rejects.toThrow(RangeError)
  })

  it('throws on empty palette', async () => {
    const bytes = ShpEncoder.encodeType0({
      canvasWidth: 1,
      canvasHeight: 1,
      frames: [{ width: 1, height: 1, indexedPixels: new Uint8Array([1]) }],
    })
    await expect(
      renderShpFrameToBlob(bytes, 'a.shp', []),
    ).rejects.toThrow(/empty palette/)
  })
})
