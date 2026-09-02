/** FA2 IsoView infantry SHP index: `(7 - direction / 32) % 8`. */
export function fa2InfantryDirIndex(direction: number): number {
  const step = Math.trunc(Number(direction) / 32)
  return ((7 - step) % 8 + 8) % 8
}

/** FA2 unit/aircraft SHP index: `direction / 32`. */
export function fa2UnitDirIndex(direction: number): number {
  return ((Math.trunc(Number(direction) / 32) % 8) + 8) % 8
}

/**
 * FA2 `LoadUnitGraphic` 文件帧：无 WalkFrames 时 8 向连续；
 * 有 WalkFrames 时 `dir * WalkFrames + StartWalkFrame`。
 */
export function fa2InfantryShpFrame(direction: number, walkFrames = 1, startWalkFrame = 0): number {
  const dir = fa2InfantryDirIndex(direction)
  const step = Math.max(1, Math.trunc(walkFrames) || 1)
  const start = Math.max(0, Math.trunc(startWalkFrame) || 0)
  return dir * step + start
}

/** 载具 SHP：WalkFrames 时 FA2 用 `(i + 1) % 8`。 */
export function fa2UnitShpFrame(direction: number, walkFrames = 1, startWalkFrame = 0): number {
  const index = fa2UnitDirIndex(direction)
  const step = Math.max(1, Math.trunc(walkFrames) || 1)
  const start = Math.max(0, Math.trunc(startWalkFrame) || 0)
  const dir = step > 1 ? (index + 1) % 8 : index
  return dir * step + start
}

export const FA2_DEFAULT_FACING = 64

export type ObjectSpriteKind = 'infantry' | 'unit' | 'building'
