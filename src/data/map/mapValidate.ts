import { EMPTY_OVERLAY, overlayIndex, OVERLAY_PLANE, validateMapSize } from './constants'
import { isValidIsoCell } from './isoCoords'
import type { MapDocument } from './MapDocument'

export type MapIssue = {
  level: 'error' | 'warning'
  code: string
  message: string
}

export function validateMap(doc: MapDocument): MapIssue[] {
  const issues: MapIssue[] = []
  const sizeError = validateMapSize(doc.width, doc.height)
  if (sizeError) issues.push({ level: 'error', code: 'size', message: sizeError })

  const inMap = (rx: number, ry: number) => isValidIsoCell(rx, ry, doc.width, doc.height)

  for (const item of [...doc.units, ...doc.infantry, ...doc.aircraft, ...doc.structures, ...doc.terrains, ...doc.smudges]) {
    if (!inMap(item.rx, item.ry)) {
      issues.push({ level: 'error', code: 'object-bounds', message: `${item.name} @ ${item.rx},${item.ry} 不在等距地图内` })
    }
  }
  for (const waypoint of doc.waypoints) {
    if (!inMap(waypoint.rx, waypoint.ry)) {
      issues.push({ level: 'error', code: 'waypoint-bounds', message: `航点 ${waypoint.number} 超出地图` })
    }
  }
  const houseNames = new Set(doc.houses.map((house) => house.name))
  for (const techno of [...doc.units, ...doc.infantry, ...doc.aircraft, ...doc.structures]) {
    if (!houseNames.has(techno.owner)) {
      issues.push({ level: 'warning', code: 'owner', message: `${techno.name} 所属阵营 ${techno.owner} 不存在` })
    }
  }
  const triggerIds = new Set(doc.triggers.map((item) => item.id))
  const tagIds = new Set(doc.tags.map((item) => item.id))
  for (const tag of doc.tags) {
    if (tag.triggerId !== '<none>' && !triggerIds.has(tag.triggerId)) {
      issues.push({ level: 'warning', code: 'tag-trigger', message: `Tag ${tag.name} 引用了缺失的触发器 ${tag.triggerId}` })
    }
  }
  for (const cellTag of doc.cellTags) {
    if (!tagIds.has(cellTag.tagId)) {
      issues.push({ level: 'warning', code: 'celltag', message: `CellTag ${cellTag.rx},${cellTag.ry} 引用了缺失的 Tag` })
    }
  }
  const teamIds = new Set(doc.teams.map((item) => item.id))
  const scriptIds = new Set(doc.scripts.map((item) => item.id))
  const taskIds = new Set(doc.taskForces.map((item) => item.id))
  for (const team of doc.teams) {
    if (team.script !== '<none>' && !scriptIds.has(team.script)) {
      issues.push({ level: 'warning', code: 'team-script', message: `队伍 ${team.name} 缺少 Script ${team.script}` })
    }
    if (team.taskForce !== '<none>' && !taskIds.has(team.taskForce)) {
      issues.push({ level: 'warning', code: 'team-taskforce', message: `队伍 ${team.name} 缺少 TaskForce ${team.taskForce}` })
    }
  }
  for (const trigger of doc.aiTriggers) {
    if (trigger.team1 !== '<none>' && !teamIds.has(trigger.team1)) {
      issues.push({ level: 'warning', code: 'aitrigger', message: `AITrigger ${trigger.name} 缺少队伍 ${trigger.team1}` })
    }
  }
  if (doc.overlay.length !== OVERLAY_PLANE * OVERLAY_PLANE) {
    issues.push({ level: 'error', code: 'overlay-plane', message: 'OverlayPack 平面尺寸不是 512×512' })
  }
  let overlayCount = 0
  for (let i = 0; i < doc.overlay.length; i++) {
    if (doc.overlay[i] !== EMPTY_OVERLAY) overlayCount++
  }
  if (overlayCount > 0 && overlayIndex(doc.width, doc.height) > doc.overlay.length) {
    issues.push({ level: 'error', code: 'overlay-index', message: 'Overlay 索引越界' })
  }
  return issues
}
