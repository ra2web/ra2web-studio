import { describe, expect, it } from 'vitest'
import { applyTransparentCorners } from './postprocess'
import {
  VETERAN_BADGE_HEIGHT,
  VETERAN_BADGE_RGBA,
  VETERAN_BADGE_WIDTH,
} from './veteranSpriteData'

/**
 * jsdom 下没有真实 canvas 实现，所以这里用最小 mock context 验证算子的调用模式
 * （fillRect 落到了哪 12 个像素位置）。逻辑/几何如果错位，mock 会立刻露馅。
 */
function makeMockCtx(width: number, height: number) {
  const fillRectCalls: Array<[number, number, number, number]> = []
  let saveCount = 0
  let restoreCount = 0
  let lastComposite = ''
  const ctx = {
    canvas: { width, height },
    save() {
      saveCount++
    },
    restore() {
      restoreCount++
    },
    set globalCompositeOperation(value: string) {
      lastComposite = value
    },
    get globalCompositeOperation() {
      return lastComposite
    },
    fillStyle: '#000',
    fillRect(x: number, y: number, w: number, h: number) {
      fillRectCalls.push([x, y, w, h])
    },
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillRectCalls,
    getSaveCount: () => saveCount,
    getRestoreCount: () => restoreCount,
    getLastComposite: () => lastComposite,
  }
}

describe('applyTransparentCorners', () => {
  it('clears 12 corner pixels in L shape with destination-out composite', () => {
    const W = 60
    const H = 48
    const m = makeMockCtx(W, H)
    applyTransparentCorners(m.ctx, { enabled: true })

    expect(m.getSaveCount()).toBe(1)
    expect(m.getRestoreCount()).toBe(1)
    expect(m.getLastComposite()).toBe('destination-out')

    // 12 个像素，每个都是 1x1 fillRect
    expect(m.fillRectCalls).toHaveLength(12)
    for (const call of m.fillRectCalls) {
      expect(call[2]).toBe(1)
      expect(call[3]).toBe(1)
    }

    const positions = m.fillRectCalls.map(([x, y]) => `${x},${y}`).sort()
    const expected = [
      // 左上
      '0,0', '0,1', '1,0',
      // 右下
      `${W - 1},${H - 1}`, `${W - 2},${H - 1}`, `${W - 1},${H - 2}`,
      // 右上
      `${W - 1},0`, `${W - 1},1`, `${W - 2},0`,
      // 左下
      `0,${H - 1}`, `1,${H - 1}`, `0,${H - 2}`,
    ].sort()

    expect(positions).toEqual(expected)
  })

  it('does nothing when enabled=false', () => {
    const m = makeMockCtx(60, 48)
    applyTransparentCorners(m.ctx, { enabled: false })
    expect(m.fillRectCalls).toHaveLength(0)
    expect(m.getSaveCount()).toBe(0)
  })

  it('skips degenerate canvases (w<2 or h<2)', () => {
    const m1 = makeMockCtx(1, 48)
    applyTransparentCorners(m1.ctx, { enabled: true })
    expect(m1.fillRectCalls).toHaveLength(0)

    const m2 = makeMockCtx(60, 1)
    applyTransparentCorners(m2.ctx, { enabled: true })
    expect(m2.fillRectCalls).toHaveLength(0)
  })
})

describe('veteranSpriteData', () => {
  it('exports 20x12 RGBA buffer with the expected total length', () => {
    expect(VETERAN_BADGE_WIDTH).toBe(20)
    expect(VETERAN_BADGE_HEIGHT).toBe(12)
    expect(VETERAN_BADGE_RGBA.length).toBe(20 * 12 * 4)
  })

  it('contains a meaningful number of opaque pixels (V chevron should not be all transparent)', () => {
    let opaque = 0
    for (let i = 3; i < VETERAN_BADGE_RGBA.length; i += 4) {
      if (VETERAN_BADGE_RGBA[i] > 0) opaque++
    }
    // OS sprite #37 实测 137 个不透明像素；锁一个下界即可
    expect(opaque).toBeGreaterThan(80)
  })

  it('opaque pixels are gold-ish (R/G dominant, B noticeably lower)', () => {
    let goldish = 0
    let totalOpaque = 0
    for (let i = 0; i < VETERAN_BADGE_RGBA.length; i += 4) {
      const a = VETERAN_BADGE_RGBA[i + 3]
      if (a === 0) continue
      totalOpaque++
      const r = VETERAN_BADGE_RGBA[i]
      const g = VETERAN_BADGE_RGBA[i + 1]
      const b = VETERAN_BADGE_RGBA[i + 2]
      // 金色/黄色：R 与 G 接近且都比 B 至少高 20，或者灰色描边都允许
      if (r >= 60 && g >= 60 && r - b >= 20) goldish++
    }
    // 至少一半的不透明像素是金色调
    expect(goldish * 2).toBeGreaterThanOrEqual(totalOpaque)
  })
})
