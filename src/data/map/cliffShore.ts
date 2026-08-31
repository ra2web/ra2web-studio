import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'
import { placeFa2Cliff } from './fa2Cliff'
import type { MapTheater } from './constants'

function bresenham(x0: number, y0: number, x1: number, y1: number): Array<{ rx: number; ry: number }> {
  const points: Array<{ rx: number; ry: number }> = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  for (;;) {
    points.push({ rx: x, ry: y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return points
}

/** 沿两点放置 CliffSet。优先 FA2 Front/Back modifier，失败则回退为线刷。 */
export function placeCliffLine(
  doc: MapDocument,
  from: { rx: number; ry: number },
  to: { rx: number; ry: number },
  theater: TheaterIndex,
  heightDelta = 4,
  face: 'front' | 'back' = 'front',
  theaterName: MapTheater = 'TEMPERATE',
): void {
  if (placeFa2Cliff(doc, from, to, theater, theaterName, { face, pick: (tiles) => tiles[0] ?? -1 })) {
    return
  }
  const rules = new TheaterRules(theater)
  const cliffSet = rules.getGeneralValue('CliffSet')
  if (cliffSet < 0) return
  const tileNum = rules.getTileNumFromSet(cliffSet)
  for (const point of bresenham(from.rx, from.ry, to.rx, to.ry)) {
    if (!isValidIsoCell(point.rx, point.ry, doc.width, doc.height)) continue
    const cell = doc.getCell(point.rx, point.ry)
    cell.tileNum = tileNum
    cell.height = Math.max(0, Math.min(14, cell.height + heightDelta))
    doc.setCell(cell)
  }
}

const SHORE_NEIGHBORS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
]

/** 若当前格邻接水域，则写成 ShorePieces 首块（FA2 CreateShore 的局部近似）。 */
export function applyShoreAt(doc: MapDocument, rx: number, ry: number, theater: TheaterIndex): void {
  const rules = new TheaterRules(theater)
  const water = rules.getGeneralValue('WaterSet')
  const shore = rules.getGeneralValue('ShorePieces')
  if (water < 0 || shore < 0) return
  const currentSet = rules.getSetNum(doc.getCell(rx, ry).tileNum)
  if (currentSet === water) return
  let touchesWater = false
  for (const [dx, dy] of SHORE_NEIGHBORS) {
    const nx = rx + dx
    const ny = ry + dy
    if (!isValidIsoCell(nx, ny, doc.width, doc.height)) continue
    if (rules.getSetNum(doc.getCell(nx, ny).tileNum) === water) {
      touchesWater = true
      break
    }
  }
  if (!touchesWater) return
  const cell = doc.getCell(rx, ry)
  cell.tileNum = rules.getTileNumFromSet(shore)
  doc.setCell(cell)
}
