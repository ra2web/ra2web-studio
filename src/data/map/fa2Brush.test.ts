import { describe, expect, it } from 'vitest'
import { fa2CenteredRectOffsets, fa2PaintRectOffsets, manhattanDiamondOffsets, outerDiamondEdges } from './fa2Brush'

describe('FA2 iso brush offsets', () => {
  it('paints a 2×1 rect along +rx, not a manhattan diamond', () => {
    expect(fa2PaintRectOffsets(2, 1)).toEqual([
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ])
    expect(fa2PaintRectOffsets(1, 2)).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 1 },
    ])
  })

  it('10×10 iso rect is 100 cells; manhattan 10 is a different footprint', () => {
    expect(fa2PaintRectOffsets(10, 10)).toHaveLength(100)
    expect(manhattanDiamondOffsets(10).some((item) => item.dx === -9 && item.dy === 0)).toBe(true)
    expect(fa2PaintRectOffsets(10, 10).some((item) => item.dx === -9)).toBe(false)
  })

  it('FA2 2×2 heighten is centered 3×3 because of integer /2', () => {
    expect(fa2CenteredRectOffsets(2, 2)).toHaveLength(9)
    expect(fa2CenteredRectOffsets(1, 1)).toEqual([{ dx: 0, dy: 0 }])
  })

  it('brush outline keeps only outer diamond edges', () => {
    const cells = fa2PaintRectOffsets(2, 1).map(({ dx, dy }) => ({ rx: dx, ry: dy }))
    expect(outerDiamondEdges(cells)).toHaveLength(6)
    const ten = fa2PaintRectOffsets(10, 10).map(({ dx, dy }) => ({ rx: dx, ry: dy }))
    expect(outerDiamondEdges(ten)).toHaveLength(40)
  })
})
