import { MAX_HEIGHT } from './constants'
import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import type { TmpTileShape } from './tmpCatalog'
import { tileNumToSet, type TheaterIndex } from './theaterIndex'

export type PlaceFa2TileOptions = {
  brushW?: number
  brushH?: number
  extraHeight?: number
  /** 点击格子当前 TMP 的 z，用于 `startheight -= tiles[bSubTile].bZHeight`。 */
  shapeOf?: (tileNum: number) => TmpTileShape | undefined
}

export type Fa2PlaceTileCell = { rx: number; ry: number; subTile: number }

/** 多格 TMP，或 theater.ini BridgeSet：走 FA2 PlaceTile 而不是单格刷。 */
export function usesFa2PlaceTile(
  shape: TmpTileShape | undefined,
  tileNum: number,
  theater?: TheaterIndex | null,
): boolean {
  if (!shape) return false
  if (shape.cx > 1 || shape.cy > 1) return true
  if (!theater) return false
  const set = tileNumToSet(theater, tileNum)
  const bridgeSet = theater.general.BridgeSet ?? -1
  return Boolean(set && bridgeSet >= 0 && set.setIndex === bridgeSet)
}

/**
 * FA2 `CIsoView::PlaceTile` 的 footprint：点击格是 TMP 的右下角
 * `pos = (x - cx + 1, y - cy + 1)`，笔刷按整块 TMP 重复。
 */
export function fa2PlaceTileCells(
  rx: number,
  ry: number,
  shape: TmpTileShape,
  brushW = 1,
  brushH = 1,
): Fa2PlaceTileCell[] {
  const cx = Math.max(1, shape.cx)
  const cy = Math.max(1, shape.cy)
  const originRx = rx - cx + 1
  const originRy = ry - cy + 1
  const anyPic = shape.subtiles.some((item) => item.hasPic)
  const out: Fa2PlaceTileCell[] = []
  for (let f = 0; f < Math.max(1, brushW); f++) {
    for (let n = 0; n < Math.max(1, brushH); n++) {
      let p = 0
      for (let i = 0; i < cx; i++) {
        for (let e = 0; e < cy; e++) {
          const paint = !anyPic || Boolean(shape.subtiles[p]?.hasPic)
          if (paint) {
            out.push({
              rx: originRx + i + f * cx,
              ry: originRy + e + n * cy,
              subTile: p,
            })
          }
          p++
        }
      }
    }
  }
  return out
}

/**
 * 对齐 FA2 PlaceTile：写入 tile/subTile，并把高度设为
 * `startheight + tiles[p].bZHeight`（高架 Bridges / BridgeSet 坡道依赖这个）。
 */
export function placeFa2Tile(
  doc: MapDocument,
  rx: number,
  ry: number,
  tileNum: number,
  shape: TmpTileShape,
  options: PlaceFa2TileOptions = {},
): void {
  const current = doc.getCell(rx, ry)
  const currentShape = options.shapeOf?.(current.tileNum)
  const currentZ = currentShape?.subtiles[current.subTile]?.zHeight ?? 0
  const startHeight = current.height + (options.extraHeight ?? 0) - currentZ
  const cells = fa2PlaceTileCells(rx, ry, shape, options.brushW ?? 1, options.brushH ?? 1)
  for (const cellPos of cells) {
    if (!isValidIsoCell(cellPos.rx, cellPos.ry, doc.width, doc.height)) continue
    const z = shape.subtiles[cellPos.subTile]?.zHeight ?? 0
    const cell = doc.getCell(cellPos.rx, cellPos.ry)
    cell.tileNum = tileNum
    cell.subTile = cellPos.subTile
    cell.height = Math.max(0, Math.min(MAX_HEIGHT, startHeight + z))
    doc.setCell(cell)
  }
}
