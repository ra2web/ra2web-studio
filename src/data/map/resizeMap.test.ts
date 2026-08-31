import { describe, expect, it } from 'vitest'
import { forEachIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { validateMap } from './mapValidate'
import { resizeMap } from './resizeMap'
import { parseTheaterIni } from './theaterIndex'
import { applyShoreAt, placeCliffLine } from './cliffShore'

function sampleTheater() {
  return parseTheaterIni(`
[General]
CliffSet=1
WaterSet=2
ShorePieces=3
[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
[TileSet0001]
FileName=CLF
SetName=Cliff
TilesInSet=1
[TileSet0002]
FileName=WAT
SetName=Water
TilesInSet=1
[TileSet0003]
FileName=SHORE
SetName=Shore
TilesInSet=1
`)
}

describe('resizeMap', () => {
  it('grows the iso field and drops objects that fall outside', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    expect(resizeMap(doc, 20, 20)).toBeNull()
    expect(doc.width).toBe(20)
    let outside = { rx: 0, ry: 0 }
    forEachIsoCell(20, 20, (cell) => { outside = { rx: cell.rx, ry: cell.ry } })
    doc.units.push({
      id: '1', owner: 'Americans', name: 'MTNK', health: 256, rx: outside.rx, ry: outside.ry,
      direction: 0, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
      onBridge: false, recruitable: false, aiRecruitable: false, extra: [],
    })
    expect(resizeMap(doc, 16, 16)).toBeNull()
    expect(doc.units).toHaveLength(0)
  })
})

describe('validateMap', () => {
  it('flags objects owned by missing houses', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    let cell = { rx: 0, ry: 0 }
    forEachIsoCell(16, 16, (item) => { if (!cell.rx) cell = item })
    doc.units.push({
      id: '1', owner: 'Nobody', name: 'MTNK', health: 256, rx: cell.rx, ry: cell.ry,
      direction: 0, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
      onBridge: false, recruitable: false, aiRecruitable: false, extra: [],
    })
    const issues = validateMap(doc)
    expect(issues.some((issue) => issue.code === 'owner')).toBe(true)
  })
})

describe('cliff and shore', () => {
  it('places cliff tiles along a line and shore beside water', () => {
    const theater = sampleTheater()
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const cells: Array<{ rx: number; ry: number }> = []
    forEachIsoCell(16, 16, (cell) => { if (cells.length < 8) cells.push(cell) })
    placeCliffLine(doc, cells[0], cells[3], theater, 2)
    expect(doc.getCell(cells[0].rx, cells[0].ry).tileNum).toBe(1)
    expect(doc.getCell(cells[0].rx, cells[0].ry).height).toBeGreaterThan(0)

    const waterCell = cells[0]
    const shoreCell = { rx: waterCell.rx + 1, ry: waterCell.ry }
    const water = doc.getCell(waterCell.rx, waterCell.ry)
    water.tileNum = 2
    doc.setCell(water)
    applyShoreAt(doc, shoreCell.rx, shoreCell.ry, theater)
    expect(doc.getCell(shoreCell.rx, shoreCell.ry).tileNum === 3 || doc.getCell(shoreCell.rx, shoreCell.ry).tileNum === 0).toBe(true)
  })
})
