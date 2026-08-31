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

/**
 * FA2 CMapData::SmoothAt（its==iss 路径，红警 2 LAT 的主路径）。
 * 3×3 正交邻接对照 CLAT 件编号，写回过渡瓦片或纯 Smooth 集。
 */
export function smoothAt(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  iSmoothSet: number,
  iLatSet: number,
  iTargetSet: number,
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
        ts[i][e] = TOKEN_OTHER
        continue
      }
      let curSet = rules.getSetNum(doc.getCell(nx, ny).tileNum)
      if (curSet === iSmoothSet) curSet = iLatSet
      if (curSet === iLatSet) ts[i][e] = TOKEN_LAT
      else if (curSet === iSmoothSet || curSet === iTargetSet) ts[i][e] = TOKEN_TARGET
      else if (curSet === shoreSet) ts[i][e] = TOKEN_OTHER
      else ts[i][e] = TOKEN_OTHER
    }
  }

  let needed = -1
  if (ts[1][1] === TOKEN_LAT) {
    const n = ts[0][1] === TOKEN_LAT
    const w = ts[1][0] === TOKEN_LAT
    const e = ts[1][2] === TOKEN_LAT
    const s = ts[2][1] === TOKEN_LAT
    if (!n && !w && !e && !s) needed = 16
    else if (n && w && e && s) needed = 0
    else if (n && s && !w && !e) needed = 11
    else if (w && e && !n && !s) needed = 6
    else if (!w && n && s) needed = 9
    else if (!s && w && e) needed = 5
    else if (!e && n && s) needed = 3
    else if (!n && w && e) needed = 2
    else if (n && !w && !e && !s) needed = 15
    else if (e && !w && !n && !s) needed = 14
    else if (s && !w && !n && !e) needed = 12
    else if (w && !n && !e && !s) needed = 8
    else if (!w && !s) needed = 13
    else if (!w && !n) needed = 10
    else if (!s && !e) needed = 7
    else if (!n && !e) needed = 4
  }

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
export function smoothAllAt(doc: MapDocument, rx: number, ry: number, theater: TheaterIndex): void {
  const general = theater.general
  for (const [smoothKey, latKey, targetKey] of TILE_TO_LAT) {
    const smooth = general[smoothKey] ?? -1
    const lat = general[latKey] ?? -1
    const target = general[targetKey] ?? -1
    if (lat < 0 || target < 0) continue
    const set = new TheaterRules(theater).getSetNum(doc.getCell(rx, ry).tileNum)
    if (set === smooth || set === lat) {
      smoothAt(doc, rx, ry, theater, smooth, lat, target)
    }
  }
}

/** FA2 PlaceTile 后对笔刷外扩 1 格做 SmoothAllAt。 */
export function smoothAllAround(doc: MapDocument, rx: number, ry: number, theater: TheaterIndex, radius = 1): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = rx + dx
      const cy = ry + dy
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) continue
      smoothAllAt(doc, cx, cy, theater)
    }
  }
}
