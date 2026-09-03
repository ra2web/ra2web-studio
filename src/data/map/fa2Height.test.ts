import { describe, expect, it } from 'vitest'
import { autoLevel, changeTileHeight, fa2HeightFieldOk, heightenGround, lookupFromTheater } from './fa2Height'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { parseTheaterIni } from './theaterIndex'
import type { TmpTileShape } from './tmpCatalog'

const HEIGHT_INI = `
[General]
ClearTile=0
CliffSet=1
RampBase=2
[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
Morphable=true
[TileSet0001]
FileName=CLF
SetName=Cliff
TilesInSet=20
Morphable=false
[TileSet0002]
FileName=RAMP
SetName=RampBase
TilesInSet=20
Morphable=true
`

function playablePair(): { a: { rx: number; ry: number }; b: { rx: number; ry: number } } {
  let found: { a: { rx: number; ry: number }; b: { rx: number; ry: number } } | null = null
  forEachIsoCell(16, 16, (cell) => {
    if (found) return
    const east = { rx: cell.rx + 1, ry: cell.ry }
    if (!fa2HeightFieldOk(cell.rx, cell.ry, 16, 16)) return
    if (!fa2HeightFieldOk(east.rx, east.ry, 16, 16)) return
    if (!isValidIsoCell(cell.rx, cell.ry, 16, 16) || !isValidIsoCell(east.rx, east.ry, 16, 16)) return
    found = { a: { rx: cell.rx, ry: cell.ry }, b: east }
  })
  if (!found) throw new Error('no playable pair')
  return found
}

describe('FA2 ChangeTileHeight / AutoLevel', () => {
  it('spreads morphable height so neighbors stay within 1 of the raised cell', () => {
    const theater = parseTheaterIni(HEIGHT_INI)
    const lookup = lookupFromTheater(theater)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a, b } = playablePair()
    changeTileHeight(doc, a.rx, a.ry, 2, lookup, theater, { noSlopes: true })
    expect(doc.getCell(a.rx, a.ry).height).toBe(2)
    expect(doc.getCell(b.rx, b.ry).height).toBeGreaterThan(0)
    expect(Math.abs(doc.getCell(a.rx, a.ry).height - doc.getCell(b.rx, b.ry).height)).toBeLessThanOrEqual(1)
  })

  it('keeps a locked stroke height so dragging does not stack raises', () => {
    const theater = parseTheaterIni(HEIGHT_INI)
    const lookup = lookupFromTheater(theater)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a, b } = playablePair()
    heightenGround(doc, a.rx, a.ry, lookup, theater, { brushW: 3, brushH: 3, slopeCorrection: false, lockHeight: 0 })
    expect(doc.getCell(a.rx, a.ry).height).toBe(1)
    heightenGround(doc, b.rx, b.ry, lookup, theater, { brushW: 3, brushH: 3, slopeCorrection: false, lockHeight: 0 })
    expect(doc.getCell(a.rx, a.ry).height).toBe(1)
    expect(doc.getCell(b.rx, b.ry).height).toBe(1)
  })

  it('heightenGround uses FA2 centered rx/ry rect, not a manhattan diamond', () => {
    const theater = parseTheaterIni(HEIGHT_INI)
    const lookup = lookupFromTheater(theater)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    let origin: { rx: number; ry: number } | null = null
    forEachIsoCell(16, 16, (cell) => {
      if (origin) return
      const alongRx = { rx: cell.rx + 1, ry: cell.ry }
      const alongRy = { rx: cell.rx, ry: cell.ry + 1 }
      if (![cell, alongRx, alongRy].every((item) => (
        fa2HeightFieldOk(item.rx, item.ry, 16, 16) && isValidIsoCell(item.rx, item.ry, 16, 16)
      ))) return
      origin = { rx: cell.rx, ry: cell.ry }
    })
    if (!origin) throw new Error('no origin')
    const beforeRy = doc.getCell(origin.rx, origin.ry + 1).height
    heightenGround(doc, origin.rx, origin.ry, lookup, theater, { brushW: 3, brushH: 1, slopeCorrection: false })
    expect(doc.getCell(origin.rx, origin.ry).height).toBe(1)
    expect(doc.getCell(origin.rx + 1, origin.ry).height).toBe(1)
    expect(doc.getCell(origin.rx, origin.ry + 1).height).toBe(beforeRy)
  })

  it('heightenGround raises same-height morphable cells in the brush', () => {
    const theater = parseTheaterIni(HEIGHT_INI)
    const lookup = lookupFromTheater(theater)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a } = playablePair()
    heightenGround(doc, a.rx, a.ry, lookup, theater, { brush: 1, slopeCorrection: false })
    expect(doc.getCell(a.rx, a.ry).height).toBe(1)
  })

  it('heightenGround places ramps on the terrace below a second raise', () => {
    const theater = parseTheaterIni(HEIGHT_INI)
    const lookup = lookupFromTheater(theater)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    let center: { rx: number; ry: number } | null = null
    forEachIsoCell(16, 16, (cell) => {
      if (center) return
      const mid = { rx: cell.rx + 1, ry: cell.ry }
      const outer = { rx: cell.rx + 2, ry: cell.ry }
      if (![cell, mid, outer].every((item) => (
        fa2HeightFieldOk(item.rx, item.ry, 16, 16) && isValidIsoCell(item.rx, item.ry, 16, 16)
      ))) return
      center = { rx: cell.rx, ry: cell.ry }
    })
    if (!center) throw new Error('no triple')
    const mid = { rx: center.rx + 1, ry: center.ry }
    const outer = { rx: center.rx + 2, ry: center.ry }
    heightenGround(doc, center.rx, center.ry, lookup, theater, { brush: 1 })
    heightenGround(doc, center.rx, center.ry, lookup, theater, { brush: 1 })
    expect(doc.getCell(center.rx, center.ry).height).toBe(2)
    expect(doc.getCell(mid.rx, mid.ry).height).toBe(1)
    expect(doc.getCell(outer.rx, outer.ry).height).toBe(0)
    expect(doc.getCell(outer.rx, outer.ry).tileNum).toBeGreaterThan(0)
  })

  it('autoLevel raises morphable ground beside a higher cliff tile', () => {
    const theater = parseTheaterIni(HEIGHT_INI)
    const cliffShape: TmpTileShape = {
      cx: 1,
      cy: 1,
      subtiles: [{ terrainType: 0, zHeight: 4, hasPic: true }],
    }
    const shapes = new Map<number, TmpTileShape>([[1, cliffShape]])
    const lookup = lookupFromTheater(theater, shapes)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a, b } = playablePair()
    const cliff = doc.getCell(a.rx, a.ry)
    cliff.tileNum = 1
    cliff.height = 4
    doc.setCell(cliff)
    autoLevel(doc, lookup, theater)
    expect(doc.getCell(b.rx, b.ry).height).toBeGreaterThanOrEqual(4)
  })
})
