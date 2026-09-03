import type { MapEditorTool } from '../../data/map/mapTools'
import type { MapTheater } from '../../data/map/constants'
import type { TheaterIndex } from '../../data/map/theaterIndex'
import type { BridgeKind } from '../../data/map/overlayTools'
import { fa2BridgeConnectKinds, resolveBridgeRepairHut } from '../../data/map/fa2Bridge'

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

export const CLIFF_TOOLBAR: MapEditorTool[] = ['cliffFront', 'cliffBack', 'highland', 'cliffRamp']

export function cliffToolbarLabelKey(id: MapEditorTool): string {
  if (id === 'highland') return 'mapEditor.toolHighland'
  if (id === 'cliffRamp') return 'mapEditor.toolCliffRamp'
  if (id === 'cliffBack') return 'mapEditor.toolCliffBack'
  return 'mapEditor.toolCliffFront'
}

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
  'highland',
  'cliffRamp',
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
  const fromGeneral = setStartTile(theater, generalKey)
  if (fromGeneral != null) return fromGeneral
  if (generalKey === 'BridgeSet' && theater) {
    const named = theater.sets.find((set) => set.setName.toLowerCase() === 'bridges')
    return named?.startTileNum
  }
  return undefined
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

const BRIDGE_KIND_LABEL: Record<BridgeKind, 'bridgeSmall' | 'bridgeBig' | 'bridgeTrack' | 'bridgeConcrete'> = {
  small: 'bridgeSmall',
  big: 'bridgeBig',
  track: 'bridgeTrack',
  concrete: 'bridgeConcrete',
}

const GROUND_BRIDGE_KINDS: BridgeKind[] = ['small', 'concrete']
const HIGH_BRIDGE_KINDS: BridgeKind[] = ['big', 'track']

function bridgeKindLeaf(kind: BridgeKind): ObjectTreeNode {
  return {
    id: `bridge-${kind}`,
    labelKey: BRIDGE_KIND_LABEL[kind],
    action: { tool: 'bridge', bridgeKind: kind },
  }
}

export const BRIDGE_TOOLBAR_HINT_I18N = {
  bridgeRampHint: 'mapEditor.bridgeRampHint',
  bridgeConnectDragEnd: 'mapEditor.bridgeConnectDragEnd',
  bridgeConnectLowStart: 'mapEditor.bridgeConnectLowStart',
  bridgeConnectHighStart: 'mapEditor.bridgeConnectHighStart',
} as const

/** Overlay→桥：地面拖线、高架坡道地块、空中拖线、维修小屋。 */
export function buildBridgeTreeChildren(
  theaterName?: MapTheater | null,
  structures: string[] = [],
): ObjectTreeNode[] {
  const kinds = fa2BridgeConnectKinds(theaterName)
  return [
    ...GROUND_BRIDGE_KINDS.filter((kind) => kinds.includes(kind)).map(bridgeKindLeaf),
    { id: 'bridge-ends', labelKey: 'bridgeEnds', action: { tool: 'tile', tileGeneral: 'BridgeSet' } },
    ...HIGH_BRIDGE_KINDS.filter((kind) => kinds.includes(kind)).map(bridgeKindLeaf),
    {
      id: 'bridge-hut',
      labelKey: 'bridgeRepairHut',
      action: { tool: 'structure', objectName: resolveBridgeRepairHut(structures) },
    },
  ]
}

export function bridgeToolbarHintKey(args: {
  tool: MapEditorTool
  treeNodeId?: string | null
  previewSetIndex?: number
  bridgeSetIndex?: number
  bridgeKind: BridgeKind
  hasStart: boolean
}): keyof typeof BRIDGE_TOOLBAR_HINT_I18N | null {
  const onHighRamp = args.tool === 'tile' && (
    args.treeNodeId === 'bridge-ends'
    || (args.bridgeSetIndex != null && args.bridgeSetIndex >= 0 && args.previewSetIndex === args.bridgeSetIndex)
  )
  if (onHighRamp) return 'bridgeRampHint'
  if (args.tool !== 'bridge') return null
  if (args.hasStart) return 'bridgeConnectDragEnd'
  if (args.bridgeKind === 'small' || args.bridgeKind === 'concrete') return 'bridgeConnectLowStart'
  return 'bridgeConnectHighStart'
}

export function buildObjectToolTree(args: {
  theater?: TheaterIndex | null
  theaterName?: MapTheater | null
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
          children: buildBridgeTreeChildren(args.theaterName, args.structures),
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
