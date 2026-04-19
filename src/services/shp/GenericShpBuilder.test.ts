import { describe, expect, it, beforeAll } from 'vitest'
import { GenericShpBuilder } from './GenericShpBuilder'
import { ShpFile } from '../../data/ShpFile'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import type { Rgb } from '../palette/PaletteTypes'
import {
  installCanvasStubs,
  makeMockImage,
  makeCanvasFromMockImage,
} from '../../test/mocks/canvasStub'

beforeAll(() => {
  installCanvasStubs()
})

/** 构造一个能通过最近邻量化精确还原色号 1..N 的 256 色调色板 */
function makePalette(): Rgb[] {
  const pal: Rgb[] = []
  pal.push({ r: 0, g: 0, b: 0 }) // index 0 透明
  pal.push({ r: 255, g: 0, b: 0 }) // 1 红
  pal.push({ r: 0, g: 255, b: 0 }) // 2 绿
  pal.push({ r: 0, g: 0, b: 255 }) // 3 蓝
  pal.push({ r: 255, g: 255, b: 255 }) // 4 白
  for (let i = 5; i < 256; i++) {
    pal.push({ r: 0, g: 0, b: 0 })
  }
  return pal
}

describe('GenericShpBuilder.buildShp', () => {
  it('multi-frame round-trip: parses back via ShpFile with right frame count + identical pixels', () => {
    const palette = makePalette()
    const w = 4
    const h = 2

    // 三帧分别是纯红 / 纯绿 / 纯蓝；最近邻量化后应分别得到 1 / 2 / 3 索引
    const colors: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]
    const expectedIdx = [1, 2, 3]
    const frames = colors.map(([r, g, b]) =>
      makeCanvasFromMockImage(
        makeMockImage(w, h, () => [r, g, b, 255]),
      ),
    )

    const result = GenericShpBuilder.buildShp({
      frames,
      palette,
      width: w,
      height: h,
    })

    expect(result.numFrames).toBe(3)
    expect(result.width).toBe(w)
    expect(result.height).toBe(h)

    const shp = ShpFile.fromVirtualFile(VirtualFile.fromBytes(result.shpBytes, 'multi.shp'))
    expect(shp.numImages).toBe(3)
    for (let f = 0; f < 3; f++) {
      const img = shp.getImage(f)
      expect(img.width).toBe(w)
      expect(img.height).toBe(h)
      expect(img.imageData.length).toBe(w * h)
      for (let i = 0; i < img.imageData.length; i++) {
        expect(img.imageData[i]).toBe(expectedIdx[f])
      }
    }
  })

  it('alpha < threshold maps to transparent index 0', () => {
    const palette = makePalette()
    const w = 2
    const h = 1
    // 像素 0：红不透明；像素 1：alpha=0
    const canvas = makeCanvasFromMockImage(
      makeMockImage(w, h, (x) =>
        x === 0 ? [255, 0, 0, 255] : [123, 45, 67, 0],
      ),
    )
    const result = GenericShpBuilder.buildShp({
      frames: [canvas],
      palette,
      width: w,
      height: h,
    })
    const shp = ShpFile.fromVirtualFile(VirtualFile.fromBytes(result.shpBytes, 'a.shp'))
    expect(shp.getImage(0).imageData[0]).toBe(1) // 红
    expect(shp.getImage(0).imageData[1]).toBe(0) // 透明
  })

  it('rejects empty frame array', () => {
    expect(() =>
      GenericShpBuilder.buildShp({
        frames: [],
        palette: makePalette(),
        width: 4,
        height: 4,
      }),
    ).toThrow(/at least one frame/i)
  })

  it('rejects invalid width/height', () => {
    const c = makeCanvasFromMockImage(makeMockImage(2, 2))
    expect(() =>
      GenericShpBuilder.buildShp({
        frames: [c],
        palette: makePalette(),
        width: 0,
        height: 4,
      }),
    ).toThrow(/invalid width/)
  })
})
