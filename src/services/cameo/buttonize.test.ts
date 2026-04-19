import { beforeAll, describe, expect, it } from 'vitest'
import { applyButtonize } from './postprocess'
import { installCanvasStubs } from '../../test/mocks/canvasStub'

beforeAll(() => {
  installCanvasStubs()
})

const W = 60
const H = 48

/** 创建一个 60×48 灰度 (gray) 全不透明 canvas，便于测试加/减后是否落在期望值。 */
function makeGrayCanvas(gray: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  // 直接灌 buf：canvasStub 的 mockCtx.buf 是 RGBA Uint8ClampedArray
  const mock = ctx as any
  for (let i = 0; i < W * H; i++) {
    const off = i * 4
    mock.buf[off] = gray
    mock.buf[off + 1] = gray
    mock.buf[off + 2] = gray
    mock.buf[off + 3] = 255
  }
  return canvas
}

function setPixel(canvas: HTMLCanvasElement, x: number, y: number, r: number, g: number, b: number, a: number) {
  const ctx = canvas.getContext('2d') as any
  const off = (y * canvas.width + x) * 4
  ctx.buf[off] = r
  ctx.buf[off + 1] = g
  ctx.buf[off + 2] = b
  ctx.buf[off + 3] = a
}

function getPixel(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const ctx = canvas.getContext('2d') as any
  const off = (y * canvas.width + x) * 4
  return [ctx.buf[off], ctx.buf[off + 1], ctx.buf[off + 2], ctx.buf[off + 3]]
}

describe('applyButtonize (OS Blade)', () => {
  it('does nothing when enabled=false', () => {
    const canvas = makeGrayCanvas(128)
    const ctx = canvas.getContext('2d')!
    applyButtonize(ctx, { enabled: false })
    // 任意像素应当原值未变
    expect(getPixel(canvas, 0, 5)).toEqual([128, 128, 128, 255])
    expect(getPixel(canvas, W - 2, 5)).toEqual([128, 128, 128, 255])
    expect(getPixel(canvas, 15, 1)).toEqual([128, 128, 128, 255])
  })

  it('does nothing when canvas is too small (W<36 or H<6)', () => {
    const small = document.createElement('canvas')
    small.width = 20
    small.height = 20
    const ctx = small.getContext('2d') as any
    for (let i = 0; i < 20 * 20; i++) {
      ctx.buf[i * 4] = 100
      ctx.buf[i * 4 + 1] = 100
      ctx.buf[i * 4 + 2] = 100
      ctx.buf[i * 4 + 3] = 255
    }
    applyButtonize(ctx as CanvasRenderingContext2D, { enabled: true, lightness: 20, darkness: 40 })
    expect([ctx.buf[0], ctx.buf[1], ctx.buf[2], ctx.buf[3]]).toEqual([100, 100, 100, 255])
  })

  it('darkens the left edge column 0 only at y=2..H-3 (RGB-=darkness)', () => {
    const canvas = makeGrayCanvas(128)
    const ctx = canvas.getContext('2d')!
    applyButtonize(ctx, { enabled: true, lightness: 20, darkness: 40 })

    // (0, 5) 在 y=2..H-3 范围内 → 被 darkened：128-40=88
    expect(getPixel(canvas, 0, 5)).toEqual([88, 88, 88, 255])
    // (0, 0) 在 y=2 之前 → 未被 dark bar 触碰；但 (0, 0) 也不在右亮、顶亮、角 patch 范围 → 应仍是原值
    expect(getPixel(canvas, 0, 0)).toEqual([128, 128, 128, 255])
    // (0, 1) 同理未在 dark 范围（dark 从 y=2 起），也不在角 patch（角 patch 从 x=1 起）→ 仍原值
    expect(getPixel(canvas, 0, 1)).toEqual([128, 128, 128, 255])
    // (0, H-3) 是 dark 末端（y=H-3=45）→ 仍 88
    expect(getPixel(canvas, 0, H - 3)).toEqual([88, 88, 88, 255])
    // (0, H-2) 在 dark 范围之外（y=46）→ 仍 128
    expect(getPixel(canvas, 0, H - 2)).toEqual([128, 128, 128, 255])
    // 左侧第二列（x=1）不在 dark bar，也不在角 patch（角 patch 是 x=1..3, y=1..2 跳 (1,1)）→
    // (1, 5) 应仍是 128
    expect(getPixel(canvas, 1, 5)).toEqual([128, 128, 128, 255])
  })

  it('lightens the right edge column W-2 only at y=1..H-2 (RGB+=lightness)', () => {
    const canvas = makeGrayCanvas(128)
    const ctx = canvas.getContext('2d')!
    applyButtonize(ctx, { enabled: true, lightness: 20, darkness: 40 })

    // (W-2, 5) 在 y=1..H-2 → light：128+20=148
    expect(getPixel(canvas, W - 2, 5)).toEqual([148, 148, 148, 255])
    // (W-2, 0) 不在 light 范围（y 从 1 起）→ 仍 128
    expect(getPixel(canvas, W - 2, 0)).toEqual([128, 128, 128, 255])
    // (W-2, H-2) 是末端（y=46）→ 148
    expect(getPixel(canvas, W - 2, H - 2)).toEqual([148, 148, 148, 255])
    // (W-2, H-1) 不在范围 → 128
    expect(getPixel(canvas, W - 2, H - 1)).toEqual([128, 128, 128, 255])
    // 真正的最右列 (W-1) 不被亮 bar 触碰（OS LightSide_Blade 是内缩 1px）
    expect(getPixel(canvas, W - 1, 5)).toEqual([128, 128, 128, 255])
  })

  it('lightens the top bar columns 4..34 at rows 1..2', () => {
    const canvas = makeGrayCanvas(128)
    const ctx = canvas.getContext('2d')!
    applyButtonize(ctx, { enabled: true, lightness: 20, darkness: 40 })

    // (15, 1) 顶 bar 命中（列 4..33, 行 1..2）→ 148
    expect(getPixel(canvas, 15, 1)).toEqual([148, 148, 148, 255])
    expect(getPixel(canvas, 15, 2)).toEqual([148, 148, 148, 255])
    // (4, 1) 顶 bar 起点 → 148
    expect(getPixel(canvas, 4, 1)).toEqual([148, 148, 148, 255])
    // (33, 1) 顶 bar 末端列 → 148
    expect(getPixel(canvas, 33, 1)).toEqual([148, 148, 148, 255])
    // (34, 2) 单点过渡 → 148
    expect(getPixel(canvas, 34, 2)).toEqual([148, 148, 148, 255])
    // (34, 1) 不在单点过渡（仅 y=2）也不在顶 bar (列范围 4..33) → 仍 128
    expect(getPixel(canvas, 34, 1)).toEqual([128, 128, 128, 255])

    // 顶 bar 不覆盖第 0 行
    expect(getPixel(canvas, 15, 0)).toEqual([128, 128, 128, 255])
    // (0, 1) 不在 dark bar (从 y=2 起)、不在顶 bar (从 x=4 起)、不在角 patch (从 x=1 起) → 仍 128
    expect(getPixel(canvas, 0, 1)).toEqual([128, 128, 128, 255])
    // 顶 bar 不覆盖列 > 34：列 35..W-3（W-2 是右亮 bar 自己负责）
    expect(getPixel(canvas, 40, 1)).toEqual([128, 128, 128, 255])
    // (3, 3) 在第 3 行，patch 已结束（patch 仅 y=1..2）→ 仍 128
    expect(getPixel(canvas, 3, 3)).toEqual([128, 128, 128, 255])
  })

  it('paints the corner "light pillar" patch at (1..3, 1..2) excluding (1, 1)', () => {
    // 用 gray=128，顶 bar (34, 2) 会被 +lightness=20 → 148；patch 取 148 再 +lightness*2=40 → 188
    const canvas = makeGrayCanvas(128)
    const ctx = canvas.getContext('2d')!
    applyButtonize(ctx, { enabled: true, lightness: 20, darkness: 40 })

    // patch 命中位置（5 个像素）：(2,1), (3,1), (1,2), (2,2), (3,2)
    expect(getPixel(canvas, 2, 1)).toEqual([188, 188, 188, 255])
    expect(getPixel(canvas, 3, 1)).toEqual([188, 188, 188, 255])
    expect(getPixel(canvas, 1, 2)).toEqual([188, 188, 188, 255])
    expect(getPixel(canvas, 2, 2)).toEqual([188, 188, 188, 255])
    expect(getPixel(canvas, 3, 2)).toEqual([188, 188, 188, 255])
    // (1, 1) 显式被跳过 → 仍 128
    expect(getPixel(canvas, 1, 1)).toEqual([128, 128, 128, 255])
  })

  it('saturates: dark cannot go below 0, light cannot exceed 255', () => {
    // 几乎全黑：darkness=40 → 0
    const dark = makeGrayCanvas(10)
    applyButtonize(dark.getContext('2d')!, { enabled: true, lightness: 0, darkness: 40 })
    expect(getPixel(dark, 0, 5)).toEqual([0, 0, 0, 255])

    // 几乎全白：lightness=20 → 255
    const light = makeGrayCanvas(250)
    applyButtonize(light.getContext('2d')!, { enabled: true, lightness: 20, darkness: 0 })
    expect(getPixel(light, W - 2, 5)).toEqual([255, 255, 255, 255])
  })

  it('does not modify transparent (alpha=0) pixels', () => {
    const canvas = makeGrayCanvas(128)
    // 把左 dark bar 上的一颗像素改为透明
    setPixel(canvas, 0, 5, 50, 50, 50, 0)
    applyButtonize(canvas.getContext('2d')!, { enabled: true, lightness: 20, darkness: 40 })
    // alpha 仍是 0；R/G/B 没被 darken（仍是 50）
    expect(getPixel(canvas, 0, 5)).toEqual([50, 50, 50, 0])
    // 周围非透明像素仍被 darken
    expect(getPixel(canvas, 0, 6)).toEqual([88, 88, 88, 255])
  })

  it('skips both bars when lightness=0 and darkness=0', () => {
    const canvas = makeGrayCanvas(128)
    applyButtonize(canvas.getContext('2d')!, { enabled: true, lightness: 0, darkness: 0 })
    expect(getPixel(canvas, 0, 5)).toEqual([128, 128, 128, 255])
    expect(getPixel(canvas, W - 2, 5)).toEqual([128, 128, 128, 255])
    expect(getPixel(canvas, 15, 1)).toEqual([128, 128, 128, 255])
    // patch 也不写
    expect(getPixel(canvas, 2, 1)).toEqual([128, 128, 128, 255])
  })

  it('uses OS defaults (lightness=20, darkness=40) when options omit them', () => {
    const canvas = makeGrayCanvas(128)
    applyButtonize(canvas.getContext('2d')!, { enabled: true })
    expect(getPixel(canvas, 0, 5)).toEqual([88, 88, 88, 255]) // 128-40
    expect(getPixel(canvas, W - 2, 5)).toEqual([148, 148, 148, 255]) // 128+20
  })
})
