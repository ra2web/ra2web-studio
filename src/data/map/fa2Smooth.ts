import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'

/** FA2 MapData.cpp tile_to_lat：SmoothSet / CLAT / TargetSet。 */
export const TILE_TO_LAT: Array<[smooth: string, lat: string, target: string]> = [
  ['SandTile', 'ClearToSandLat', 'ClearTile'],
  ['GreenTile', 'ClearToGreenLat', 'ClearTile'],
  ['RoughTile', 'ClearToRoughLat', 'ClearTile'],
  ['PaveTile', 'ClearToPaveLat', 'ClearTile'],
  ['CrystalTile', 'ClearToCrystalLat', 'ClearTile'],
  ['SwampTile', 'WaterToSwampLat', 'WaterSet'],
]

const TOKEN_OTHER = 0
const TOKEN_TARGET = 1
const TOKEN_LAT = 2

function latIndex(needed: number, latSetStart: number, tilesInSet: number): number {
  const offset = Math.max(0, Math.min(needed, Math.max(0, tilesInSet - 1)))
  return latSetStart + offset
}

export type SmoothTerrainLookup = {
  /** 瓦片集首块 `bTerrainType`（FA2 `its`/`iss`/`ils`）。 */
  setType: (setNum: number) => number
  /** 当前格 TMP 子格地形类型。 */
  cellType: (rx: number, ry: number) => number
}

function latNeeded(ts: number[][], ils: number): number {
  if (ts[1][1] !== ils) return -1
  const n = ts[0][1] === ils
  const w = ts[1][0] === ils
  const e = ts[1][2] === ils
  const s = ts[2][1] === ils
  if (!n && !w && !e && !s) return 16
  if (n && w && e && s) return 0
  if (n && s && !w && !e) return 11
  if (w && e && !n && !s) return 6
  if (!w && n && s) return 9
  if (!s && w && e) return 5
  if (!e && n && s) return 3
  if (!n && w && e) return 2
  if (n && !w && !e && !s) return 15
  if (e && !w && !n && !s) return 14
  if (s && !w && !n && !e) return 12
  if (w && !n && !e && !s) return 8
  if (!w && !s) return 13
  if (!w && !n) return 10
  if (!s && !e) return 7
  if (!n && !e) return 4
  return -1
}

/**
 * FA2 CMapData::SmoothAt。
 * 无 lookup 时走 its==iss（RA2 LAT 主路径）；有 lookup 且 its!=iss 时用 TMP `bTerrainType`。
 */
export function smoothAt(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  iSmoothSet: number,
  iLatSet: number,
  iTargetSet: number,
  lookup?: SmoothTerrainLookup,
  ignoreShore = true,
): void {
  if (iSmoothSet < 0 || iLatSet < 0 || iTargetSet < 0) return
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  const rules = new TheaterRules(theater)
  const shoreSet = rules.getGeneralValue('ShorePieces')
  const currentSet = rules.getSetNum(doc.getCell(rx, ry).tileNum)
  if (currentSet !== iSmoothSet && currentSet !== iLatSet) return

  const latInfo = theater.sets[iLatSet]
  const smoothInfo = theater.sets[iSmoothSet]
  if (!latInfo || !smoothInfo) return

  const its = lookup?.setType(iTargetSet) ?? TOKEN_TARGET
  const iss = lookup?.setType(iSmoothSet) ?? TOKEN_TARGET
  let ils = lookup?.setType(iLatSet) ?? TOKEN_LAT
  const sameType = its === iss
  if (sameType && lookup) ils += 1

  const ts: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++) {
    for (let e = 0; e < 3; e++) {
      const nx = rx + (i - 1)
      const ny = ry + (e - 1)
      if (!isValidIsoCell(nx, ny, doc.width, doc.height)) {
        ts[i][e] = 0
        continue
      }
      let curSet = rules.getSetNum(doc.getCell(nx, ny).tileNum)
      if (sameType && curSet === iSmoothSet) curSet = iLatSet
      if (!lookup || sameType) {
        if (curSet === iLatSet) ts[i][e] = TOKEN_LAT
        else if (curSet === iSmoothSet || curSet === iTargetSet) ts[i][e] = TOKEN_TARGET
        else ts[i][e] = TOKEN_OTHER
        continue
      }
      if (curSet !== shoreSet && curSet !== iLatSet && curSet !== iSmoothSet) {
        ts[i][e] = 0
      } else {
        ts[i][e] = lookup.cellType(nx, ny)
      }
      if (curSet === shoreSet && ignoreShore) ts[i][e] = 0
    }
  }

  const centerToken = !lookup || sameType ? TOKEN_LAT : ils
  let needed = latNeeded(ts, centerToken)
  needed -= 1
  const cell = doc.getCell(rx, ry)
  if (needed >= 0) {
    cell.tileNum = latIndex(needed, latInfo.startTileNum, latInfo.tilesInSet)
    cell.subTile = 0
    doc.setCell(cell)
    return
  }
  cell.tileNum = smoothInfo.startTileNum
  cell.subTile = 0
  doc.setCell(cell)
}

/** FA2 SmoothAllAt：对当前格尝试每一组 LAT 关系。 */
export function smoothAllAt(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  lookup?: SmoothTerrainLookup,
): void {
  const general = theater.general
  for (const [smoothKey, latKey, targetKey] of TILE_TO_LAT) {
    const smooth = general[smoothKey] ?? -1
    const lat = general[latKey] ?? -1
    const target = general[targetKey] ?? -1
    if (lat < 0 || target < 0) continue
    const set = new TheaterRules(theater).getSetNum(doc.getCell(rx, ry).tileNum)
    if (set === smooth || set === lat) {
      smoothAt(doc, rx, ry, theater, smooth, lat, target, lookup)
    }
  }
}

/** FA2 PlaceTile 后对笔刷外扩 1 格做 SmoothAllAt。 */
export function smoothAllAround(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  radius = 1,
  lookup?: SmoothTerrainLookup,
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = rx + dx
      const cy = ry + dy
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) continue
      smoothAllAt(doc, cx, cy, theater, lookup)
    }
  }
}
