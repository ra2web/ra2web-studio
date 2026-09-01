import { describe, expect, it } from 'vitest'
import { overlayBlitPosition, tmpBlitPosition } from './isoDraw'

describe('tmpBlitPosition', () => {
  it('keeps 60×30 tiles centered on the diamond top like the old blit', () => {
    const origin = { px: 100, py: 40 }
    expect(tmpBlitPosition(origin, { width: 60, height: 30, blockWidth: 60, drawOffsetX: 0, drawOffsetY: 0 })).toEqual({
      x: 70,
      y: 40,
    })
  })

  it('uses FA2/werhd extra pad instead of centering the expanded sprite', () => {
    const origin = { px: 100, py: 40 }
    const pixels = { width: 80, height: 45, blockWidth: 60, drawOffsetX: -20, drawOffsetY: -15 }
    const pos = tmpBlitPosition(origin, pixels)
    expect(pos).toEqual({ x: 50, y: 25 })
    expect(origin.px - pixels.width / 2).toBe(60)
  })
})

describe('overlayBlitPosition', () => {
  it('places SHP overlays at FA2 diamond-top offset', () => {
    expect(overlayBlitPosition({ px: 100, py: 40 }, 48, 32)).toEqual({ x: 76, y: 24 })
  })
})
