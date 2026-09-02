import type { MapDocument } from './MapDocument'
import type { MapWaypoint } from './types'

/** FA2 多人出生点是 `[Waypoints]` 的 0–7；Player 1 = waypoint 0。 */
export const FA2_START_WAYPOINT_COUNT = 8
/** FA2 单人图点击出生点写入的 HomeCell。 */
export const FA2_SP_HOME_WAYPOINT = 98
export const FA2_SP_HOME_WAYPOINT_NEXT = 99

export function nextFreeWaypointNumber(waypoints: MapWaypoint[]): number {
  const used = new Set(waypoints.map((item) => item.number))
  let n = 0
  while (used.has(n)) n += 1
  return n
}

export function waypointAtCell(waypoints: MapWaypoint[], rx: number, ry: number): MapWaypoint | undefined {
  return waypoints.find((item) => item.rx === rx && item.ry === ry)
}

/** FA2：选 Player N 时若 0..N-1 有空洞，先放下缺失号，避免跳号随机出生。 */
export function firstMissingStartWaypoint(waypoints: MapWaypoint[], requested: number): number {
  const max = Math.max(0, Math.trunc(requested))
  for (let index = 0; index < max; index += 1) {
    if (!waypoints.some((item) => item.number === index)) return index
  }
  return max
}

function setWaypoint(waypoints: MapWaypoint[], number: number, rx: number, ry: number): void {
  const existing = waypoints.find((item) => item.number === number)
  if (existing) {
    existing.rx = rx
    existing.ry = ry
    return
  }
  waypoints.push({ number, rx, ry })
}

export function deleteWaypointAt(doc: MapDocument, rx: number, ry: number): boolean {
  const before = doc.waypoints.length
  doc.waypoints = doc.waypoints.filter((item) => !(item.rx === rx && item.ry === ry))
  return doc.waypoints.length !== before
}

export type PlaceWaypointResult = {
  placed: boolean
  number?: number
}

/**
 * 对齐 FA2 `ACTIONMODE_WAYPOINT`：
 * - 未指定编号：`AddWaypoint("")` 取下一个空闲 ID
 * - 指定出生点编号：同 ID 覆盖坐标（移动出生点，不是追加）
 * - 目标格已有 waypoint 则不放
 */
export function placeFa2Waypoint(
  doc: MapDocument,
  rx: number,
  ry: number,
  options: { startNumber?: number } = {},
): PlaceWaypointResult {
  if (waypointAtCell(doc.waypoints, rx, ry)) return { placed: false }

  if (options.startNumber == null) {
    const number = nextFreeWaypointNumber(doc.waypoints)
    doc.waypoints.push({ number, rx, ry })
    return { placed: true, number }
  }

  if (!doc.basic.multiplayerOnly) {
    setWaypoint(doc.waypoints, FA2_SP_HOME_WAYPOINT_NEXT, rx, ry + 1)
    setWaypoint(doc.waypoints, FA2_SP_HOME_WAYPOINT, rx, ry)
    return { placed: true, number: FA2_SP_HOME_WAYPOINT }
  }

  const number = firstMissingStartWaypoint(doc.waypoints, options.startNumber)
  setWaypoint(doc.waypoints, number, rx, ry)
  return { placed: true, number }
}
