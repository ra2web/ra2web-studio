import {
  FA2_ORE_GEMS,
  FA2_ORE_RIPARIUS_FIXED,
  FA2_ORE_RIPARIUS_RANDOM_BASE,
  FA2_VEINS_DATA,
  MAX_HEIGHT,
  OVRL_VEINHOLE,
  OVRL_VEINHOLEBORDER,
  OVRL_VEINS,
} from './constants'
import { fa2CenteredRectOffsets, fa2PaintRectOffsets } from './fa2Brush'
import { FA2_DEFAULT_FACING, type ObjectSpriteKind } from './fa2Facing'
import { cellAllowsOre } from './fa2Ore'
import { fa2PlaceTileCells, usesFa2PlaceTile } from './fa2PlaceTile'
import { isValidIsoCell } from './isoCoords'
import type { MapDocument } from './MapDocument'
import type { MapEditorTool } from './mapTools'
import { foundationCells, structureSize } from './fa2Occupy'
import type { BuildingFoundation } from './rulesObjects'
import {
  bridgeLineOverlays,
  type BridgeKind,
} from './overlayTools'
import type { TheaterIndex } from './theaterIndex'
import type { TmpTileShape } from './tmpCatalog'

export type BrushGhost =
  | { kind: 'tile'; rx: number; ry: number; tileNum: number; subTile: number; height: number }
  | { kind: 'overlay'; rx: number; ry: number; overlayId: number; overlayValue: number }
  | {
    kind: 'object'
    rx: number
    ry: number
    name: string
    objectKind: ObjectSpriteKind
    facing: number
    owner?: string
    subCell?: number
  }
  | { kind: 'waypoint'; rx: number; ry: number }

export type BrushPreviewOrigin = { rx: number; ry: number; subCell?: number }

export type BrushPreviewInput = {
  tool: MapEditorTool
  origin: BrushPreviewOrigin | null
  doc: MapDocument
  tileNum: number
  overlayId: number
  overlayData: number
  objectName: string
  owner: string
  brushW: number
  brushH: number
  brush: number
  oreRandom: boolean
  bridgeKind: BridgeKind
  bridgeStart?: { rx: number; ry: number } | null
  waypointErase?: boolean
  theater?: TheaterIndex | null
  tileShape?: TmpTileShape
  shapeOf?: (tileNum: number) => TmpTileShape | undefined
  terrainPool?: string[]
}

const NO_GHOST: ReadonlySet<MapEditorTool> = new Set([
  'pan', 'select', 'copy', 'paste', 'eraseObject', 'eraseOverlay',
  'raise', 'lower', 'raiseTile', 'lowerTile', 'flatten',
  'cliff', 'cliffFront', 'cliffBack', 'highland', 'cliffRamp', 'shore',
  'hideTileset', 'hideField', 'tube', 'celltag',
])

function overlayGhosts(
  cells: Array<{ rx: number; ry: number }>,
  overlayId: number,
  overlayValue: number,
): BrushGhost[] {
  return cells.map((cell) => ({
    kind: 'overlay' as const,
    rx: cell.rx,
    ry: cell.ry,
    overlayId,
    overlayValue,
  }))
}

function objectKindForTool(tool: MapEditorTool): ObjectSpriteKind | null {
  if (tool === 'infantry') return 'infantry'
  if (tool === 'unit' || tool === 'aircraft') return 'unit'
  if (tool === 'structure' || tool === 'basenode') return 'building'
  if (tool === 'terrain' || tool === 'randomTerrain') return 'terrain'
  if (tool === 'smudge') return 'smudge'
  return null
}

/** 当前工具在光标处将放下的精灵，供视口半透明预览。 */
export function buildBrushGhosts(input: BrushPreviewInput): BrushGhost[] {
  const origin = input.origin
  if (!origin || NO_GHOST.has(input.tool)) return []
  const { doc, tool } = input

  if (tool === 'tile') {
    const shape = input.tileShape
    if (usesFa2PlaceTile(shape, input.tileNum, input.theater) && shape) {
      const current = doc.getCell(origin.rx, origin.ry)
      const currentZ = input.shapeOf?.(current.tileNum)?.subtiles[current.subTile]?.zHeight ?? 0
      const startHeight = current.height - currentZ
      return fa2PlaceTileCells(origin.rx, origin.ry, shape, input.brushW, input.brushH)
        .filter((cell) => isValidIsoCell(cell.rx, cell.ry, doc.width, doc.height))
        .map((cell) => ({
          kind: 'tile' as const,
          rx: cell.rx,
          ry: cell.ry,
          tileNum: input.tileNum,
          subTile: cell.subTile,
          height: Math.max(0, Math.min(MAX_HEIGHT, startHeight + (shape.subtiles[cell.subTile]?.zHeight ?? 0))),
        }))
    }
    return fa2PaintRectOffsets(input.brushW, input.brushH)
      .map(({ dx, dy }) => ({ rx: origin.rx + dx, ry: origin.ry + dy }))
      .filter((cell) => isValidIsoCell(cell.rx, cell.ry, doc.width, doc.height))
      .map((cell) => ({
        kind: 'tile' as const,
        rx: cell.rx,
        ry: cell.ry,
        tileNum: input.tileNum,
        subTile: 0,
        height: doc.getCell(cell.rx, cell.ry).height,
      }))
  }

  if (tool === 'overlay' || tool === 'wall') {
    return overlayGhosts(
      fa2PaintRectOffsets(tool === 'wall' ? 1 : input.brushW, tool === 'wall' ? 1 : input.brushH)
        .map(({ dx, dy }) => ({ rx: origin.rx + dx, ry: origin.ry + dy }))
        .filter((cell) => isValidIsoCell(cell.rx, cell.ry, doc.width, doc.height)),
      input.overlayId,
      input.overlayData,
    )
  }

  if (tool === 'ore' || tool === 'gems') {
    const id = tool === 'gems'
      ? FA2_ORE_GEMS
      : (input.oreRandom ? FA2_ORE_RIPARIUS_RANDOM_BASE : FA2_ORE_RIPARIUS_FIXED)
    return overlayGhosts(
      fa2PaintRectOffsets(input.brushW, input.brushH)
        .map(({ dx, dy }) => ({ rx: origin.rx + dx, ry: origin.ry + dy }))
        .filter((cell) => (
          isValidIsoCell(cell.rx, cell.ry, doc.width, doc.height)
          && cellAllowsOre(doc, cell.rx, cell.ry, input.theater)
        )),
      id,
      0,
    )
  }

  if (tool === 'veins') {
    return overlayGhosts(
      fa2PaintRectOffsets(input.brushW, input.brushH)
        .map(({ dx, dy }) => ({ rx: origin.rx + dx, ry: origin.ry + dy }))
        .filter((cell) => isValidIsoCell(cell.rx, cell.ry, doc.width, doc.height)),
      OVRL_VEINS,
      FA2_VEINS_DATA,
    )
  }

  if (tool === 'veinhole') {
    const cells: BrushGhost[] = []
    for (let gx = origin.rx - 1; gx <= origin.rx + 1; gx++) {
      for (let gy = origin.ry - 1; gy <= origin.ry + 1; gy++) {
        if (!isValidIsoCell(gx, gy, doc.width, doc.height)) continue
        const hole = gx === origin.rx && gy === origin.ry
        cells.push({
          kind: 'overlay',
          rx: gx,
          ry: gy,
          overlayId: hole ? OVRL_VEINHOLE : OVRL_VEINHOLEBORDER,
          overlayValue: 0,
        })
      }
    }
    return cells
  }

  if (tool === 'bridge') {
    if (!input.bridgeStart) return []
    const line = bridgeLineOverlays(doc, input.bridgeStart, origin, input.bridgeKind)
    return line.map((cell) => ({
      kind: 'overlay' as const,
      rx: cell.rx,
      ry: cell.ry,
      overlayId: cell.id,
      overlayValue: cell.value,
    }))
  }

  if (tool === 'waypoint') {
    if (input.waypointErase) return []
    return [{ kind: 'waypoint', rx: origin.rx, ry: origin.ry }]
  }

  const objectKind = objectKindForTool(tool)
  if (objectKind) {
    const name = tool === 'randomTerrain'
      ? (input.terrainPool?.[0] || input.objectName)
      : input.objectName
    if (!name) return []
    return [{
      kind: 'object',
      rx: origin.rx,
      ry: origin.ry,
      name,
      objectKind,
      facing: FA2_DEFAULT_FACING,
      owner: objectKind === 'terrain' || objectKind === 'smudge' ? undefined : input.owner,
      subCell: objectKind === 'infantry' ? (origin.subCell ?? 0) : undefined,
    }]
  }

  return []
}

/** 幽灵占用的格子，用来画笔刷外框。 */
export function brushGhostCells(
  ghosts: BrushGhost[],
  tool: MapEditorTool,
  origin: BrushPreviewOrigin | null,
  foundations: Record<string, BuildingFoundation> = {},
  objectName = '',
): Array<{ rx: number; ry: number }> {
  if (ghosts.length > 0) {
    const keys = new Set<string>()
    const cells: Array<{ rx: number; ry: number }> = []
    for (const ghost of ghosts) {
      const key = `${ghost.rx},${ghost.ry}`
      if (keys.has(key)) continue
      keys.add(key)
      cells.push({ rx: ghost.rx, ry: ghost.ry })
    }
    if (tool === 'structure' || tool === 'basenode') {
      return foundationCells(origin?.rx ?? ghosts[0].rx, origin?.ry ?? ghosts[0].ry, structureSize(objectName, foundations))
    }
    return cells
  }
  if (!origin) return []
  if (tool === 'structure' || tool === 'basenode') {
    return foundationCells(origin.rx, origin.ry, structureSize(objectName, foundations))
  }
  return [{ rx: origin.rx, ry: origin.ry }]
}

/** FA2 Heighten / HeightenTile：`m_BrushSize` 在 (rx, ry) 上的中心矩形。 */
export function heightBrushCells(
  origin: BrushPreviewOrigin,
  brushW: number,
  brushH: number,
): Array<{ rx: number; ry: number }> {
  return fa2CenteredRectOffsets(brushW, brushH).map(({ dx, dy }) => ({
    rx: origin.rx + dx,
    ry: origin.ry + dy,
  }))
}
