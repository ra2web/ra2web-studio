import { MapDocument, createMapObjectId } from './MapDocument'

export type MapEditorTool =
  | 'pan'
  | 'select'
  | 'raise'
  | 'lower'
  | 'flatten'
  | 'tile'
  | 'overlay'
  | 'ore'
  | 'gems'
  | 'veinhole'
  | 'veins'
  | 'eraseOverlay'
  | 'infantry'
  | 'unit'
  | 'aircraft'
  | 'structure'
  | 'terrain'
  | 'smudge'
  | 'waypoint'
  | 'celltag'
  | 'eraseObject'
  | 'tube'
  | 'cliff'
  | 'cliffFront'
  | 'cliffBack'
  | 'shore'
  | 'basenode'
  | 'copy'
  | 'paste'
  | 'bridge'
  | 'wall'
  | 'randomTerrain'

export const TERRAIN_TOOLS: MapEditorTool[] = ['raise', 'lower', 'flatten', 'tile', 'cliff', 'cliffFront', 'cliffBack', 'shore']
export const OVERLAY_TOOLS: MapEditorTool[] = ['overlay', 'ore', 'gems', 'veinhole', 'veins', 'eraseOverlay', 'wall', 'bridge']
export const OBJECT_TOOLS: MapEditorTool[] = [
  'infantry', 'unit', 'aircraft', 'structure', 'terrain', 'smudge', 'waypoint', 'celltag', 'eraseObject', 'randomTerrain',
]

export { applyOreBrush, clearOverlay, placeVeinhole, placeVeins } from './fa2Ore'

const FALLBACK_RANDOM_TERRAIN = ['TREE01', 'TREE02', 'TREE03', 'TREE04', 'TREE05', 'TREE06', 'TREE07']

/** FA2 `ACTIONMODE_RANDOMTERRAIN`：从列表随机放一个地形物，格上已有则跳过。 */
export function placeRandomTerrain(
  doc: MapDocument,
  rx: number,
  ry: number,
  names: string[],
  pick: (count: number) => number = (count) => Math.floor(Math.random() * count),
): boolean {
  if (doc.terrains.some((item) => item.rx === rx && item.ry === ry)) return false
  const pool = names.length > 0 ? names : FALLBACK_RANDOM_TERRAIN
  if (pool.length === 0) return false
  const index = Math.max(0, Math.min(pool.length - 1, pick(pool.length)))
  const name = pool[index]
  if (!name) return false
  doc.terrains.push({ id: createMapObjectId(), name, rx, ry })
  return true
}

export function isTouchLikeEvent(event: { pointerType?: string }): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
}
