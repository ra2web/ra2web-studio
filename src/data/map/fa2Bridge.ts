import type { MapTheater } from './constants'
import type { BridgeKind } from './overlayTools'

/** FA2 RA2 `BuildingTypes` 桥梁维修小屋。 */
export const FA2_BRIDGE_REPAIR_HUT = 'CAARMR'

/**
 * Overlay→Bridges 拖线种类：Lunar 不列连桥；Desert 只有小桥/混凝土。
 * 高架坡道（BridgeSet）与维修小屋在 FA2 其它面板，Studio 仍挂在 Bridges 下。
 */
export function fa2BridgeConnectKinds(theater?: MapTheater | null): BridgeKind[] {
  if (theater === 'LUNAR') return []
  if (theater === 'DESERT') return ['small', 'concrete']
  return ['small', 'big', 'track', 'concrete']
}

/**
 * FA2 `TileSetBrowserView`：TEM TileSet 80 / SNO 73 / URB 101 跳过件 10 与 15。
 * 按 theater.ini `BridgeSet` 识别，而不是写死序号。
 */
export function isFa2HiddenBridgeSetTile(
  theater: MapTheater | undefined,
  setIndex: number,
  tileInSet: number,
  bridgeSet: number,
): boolean {
  if (bridgeSet < 0 || setIndex !== bridgeSet) return false
  if (tileInSet !== 10 && tileInSet !== 15) return false
  return theater === 'TEMPERATE' || theater === 'SNOW' || theater === 'URBAN'
}

/** FA2 地形浏览器列出该集全部件；TEM/SNO/URB 的 BridgeSet 跳过 10、15，不截断。 */
export function listFa2TileSetThumbs(
  tilesInSet: number,
  startTileNum: number,
  setIndex: number,
  theater: MapTheater | undefined,
  bridgeSet: number,
): number[] {
  const thumbs: number[] = []
  for (let index = 0; index < Math.max(0, tilesInSet); index++) {
    if (isFa2HiddenBridgeSetTile(theater, setIndex, index, bridgeSet)) continue
    thumbs.push(startTileNum + index)
  }
  return thumbs
}

export function resolveBridgeRepairHut(structures: string[]): string {
  const found = structures.find((name) => name.toUpperCase() === FA2_BRIDGE_REPAIR_HUT)
  return found ?? FA2_BRIDGE_REPAIR_HUT
}
