import { MAX_HEIGHT } from './constants'
import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { cellKey } from './packs'
import { TheaterRules, type TheaterIndex } from './theaterIndex'

/** FA2 `Defines.h` 坡度件编号（相对 RampBase 起点，写入时 `rampbase + ns - 1`）。 */
export const SLOPE_UP_RIGHT = 1
export const SLOPE_UP_BOTTOM = 2
export const SLOPE_UP_LEFT = 3
export const SLOPE_UP_TOP = 4
export const SLOPE_UP_RIGHTBOTTOM = 5
export const SLOPE_UP_LEFTBOTTOM = 6
export const SLOPE_UP_LEFTTOP = 7
export const SLOPE_UP_RIGHTTOP = 8
export const SLOPE_DOWN_LEFTTOP = 9
export const SLOPE_DOWN_RIGHTTOP = 10
export const SLOPE_DOWN_RIGHTBOTTOM = 11
export const SLOPE_DOWN_LEFTBOTTOM = 12
export const SLOPE_DOWN_TOP = 13
export const SLOPE_DOWN_RIGHT = 14
export const SLOPE_DOWN_BOTTOM = 15
export const SLOPE_DOWN_LEFT = 16
export const SLOPE_UP_LEFTBOTTOM_AND_RIGHTTOP = 17
export const SLOPE_UP_LEFTTOP_AND_RIGHTBOTTOM = 18

function inField(rx: number, ry: number, isoSize: number): boolean {
  return rx >= 0 && ry >= 0 && rx < isoSize && ry < isoSize
}

function peekHeight(doc: MapDocument, rx: number, ry: number): number {
  return doc.cells.get(cellKey(rx, ry))?.height ?? 0
}

function heightDiff(doc: MapDocument, cx: number, cy: number, rx: number, ry: number, isoSize: number): number {
  if (!inField(rx, ry, isoSize)) return 0
  return peekHeight(doc, cx, cy) - peekHeight(doc, rx, ry)
}

/**
 * FA2 `CMapData::CreateSlopesAt`：按 3×3 高差选 RampBase 件；鞍部则抬高 morphable 格并递归。
 */
export function createSlopesAt(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  disableSlopeCorrection = false,
): void {
  const isoSize = doc.isoSize
  if (!inField(rx, ry, isoSize)) return
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  const rules = new TheaterRules(theater)
  const cell = doc.getCell(rx, ry)
  const morphable = rules.isMorphable(cell.tileNum)
  const h: number[][] = [
    [
      heightDiff(doc, rx, ry, rx - 1, ry - 1, isoSize),
      heightDiff(doc, rx, ry, rx - 1, ry, isoSize),
      heightDiff(doc, rx, ry, rx - 1, ry + 1, isoSize),
    ],
    [
      heightDiff(doc, rx, ry, rx, ry - 1, isoSize),
      0,
      heightDiff(doc, rx, ry, rx, ry + 1, isoSize),
    ],
    [
      heightDiff(doc, rx, ry, rx + 1, ry - 1, isoSize),
      heightDiff(doc, rx, ry, rx + 1, ry, isoSize),
      heightDiff(doc, rx, ry, rx + 1, ry + 1, isoSize),
    ],
  ]

  if (!disableSlopeCorrection && morphable) {
    const saddle = (
      (h[0][1] < 0 && h[2][1] < 0) || (h[1][0] < 0 && h[1][2] < 0)
      || (h[1][0] < 0 && h[0][2] < 0 && h[0][1] >= 0)
      || (h[1][0] < 0 && h[2][2] < 0 && h[2][1] >= 0)
      || (h[0][1] < 0 && h[2][0] < 0 && h[1][0] >= 0)
      || (h[0][1] < 0 && h[2][2] < 0 && h[1][2] >= 0)
      || (h[1][2] < 0 && h[0][0] < 0 && h[0][1] >= 0)
      || (h[1][2] < 0 && h[2][0] < 0 && h[2][1] >= 0)
      || (h[2][1] < 0 && h[0][0] < 0 && h[1][0] >= 0)
      || (h[2][1] < 0 && h[0][2] < 0 && h[1][2] >= 0)
      || (h[1][0] < 0 && h[0][1] < 0 && h[0][0] >= 0)
      || (h[0][1] < 0 && h[1][2] < 0 && h[0][2] >= 0)
      || (h[1][2] < 0 && h[2][1] < 0 && h[2][2] >= 0)
      || (h[2][1] < 0 && h[1][0] < 0 && h[2][0] >= 0)
    )
    if (saddle) {
      const next = Math.min(MAX_HEIGHT, cell.height + 1)
      if (next !== cell.height) {
        cell.height = next
        doc.setCell(cell)
        for (let i = -1; i < 2; i++) {
          for (let e = -1; e < 2; e++) {
            createSlopesAt(doc, rx + i, ry + e, theater, disableSlopeCorrection)
          }
        }
      }
      return
    }
  }

  let ns = -1
  if (h[0][0] === -1 && h[2][2] === -1 && h[2][0] >= 0 && h[0][2] >= 0 && h[1][0] >= 0 && h[1][2] >= 0 && h[0][1] >= 0 && h[2][1] >= 0) {
    ns = SLOPE_UP_LEFTTOP_AND_RIGHTBOTTOM
  }
  if (h[0][2] === -1 && h[2][0] === -1 && h[0][0] >= 0 && h[2][2] >= 0 && h[0][1] >= 0 && h[1][0] >= 0 && h[1][2] >= 0 && h[2][1] >= 0) {
    ns = SLOPE_UP_LEFTBOTTOM_AND_RIGHTTOP
  }

  if (ns === -1) {
    if (h[1][0] === -1 && h[0][1] !== -1 && h[1][2] !== -1 && h[2][1] !== -1) ns = SLOPE_UP_LEFT
    else if (h[0][1] === -1 && h[1][0] !== -1 && h[2][1] !== -1 && h[1][2] !== -1) ns = SLOPE_UP_TOP
    else if (h[1][2] === -1 && h[0][1] !== -1 && h[1][0] !== -1 && h[2][1] !== -1) ns = SLOPE_UP_RIGHT
    else if (h[2][1] === -1 && h[0][1] !== -1 && h[1][0] !== -1 && h[1][2] !== -1) ns = SLOPE_UP_BOTTOM
  }

  if (ns === -1) {
    if (h[0][0] === -2) ns = SLOPE_DOWN_BOTTOM
    if (h[2][0] === -2) ns = SLOPE_DOWN_RIGHT
    if (h[0][2] === -2) ns = SLOPE_DOWN_LEFT
    if (h[2][2] === -2) ns = SLOPE_DOWN_TOP
  }

  if (ns === -1 && h[0][0] === -1) {
    if (h[1][0] === -1 && h[0][1] === -1) ns = SLOPE_DOWN_RIGHTBOTTOM
    else if (h[1][0] === 0 && h[0][1] === 0) ns = SLOPE_UP_LEFTTOP
  }
  if (ns === -1 && h[2][0] === -1) {
    if (h[1][0] === -1 && h[2][1] === -1) ns = SLOPE_DOWN_RIGHTTOP
    else if (h[1][0] === 0 && h[2][1] === 0) ns = SLOPE_UP_LEFTBOTTOM
  }
  if (ns === -1 && h[0][2] === -1) {
    if (h[1][2] === -1 && h[0][1] === -1) ns = SLOPE_DOWN_LEFTBOTTOM
    else if (h[1][2] === 0 && h[0][1] === 0) ns = SLOPE_UP_RIGHTTOP
  }
  if (ns === -1 && h[2][2] === -1) {
    if (h[1][2] === -1 && h[2][1] === -1) ns = SLOPE_DOWN_LEFTTOP
    else if (h[1][2] === 0 && h[2][1] === 0) ns = SLOPE_UP_RIGHTBOTTOM
  }

  if (ns === -1 && h[1][0] === -1 && h[2][1] === -1) ns = SLOPE_DOWN_RIGHTTOP
  if (ns === -1 && h[1][2] === -1 && h[2][1] === -1) ns = SLOPE_DOWN_LEFTTOP
  if (ns === -1 && h[1][0] === -1 && h[0][1] === -1) ns = SLOPE_DOWN_RIGHTBOTTOM
  if (ns === -1 && h[1][2] === -1 && h[0][1] === -1) ns = SLOPE_DOWN_LEFTBOTTOM

  const rampSet = rules.getGeneralValue('RampBase')
  const rampSmooth = rules.getGeneralValue('RampSmooth')
  const setNum = rules.getSetNum(cell.tileNum)
  if (ns === -1 && (setNum === rampSet || setNum === rampSmooth) && morphable) {
    cell.tileNum = 0
    cell.subTile = 0
    doc.setCell(cell)
  }
  if (morphable && ns !== -1 && rampSet >= 0) {
    cell.tileNum = rules.getTileNumFromSet(rampSet, ns - 1)
    cell.subTile = 0
    doc.setCell(cell)
  }
}

/** 刷高程后对笔刷范围及一圈邻格跑 CreateSlopesAt（FA2 Heighten 后的斜率修正）。 */
export function createSlopesAround(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  brush = 1,
  disableSlopeCorrection = false,
): void {
  const extra = 1
  for (let dy = -brush + 1 - extra; dy < brush + extra; dy++) {
    for (let dx = -brush + 1 - extra; dx < brush + extra; dx++) {
      createSlopesAt(doc, rx + dx, ry + dy, theater, disableSlopeCorrection)
    }
  }
}

/** FA2 `OnMaptoolsChangemapheight`：全图加减同一高度。 */
export function changeMapHeight(doc: MapDocument, delta: number): string | null {
  if (!delta) return null
  for (const cell of doc.cells.values()) {
    const next = cell.height + delta
    if (next < 0 || next > MAX_HEIGHT) return '高度超出 0–14'
  }
  for (const cell of doc.cells.values()) {
    cell.height += delta
  }
  return null
}
