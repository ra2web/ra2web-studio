import {
  TERRAIN_GROUND,
  TERRAIN_ROUGH,
  TERRAIN_WATER,
  TERRAIN_WATER_ALT,
  shoreTerrainOverride,
  type ShorePiece,
} from './fa2Shore'

/** FA2 Loading.cpp / PlaceCliff 使用的 TMP 子格。顺序：`for x; for y; p++`。 */
export type TmpSubtileInfo = {
  terrainType: number
  zHeight: number
  hasPic: boolean
}

export type TmpTileShape = {
  cx: number
  cy: number
  subtiles: TmpSubtileInfo[]
}

export type TmpLike = {
  width: number
  height: number
  images: Array<{ terrainType?: number; height?: number; tileData?: Uint8Array } | null>
}

/**
 * FA2 `bHackedTerrainType`：WaterSet 强制水域；`0x0a` 与 WATER 都当水域；ROUGH 当作 GROUND。
 * ShorePieces 另见 `shoreTerrainOverride`（FAData `[ShoreTerrainRA2]`）。
 */
export function hackTerrainType(terrainType: number, setIsWater = false): number {
  if (setIsWater) return TERRAIN_WATER
  if (terrainType === TERRAIN_WATER || terrainType === TERRAIN_WATER_ALT) return TERRAIN_WATER
  if (terrainType === TERRAIN_ROUGH) return TERRAIN_GROUND
  return terrainType || TERRAIN_GROUND
}

/**
 * FA2 `XCC_GetTMPInfo`：`iTilesX = cblocks_y`，`iTilesY = cblocks_x`。
 * PlaceCliff 用的 TILEDATA.cx/cy 也来自这里，CliffSet 同样要 swap。
 */
export function fa2CblocksForSet(_setIndex?: number, _cliffSet = -1): boolean {
  return true
}

/**
 * 从 TMP 头抽出 TILEDATA 的 cx/cy/tiles[p]。
 * `fa2Cblocks`：对齐 FA2 `XCC_GetTMPInfo`（`iTilesX = cblocks_y`，`iTilesY = cblocks_x`）。
 * 公路等非正方形 TMP 必须开，否则 PlaceTile 走错等距轴，extra 标线会交错。
 */
export function shapeFromTmp(tmp: TmpLike, fa2Cblocks = false): TmpTileShape {
  const cx = Math.max(1, fa2Cblocks ? tmp.height : tmp.width)
  const cy = Math.max(1, fa2Cblocks ? tmp.width : tmp.height)
  const subtiles: TmpSubtileInfo[] = []
  for (let x = 0; x < cx; x++) {
    for (let y = 0; y < cy; y++) {
      const image = tmp.images[x * cy + y] ?? null
      subtiles.push({
        terrainType: image?.terrainType ?? 0,
        zHeight: image?.height ?? 0,
        hasPic: Boolean(image && (image.tileData?.length ?? 0) > 0),
      })
    }
  }
  return { cx, cy, subtiles }
}

export function shorePieceFromShape(setOffset: number, shape: TmpTileShape, setIsWater = false): ShorePiece {
  return {
    setOffset,
    cx: shape.cx,
    cy: shape.cy,
    terrain: shape.subtiles.map((item, index) => (
      shoreTerrainOverride(setOffset, index) ?? hackTerrainType(item.terrainType, setIsWater)
    )),
    hasPic: shape.subtiles.map((item) => item.hasPic),
    zHeight: shape.subtiles.map((item) => item.zHeight),
  }
}

/**
 * 无 TMP 时按 FAData/真实 TMP 头近似 CliffSet 尺寸（isotemp.mix 实测）。
 * Studio 轴向：cx 沿 rx（子格 i），cy 沿 ry（子格 e），p = i*cy+e。
 */
export function cliffFootprint(shape: TmpTileShape | undefined, tileInSet: number): { cx: number; cy: number; zHeight: number[] } {
  if (shape) {
    return { cx: shape.cx, cy: shape.cy, zHeight: shape.subtiles.map((item) => item.zHeight) }
  }
  switch (tileInSet) {
    case 1: // front horiz_cornertop（沿 rx 两格，高→低）
    case 7: // front horiz 收尾件
      return { cx: 2, cy: 1, zHeight: [4, 0] }
    case 17: // front vertic 收尾件（沿 ry 两格，高→低）
    case 21: // front vertic_cornerleft
      return { cx: 1, cy: 2, zHeight: [4, 0] }
    case 4:
    case 5:
    case 6: // front horiz：i0 行（rim 列 rx）高、i1 低
      return { cx: 2, cy: 2, zHeight: [4, 4, 0, 0] }
    case 14:
    case 15:
    case 16: // front vertic：e0（rim 行 ry）高、e1 低
      return { cx: 2, cy: 2, zHeight: [4, 0, 4, 0] }
    case 22:
    case 23:
    case 24: // back horiz：1 格 rx × 2 格 ry，全高
      return { cx: 1, cy: 2, zHeight: [4, 4] }
    case 34:
    case 35:
    case 36: // back vertic：2 格 rx × 1 格 ry，全高
      return { cx: 2, cy: 1, zHeight: [4, 4] }
    case 25:
    case 37: // back 收尾件
    case 28:
    case 29:
    case 32:
    case 33: // 1×1 转角件
      return { cx: 1, cy: 1, zHeight: [4] }
    default:
      return { cx: 2, cy: 2, zHeight: [4, 4, 4, 4] }
  }
}

export function subtileIndex(x: number, y: number, cy: number): number {
  return x * cy + y
}
