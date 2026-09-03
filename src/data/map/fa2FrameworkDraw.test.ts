import { describe, expect, it } from 'vitest'
import { cellHighlightColor } from './fa2CellCursor'
import { SLOPE_UP_LEFT, SLOPE_UP_LEFTTOP, SLOPE_UP_RIGHT } from './fa2Slopes'
import {
  FRAMEWORK_RISER_FILL,
  frameworkCellDraw,
  frameworkPaintsRiser,
  frameworkRampNs,
  frameworkSetLabel,
  frameworkSurfaceHeights,
  paintFrameworkCell,
} from './fa2FrameworkDraw'
import { parseTheaterIni } from './theaterIndex'

const THEATER = `
[General]
ClearTile=0
CliffSet=1
WaterSet=2
ShorePieces=3
RampBase=4
HeightBase=5

[TileSet0000]
FileName=Clear
SetName=Lat Grass
TilesInSet=1

[TileSet0001]
FileName=Cliff
SetName=Cliff Set
TilesInSet=40
MarbleMadness=6

[TileSet0002]
FileName=Water
SetName=Water
TilesInSet=1
MarbleMadness=7

[TileSet0003]
FileName=Shore
SetName=Shore Pieces
TilesInSet=1
MarbleMadness=8

[TileSet0004]
FileName=slope
SetName=Ramps
TilesInSet=18
MarbleMadness=9

[TileSet0005]
FileName=hyte
SetName=Newest MM Height
TilesInSet=15

[TileSet0006]
FileName=Mclif
SetName=ZMM Cliff Set
TilesInSet=40

[TileSet0007]
FileName=MWater
SetName=ZMM Water
TilesInSet=1

[TileSet0008]
FileName=MShore
SetName=ZMM Shore
TilesInSet=1

[TileSet0009]
FileName=mslop
SetName=ZMM Ramps
TilesInSet=18
`

describe('frameworkCellDraw', () => {
  it('uses FA2 highlight colors for height 0 / 1 / 6 without a label', () => {
    const index = parseTheaterIni(THEATER)
    expect(frameworkCellDraw(0, 0, index)).toMatchObject({
      kind: 'height',
      fill: cellHighlightColor(0),
      label: null,
      riserText: null,
    })
    expect(frameworkCellDraw(0, 1, index)).toMatchObject({
      kind: 'height',
      fill: cellHighlightColor(1),
      label: null,
      riserText: '1',
    })
    expect(frameworkCellDraw(0, 6, index)).toMatchObject({
      kind: 'height',
      fill: cellHighlightColor(6),
      label: null,
      riserText: '6',
    })
  })

  it('labels Cliff tile 18 as C18', () => {
    const index = parseTheaterIni(THEATER)
    const cliffStart = index.sets[1].startTileNum
    expect(frameworkSetLabel('Cliff', 17)).toBe('C18')
    expect(frameworkCellDraw(cliffStart + 17, 0, index)).toMatchObject({
      kind: 'cliff',
      fill: '#ff3232',
      label: 'C18',
    })
  })

  it('colors mapped water / shore / ramp sets', () => {
    const index = parseTheaterIni(THEATER)
    expect(frameworkCellDraw(index.sets[2].startTileNum, 0, index).kind).toBe('water')
    expect(frameworkCellDraw(index.sets[3].startTileNum, 0, index).kind).toBe('shore')
    expect(frameworkCellDraw(index.sets[4].startTileNum, 0, index).kind).toBe('ramp')
  })

  it('tilts RampBase pieces instead of drawing a flat platform', () => {
    const index = parseTheaterIni(THEATER)
    const rampStart = index.sets[4].startTileNum
    expect(frameworkRampNs(rampStart + SLOPE_UP_RIGHT - 1, index)).toBe(SLOPE_UP_RIGHT)
    expect(frameworkCellDraw(rampStart + SLOPE_UP_LEFT - 1, 2, index)).toMatchObject({
      kind: 'ramp',
      label: 'S3',
      riserText: null,
    })
    expect(frameworkSurfaceHeights(rampStart + SLOPE_UP_RIGHT - 1, 0, index)).toEqual([0, 1, 1, 0])
    expect(frameworkSurfaceHeights(rampStart + SLOPE_UP_LEFT - 1, 2, index)).toEqual([3, 2, 2, 3])
    expect(frameworkSurfaceHeights(rampStart + SLOPE_UP_LEFTTOP - 1, 1, index)).toEqual([2, 1, 1, 1])
    expect(frameworkSurfaceHeights(0, 3, index)).toEqual([3, 3, 3, 3])
  })

  it('does not paint white risers on raised floors or ramps', () => {
    const fills: string[] = []
    const ctx = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() { fills.push(String(this.fillStyle)) },
      stroke() {},
      fillText() {},
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D
    const index = parseTheaterIni(THEATER)
    expect(frameworkPaintsRiser('height')).toBe(false)
    expect(frameworkPaintsRiser('ramp')).toBe(false)
    expect(frameworkPaintsRiser('cliff')).toBe(true)
    paintFrameworkCell(ctx, { rx: 10, ry: 10, height: 1, tileNum: 0, isoSize: 20, index })
    paintFrameworkCell(ctx, {
      rx: 11,
      ry: 10,
      height: 0,
      tileNum: index.sets[4].startTileNum,
      isoSize: 20,
      index,
    })
    expect(fills).not.toContain(FRAMEWORK_RISER_FILL)
  })

  it('keeps only height color when theater.ini is missing', () => {
    expect(frameworkCellDraw(49, 6, null)).toEqual({
      kind: 'height',
      fill: cellHighlightColor(6),
      stroke: '#1e293b',
      label: null,
      riserText: '6',
    })
  })
})
