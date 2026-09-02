/** FA2 `LoadUnitGraphic` 建筑炮台：rules `Turret=` / `TurretAnim` + FAData 偏移。 */

import faDataText from './fa2/FAData.ini?raw'
import { fa2InfantryDirIndex } from './fa2Facing'
import { MapIni } from './MapIni'

export type BuildingTurretSpec = {
  anim: string
  voxel: boolean
  x: number
  y: number
  offsetX: number
  offsetY: number
}

function isTrue(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized === 'yes' || normalized === 'true' || normalized === '1'
}

function rulesVal(ini: MapIni | null | undefined, sections: string[], key: string): string {
  for (const section of sections) {
    const value = ini?.getValue(section, key)?.trim()
    if (value) return value
  }
  return ''
}

function lastInt(section: { entries: Array<{ key: string; value: string }> } | undefined, key: string): number {
  const needle = key.toLowerCase()
  let found: number | undefined
  for (const entry of section?.entries ?? []) {
    if (entry.key.toLowerCase() !== needle) continue
    found = Number.parseInt(entry.value, 10) || 0
  }
  return found ?? 0
}

const turretOffsetIni = MapIni.parse(faDataText)

/** FA2 `BuildingVoxelTurretsRA2`：`TypeX`/`TypeY` 再加 `TypeXn`/`TypeYn`（n 为朝向 0–7）。 */
export function buildingVoxelTurretOffset(
  objectName: string,
  rulesImage = objectName,
  dirIndex = 0,
): { offsetX: number; offsetY: number } {
  const section = turretOffsetIni.getSection('BuildingVoxelTurretsRA2')
  const dir = ((dirIndex % 8) + 8) % 8
  let offsetX = 0
  let offsetY = 0
  for (const type of [objectName, rulesImage]) {
    if (!type) continue
    offsetX = lastInt(section, `${type}X`) + lastInt(section, `${type}X${dir}`)
    offsetY = lastInt(section, `${type}Y`) + lastInt(section, `${type}Y${dir}`)
    if (offsetX !== 0 || offsetY !== 0) return { offsetX, offsetY }
  }
  return { offsetX, offsetY }
}

export function readBuildingTurret(
  rulesIni: MapIni | null | undefined,
  objectName: string,
  rulesImage = objectName,
  facing = 64,
): BuildingTurretSpec | null {
  const sections = [objectName, rulesImage]
  if (!isTrue(rulesVal(rulesIni, sections, 'Turret'))) return null
  const anim = rulesVal(rulesIni, sections, 'TurretAnim')
  if (!anim) return null
  const voxel = isTrue(rulesVal(rulesIni, sections, 'TurretAnimIsVoxel'))
  const x = Number.parseInt(rulesVal(rulesIni, sections, 'TurretAnimX'), 10) || 0
  const y = Number.parseInt(rulesVal(rulesIni, sections, 'TurretAnimY'), 10) || 0
  const { offsetX, offsetY } = buildingVoxelTurretOffset(objectName, rulesImage, fa2InfantryDirIndex(facing))
  return { anim, voxel, x, y, offsetX, offsetY }
}

/** FA2 炮台 SHP：每向 4 帧，朝向与建筑相同 `(7 - dir/32) % 8`。 */
export function fa2BuildingTurretShpFrame(direction: number): number {
  return fa2InfantryDirIndex(direction) * 4
}
