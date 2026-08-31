import { describe, expect, it } from 'vitest'
import { forEachIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { applyLatAt } from './lat'
import { parseTheaterIni, tmpFileName, TheaterRules } from './theaterIndex'

const SAMPLE_INI = `
[General]
ClearTile=0
SandTile=1
ClearToSandLat=2
CliffSet=3
WaterSet=4
ShorePieces=5
RampBase=6
RampSmooth=7

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

[TileSet0004]
FileName=WAT
SetName=Water
TilesInSet=1

[TileSet0005]
FileName=SHORE
SetName=Shore
TilesInSet=1

[TileSet0006]
FileName=RAMP
SetName=RampBase
TilesInSet=1

[TileSet0007]
FileName=RSMOOTH
SetName=RampSmooth
TilesInSet=12
`

function firstTwoNeighbors(): { a: { rx: number; ry: number }; b: { rx: number; ry: number } } {
  let a: { rx: number; ry: number } | null = null
  let b: { rx: number; ry: number } | null = null
  forEachIsoCell(16, 16, (cell) => {
    if (a && b) return
    if (!a) {
      a = { rx: cell.rx, ry: cell.ry }
      return
    }
    if (cell.rx === a.rx + 1 && cell.ry === a.ry) b = { rx: cell.rx, ry: cell.ry }
  })
  if (!a || !b) throw new Error('expected iso neighbors')
  return { a, b }
}

describe('parseTheaterIni', () => {
  it('assigns sequential tile numbers and LAT general keys', () => {
    const index = parseTheaterIni(SAMPLE_INI)
    expect(index.sets).toHaveLength(8)
    expect(index.sets[1].startTileNum).toBe(1)
    expect(index.general.SandTile).toBe(1)
    expect(tmpFileName(index.sets[0], 0, '.tem')).toBe('clear01.tem')
    expect(new TheaterRules(index).getCLATSet(1)).toBe(2)
  })
})

describe('applyLatAt', () => {
  it('turns a sand tile beside clear into a ClearToSandLat transition', () => {
    const index = parseTheaterIni(SAMPLE_INI)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const { a, b } = firstTwoNeighbors()
    const sand = doc.getCell(a.rx, a.ry)
    sand.tileNum = 1
    doc.setCell(sand)
    const clear = doc.getCell(b.rx, b.ry)
    clear.tileNum = 0
    doc.setCell(clear)
    applyLatAt(doc, a.rx, a.ry, index)
    const result = doc.getCell(a.rx, a.ry).tileNum
    expect(result).toBeGreaterThanOrEqual(2)
    expect(result).toBeLessThan(18)
  })
})
