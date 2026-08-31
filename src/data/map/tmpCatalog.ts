import { TERRAIN_GROUND, TERRAIN_ROUGH, TERRAIN_WATER, type ShorePiece } from './fa2Shore'

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
 * FA2 `bHackedTerrainType`：WaterSet 强制水域；ROUGH 当作 GROUND。
 * Loading.cpp 对 ShorePieces 还有若干水面 hack，这里保留 ROUGH→GROUND 与显式水域。
 */
export function hackTerrainType(terrainType: number, setIsWater = false): number {
  if (setIsWater) return TERRAIN_WATER
  if (terrainType === TERRAIN_ROUGH) return TERRAIN_GROUND
  if (terrainType === TERRAIN_WATER) return TERRAIN_WATER
  return terrainType || TERRAIN_GROUND
}

/** FA2 `tiles[p]`：`p = x * cy + y`（与 TMP 偏移表顺序一致）。 */
function imageAt(tmp: TmpLike, x: number, y: number): TmpLike['images'][number] {
  const cy = tmp.height
  return tmp.images[x * cy + y] ?? null
}

/** 从 TMP 头与子格抽出 FA2 TILEDATA 的 cx/cy/tiles[p]。 */
export function shapeFromTmp(tmp: TmpLike): TmpTileShape {
  const cx = Math.max(1, tmp.width)
  const cy = Math.max(1, tmp.height)
  const subtiles: TmpSubtileInfo[] = []
  for (let x = 0; x < cx; x++) {
    for (let y = 0; y < cy; y++) {
      const image = imageAt(tmp, x, y)
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
    terrain: shape.subtiles.map((item) => hackTerrainType(item.terrainType, setIsWater)),
    hasPic: shape.subtiles.map((item) => item.hasPic),
    zHeight: shape.subtiles.map((item) => item.zHeight),
  }
}

export function cliffFootprint(shape: TmpTileShape | undefined, tileInSet: number): { cx: number; cy: number; zHeight: number[] } {
  if (shape) {
    return { cx: shape.cx, cy: shape.cy, zHeight: shape.subtiles.map((item) => item.zHeight) }
  }
  if (tileInSet === 7 || tileInSet === 17 || tileInSet === 25 || tileInSet === 37) {
    return { cx: 2, cy: 1, zHeight: [4, 4] }
  }
  return { cx: 2, cy: 2, zHeight: [4, 4, 4, 4] }
}

export function subtileIndex(x: number, y: number, cy: number): number {
  return x * cy + y
}
