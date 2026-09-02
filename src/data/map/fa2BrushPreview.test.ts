import { describe, expect, it } from 'vitest'
import {
  EMPTY_OVERLAY,
  FA2_ORE_GEMS,
  FA2_ORE_RIPARIUS_FIXED,
  FA2_ORE_RIPARIUS_RANDOM_BASE,
  FA2_VEINS_DATA,
  OVRL_VEINHOLE,
  OVRL_VEINHOLEBORDER,
  OVRL_VEINS,
} from './constants'
import { FA2_DEFAULT_FACING } from './fa2Facing'
import {
  buildBrushGhosts,
  brushGhostCells,
  heightBrushCells,
  type BrushPreviewInput,
} from './fa2BrushPreview'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { OVRL_SMALL_BRIDGE_START } from './overlayTools'
import type { TmpTileShape } from './tmpCatalog'

function firstCell(width = 16, height = 16): { rx: number; ry: number } {
  let found: { rx: number; ry: number } | null = null
  forEachIsoCell(width, height, (cell) => {
    if (!found) found = { rx: cell.rx, ry: cell.ry }
  })
  if (!found) throw new Error('no cell')
  return found
}

function innerCell(): { rx: number; ry: number } {
  const width = 24
  const height = 24
  let found: { rx: number; ry: number } | null = null
  forEachIsoCell(width, height, (cell) => {
    if (found) return
    if (
      isValidIsoCell(cell.rx - 1, cell.ry - 1, width, height)
      && isValidIsoCell(cell.rx + 6, cell.ry, width, height)
      && isValidIsoCell(cell.rx, cell.ry - 1, width, height)
      && isValidIsoCell(cell.rx, cell.ry + 1, width, height)
    ) {
      found = { rx: cell.rx, ry: cell.ry }
    }
  })
  if (!found) throw new Error('no inner cell')
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

function input(partial: Partial<BrushPreviewInput> & Pick<BrushPreviewInput, 'tool'>): BrushPreviewInput {
  const doc = partial.doc ?? MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
  return {
    origin: firstCell(doc.width, doc.height),
    tileNum: 3,
    overlayId: 102,
    overlayData: 2,
    objectName: 'E1',
    owner: 'Neutral',
    brushW: 1,
    brushH: 1,
    brush: 1,
    oreRandom: false,
    bridgeKind: 'small',
    ...partial,
    doc,
  }
}

describe('buildBrushGhosts', () => {
  it('returns nothing for pan / select / height tools', () => {
    expect(buildBrushGhosts(input({ tool: 'pan' }))).toEqual([])
    expect(buildBrushGhosts(input({ tool: 'select' }))).toEqual([])
    expect(buildBrushGhosts(input({ tool: 'raise' }))).toEqual([])
  })

  it('previews a 2×1 tile brush as TMP ghosts on existing height', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = innerCell()
    doc.getCell(origin.rx, origin.ry).height = 2
    doc.setCell(doc.getCell(origin.rx, origin.ry))
    const next = doc.getCell(origin.rx + 1, origin.ry)
    const ghosts = buildBrushGhosts(input({ tool: 'tile', doc, origin, tileNum: 7, brushW: 2, brushH: 1 }))
    expect(ghosts).toEqual([
      { kind: 'tile', rx: origin.rx, ry: origin.ry, tileNum: 7, subTile: 0, height: 2 },
      { kind: 'tile', rx: origin.rx + 1, ry: origin.ry, tileNum: 7, subTile: 0, height: next.height },
    ])
  })

  it('previews PlaceTile ramps with subtiles and predicted height', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = innerCell()
    doc.getCell(origin.rx, origin.ry).height = 4
    doc.setCell(doc.getCell(origin.rx, origin.ry))
    const ghosts = buildBrushGhosts(input({
      tool: 'tile',
      doc,
      origin,
      tileNum: 80,
      tileShape: rampShape(),
    }))
    expect(ghosts).toEqual([
      { kind: 'tile', rx: origin.rx - 1, ry: origin.ry - 1, tileNum: 80, subTile: 0, height: 4 },
      { kind: 'tile', rx: origin.rx - 1, ry: origin.ry, tileNum: 80, subTile: 1, height: 4 },
      { kind: 'tile', rx: origin.rx, ry: origin.ry - 1, tileNum: 80, subTile: 2, height: 8 },
      { kind: 'tile', rx: origin.rx, ry: origin.ry, tileNum: 80, subTile: 3, height: 8 },
    ])
  })

  it('previews overlay, ore, gems and veins', () => {
    const origin = firstCell()
    expect(buildBrushGhosts(input({ tool: 'overlay', origin, overlayId: 0, overlayData: 3 }))).toEqual([
      { kind: 'overlay', rx: origin.rx, ry: origin.ry, overlayId: 0, overlayValue: 3 },
    ])
    expect(buildBrushGhosts(input({ tool: 'ore', origin }))[0]).toMatchObject({
      kind: 'overlay', overlayId: FA2_ORE_RIPARIUS_FIXED, overlayValue: 0,
    })
    expect(buildBrushGhosts(input({ tool: 'ore', origin, oreRandom: true }))[0]).toMatchObject({
      overlayId: FA2_ORE_RIPARIUS_RANDOM_BASE,
    })
    expect(buildBrushGhosts(input({ tool: 'gems', origin }))[0]).toMatchObject({
      overlayId: FA2_ORE_GEMS,
    })
    expect(buildBrushGhosts(input({ tool: 'veins', origin }))[0]).toMatchObject({
      overlayId: OVRL_VEINS, overlayValue: FA2_VEINS_DATA,
    })
  })

  it('previews a 3×3 veinhole', () => {
    const origin = innerCell()
    const ghosts = buildBrushGhosts(input({
      tool: 'veinhole',
      doc: MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' }),
      origin,
    }))
    expect(ghosts.length).toBeGreaterThanOrEqual(5)
    expect(ghosts.find((item) => item.rx === origin.rx && item.ry === origin.ry)).toMatchObject({
      overlayId: OVRL_VEINHOLE,
    })
    expect(ghosts.some((item) => item.kind === 'overlay' && item.overlayId === OVRL_VEINHOLEBORDER)).toBe(true)
  })

  it('previews infantry at the hovered subcell', () => {
    const origin = { ...firstCell(), subCell: 2 }
    expect(buildBrushGhosts(input({ tool: 'infantry', origin, objectName: 'E1' }))).toEqual([{
      kind: 'object',
      rx: origin.rx,
      ry: origin.ry,
      name: 'E1',
      objectKind: 'infantry',
      facing: FA2_DEFAULT_FACING,
      owner: 'Neutral',
      subCell: 2,
    }])
  })

  it('previews a waypoint and skips erase-waypoint', () => {
    const origin = firstCell()
    expect(buildBrushGhosts(input({ tool: 'waypoint', origin }))).toEqual([
      { kind: 'waypoint', rx: origin.rx, ry: origin.ry },
    ])
    expect(buildBrushGhosts(input({ tool: 'waypoint', origin, waypointErase: true }))).toEqual([])
  })

  it('previews the full bridge line only after a start cell is set', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const from = innerCell()
    const to = { rx: from.rx + 6, ry: from.ry }
    expect(buildBrushGhosts(input({ tool: 'bridge', doc, origin: from, bridgeKind: 'big' }))).toEqual([])
    expect(buildBrushGhosts(input({
      tool: 'bridge',
      doc,
      origin: from,
      bridgeKind: 'big',
      bridgeStart: from,
    }))).toEqual([])
    const line = buildBrushGhosts(input({
      tool: 'bridge',
      doc,
      origin: to,
      bridgeKind: 'small',
      bridgeStart: from,
    }))
    expect(line.some((item) => item.kind === 'overlay' && item.overlayId === OVRL_SMALL_BRIDGE_START + 22)).toBe(true)
    expect(doc.getOverlay(from.rx, from.ry).id).toBe(EMPTY_OVERLAY)
  })
})

describe('brushGhostCells / heightBrushCells', () => {
  it('uses building foundation for structure outline', () => {
    const origin = firstCell()
    const ghosts = buildBrushGhosts(input({
      tool: 'structure',
      origin,
      objectName: 'GAPOWR',
    }))
    expect(brushGhostCells(ghosts, 'structure', origin, { GAPOWR: { w: 2, h: 3 } }, 'GAPOWR')).toHaveLength(6)
  })

  it('keeps FA2 centered rect for raise-tile', () => {
    expect(heightBrushCells({ rx: 10, ry: 10 }, 'raiseTile', 2, 2, 2, false)).toHaveLength(9)
    expect(heightBrushCells({ rx: 10, ry: 10 }, 'raise', 1, 1, 1, false)).toEqual([{ rx: 10, ry: 10 }])
  })
})
