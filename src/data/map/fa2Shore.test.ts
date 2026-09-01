import { describe, expect, it } from 'vitest'
import {
  autoCreateShores,
  createShore,
  createShoreAt,
  isShoreTransition,
  softTileSetNames,
  TERRAIN_GROUND,
  TERRAIN_WATER,
  type ShorePiece,
} from './fa2Shore'
import { applyShoreAt } from './cliffShore'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { parseTheaterIni } from './theaterIndex'

const SHORE_INI = `
[General]
ClearTile=0
WaterSet=1
ShorePieces=2
CliffSet=3
[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
[TileSet0001]
FileName=WAT
SetName=Water
TilesInSet=1
[TileSet0002]
FileName=SHORE
SetName=Shore
TilesInSet=16
[TileSet0003]
FileName=CLF
SetName=Cliff
TilesInSet=1
`

function firstPair(): { land: { rx: number; ry: number }; water: { rx: number; ry: number } } {
  let found: { land: { rx: number; ry: number }; water: { rx: number; ry: number } } | null = null
  forEachIsoCell(16, 16, (cell) => {
    if (found) return
    const neighbor = { rx: cell.rx + 1, ry: cell.ry }
    if (!isValidIsoCell(cell.rx, cell.ry, 16, 16)) return
    if (!isValidIsoCell(neighbor.rx, neighbor.ry, 16, 16)) return
    found = { land: { rx: cell.rx, ry: cell.ry }, water: neighbor }
  })
  if (!found) throw new Error('no pair')
  return found
}

describe('FA2 CreateShore', () => {
  it('reads SoftTileSets from bundled FAData.ini', () => {
    const names = softTileSetNames()
    expect(names).toContain('WaterSet')
    expect(names).toContain('ShorePieces')
    expect(names).toContain('ClearTile')
  })

  it('places a ShorePieces tile on land that touches water', () => {
    const theater = parseTheaterIni(SHORE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { land, water } = firstPair()
    const waterCell = doc.getCell(water.rx, water.ry)
    waterCell.tileNum = 1
    doc.setCell(waterCell)
    applyShoreAt(doc, land.rx, land.ry, theater)
    const tileNum = doc.getCell(land.rx, land.ry).tileNum
    expect(tileNum).toBeGreaterThanOrEqual(2)
    expect(tileNum).toBeLessThan(18)
  })

  it('fits a catalog 2×1 shore TMP against water/ground like FA2', () => {
    const theater = parseTheaterIni(SHORE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { land, water } = firstPair()
    const waterCell = doc.getCell(water.rx, water.ry)
    waterCell.tileNum = 1
    doc.setCell(waterCell)
    const piece: ShorePiece = {
      setOffset: 4,
      cx: 2,
      cy: 1,
      terrain: [TERRAIN_GROUND, TERRAIN_WATER],
      hasPic: [true, true],
      zHeight: [2, 0],
    }
    createShore(doc, land.rx, land.ry, land.rx + 2, land.ry + 1, theater, [piece])
    expect(doc.getCell(land.rx, land.ry).tileNum).toBe(2 + 4)
    expect(doc.getCell(water.rx, water.ry).tileNum).toBe(2 + 4)
    expect(doc.getCell(water.rx, water.ry).subTile).toBe(1)
    expect(doc.getCell(land.rx, land.ry).height).toBe(2)
    expect(doc.getCell(water.rx, water.ry).height).toBe(0)
  })

  it('with removeUseless, turns isolated water into clear', () => {
    const theater = parseTheaterIni(SHORE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { water } = firstPair()
    const cell = doc.getCell(water.rx, water.ry)
    cell.tileNum = 1
    doc.setCell(cell)
    createShore(doc, water.rx - 1, water.ry - 1, water.rx + 2, water.ry + 2, theater, [], true)
    expect(doc.getCell(water.rx, water.ry).tileNum).toBe(0)
  })

  it('autoCreateShores matches FA2 full-map removeUseless', () => {
    const theater = parseTheaterIni(SHORE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { water } = firstPair()
    const cell = doc.getCell(water.rx, water.ry)
    cell.tileNum = 1
    doc.setCell(cell)
    autoCreateShores(doc, theater)
    expect(doc.getCell(water.rx, water.ry).tileNum).toBe(0)
  })

  it('turns a fully water-surrounded leftover shore into water', () => {
    const theater = parseTheaterIni(SHORE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    let center: { rx: number; ry: number } | null = null
    forEachIsoCell(16, 16, (cell) => {
      if (center) return
      const ring = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      if (ring.every(([dx, dy]) => isValidIsoCell(cell.rx + dx, cell.ry + dy, 16, 16))) {
        center = { rx: cell.rx, ry: cell.ry }
      }
    })
    if (!center) throw new Error('no center')
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const cell = doc.getCell(center.rx + dx, center.ry + dy)
      cell.tileNum = 1
      doc.setCell(cell)
    }
    const shore = doc.getCell(center.rx, center.ry)
    shore.tileNum = 2
    doc.setCell(shore)
    createShoreAt(doc, center.rx, center.ry, theater, 1)
    expect(doc.getCell(center.rx, center.ry).tileNum).toBe(1)
  })

  it('does not paint inland land when shore catalog has all-ground pieces', () => {
    const theater = parseTheaterIni(SHORE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    let blob: { land: { rx: number; ry: number }; waters: Array<{ rx: number; ry: number }> } | null = null
    forEachIsoCell(16, 16, (cell) => {
      if (blob) return
      const waters = [
        { rx: cell.rx + 1, ry: cell.ry },
        { rx: cell.rx + 2, ry: cell.ry },
        { rx: cell.rx + 1, ry: cell.ry + 1 },
        { rx: cell.rx + 2, ry: cell.ry + 1 },
      ]
      if (!isValidIsoCell(cell.rx, cell.ry, 16, 16)) return
      if (!waters.every((item) => isValidIsoCell(item.rx, item.ry, 16, 16))) return
      blob = { land: { rx: cell.rx, ry: cell.ry }, waters }
    })
    if (!blob) throw new Error('no water blob')
    const waters = blob.waters
    const edgeLand = blob.land
    for (const water of waters) {
      const cell = doc.getCell(water.rx, water.ry)
      cell.tileNum = 1
      doc.setCell(cell)
    }
    let far: { rx: number; ry: number } | null = null
    forEachIsoCell(16, 16, (cell) => {
      if (far) return
      if (waters.some((water) => Math.abs(cell.rx - water.rx) + Math.abs(cell.ry - water.ry) < 6)) return
      far = { rx: cell.rx, ry: cell.ry }
    })
    if (!far) throw new Error('no inland cell')
    const groundOnly: ShorePiece = {
      setOffset: 5,
      cx: 2,
      cy: 2,
      terrain: [TERRAIN_GROUND, TERRAIN_GROUND, TERRAIN_GROUND, TERRAIN_GROUND],
      hasPic: [true, true, true, true],
    }
    const edge: ShorePiece = {
      setOffset: 4,
      cx: 2,
      cy: 1,
      terrain: [TERRAIN_GROUND, TERRAIN_WATER],
      hasPic: [true, true],
    }
    expect(isShoreTransition(groundOnly)).toBe(false)
    expect(isShoreTransition(edge)).toBe(true)
    autoCreateShores(doc, theater, [groundOnly, edge])
    expect(doc.getCell(far.rx, far.ry).tileNum).toBe(0)
    expect(doc.getCell(edgeLand.rx, edgeLand.ry).tileNum).toBe(2 + 4)
    expect(doc.getCell(waters[0].rx, waters[0].ry).tileNum).toBe(2 + 4)
  })
})
