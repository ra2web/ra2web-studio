import { EMPTY_OVERLAY, ORE_RANGES } from './constants'
import { MapDocument } from './MapDocument'

export type MapEditorTool =
  | 'pan'
  | 'select'
  | 'raise'
  | 'lower'
  | 'flatten'
  | 'tile'
  | 'overlay'
  | 'ore'
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
  | 'shore'
  | 'basenode'
  | 'copy'
  | 'paste'

export const TERRAIN_TOOLS: MapEditorTool[] = ['raise', 'lower', 'flatten', 'tile', 'cliff', 'shore']
export const OVERLAY_TOOLS: MapEditorTool[] = ['overlay', 'ore', 'eraseOverlay']
export const OBJECT_TOOLS: MapEditorTool[] = [
  'infantry', 'unit', 'aircraft', 'structure', 'terrain', 'smudge', 'waypoint', 'celltag', 'eraseObject',
]

export function applyOreBrush(doc: MapDocument, rx: number, ry: number, density = 11): void {
  const [from, to] = ORE_RANGES.riparius
  const id = Math.min(to, from + Math.max(0, Math.min(density, to - from)))
  doc.setOverlay(rx, ry, id, density)
}

export function clearOverlay(doc: MapDocument, rx: number, ry: number): void {
  doc.setOverlay(rx, ry, EMPTY_OVERLAY, 0)
}

export function isTouchLikeEvent(event: { pointerType?: string }): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
}
