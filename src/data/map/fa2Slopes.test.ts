import { describe, expect, it } from 'vitest'
import { changeMapHeight, createSlopesAt, SLOPE_UP_LEFT } from './fa2Slopes'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { parseTheaterIni } from './theaterIndex'

const SLOPE_INI = `
[General]
ClearTile=0
RampBase=1
RampSmooth=2
[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
Morphable=true
[TileSet0001]
FileName=RAMP
SetName=RampBase
TilesInSet=20
Morphable=true
[TileSet0002]
FileName=RSMOOTH
SetName=RampSmooth
TilesInSet=1
Morphable=true
`

function validPairNorth(): { center: { rx: number; ry: number }; north: { rx: number; ry: number } } {
  let found: { center: { rx: number; ry: number }; north: { rx: number; ry: number } } | null = null
  forEachIsoCell(16, 16, (cell) => {
    if (found) return
    const north = { rx: cell.rx, ry: cell.ry - 1 }
    if (!isValidIsoCell(cell.rx, cell.ry, 16, 16)) return
    if (!isValidIsoCell(north.rx, north.ry, 16, 16)) return
    found = { center: { rx: cell.rx, ry: cell.ry }, north }
  })
  if (!found) throw new Error('no pair')
  return found
}

describe('FA2 CreateSlopesAt', () => {
  it('places RampBase+SLOPE_UP_LEFT-1 when the -Y neighbor is one higher', () => {
    const theater = parseTheaterIni(SLOPE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { center, north } = validPairNorth()
    const high = doc.getCell(north.rx, north.ry)
    high.height = 1
    doc.setCell(high)
    createSlopesAt(doc, center.rx, center.ry, theater)
    expect(doc.getCell(center.rx, center.ry).tileNum).toBe(1 + SLOPE_UP_LEFT - 1)
  })

  it('raises a morphable saddle between two higher neighbors', () => {
    const theater = parseTheaterIni(SLOPE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    let center: { rx: number; ry: number } | null = null
    forEachIsoCell(16, 16, (cell) => {
      if (center) return
      const west = { rx: cell.rx - 1, ry: cell.ry }
      const east = { rx: cell.rx + 1, ry: cell.ry }
      if (![cell, west, east].every((item) => isValidIsoCell(item.rx, item.ry, 16, 16))) return
      center = { rx: cell.rx, ry: cell.ry }
    })
    if (!center) throw new Error('no center')
    for (const [dx] of [[-1], [1]]) {
      const n = doc.getCell(center.rx + dx, center.ry)
      n.height = 2
      doc.setCell(n)
    }
    const before = doc.getCell(center.rx, center.ry).height
    createSlopesAt(doc, center.rx, center.ry, theater)
    expect(doc.getCell(center.rx, center.ry).height).toBeGreaterThan(before)
  })

  it('changeMapHeight shifts every cell or rejects out-of-range', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    expect(changeMapHeight(doc, 2)).toBeNull()
    expect(doc.getCell(12, 12).height).toBe(2)
    expect(changeMapHeight(doc, 20)).toBeTruthy()
    expect(doc.getCell(12, 12).height).toBe(2)
  })
})
