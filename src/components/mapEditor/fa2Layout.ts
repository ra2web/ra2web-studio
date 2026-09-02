import type { MapEditorTool } from '../../data/map/mapTools'
import type { TheaterIndex } from '../../data/map/theaterIndex'
import type { BridgeKind } from '../../data/map/overlayTools'

export const FA2_BRUSH_SIZES = [
  { id: '1x1', label: '1x1', w: 1, h: 1, brush: 1 },
  { id: '2x2', label: '2x2', w: 2, h: 2, brush: 2 },
  { id: '3x3', label: '3x3', w: 3, h: 3, brush: 3 },
  { id: '4x4', label: '4x4', w: 4, h: 4, brush: 4 },
  { id: '5x5', label: '5x5', w: 5, h: 5, brush: 5 },
  { id: '10x10', label: '10x10', w: 10, h: 10, brush: 10 },
  { id: '1x2', label: '1x2', w: 1, h: 2, brush: 2 },
  { id: '2x1', label: '2x1', w: 2, h: 1, brush: 2 },
  { id: '1x3', label: '1x3', w: 1, h: 3, brush: 3 },
  { id: '3x1', label: '3x1', w: 3, h: 1, brush: 3 },
] as const

export type Fa2BrushSizeId = (typeof FA2_BRUSH_SIZES)[number]['id']

export const TERRAIN_TOOLBAR: MapEditorTool[] = [
  'raise',
  'lower',
  'flatten',
  'hideTileset',
  'hideField',
  'raiseTile',
  'lowerTile',
]

export const CLIFF_TOOLBAR: MapEditorTool[] = ['cliffFront', 'cliffBack']

const BRUSH_TOOLS: ReadonlySet<MapEditorTool> = new Set([
  'raise',
  'lower',
  'flatten',
  'tile',
  'ore',
  'gems',
  'veins',
  'overlay',
  'eraseOverlay',
])

export function toolUsesBrush(tool: MapEditorTool): boolean {
  return BRUSH_TOOLS.has(tool)
}

export function brushSizeFromId(id: Fa2BrushSizeId): (typeof FA2_BRUSH_SIZES)[number] {
  return FA2_BRUSH_SIZES.find((item) => item.id === id) ?? FA2_BRUSH_SIZES[0]
}

export type ObjectTreeAction = {
  tool: MapEditorTool
  tileGeneral?: string
  overlayId?: number
  overlayData?: number
  objectName?: string
  waypointNumber?: number
  waypointErase?: boolean
  brush?: number
  bridgeKind?: BridgeKind
}

export type ObjectTreeNode = {
  id: string
  labelKey: string
  label?: string
  action?: ObjectTreeAction
  children?: ObjectTreeNode[]
}

function setStartTile(index: TheaterIndex | null | undefined, generalKey: string): number | undefined {
  if (!index) return undefined
  const setNum = index.general[generalKey]
  if (setNum == null || !index.sets[setNum]) return undefined
  return index.sets[setNum].startTileNum
}

export function resolveTreeTileNum(
  theater: TheaterIndex | null | undefined,
  generalKey: string | undefined,
): number | undefined {
  if (!generalKey) return undefined
  return setStartTile(theater, generalKey)
}

function namedLeaves(
  names: string[],
  idPrefix: string,
  labelKey: string,
  tool: MapEditorTool,
): ObjectTreeNode[] {
  return (names ?? []).slice(0, 80).map((name) => ({
    id: `${idPrefix}-${name}`,
    labelKey,
    label: name,
    action: { tool, objectName: name },
  }))
}

export function buildObjectToolTree(args: {
  theater?: TheaterIndex | null
  infantry: string[]
  units: string[]
  aircraft: string[]
  structures: string[]
  terrain: string[]
  smudges: string[]
  overlays: string[]
  multiplayerOnly?: boolean
}): ObjectTreeNode[] {
  const groundKeys = [
    ['clear', 'treeGroundClear', 'ClearTile'],
    ['sand', 'treeGroundSand', 'SandTile'],
    ['rough', 'treeGroundRough', 'RoughTile'],
    ['green', 'treeGroundGreen', 'GreenTile'],
    ['pave', 'treeGroundPave', 'PaveTile'],
    ['water', 'treeGroundWater', 'WaterSet'],
  ] as const

  return [
    { id: 'nothing', labelKey: 'treeNothing', action: { tool: 'select' } },
    {
      id: 'ground',
      labelKey: 'treeGround',
      children: groundKeys.map(([id, labelKey, general]) => ({
        id: `ground-${id}`,
        labelKey,
        action: { tool: 'tile', tileGeneral: general },
      })),
    },
    {
      id: 'waypoints',
      labelKey: 'treeWaypoints',
      children: [
        { id: 'waypoint-create', labelKey: 'toolWaypoint', action: { tool: 'waypoint' } },
        { id: 'waypoint-delete', labelKey: 'treeDeleteWaypoint', action: { tool: 'waypoint', waypointErase: true } },
      ],
    },
    {
      id: 'startpoints',
      labelKey: 'treeStartpoints',
      children: [
        ...Array.from({ length: args.multiplayerOnly === false ? 1 : 8 }, (_, index) => ({
          id: `start-${index}`,
          labelKey: 'treeStartPlayer',
          label: String(index + 1),
          action: { tool: 'waypoint' as const, waypointNumber: index },
        })),
        { id: 'start-delete', labelKey: 'treeDeleteStartpoint', action: { tool: 'waypoint', waypointErase: true } },
      ],
    },
    {
      id: 'infantry',
      labelKey: 'toolInfantry',
      children: namedLeaves(args.infantry, 'inf', 'toolInfantry', 'infantry'),
    },
    {
      id: 'vehicles',
      labelKey: 'toolUnit',
      children: namedLeaves(args.units, 'veh', 'toolUnit', 'unit'),
    },
    {
      id: 'aircraft',
      labelKey: 'toolAircraft',
      children: namedLeaves(args.aircraft, 'air', 'toolAircraft', 'aircraft'),
    },
    {
      id: 'structures',
      labelKey: 'toolStructure',
      children: namedLeaves(args.structures, 'str', 'toolStructure', 'structure'),
    },
    {
      id: 'terrain-objects',
      labelKey: 'toolTerrain',
      children: [
        { id: 'random-terrain', labelKey: 'toolRandomTerrain', action: { tool: 'randomTerrain' } },
        ...namedLeaves(args.terrain, 'ter', 'toolTerrain', 'terrain'),
      ],
    },
    {
      id: 'smudges',
      labelKey: 'toolSmudge',
      children: namedLeaves(args.smudges, 'smu', 'toolSmudge', 'smudge'),
    },
    {
      id: 'overlay',
      labelKey: 'toolOverlay',
      children: [
        { id: 'ore', labelKey: 'toolOre', action: { tool: 'ore' } },
        { id: 'gems', labelKey: 'toolGems', action: { tool: 'gems' } },
        { id: 'veinhole', labelKey: 'toolVeinhole', action: { tool: 'veinhole' } },
        { id: 'veins', labelKey: 'toolVeins', action: { tool: 'veins' } },
        {
          id: 'erase-overlay',
          labelKey: 'toolEraseOverlay',
          children: [1, 2, 3].map((size) => ({
            id: `erase-overlay-${size}`,
            labelKey: 'toolEraseOverlay',
            label: `${size}x${size}`,
            action: { tool: 'eraseOverlay', brush: size },
          })),
        },
        {
          id: 'bridges',
          labelKey: 'toolBridge',
          children: [
            { id: 'bridge-small', labelKey: 'bridgeSmall', action: { tool: 'bridge', bridgeKind: 'small' } },
            { id: 'bridge-big', labelKey: 'bridgeBig', action: { tool: 'bridge', bridgeKind: 'big' } },
            { id: 'bridge-track', labelKey: 'bridgeTrack', action: { tool: 'bridge', bridgeKind: 'track' } },
            { id: 'bridge-concrete', labelKey: 'bridgeConcrete', action: { tool: 'bridge', bridgeKind: 'concrete' } },
          ],
        },
        { id: 'wall', labelKey: 'toolWall', action: { tool: 'wall' } },
        { id: 'overlay-manual', labelKey: 'toolOverlay', action: { tool: 'overlay' } },
        ...args.overlays.slice(0, 60).map((name, index) => ({
          id: `overlay-${index}`,
          labelKey: 'toolOverlay',
          label: `${index} ${name}`,
          action: { tool: 'overlay' as const, overlayId: index },
        })),
      ],
    },
    {
      id: 'celltags',
      labelKey: 'toolCellTag',
      children: [
        { id: 'celltag-create', labelKey: 'toolCellTag', action: { tool: 'celltag' } },
      ],
    },
    { id: 'basenode', labelKey: 'toolBaseNode', action: { tool: 'basenode' } },
    { id: 'tube', labelKey: 'toolTube', action: { tool: 'tube' } },
    { id: 'erase-object', labelKey: 'toolEraseObject', action: { tool: 'eraseObject' } },
    { id: 'copy', labelKey: 'toolCopy', action: { tool: 'copy' } },
    { id: 'paste', labelKey: 'toolPaste', action: { tool: 'paste' } },
    { id: 'pan', labelKey: 'toolPan', action: { tool: 'pan' } },
    { id: 'shore', labelKey: 'toolShore', action: { tool: 'shore' } },
  ]
}
