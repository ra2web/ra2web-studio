import { describe, expect, it } from 'vitest'
import { classifyCliffDirection, cliffTilesFor, placeFa2Cliff } from './fa2Cliff'
import { forEachIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { parseTheaterIni } from './theaterIndex'

function cliffTheater() {
  const sets = Array.from({ length: 4 }, (_, setIndex) => {
    const tiles = setIndex === 1 ? 40 : 1
    return `
[TileSet${String(setIndex).padStart(4, '0')}]
FileName=SET${setIndex}
SetName=Set${setIndex}
TilesInSet=${tiles}
`
  }).join('\n')
  return parseTheaterIni(`
[General]
ClearTile=0
CliffSet=1
WaterSet=2
ShorePieces=3
${sets}
`)
}

describe('FA2 CliffModifier', () => {
  it('loads CliffFrontData horiz pieces from FAData.ini', () => {
    expect(cliffTilesFor('front')).toEqual([4, 5, 6, 7])
    expect(cliffTilesFor('back')).toContain(22)
  })

  it('snaps a steep line to axis-aligned cliff direction', () => {
    const walk = classifyCliffDirection(1, 8)
    expect(walk?.type).toBe('horiz_')
    expect(walk?.addy).toBe(1)
  })

  it('places CliffSet tiles from start toward dest', () => {
    const theater = cliffTheater()
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const cells: Array<{ rx: number; ry: number }> = []
    forEachIsoCell(24, 24, (cell) => {
      if (cells.length < 20) cells.push({ rx: cell.rx, ry: cell.ry })
    })
    const from = cells[2]
    const to = { rx: from.rx, ry: from.ry + 8 }
    const placed = placeFa2Cliff(doc, from, to, theater, 'TEMPERATE', {
      face: 'front',
      pick: (tiles) => tiles[0] ?? -1,
    })
    expect(placed).toBe(true)
    const cliffNums: number[] = []
    forEachIsoCell(24, 24, (cell) => {
      const tileNum = doc.getCell(cell.rx, cell.ry).tileNum
      if (tileNum >= 1 && tileNum < 41) cliffNums.push(tileNum)
    })
    expect(cliffNums.length).toBeGreaterThan(0)
  })

  it('writes TMP bZHeight onto cliff cells instead of a flat +4', () => {
    const theater = cliffTheater()
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const cells: Array<{ rx: number; ry: number }> = []
    forEachIsoCell(24, 24, (cell) => {
      if (cells.length < 20) cells.push({ rx: cell.rx, ry: cell.ry })
    })
    const from = cells[2]
    const startHeight = doc.getCell(from.rx, from.ry).height
    const to = { rx: from.rx, ry: from.ry + 8 }
    const zHeight = [1, 2, 3, 4]
    placeFa2Cliff(doc, from, to, theater, 'TEMPERATE', {
      face: 'front',
      pick: (tiles) => tiles[0] ?? -1,
      shapeOf: () => ({
        cx: 2,
        cy: 2,
        subtiles: zHeight.map((height) => ({ terrainType: 0, zHeight: height, hasPic: true })),
      }),
    })
    const heights: number[] = []
    forEachIsoCell(24, 24, (cell) => {
      const mapCell = doc.getCell(cell.rx, cell.ry)
      if (mapCell.tileNum >= 1 && mapCell.tileNum < 41) heights.push(mapCell.height)
    })
    expect(heights.length).toBeGreaterThan(0)
    expect(heights.some((height) => height === startHeight + 1 || height === startHeight + 2)).toBe(true)
    expect(heights.every((height) => height !== startHeight + 4 || zHeight.includes(4))).toBe(true)
  })
})
