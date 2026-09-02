import { allocateInfantrySubCell, infantryAtSubCell } from './fa2Infantry'
import { structureAt } from './fa2Occupy'
import { waypointAtCell } from './fa2Waypoint'
import { MapDocument, createMapObjectId } from './MapDocument'
import type { BuildingFoundation } from './rulesObjects'
import type { MapTechno } from './types'

/** FA2 IsoView `m_type`：步兵 / 建筑 / 飞机 / 载具 / 地形物 / CellTag / 路径点。污渍不可拖。 */
export type Fa2DragKind = 'infantry' | 'structure' | 'aircraft' | 'unit' | 'terrain' | 'celltag' | 'waypoint'

export type Fa2DragTarget = {
  kind: Fa2DragKind
  id: string
  rx: number
  ry: number
}

export type Fa2DragMove = Fa2DragTarget & {
  toRx: number
  toRy: number
  copy: boolean
}

/**
 * FA2 `OnLButtonDown` + `IsGroundObjectAt`：步兵 → 载具 → 飞机 → 地形物 → 建筑（点到地基任一格则用建筑原点）。
 * 然后才是路径点（含出生点 0–7）和 CellTag。
 */
export function pickFa2DragTarget(
  doc: MapDocument,
  rx: number,
  ry: number,
  foundations: Record<string, BuildingFoundation> = {},
  subCell?: number,
): Fa2DragTarget | null {
  const infantry = infantryAtSubCell(doc.infantry, rx, ry, subCell)
  if (infantry) return { kind: 'infantry', id: infantry.id, rx, ry }
  const unit = doc.units.find((item) => item.rx === rx && item.ry === ry)
  if (unit) return { kind: 'unit', id: unit.id, rx, ry }
  const aircraft = doc.aircraft.find((item) => item.rx === rx && item.ry === ry)
  if (aircraft) return { kind: 'aircraft', id: aircraft.id, rx, ry }
  const terrain = doc.terrains.find((item) => item.rx === rx && item.ry === ry)
  if (terrain) return { kind: 'terrain', id: terrain.id, rx, ry }
  const building = structureAt(doc, rx, ry, foundations)
  if (building) return { kind: 'structure', id: building.id, rx: building.rx, ry: building.ry }
  const waypoint = waypointAtCell(doc.waypoints, rx, ry)
  if (waypoint) return { kind: 'waypoint', id: String(waypoint.number), rx, ry }
  const cellTag = doc.cellTags.find((item) => item.rx === rx && item.ry === ry)
  if (cellTag) return { kind: 'celltag', id: `${cellTag.tagId}@${cellTag.rx},${cellTag.ry}`, rx, ry }
  return null
}

export function applyFa2Drag(doc: MapDocument, move: Fa2DragMove): boolean {
  const sameCell = move.toRx === move.rx && move.toRy === move.ry
  if (sameCell && !move.copy) return false
  switch (move.kind) {
    case 'infantry':
      return dragInfantry(doc, move)
    case 'unit':
      return dragTechnoList(doc.units, move)
    case 'aircraft':
      return dragTechnoList(doc.aircraft, move)
    case 'structure':
      return dragTechnoList(doc.structures, move)
    case 'terrain': {
      const item = doc.terrains.find((entry) => entry.id === move.id)
      if (!item) return false
      if (move.copy) {
        doc.terrains.push({ ...item, id: createMapObjectId(), rx: move.toRx, ry: move.toRy })
        return true
      }
      item.rx = move.toRx
      item.ry = move.toRy
      return true
    }
    case 'waypoint': {
      const number = Number(move.id)
      const item = doc.waypoints.find((entry) => entry.number === number)
      if (!item) return false
      item.rx = move.toRx
      item.ry = move.toRy
      return !sameCell
    }
    case 'celltag': {
      const item = doc.cellTags.find((entry) => entry.rx === move.rx && entry.ry === move.ry && `${entry.tagId}@${entry.rx},${entry.ry}` === move.id)
      if (!item) return false
      if (move.copy) {
        doc.cellTags.push({ rx: move.toRx, ry: move.toRy, tagId: item.tagId })
        return true
      }
      item.rx = move.toRx
      item.ry = move.toRy
      return true
    }
    default:
      return false
  }
}

function dragInfantry(doc: MapDocument, move: Fa2DragMove): boolean {
  const item = doc.infantry.find((entry) => entry.id === move.id)
  if (!item) return false
  const others = doc.infantry.filter((entry) => (
    entry.rx === move.toRx && entry.ry === move.toRy && (move.copy || entry.id !== item.id)
  ))
  const subCell = allocateInfantrySubCell(others)
  if (subCell == null) return false
  if (move.copy) {
    doc.infantry.push({ ...item, extra: [...item.extra], id: createMapObjectId(), rx: move.toRx, ry: move.toRy, subCell })
    return true
  }
  item.rx = move.toRx
  item.ry = move.toRy
  item.subCell = subCell
  return true
}

function dragTechnoList(list: MapTechno[], move: Fa2DragMove): boolean {
  const item = list.find((entry) => entry.id === move.id)
  if (!item) return false
  if (move.copy) {
    list.push({ ...item, extra: [...item.extra], id: createMapObjectId(), rx: move.toRx, ry: move.toRy })
    return true
  }
  item.rx = move.toRx
  item.ry = move.toRy
  return true
}
