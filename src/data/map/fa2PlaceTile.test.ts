import { describe, expect, it } from 'vitest'
import { RA2_ISO_TILE_WIDTH } from './constants'
import { forEachIsoCell, isValidIsoCell, projectCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { fa2PlaceTileCells, placeFa2Tile, usesFa2PlaceTile } from './fa2PlaceTile'
import { shapeFromTmp, type TmpTileShape } from './tmpCatalog'

function firstCell(width = 24, height = 24): { rx: number; ry: number } {
  let found: { rx: number; ry: number } | null = null
  forEachIsoCell(width, height, (cell) => {
    if (found) return
    if (
      isValidIsoCell(cell.rx, cell.ry, width, height)
      && isValidIsoCell(cell.rx - 1, cell.ry - 1, width, height)
      && isValidIsoCell(cell.rx - 1, cell.ry, width, height)
      && isValidIsoCell(cell.rx, cell.ry - 1, width, height)
    ) {
      found = { rx: cell.rx, ry: cell.ry }
    }
  })
  if (!found) throw new Error('no cell')
  return found
}

function rampShape(): TmpTileShape {
  return {
    cx: 2,
    cy: 2,
    subtiles: [
      { terrainType: 0, zHeight: 0, hasPic: true },
      { terrainType: 0, zHeight: 0, hasPic: true },
      { terrainType: 0, zHeight: 4, hasPic: true },
      { terrainType: 0, zHeight: 4, hasPic: true },
    ],
  }
}

describe('FA2 PlaceTile', () => {
  it('anchors the TMP at the click cell as the bottom-right subtile', () => {
    const cells = fa2PlaceTileCells(10, 10, rampShape())
    expect(cells).toEqual([
      { rx: 9, ry: 9, subTile: 0 },
      { rx: 9, ry: 10, subTile: 1 },
      { rx: 10, ry: 9, subTile: 2 },
      { rx: 10, ry: 10, subTile: 3 },
    ])
  })

  it('writes BridgeSet-style ramps with subtiles and z height', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const click = firstCell()
    const origin = { rx: click.rx - 1, ry: click.ry - 1 }
    doc.getCell(click.rx, click.ry).height = 4
    doc.setCell(doc.getCell(click.rx, click.ry))
    placeFa2Tile(doc, click.rx, click.ry, 80, rampShape())
    expect(doc.getCell(origin.rx, origin.ry)).toMatchObject({ tileNum: 80, subTile: 0, height: 4 })
    expect(doc.getCell(origin.rx, click.ry)).toMatchObject({ tileNum: 80, subTile: 1, height: 4 })
    expect(doc.getCell(click.rx, origin.ry)).toMatchObject({ tileNum: 80, subTile: 2, height: 8 })
    expect(doc.getCell(click.rx, click.ry)).toMatchObject({ tileNum: 80, subTile: 3, height: 8 })
  })

  it('skips TMP holes without a picture', () => {
    const shape: TmpTileShape = {
      cx: 2,
      cy: 1,
      subtiles: [
        { terrainType: 0, zHeight: 0, hasPic: true },
        { terrainType: 0, zHeight: 0, hasPic: false },
      ],
    }
    expect(fa2PlaceTileCells(5, 5, shape)).toEqual([{ rx: 4, ry: 5, subTile: 0 }])
  })

  it('uses PlaceTile for BridgeSet even when the TMP is 1×1', () => {
    const theater = {
      general: { BridgeSet: 2 },
      sets: [
        { setIndex: 0, startTileNum: 0, tilesInSet: 1, fileName: 'clear', setName: 'Clear', marbleMadnessSet: -1, allowTiberium: true, morphable: true },
        { setIndex: 2, startTileNum: 10, tilesInSet: 4, fileName: 'bridge', setName: 'Bridges', marbleMadnessSet: -1, allowTiberium: false, morphable: false },
      ],
      tileCount: 14,
    }
    const one: TmpTileShape = { cx: 1, cy: 1, subtiles: [{ terrainType: 0, zHeight: 0, hasPic: true }] }
    const two: TmpTileShape = { cx: 2, cy: 1, subtiles: [{ terrainType: 0, zHeight: 0, hasPic: true }, { terrainType: 0, zHeight: 0, hasPic: true }] }
    expect(usesFa2PlaceTile(one, 0, theater)).toBe(false)
    expect(usesFa2PlaceTile(one, 10, theater)).toBe(true)
    expect(usesFa2PlaceTile(two, 0, theater)).toBe(true)
  })

  it('places a FA2-swapped 2×1 road along +ry so shared extra keeps one origin', () => {
    const shape = shapeFromTmp({
      width: 2,
      height: 1,
      images: [
        { terrainType: 0, height: 0, tileData: new Uint8Array([1]) },
        { terrainType: 0, height: 0, tileData: new Uint8Array([1]) },
      ],
    }, true)
    expect(shape).toMatchObject({ cx: 1, cy: 2 })
    const cells = fa2PlaceTileCells(10, 10, shape)
    expect(cells).toEqual([
      { rx: 10, ry: 9, subTile: 0 },
      { rx: 10, ry: 10, subTile: 1 },
    ])
    const extraX = 0
    const headers = [0, 30]
    const isoSize = 20
    const extraWorldX = cells.map((cell, index) => {
      const origin = projectCell(cell.rx, cell.ry, 0, isoSize)
      return origin.px - RA2_ISO_TILE_WIDTH / 2 + extraX - headers[index]
    })
    expect(extraWorldX[0]).toBe(extraWorldX[1])
  })
})
