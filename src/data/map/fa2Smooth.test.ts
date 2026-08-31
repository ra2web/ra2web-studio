import { describe, expect, it } from 'vitest'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { parseTheaterIni } from './theaterIndex'
import { smoothAllAt, smoothAt } from './fa2Smooth'
import { applyLatAt } from './lat'

const LAT_INI = `
[General]
ClearTile=0
SandTile=1
ClearToSandLat=2
CliffSet=3

[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1

[TileSet0001]
FileName=SAND
SetName=Sand
TilesInSet=1

[TileSet0002]
FileName=LAT1
SetName=ClearToSandLat
TilesInSet=16

[TileSet0003]
FileName=CLF
SetName=Cliff
TilesInSet=1
`

function firstCell(): { rx: number; ry: number } {
  let found: { rx: number; ry: number } | null = null
  forEachIsoCell(16, 16, (cell) => {
    if (!found) found = { rx: cell.rx, ry: cell.ry }
  })
  if (!found) throw new Error('no cell')
  return found
}

describe('FA2 SmoothAt', () => {
  it('turns an isolated sand cell into a CLAT piece', () => {
    const theater = parseTheaterIni(LAT_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    const cell = doc.getCell(origin.rx, origin.ry)
    cell.tileNum = 1
    doc.setCell(cell)
    smoothAt(doc, origin.rx, origin.ry, theater, 1, 2, 0)
    const tileNum = doc.getCell(origin.rx, origin.ry).tileNum
    expect(tileNum).toBeGreaterThanOrEqual(2)
    expect(tileNum).toBeLessThan(18)
  })

  it('keeps fully surrounded sand as the Smooth set', () => {
    const theater = parseTheaterIni(LAT_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    let center: { rx: number; ry: number } | null = null
    forEachIsoCell(16, 16, (cell) => {
      if (center) return
      const neighbors = [
        { rx: cell.rx - 1, ry: cell.ry },
        { rx: cell.rx + 1, ry: cell.ry },
        { rx: cell.rx, ry: cell.ry - 1 },
        { rx: cell.rx, ry: cell.ry + 1 },
      ]
      if (neighbors.every((item) => isValidIsoCell(item.rx, item.ry, 16, 16))) {
        center = { rx: cell.rx, ry: cell.ry }
      }
    })
    if (!center) center = { rx: 10, ry: 12 }
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const cell = doc.getCell(center.rx + dx, center.ry + dy)
      cell.tileNum = 1
      doc.setCell(cell)
    }
    smoothAllAt(doc, center.rx, center.ry, theater)
    expect(doc.getCell(center.rx, center.ry).tileNum).toBe(1)
  })

  it('applyLatAt still produces a ClearToSandLat tile', () => {
    const theater = parseTheaterIni(LAT_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const origin = firstCell()
    const sand = doc.getCell(origin.rx, origin.ry)
    sand.tileNum = 1
    doc.setCell(sand)
    applyLatAt(doc, origin.rx, origin.ry, theater)
    const tileNum = doc.getCell(origin.rx, origin.ry).tileNum
    expect(tileNum).toBeGreaterThanOrEqual(2)
    expect(tileNum).toBeLessThan(18)
  })
})
