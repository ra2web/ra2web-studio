import faDataText from './fa2/FAData.ini?raw'
import { isValidIsoCell } from './isoCoords'
import { MapIni } from './MapIni'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'

/** FA2 `Defines.h`。 */
export const TERRAIN_GROUND = 0x0d
export const TERRAIN_WATER = 0x09
export const TERRAIN_ROUGH = 0x0e
/** TMP 常见水面标记；FA2 Loading.cpp 把它 hack 成 `TERRAINTYPE_WATER`。 */
export const TERRAIN_WATER_ALT = 0x0a

export type ShorePiece = {
  /** 相对 ShorePieces 集起点的件编号（FA2 `i - tStart`）。 */
  setOffset: number
  cx: number
  cy: number
  /** 子格地形，FA2 顺序：`for x; for y; p++`。 */
  terrain: number[]
  hasPic: boolean[]
  /** FA2 `bZHeight`；缺省时贴合不改高程。 */
  zHeight?: number[]
}

export function isWaterTerrain(terrainType: number): boolean {
  return terrainType === TERRAIN_WATER || terrainType === TERRAIN_WATER_ALT
}

/**
 * 岸块必须同时含陆地与水域，否则 `pieceFits` 会在整片陆地上成立。
 * FA2 靠 TMP `0x0a` / ShoreTerrainRA2 保证这一点。
 */
export function isShoreTransition(piece: ShorePiece): boolean {
  let water = 0
  let land = 0
  for (const terrainType of piece.terrain) {
    if (isWaterTerrain(terrainType)) water++
    else land++
  }
  return water > 0 && land > 0
}

const SOFT_INI = MapIni.parse(faDataText)

/** FA2 `[ShoreTerrainRA2]`：`{件编号}_{子格}=1` 强制水域，`=0` 为 ROUGH。 */
export function shoreTerrainOverride(setOffset: number, subIndex: number): number | undefined {
  const raw = SOFT_INI.getValue('ShoreTerrainRA2', `${setOffset}_${subIndex}`)
  if (!raw) return undefined
  return Number(raw) ? TERRAIN_WATER : TERRAIN_ROUGH
}

/**
 * FA2 CreateShore 第一轮优先放置的 ShorePieces 件编号（相对集起点）。
 * MapData.cpp：4–7、12–15、20–23、28–31、32–39。
 */
const PREFERRED_SHORE_OFFSETS = new Set([
  4, 5, 6, 7, 12, 13, 14, 15, 20, 21, 22, 23, 28, 29, 30, 31,
  32, 33, 34, 35, 36, 37, 38, 39,
])

export function softTileSetNames(): string[] {
  const names: string[] = []
  for (const entry of SOFT_INI.getSection('SoftTileSets')?.entries ?? []) {
    const enabled = Number(String(entry.value).split(';')[0].trim())
    if (enabled) names.push(entry.key)
  }
  return names
}

function keyOf(rx: number, ry: number): string {
  return `${rx},${ry}`
}

function cellTerrain(
  setNum: number,
  waterSet: number,
  shoreSet: number,
  tileNum: number,
  subTile: number,
  shoreStart: number,
  pieces: ShorePiece[],
): number {
  if (setNum === waterSet) return TERRAIN_WATER
  if (setNum === shoreSet && pieces.length > 0) {
    const offset = tileNum - shoreStart
    const piece = pieces.find((item) => item.setOffset === offset)
    if (piece) return piece.terrain[subTile] ?? TERRAIN_GROUND
  }
  return TERRAIN_GROUND
}

function neighbors4(rx: number, ry: number): Array<[number, number]> {
  return [[rx, ry - 1], [rx + 1, ry], [rx, ry + 1], [rx - 1, ry]]
}

function isPreferred(offset: number): boolean {
  return PREFERRED_SHORE_OFFSETS.has(offset)
}

function pieceFits(
  originX: number,
  originY: number,
  piece: ShorePiece,
  terrain: Map<string, number>,
  tsets: Map<string, number>,
  hasChanged: Set<string>,
  noChange: Set<string>,
  shoreSet: number,
  width: number,
  height: number,
): boolean {
  let p = 0
  let mapWater = 0
  const waterCount = piece.terrain.filter((item) => isWaterTerrain(item)).length
  for (let xx = 0; xx < piece.cx; xx++) {
    for (let yy = 0; yy < piece.cy; yy++) {
      const rx = originX + xx
      const ry = originY + yy
      if (!isValidIsoCell(rx, ry, width, height)) {
        p++
        continue
      }
      const pos = keyOf(rx, ry)
      if (tsets.get(pos) === shoreSet && hasChanged.has(pos)) {
        if (!(piece.cx === 2 && piece.cy === 2 && waterCount === 3)) {
          if (!((piece.cx === 3 && piece.cy === 2) || (piece.cx === 2 && piece.cy === 3))) {
            return false
          }
        }
      }
      if (noChange.has(pos)) return false
      const tileT = piece.terrain[p] ?? TERRAIN_GROUND
      const mapT = terrain.get(pos) ?? TERRAIN_GROUND
      if (isWaterTerrain(mapT)) mapWater++
      if (isWaterTerrain(tileT)) {
        if (!isWaterTerrain(mapT)) return false
      } else if (mapT !== TERRAIN_GROUND) {
        return false
      }
      p++
    }
  }
  // FA2 曾用 wat_ex：岸块覆盖范围内必须碰到水域。注释掉后靠 TMP 水域掩码；
  // 目录缺水域标记时必须保留这道检查，否则内陆会被全 GROUND 岸块刷满。
  return mapWater > 0
}

function placePiece(
  doc: MapDocument,
  originX: number,
  originY: number,
  piece: ShorePiece,
  shoreStart: number,
  terrain: Map<string, number>,
  tsets: Map<string, number>,
  hasChanged: Set<string>,
  noChange: Set<string>,
  shoreSet: number,
): void {
  const startHeight = doc.getCell(originX, originY).height
  let p = 0
  for (let xx = 0; xx < piece.cx; xx++) {
    for (let yy = 0; yy < piece.cy; yy++) {
      const rx = originX + xx
      const ry = originY + yy
      if (piece.hasPic[p] && isValidIsoCell(rx, ry, doc.width, doc.height)) {
        const cell = doc.getCell(rx, ry)
        cell.tileNum = shoreStart + piece.setOffset
        cell.subTile = p
        cell.height = Math.max(0, Math.min(14, startHeight + (piece.zHeight?.[p] ?? 0)))
        doc.setCell(cell)
        const pos = keyOf(rx, ry)
        terrain.set(pos, piece.terrain[p] ?? TERRAIN_GROUND)
        tsets.set(pos, shoreSet)
        hasChanged.add(pos)
        if ((piece.cx === 3 && piece.cy === 2) || (piece.cx === 2 && piece.cy === 3)) noChange.add(pos)
      }
      p++
    }
  }
}

function fitPass(
  doc: MapDocument,
  left: number,
  top: number,
  right: number,
  bottom: number,
  pieces: ShorePiece[],
  preferred: boolean,
  terrain: Map<string, number>,
  tsets: Map<string, number>,
  hasChanged: Set<string>,
  noChange: Set<string>,
  shoreSet: number,
  shoreStart: number,
): void {
  for (const piece of pieces) {
    if (preferred !== isPreferred(piece.setOffset)) continue
    if (!isShoreTransition(piece)) continue
    for (let x = left; x < right; x++) {
      for (let y = top; y < bottom; y++) {
        if (!isValidIsoCell(x, y, doc.width, doc.height)) continue
        if (!pieceFits(x, y, piece, terrain, tsets, hasChanged, noChange, shoreSet, doc.width, doc.height)) continue
        const similar = pieces.filter((other) => (
          other.cx === piece.cx
          && other.cy === piece.cy
          && other.terrain.length === piece.terrain.length
          && other.terrain.every((value, index) => value === piece.terrain[index])
          && (preferred ? isPreferred(other.setOffset) : !isPreferred(other.setOffset))
        ))
        const chosen = similar[0] ?? piece
        placePiece(doc, x, y, chosen, shoreStart, terrain, tsets, hasChanged, noChange, shoreSet)
      }
    }
  }
}

/**
 * 无 TMP 岸块目录时：按四邻水域掩码选 ShorePieces 件（LAT 同款 1–15）。
 */
function placeShoreByMask(doc: MapDocument, rx: number, ry: number, theater: TheaterIndex): void {
  const rules = new TheaterRules(theater)
  const water = rules.getGeneralValue('WaterSet')
  const shore = rules.getGeneralValue('ShorePieces')
  if (water < 0 || shore < 0) return
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  const currentSet = rules.getSetNum(doc.getCell(rx, ry).tileNum)
  if (currentSet === water) return
  let mask = 0
  const bits = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]] as const
  for (const [dx, dy, bit] of bits) {
    const nx = rx + dx
    const ny = ry + dy
    if (!isValidIsoCell(nx, ny, doc.width, doc.height)) continue
    if (rules.getSetNum(doc.getCell(nx, ny).tileNum) === water) mask |= bit
  }
  if (mask === 0) return
  const set = theater.sets[shore]
  const tileIndex = set && set.tilesInSet > 1 ? Math.min(mask, set.tilesInSet - 1) : 0
  const cell = doc.getCell(rx, ry)
  cell.tileNum = rules.getTileNumFromSet(shore, tileIndex)
  cell.subTile = 0
  doc.setCell(cell)
}

/**
 * FA2 `CMapData::CreateShore`：修残岸、可选清孤立水/地、再按岸块 TMP 水域图案贴合。
 * 无 `pieces` 时回退为邻水掩码（仍读 FAData SoftTileSets）。
 * `removeUseless` 对齐 FA2 参数；IsoView 笔刷传 FALSE，全图菜单才为 TRUE。
 */
export function createShore(
  doc: MapDocument,
  left: number,
  top: number,
  right: number,
  bottom: number,
  theater: TheaterIndex,
  pieces: ShorePiece[] = [],
  removeUseless = false,
): void {
  const rules = new TheaterRules(theater)
  const waterSet = rules.getGeneralValue('WaterSet')
  const shoreSet = rules.getGeneralValue('ShorePieces')
  const clearSet = rules.getGeneralValue('ClearTile')
  if (waterSet < 0 || shoreSet < 0) return
  const softNames = new Set(softTileSetNames())
  const softSets = new Set<number>()
  for (const name of softNames) {
    const setNum = rules.getGeneralValue(name)
    if (setNum >= 0) softSets.add(setNum)
  }
  const waterTile = rules.getTileNumFromSet(waterSet)
  const clearTile = clearSet >= 0 ? rules.getTileNumFromSet(clearSet) : 0
  const shoreStart = rules.getTileNumFromSet(shoreSet)
  const pad = 2
  const x0 = left - pad
  const y0 = top - pad
  const x1 = right + pad
  const y1 = bottom + pad

  const tsets = new Map<string, number>()
  const terrain = new Map<string, number>()
  const noChange = new Set<string>()
  const hasChanged = new Set<string>()

  const snapshot = () => {
    tsets.clear()
    terrain.clear()
    for (let rx = x0; rx < x1; rx++) {
      for (let ry = y0; ry < y1; ry++) {
        if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
        const cell = doc.getCell(rx, ry)
        const setNum = rules.getSetNum(cell.tileNum)
        tsets.set(keyOf(rx, ry), setNum)
        terrain.set(keyOf(rx, ry), cellTerrain(setNum, waterSet, shoreSet, cell.tileNum, cell.subTile, shoreStart, pieces))
      }
    }
  }
  snapshot()

  for (let rx = x0; rx < x1; rx++) {
    for (let ry = y0; ry < y1; ry++) {
      if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
      if (tsets.get(keyOf(rx, ry)) !== shoreSet) continue
      let waterHits = 0
      for (const [nx, ny] of neighbors4(rx, ry)) {
        if (!isValidIsoCell(nx, ny, doc.width, doc.height)) continue
        if (isWaterTerrain(terrain.get(keyOf(nx, ny)) ?? TERRAIN_GROUND)) waterHits++
      }
      const cell = doc.getCell(rx, ry)
      if (waterHits >= 4) {
        cell.tileNum = waterTile
        cell.subTile = 0
        doc.setCell(cell)
      } else if (waterHits === 0) {
        cell.tileNum = clearTile
        cell.subTile = 0
        doc.setCell(cell)
      }
    }
  }
  snapshot()

  if (removeUseless) {
    for (let rx = left; rx < right; rx++) {
      for (let ry = top; ry < bottom; ry++) {
        if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
        const setNum = tsets.get(keyOf(rx, ry)) ?? 0
        if (softSets.size > 0 && !softSets.has(setNum)) continue
        const center = terrain.get(keyOf(rx, ry)) ?? TERRAIN_GROUND
        if (!isWaterTerrain(center) && center !== TERRAIN_GROUND) continue
        const n = terrain.get(keyOf(rx, ry - 1)) ?? TERRAIN_GROUND
        const s = terrain.get(keyOf(rx, ry + 1)) ?? TERRAIN_GROUND
        const w = terrain.get(keyOf(rx - 1, ry)) ?? TERRAIN_GROUND
        const e = terrain.get(keyOf(rx + 1, ry)) ?? TERRAIN_GROUND
        if ((n !== center && s !== center) || (w !== center && e !== center)) {
          const cell = doc.getCell(rx, ry)
          if (isWaterTerrain(center)) {
            cell.tileNum = clearTile
            cell.subTile = 0
            doc.setCell(cell)
          } else if ((isWaterTerrain(n) && isWaterTerrain(s)) || (isWaterTerrain(w) && isWaterTerrain(e))) {
            cell.tileNum = waterTile
            cell.subTile = 0
            doc.setCell(cell)
          }
        }
      }
    }
    snapshot()
  }

  for (let rx = left; rx < right; rx++) {
    for (let ry = top; ry < bottom; ry++) {
      if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
      const pos = keyOf(rx, ry)
      const setNum = tsets.get(pos) ?? 0
      if (softSets.size > 0 && !softSets.has(setNum)) {
        noChange.add(pos)
        continue
      }
      if (setNum !== shoreSet || pieces.length === 0) continue
      const cell = doc.getCell(rx, ry)
      const piece = pieces.find((item) => item.setOffset === cell.tileNum - shoreStart)
      if (!piece) continue
      const ox = Math.floor(cell.subTile / piece.cy)
      const oy = cell.subTile % piece.cy
      if (rx - ox < left || ry - oy < top || rx - ox + piece.cx >= right || ry - oy + piece.cy >= bottom) {
        noChange.add(pos)
      }
    }
  }

  if (pieces.length > 0) {
    fitPass(doc, left, top, right, bottom, pieces, true, terrain, tsets, hasChanged, noChange, shoreSet, shoreStart)
    fitPass(doc, left, top, right, bottom, pieces, false, terrain, tsets, hasChanged, noChange, shoreSet, shoreStart)
    return
  }

  for (let rx = left; rx < right; rx++) {
    for (let ry = top; ry < bottom; ry++) {
      if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
      placeShoreByMask(doc, rx, ry, theater)
    }
  }
}

/** FA2 菜单 `OnMaptoolsAutocreateshores`：`CreateShore(0,0,iso,iso)` 且 removeUseless=TRUE。 */
export function autoCreateShores(
  doc: MapDocument,
  theater: TheaterIndex,
  pieces: ShorePiece[] = [],
): void {
  createShore(doc, 0, 0, doc.isoSize, doc.isoSize, theater, pieces, true)
}

/** 以点击格为中心的 CreateShore（FA2 岸线笔刷）。 */
export function createShoreAt(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  radius = 2,
  pieces: ShorePiece[] = [],
): void {
  createShore(doc, rx - radius, ry - radius, rx + radius + 1, ry + radius + 1, theater, pieces)
}
