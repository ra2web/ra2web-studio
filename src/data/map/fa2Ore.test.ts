import { describe, expect, it } from 'vitest'
import {
  FA2_ORE_GEMS,
  FA2_ORE_RIPARIUS_FIXED,
  FA2_ORE_RIPARIUS_RANDOM_BASE,
  FA2_VEINS_DATA,
  OVRL_VEINHOLE,
  OVRL_VEINHOLEBORDER,
  OVRL_VEINS,
} from './constants'
import { applyOreBrush, clearOverlay, placeVeinhole, placeVeins, smoothTiberium } from './fa2Ore'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { parseTheaterIni } from './theaterIndex'

function firstCell(width = 16, height = 16): { rx: number; ry: number } {
  let found: { rx: number; ry: number } | null = null
  forEachIsoCell(width, height, (cell) => {
    if (!found) found = { rx: cell.rx, ry: cell.ry }
  })
  if (!found) throw new Error('no cell')
  return found
}

function pair(): { a: { rx: number; ry: number }; b: { rx: number; ry: number } } {
  const origin = firstCell()
  const east = { rx: origin.rx + 1, ry: origin.ry }
  if (!isValidIsoCell(east.rx, east.ry, 16, 16)) throw new Error('no pair')
  return { a: origin, b: east }
}

describe('FA2 SmoothTiberium / ore / veins', () => {
  it('writes adjacency overlay data for an isolated Riparius tile', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    applyOreBrush(doc, origin.rx, origin.ry)
    expect(doc.getOverlay(origin.rx, origin.ry).id).toBe(FA2_ORE_RIPARIUS_FIXED)
    expect(doc.getOverlay(origin.rx, origin.ry).value).toBe(0)
  })

  it('uses FA2 _adj table when two ore cells touch', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a, b } = pair()
    applyOreBrush(doc, a.rx, a.ry)
    applyOreBrush(doc, b.rx, b.ry)
    expect(doc.getOverlay(a.rx, a.ry).value).toBe(1)
    expect(doc.getOverlay(b.rx, b.ry).value).toBe(1)
    smoothTiberium(doc, a.rx, a.ry)
    expect(doc.getOverlay(a.rx, a.ry).value).toBe(1)
  })

  it('paints gems as Cruentus 0x1e', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    applyOreBrush(doc, origin.rx, origin.ry, { kind: 'gems' })
    expect(doc.getOverlay(origin.rx, origin.ry).id).toBe(FA2_ORE_GEMS)
  })

  it('random riparius stays in 0x68–0x6F', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    applyOreBrush(doc, origin.rx, origin.ry, { style: 'random', random: () => 0.99 })
    const id = doc.getOverlay(origin.rx, origin.ry).id
    expect(id).toBeGreaterThanOrEqual(FA2_ORE_RIPARIUS_RANDOM_BASE)
    expect(id).toBeLessThan(FA2_ORE_RIPARIUS_RANDOM_BASE + 8)
  })

  it('skips tiles whose set has AllowTiberium!=true', () => {
    const theater = parseTheaterIni(`
[General]
ClearTile=0
[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
AllowTiberium=false
`)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    applyOreBrush(doc, origin.rx, origin.ry, { theater })
    expect(doc.getOverlay(origin.rx, origin.ry).id).toBe(255)
  })

  it('places a 3×3 veinhole with lowered center', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    const startHeight = doc.getCell(origin.rx, origin.ry).height
    placeVeinhole(doc, origin.rx, origin.ry)
    expect(doc.getOverlay(origin.rx, origin.ry).id).toBe(OVRL_VEINHOLE)
    expect(doc.getCell(origin.rx, origin.ry).height).toBe(Math.max(0, startHeight - 1))
    if (isValidIsoCell(origin.rx + 1, origin.ry, 16, 16)) {
      expect(doc.getOverlay(origin.rx + 1, origin.ry).id).toBe(OVRL_VEINHOLEBORDER)
    }
  })

  it('places veins with OverlayData 0x30', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    placeVeins(doc, origin.rx, origin.ry)
    expect(doc.getOverlay(origin.rx, origin.ry)).toEqual({ id: OVRL_VEINS, value: FA2_VEINS_DATA })
  })

  it('clearOverlay restitches neighboring ore adjacency', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a, b } = pair()
    applyOreBrush(doc, a.rx, a.ry)
    applyOreBrush(doc, b.rx, b.ry)
    clearOverlay(doc, b.rx, b.ry)
    expect(doc.getOverlay(b.rx, b.ry).id).toBe(255)
    expect(doc.getOverlay(a.rx, a.ry).value).toBe(0)
  })
})
