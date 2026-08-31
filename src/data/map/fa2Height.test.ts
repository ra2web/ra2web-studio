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

  it('heightenGround raises same-height morphable cells in the brush', () => {
    const theater = parseTheaterIni(HEIGHT_INI)
    const lookup = lookupFromTheater(theater)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a } = playablePair()
    heightenGround(doc, a.rx, a.ry, lookup, theater, { brush: 1, slopeCorrection: false })
    expect(doc.getCell(a.rx, a.ry).height).toBe(1)
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
