import { describe, expect, it, beforeAll } from 'vitest'
import { SpriteSheetSlicer } from './SpriteSheetSlicer'
import { installCanvasStubs, makeMockImage } from '../../test/mocks/canvasStub'

beforeAll(() => {
  installCanvasStubs()
})

describe('SpriteSheetSlicer.slice', () => {
  it('cuts an 8x4 sprite sheet into 32 canvases of frame size', () => {
    const cols = 8
    const rows = 4
    const fw = 16
    const fh = 16
    const sheet = makeMockImage(cols * fw, rows * fh)
    const frames = SpriteSheetSlicer.slice({
      source: sheet as any,
      cols,
      rows,
      frameWidth: fw,
      frameHeight: fh,
    })
    expect(frames).toHaveLength(cols * rows)
    for (const c of frames) {
      expect(c.width).toBe(fw)
      expect(c.height).toBe(fh)
    }
  })

  it('honors maxFrames < cols*rows by truncating in row-major order', () => {
    const frames = SpriteSheetSlicer.slice({
      source: makeMockImage(64, 32) as any,
      cols: 4,
      rows: 2,
      frameWidth: 16,
      frameHeight: 16,
      maxFrames: 5,
    })
    expect(frames).toHaveLength(5)
  })

  it('row-major sampling pulls expected (sx, sy) for each frame', () => {
    // 用渐变图：颜色从源位置可还原 (sx, sy)
    const cols = 3
    const rows = 2
    const fw = 4
    const fh = 4
    const sheetW = cols * fw
    const sheetH = rows * fh
    const sheet = makeMockImage(sheetW, sheetH, (x, y) => [x, y, 0, 255])
    const frames = SpriteSheetSlicer.slice({
      source: sheet as any,
      cols,
      rows,
      frameWidth: fw,
      frameHeight: fh,
    })
    expect(frames).toHaveLength(cols * rows)
    // 第 0 帧（左上）：左上像素应为 (0,0)；右下像素应为 (3,3)
    {
      const ctx = frames[0].getContext('2d')!
      const pixel00 = ctx.getImageData(0, 0, 1, 1).data
      expect([pixel00[0], pixel00[1]]).toEqual([0, 0])
      const pixel33 = ctx.getImageData(3, 3, 1, 1).data
      expect([pixel33[0], pixel33[1]]).toEqual([3, 3])
    }
    // 第 1 帧（左上行第 2 列，sx=4, sy=0）：左上像素应为 (4,0)
    {
      const ctx = frames[1].getContext('2d')!
      const pixel = ctx.getImageData(0, 0, 1, 1).data
      expect([pixel[0], pixel[1]]).toEqual([4, 0])
    }
    // 第 3 帧（第 2 行第 1 列，sx=0, sy=4）：左上像素应为 (0,4)
    {
      const ctx = frames[3].getContext('2d')!
      const pixel = ctx.getImageData(0, 0, 1, 1).data
      expect([pixel[0], pixel[1]]).toEqual([0, 4])
    }
  })

  it('throws on invalid cols/rows/frame size', () => {
    expect(() =>
      SpriteSheetSlicer.slice({
        source: makeMockImage(16, 16) as any,
        cols: 0,
        rows: 1,
        frameWidth: 16,
        frameHeight: 16,
      }),
    ).toThrow(/invalid cols/)
    expect(() =>
      SpriteSheetSlicer.slice({
        source: makeMockImage(16, 16) as any,
        cols: 1,
        rows: 1,
        frameWidth: 0,
        frameHeight: 16,
      }),
    ).toThrow(/invalid frameWidth/)
  })
})
