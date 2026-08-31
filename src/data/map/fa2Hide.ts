import { tileNumToSet, type TheaterIndex } from './theaterIndex'

/** FA2 IsoView `bHide`：仅编辑器显示，不写入地图 INI。 */
export type MapHideView = {
  tileSets: Set<number>
  fields: Set<string>
  tileNums: Set<number>
}

export function emptyHideView(): MapHideView {
  return { tileSets: new Set(), fields: new Set(), tileNums: new Set() }
}

export function fieldHideKey(rx: number, ry: number): string {
  return `${rx},${ry}`
}

export function isCellHidden(
  rx: number,
  ry: number,
  tileNum: number,
  hide: MapHideView,
  index?: TheaterIndex | null,
): boolean {
  if (hide.fields.has(fieldHideKey(rx, ry))) return true
  if (hide.tileNums.has(tileNum)) return true
  const setIndex = index ? tileNumToSet(index, tileNum)?.setIndex : undefined
  return setIndex != null && hide.tileSets.has(setIndex)
}

/** FA2 `CIsoView::HideTileSet`：无剧院索引时退化为按 tileNum 隐藏。 */
export function hideTileSetAt(
  hide: MapHideView,
  tileNum: number,
  index?: TheaterIndex | null,
): MapHideView {
  const setIndex = index ? tileNumToSet(index, tileNum)?.setIndex : undefined
  const tileSets = new Set(hide.tileSets)
  const tileNums = new Set(hide.tileNums)
  if (setIndex != null) tileSets.add(setIndex)
  else tileNums.add(tileNum)
  return { tileSets, tileNums, fields: new Set(hide.fields) }
}

export function hideFieldAt(hide: MapHideView, rx: number, ry: number): MapHideView {
  const fields = new Set(hide.fields)
  fields.add(fieldHideKey(rx, ry))
  return { tileSets: new Set(hide.tileSets), tileNums: new Set(hide.tileNums), fields }
}

export function showAllTileSets(hide: MapHideView): MapHideView {
  return { tileSets: new Set(), tileNums: new Set(), fields: new Set(hide.fields) }
}

export function showAllFields(hide: MapHideView): MapHideView {
  return { tileSets: new Set(hide.tileSets), tileNums: new Set(hide.tileNums), fields: new Set() }
}
