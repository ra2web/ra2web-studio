import { INFANTRY_SUBPOS_COUNT, RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from './constants'

/** FA2 `subPosLookup` 用 fielddata 槽位，不是 INI `pos` 原值。 */
export function infantryDrawSlot(subCell: number): number {
  if (subCell > 0) return Math.min(subCell - 1, INFANTRY_SUBPOS_COUNT - 1)
  return 0
}

export function infantrySubPosOffset(subCell: number): { x: number; y: number } {
  const slot = infantryDrawSlot(subCell)
  const hx = RA2_ISO_TILE_WIDTH / 4
  const hy = RA2_ISO_TILE_HEIGHT / 4
  if (slot === 0) return { x: 0, y: -hy }
  if (slot === 1) return { x: hx, y: 0 }
  if (slot === 2) return { x: -hx, y: 0 }
  if (slot === 3) return { x: 0, y: hy }
  return { x: 0, y: 0 }
}

type InfantryPos = { subCell?: number }

function occupiedSlots(existing: InfantryPos[]): Set<number> {
  return new Set(existing.map((item) => infantryDrawSlot(item.subCell ?? 0)))
}

/**
 * FA2 `CMapData::AddInfantry`：一格最多 3 人。
 * 第一个 pos=0；再放时若已有 pos=0 则改写为 1..，新人 pos=空槽+1。
 */
export function allocateInfantrySubCell(existing: InfantryPos[]): number | null {
  if (existing.length >= INFANTRY_SUBPOS_COUNT) return null
  if (existing.length === 0) return 0
  const center = existing.find((item) => (item.subCell ?? 0) === 0)
  if (center) {
    const slots = occupiedSlots(existing)
    for (let slot = 1; slot < INFANTRY_SUBPOS_COUNT; slot++) {
      if (!slots.has(slot)) {
        center.subCell = slot
        break
      }
    }
  }
  const slots = occupiedSlots(existing)
  for (let slot = 0; slot < INFANTRY_SUBPOS_COUNT; slot++) {
    if (!slots.has(slot)) return slot + 1
  }
  return null
}

/** 可放置的 INI pos：0（中上）、2（右）、3（左）。 */
export const INFANTRY_PLACE_POS = [0, 2, 3] as const

export function infantrySlotTaken(existing: InfantryPos[], subCell: number): boolean {
  const slot = infantryDrawSlot(subCell)
  return existing.some((item) => infantryDrawSlot(item.subCell ?? 0) === slot)
}

/** 优先放到点击的 subcell；已被占则回退 FA2 自动分配。 */
export function preferInfantrySubCell(existing: InfantryPos[], preferred?: number): number | null {
  if (existing.length >= INFANTRY_SUBPOS_COUNT) return null
  if (preferred != null && !infantrySlotTaken(existing, preferred)) return preferred
  return allocateInfantrySubCell(existing)
}

/**
 * 按世界像素到菱形顶点的偏移，选最近的步兵 subcell。
 * 用于点选 / 放置精度对齐 FA2 一格多人。
 */
export function infantrySubCellFromWorld(
  worldX: number,
  worldY: number,
  origin: { px: number; py: number },
): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (const pos of INFANTRY_PLACE_POS) {
    const offset = infantrySubPosOffset(pos)
    const dx = worldX - (origin.px + offset.x)
    const dy = worldY - (origin.py + offset.y)
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = pos
    }
  }
  return best
}

export function infantryAtSubCell<T extends InfantryPos & { rx: number; ry: number }>(
  items: T[],
  rx: number,
  ry: number,
  subCell?: number,
): T | undefined {
  const here = items.filter((item) => item.rx === rx && item.ry === ry)
  if (here.length === 0) return undefined
  if (subCell == null) return here[0]
  const slot = infantryDrawSlot(subCell)
  return here.find((item) => infantryDrawSlot(item.subCell ?? 0) === slot) ?? here[0]
}
