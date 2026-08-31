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
})
