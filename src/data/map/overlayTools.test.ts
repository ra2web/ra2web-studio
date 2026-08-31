import { describe, expect, it } from 'vitest'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { OVRL_TRACK_BEGIN } from './constants'
import {
  FA2_WALL_OVERLAYS,
  OVRL_BIG_BRIDGE_EW,
  OVRL_SMALL_BRIDGE_START,
  handleTrail,
  overlayDirection,
  placeBridgeLine,
} from './overlayTools'
import { placeRandomTerrain } from './mapTools'

function firstCell(): { rx: number; ry: number } {
  let found: { rx: number; ry: number } | null = null
  forEachIsoCell(24, 24, (cell) => {
    if (!found) found = { rx: cell.rx, ry: cell.ry }
  })
  if (!found) throw new Error('no cell')
  return found
}

function lineAlongX(): { from: { rx: number; ry: number }; to: { rx: number; ry: number } } {
  let from: { rx: number; ry: number } | null = null
  forEachIsoCell(24, 24, (cell) => {
    if (from) return
    if (
      isValidIsoCell(cell.rx, cell.ry, 24, 24)
      && isValidIsoCell(cell.rx + 6, cell.ry, 24, 24)
      && isValidIsoCell(cell.rx, cell.ry - 1, 24, 24)
      && isValidIsoCell(cell.rx, cell.ry + 1, 24, 24)
    ) {
      from = { rx: cell.rx, ry: cell.ry }
    }
  })
  if (!from) throw new Error('no line')
  return { from, to: { rx: from.rx + 6, ry: from.ry } }
}

describe('FA2 overlay walls and tracks', () => {
  it('connects sandbag overlay data from four neighbors', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = firstCell()
    const east = { rx: origin.rx + 1, ry: origin.ry }
    doc.setOverlay(origin.rx, origin.ry, FA2_WALL_OVERLAYS[0], 0)
    doc.setOverlay(east.rx, east.ry, FA2_WALL_OVERLAYS[0], 0)
    handleTrail(doc, origin.rx, origin.ry)
    expect(overlayDirection(doc, origin.rx, origin.ry) & 0x4).toBe(0x4)
    expect(doc.getOverlay(origin.rx, origin.ry).value & 0x4).toBe(0x4)
    expect(doc.getOverlay(east.rx, east.ry).value & 0x1).toBe(0x1)
  })

  it('rewrites track overlay ids from 0x27', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = firstCell()
    const east = { rx: origin.rx + 1, ry: origin.ry }
    doc.setOverlay(origin.rx, origin.ry, OVRL_TRACK_BEGIN, 0)
    doc.setOverlay(east.rx, east.ry, OVRL_TRACK_BEGIN, 0)
    handleTrail(doc, origin.rx, origin.ry)
    expect(doc.getOverlay(origin.rx, origin.ry).id).toBeGreaterThanOrEqual(OVRL_TRACK_BEGIN)
    expect(doc.getOverlay(origin.rx, origin.ry).id).toBeLessThanOrEqual(OVRL_TRACK_BEGIN + 11)
  })
})

describe('FA2 overlay bridges', () => {
  it('paints a big east-west bridge on equal height', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const { from, to } = lineAlongX()
    placeBridgeLine(doc, from, to, 'big')
    expect(doc.getOverlay(from.rx, from.ry).id).toBe(OVRL_BIG_BRIDGE_EW)
    expect(doc.getOverlay(from.rx, from.ry).value).toBe(0x9)
    expect(doc.getOverlay(to.rx, to.ry).id).toBe(OVRL_BIG_BRIDGE_EW)
  })

  it('paints small-bridge ramps three cells wide', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const { from, to } = lineAlongX()
    placeBridgeLine(doc, from, to, 'small', () => 0)
    expect(doc.getOverlay(from.rx, from.ry).id).toBe(OVRL_SMALL_BRIDGE_START + 22)
    expect(doc.getOverlay(from.rx + 1, from.ry).id).toBe(OVRL_SMALL_BRIDGE_START + 9)
    expect(doc.getOverlay(to.rx, to.ry).id).toBe(OVRL_SMALL_BRIDGE_START + 24)
  })
})

describe('FA2 random terrain', () => {
  it('places a name from the pool and skips occupied cells', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const cell = firstCell()
    const placed = placeRandomTerrain(doc, cell.rx, cell.ry, ['TREE01', 'TREE02'], () => 0)
    expect(placed).toBe(true)
    expect(doc.terrains[0]?.name).toBe('TREE01')
    expect(placeRandomTerrain(doc, cell.rx, cell.ry, ['TREE03'], () => 0)).toBe(false)
    expect(doc.terrains).toHaveLength(1)
  })
})
