import { describe, expect, it } from 'vitest'
import {
  emptyHideView,
  hideFieldAt,
  hideTileSetAt,
  isCellHidden,
  showAllFields,
  showAllTileSets,
} from './fa2Hide'
import type { TheaterIndex } from './theaterIndex'

function indexWithSet(startTileNum: number, tilesInSet = 4): TheaterIndex {
  return {
    general: {},
    tileCount: startTileNum + tilesInSet,
    sets: [{
      setIndex: 3,
      fileName: 'clear',
      setName: 'Clear',
      tilesInSet,
      startTileNum,
      marbleMadnessSet: -1,
      allowTiberium: false,
      morphable: true,
    }],
  }
}

describe('FA2 hide tileset / field', () => {
  it('hides a whole tileset from theater.ini set index', () => {
    const index = indexWithSet(10)
    let hide = emptyHideView()
    hide = hideTileSetAt(hide, 11, index)
    expect(isCellHidden(12, 12, 11, hide, index)).toBe(true)
    expect(isCellHidden(8, 8, 9, hide, index)).toBe(false)
  })

  it('falls back to tileNum when no theater index', () => {
    let hide = emptyHideView()
    hide = hideTileSetAt(hide, 7)
    expect(isCellHidden(12, 12, 7, hide)).toBe(true)
    expect(isCellHidden(12, 13, 8, hide)).toBe(false)
  })

  it('hides a single field and restores with ShowAll', () => {
    let hide = hideFieldAt(emptyHideView(), 12, 12)
    expect(isCellHidden(12, 12, 0, hide)).toBe(true)
    expect(isCellHidden(12, 13, 0, hide)).toBe(false)
    hide = showAllFields(hide)
    expect(isCellHidden(12, 12, 0, hide)).toBe(false)
  })

  it('ShowAllTileSets keeps hidden fields', () => {
    let hide = hideFieldAt(emptyHideView(), 4, 5)
    hide = hideTileSetAt(hide, 1)
    hide = showAllTileSets(hide)
    expect(isCellHidden(4, 5, 1, hide)).toBe(true)
    expect(isCellHidden(1, 1, 1, hide)).toBe(false)
  })
})
