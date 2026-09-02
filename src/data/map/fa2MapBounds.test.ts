import { describe, expect, it, vi } from 'vitest'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from './constants'
import { MapDocument } from './MapDocument'
import {
  FA2_VALID_BOUND_COLOR,
  FA2_VISIBLE_BOUND_COLOR,
  fa2MapBoundRects,
  fa2ValidMapRect,
  strokeFa2MapBounds,
} from './fa2MapBounds'
import { projectCell } from './isoCoords'

describe('fa2MapBoundRects', () => {
  it('matches FA2 RenderUIOverlay corners for a 50x50 map', () => {
    const isoSize = 100
    const valid = fa2ValidMapRect(50, 50, isoSize)
    const top = projectCell(50, 1, 0, isoSize)
    const bottom = projectCell(50, 99, 0, isoSize)
    expect(valid.x1).toBe(top.px + RA2_ISO_TILE_WIDTH / 2)
    expect(valid.y1).toBe(top.py + RA2_ISO_TILE_HEIGHT / 2)
    expect(valid.x2).toBe(bottom.px + RA2_ISO_TILE_WIDTH / 2)
    expect(valid.y2).toBe(bottom.py + RA2_ISO_TILE_HEIGHT / 2)

    const bounds = fa2MapBoundRects({
      width: 50,
      height: 50,
      isoSize,
      localX: 2,
      localY: 4,
      localWidth: 46,
      localHeight: 44,
    })
    expect(bounds.visible.x1).toBe(valid.x1 + 2 * RA2_ISO_TILE_WIDTH - RA2_ISO_TILE_WIDTH / 2)
    expect(bounds.visible.y1).toBe(valid.y1)
    expect(bounds.visible.x2).toBeLessThan(valid.x2)
    expect(bounds.visible.y2).toBeLessThan(valid.y2)
    expect(bounds.visible.x1).toBeGreaterThan(valid.x1)
  })

  it('uses Map.Size / LocalSize from a new multiplayer document', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
    const bounds = fa2MapBoundRects(doc)
    expect(doc.localX).toBe(2)
    expect(doc.localY).toBe(4)
    expect(doc.localWidth).toBe(12)
    expect(doc.localHeight).toBe(10)
    expect(bounds.visible.x1).toBeGreaterThan(bounds.valid.x1)
    expect(bounds.visible.y2).toBeLessThan(bounds.valid.y2)
  })

  it('strokes red then blue double rectangles like FA2', () => {
    const strokeRect = vi.fn()
    const ctx = { strokeStyle: '', lineWidth: 1, strokeRect }
    strokeFa2MapBounds(ctx, {
      valid: { x1: 0, y1: 0, x2: 100, y2: 80 },
      visible: { x1: 10, y1: 10, x2: 90, y2: 70 },
    }, 1)
    expect(ctx.strokeStyle).toBe(FA2_VISIBLE_BOUND_COLOR)
    expect(strokeRect).toHaveBeenCalledTimes(4)
    expect(strokeRect.mock.calls[0]).toEqual([0, 0, 100, 80])
    expect(strokeRect.mock.calls[2]).toEqual([10, 10, 80, 60])
    expect(FA2_VALID_BOUND_COLOR).toBe('#ff0000')
  })
})
