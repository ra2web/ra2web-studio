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
    // Studio 直译：x_diff = Δrx，y_diff = Δry。陡沿 ry 的线吸附成 horiz。
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

  it('does not switch a straight run to corner tiles just because the previous stamp is cliff', () => {
    const theater = cliffTheater()
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const cells: Array<{ rx: number; ry: number }> = []
    forEachIsoCell(24, 24, (cell) => {
      if (cells.length < 20) cells.push({ rx: cell.rx, ry: cell.ry })
    })
    const from = cells[2]
    const to = { rx: from.rx, ry: from.ry + 8 }
    placeFa2Cliff(doc, from, to, theater, 'TEMPERATE', {
      face: 'front',
      pick: (tiles) => tiles[0] ?? -1,
    })
    const counts = new Map<number, number>()
    forEachIsoCell(24, 24, (cell) => {
      const tileNum = doc.getCell(cell.rx, cell.ry).tileNum
      if (tileNum < 1 || tileNum >= 41) return
      counts.set(tileNum, (counts.get(tileNum) ?? 0) + 1)
    })
    // 沿 ry 的线是 horiz 走线：直线件 4..7（tileNum 5..8），转角件 horiz_cornertop=1（tileNum 2）。
    const cornerTile = 1 + 1
    expect(counts.get(cornerTile) ?? 0).toBe(0)
    expect([...counts.keys()].some((tileNum) => tileNum >= 5 && tileNum <= 8)).toBe(true)
  })

  it('does not write TMP subtiles without a picture, matching FA2 pic!=NULL', () => {
    const theater = cliffTheater()
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const cells: Array<{ rx: number; ry: number }> = []
    forEachIsoCell(24, 24, (cell) => {
      if (cells.length < 20) cells.push({ rx: cell.rx, ry: cell.ry })
    })
    const from = cells[2]
    const to = { rx: from.rx, ry: from.ry + 4 }
    placeFa2Cliff(doc, from, to, theater, 'TEMPERATE', {
      face: 'front',
      pick: (tiles) => tiles[0] ?? -1,
      shapeOf: () => ({
        cx: 2,
        cy: 2,
        subtiles: [
          { terrainType: 0, zHeight: 4, hasPic: true },
          { terrainType: 0, zHeight: 0, hasPic: false },
          { terrainType: 0, zHeight: 4, hasPic: true },
          { terrainType: 0, zHeight: 0, hasPic: false },
        ],
      }),
    })
    let cliffs = 0
    let heightZeroCliffs = 0
    forEachIsoCell(24, 24, (cell) => {
      const mapCell = doc.getCell(cell.rx, cell.ry)
      if (mapCell.tileNum < 1 || mapCell.tileNum >= 41) return
      cliffs += 1
      if (mapCell.height === 0) heightZeroCliffs += 1
    })
    expect(cliffs).toBeGreaterThan(0)
    expect(cliffs).toBeLessThan(8)
    expect(heightZeroCliffs).toBe(0)
  })
})
