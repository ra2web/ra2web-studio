/** FA2 `LoadUnitGraphic` / `LoadOverlayGraphic` 选哪张 pal。 */

import type { ArtImageInfo } from './imageFinder'
import type { MapIni } from './MapIni'

export type Fa2ShpPaletteKind = 'iso' | 'unit' | 'overlay'

const THEATER_SHP_SUFFIXES = ['.tem', '.sno', '.urb', '.lun', '.des', '.ubn'] as const

/** FA2 找到这些剧院后缀文件后仍强制 unit pal。 */
export const FA2_UNIT_PAL_THEATER_FILES = new Set([
  'tibtre01.tem',
  'tibtre02.tem',
  'tibtre03.tem',
  'veinhole.tem',
])

export function isTheaterShpFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return THEATER_SHP_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'yes' || normalized === 'true' || normalized === '1'
}

/** 矿石 / 矿脉 / 矿穴怪：FA2 用 `m_hPalTemp`（temperat.pal）。 */
export function overlayUsesTemperatPalette(rules: MapIni | null | undefined, overlayName: string): boolean {
  if (!rules || !overlayName) return false
  return parseBool(rules.getValue(overlayName, 'Tiberium'))
    || parseBool(rules.getValue(overlayName, 'IsVeins'))
    || parseBool(rules.getValue(overlayName, 'IsVeinholeMonster'))
}

/**
 * 单位 / 地形物 / 污渍：
 * - tibtre / veinhole.tem → unit
 * - TerrainPalette / ShouldUseCellDrawer → iso
 * - 实际打开的是 `.tem/.sno/...` → iso（即便 art 没写 TerrainPalette）
 * - 否则 → unit
 */
export function fa2UnitGraphicPalette(fileName: string | null | undefined, info: ArtImageInfo): Fa2ShpPaletteKind {
  const name = (fileName ?? '').toLowerCase()
  if (FA2_UNIT_PAL_THEATER_FILES.has(name)) return 'unit'
  if (info.terrainPalette) return 'iso'
  if (fileName && isTheaterShpFile(fileName)) return 'iso'
  return 'unit'
}

/**
 * Overlay（桥、墙、矿）：
 * - Tiberium / IsVeins / IsVeinholeMonster → overlay（temperat.pal）
 * - TerrainPalette → iso
 * - `.tem` 等剧院后缀 → iso（桥、污渍式 overlay）
 * - `.shp` → unit
 * - 默认 iso（FA2 `LoadOverlayGraphic` 起始 pal）
 */
export function fa2OverlayGraphicPalette(
  fileName: string | null | undefined,
  info: ArtImageInfo,
  overlayName: string,
  rules?: MapIni | null,
): Fa2ShpPaletteKind {
  if (overlayUsesTemperatPalette(rules, overlayName)) return 'overlay'
  if (info.terrainPalette) return 'iso'
  if (fileName && isTheaterShpFile(fileName)) return 'iso'
  if (fileName?.toLowerCase().endsWith('.shp')) return 'unit'
  return 'iso'
}
