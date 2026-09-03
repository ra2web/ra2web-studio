import { MAX_HEIGHT } from './constants'
import { fa2CenteredRectOffsets } from './fa2Brush'
import { createSlopesAt, createSlopesInRect } from './fa2Slopes'
import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { cellKey, emptyCell } from './packs'
import { TheaterRules, type TheaterIndex } from './theaterIndex'
import type { TmpTileShape } from './tmpCatalog'

export type HeightTileLookup = {
  morphable(tileNum: number): boolean
  setNum(tileNum: number): number
  shape(tileNum: number): { cx: number; cy: number; zHeight: (subTile: number) => number; terrainType: (subTile: number) => number }
}

export type HeightAffectRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type ChangeTileHeightOptions = {
  nonMorphableMove?: boolean
  onlyThisTile?: boolean
  noSlopes?: boolean
  disableSlopeCorrection?: boolean
  affected?: HeightAffectRect
}

export type HeightBrushOptions = {
  brush?: number
  brushW?: number
  brushH?: number
  onlyThisTile?: boolean
  slopeCorrection?: boolean
  /** 同一笔划锁定的基准高度；不传则用落点当前高度。 */
  lockHeight?: number
}

const DEFAULT_SHAPE = {
  cx: 1,
  cy: 1,
  zHeight: () => 0,
  terrainType: () => 0,
}

export function lookupFromTheater(theater: TheaterIndex, shapes?: Map<number, TmpTileShape>): HeightTileLookup {
  const rules = new TheaterRules(theater)
  return {
    morphable: (tileNum) => rules.isMorphable(tileNum),
    setNum: (tileNum) => rules.getSetNum(tileNum),
    shape: (tileNum) => {
      const found = shapes?.get(tileNum)
      if (!found) return DEFAULT_SHAPE
      return {
        cx: found.cx,
        cy: found.cy,
        zHeight: (subTile) => found.subtiles[subTile]?.zHeight ?? 0,
        terrainType: (subTile) => found.subtiles[subTile]?.terrainType ?? 0,
      }
    },
  }
}

/** FA2 IsoView `ChangeTileHeight` 入口跳过的边框格。 */
export function fa2HeightFieldOk(rx: number, ry: number, mapWidth: number, mapHeight: number): boolean {
  if (rx < 1 || ry < 1) return false
  if (rx + ry < mapWidth + 1) return false
  if (rx + ry > mapWidth + mapHeight * 2) return false
  if (ry + 1 > mapWidth && rx - 1 < ry - mapWidth) return false
  if (rx + 1 > mapWidth && ry + mapWidth - 1 < rx) return false
  return true
}

function peekCell(doc: MapDocument, rx: number, ry: number) {
  return doc.cells.get(cellKey(rx, ry)) ?? emptyCell(rx, ry)
}

function expandAffected(rect: HeightAffectRect | undefined, rx: number, ry: number): void {
  if (!rect) return
  if (rx < rect.left) rect.left = rx
  if (ry < rect.top) rect.top = ry
  if (rx > rect.right) rect.right = rx
  if (ry > rect.bottom) rect.bottom = ry
}

function writeHeight(doc: MapDocument, rx: number, ry: number, height: number): void {
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  const cell = doc.getCell(rx, ry)
  cell.height = Math.max(0, Math.min(MAX_HEIGHT, height))
  doc.setCell(cell)
}

function neighborGround(doc: MapDocument, rx: number, ry: number): number {
  const tileNum = peekCell(doc, rx, ry).tileNum
  return tileNum === 0xffff ? 0 : tileNum
}

/**
 * FA2 `CIsoView::ChangeTileHeight`：按 TMP morphable / bZHeight 把邻格高度一起带上。
 */
export function changeTileHeight(
  doc: MapDocument,
  rx: number,
  ry: number,
  newHeight: number,
  lookup: HeightTileLookup,
  theater: TheaterIndex,
  options: ChangeTileHeightOptions = {},
  reserved = new Set<string>(),
): void {
  const isoSize = doc.isoSize
  if (!fa2HeightFieldOk(rx, ry, doc.width, doc.height)) return
  const key = cellKey(rx, ry)
  if (reserved.has(key)) return

  const orig = peekCell(doc, rx, ry)
  const origGround = orig.tileNum === 0xffff ? 0 : orig.tileNum
  reserved.add(key)
  expandAffected(options.affected, rx, ry)

  let nonMorphable = options.nonMorphableMove === true
  if (!lookup.morphable(origGround)) nonMorphable = true
  writeHeight(doc, rx, ry, newHeight)

  const origShape = lookup.shape(origGround)
  for (let i = -1; i < 2; i++) {
    for (let e = -1; e < 2; e++) {
      const nx = rx + i
      const ny = ry + e
      if (nx < 0 || ny < 0 || nx >= isoSize || ny >= isoSize) continue
      const neighbor = peekCell(doc, nx, ny)
      const destGround = neighbor.tileNum === 0xffff ? 0 : neighbor.tileNum
      let allowed = true
      if (options.onlyThisTile) {
        if (destGround !== origGround) allowed = false
        else {
          const width = origShape.cy
          const ox = Math.floor(orig.subTile / Math.max(1, width))
          const oy = orig.subTile % Math.max(1, width)
          const x = Math.floor(neighbor.subTile / Math.max(1, width))
          const y = neighbor.subTile % Math.max(1, width)
          if (x - ox !== i || y - oy !== e) allowed = false
        }
      }
      const destMorphable = lookup.morphable(destGround)
      const destShape = lookup.shape(destGround)
      if (allowed && (!nonMorphable || destMorphable)) {
        const block = (ax: number, ay: number, bx: number, by: number) => {
          const left = neighborGround(doc, ax, ay)
          const right = neighborGround(doc, bx, by)
          return !lookup.morphable(left) && !lookup.morphable(right)
        }
        if (e === 1 && i === 1 && block(rx + 1, ry, rx, ry + 1)) allowed = false
        if (e === -1 && i === -1 && block(rx - 1, ry, rx, ry - 1)) allowed = false
        if (e === -1 && i === 1 && block(rx - 1, ry, rx, ry + 1)) allowed = false
        if (e === 1 && i === -1 && block(rx + 1, ry, rx, ry - 1)) allowed = false
      }
      if (!allowed || reserved.has(cellKey(nx, ny))) continue

      const needDiff = destShape.zHeight(neighbor.subTile) - origShape.zHeight(orig.subTile)
      const diff = neighbor.height - newHeight
      const nested = { ...options, nonMorphableMove: nonMorphable }
      if (!nonMorphable && destMorphable) {
        if (diff < -1) changeTileHeight(doc, nx, ny, newHeight - 1, lookup, theater, nested, reserved)
        if (diff > 1) changeTileHeight(doc, nx, ny, newHeight + 1, lookup, theater, nested, reserved)
      } else if (nonMorphable) {
        if (!destMorphable) {
          if (destShape.terrainType(neighbor.subTile) === origShape.terrainType(orig.subTile) || lookup.setNum(destGround) === lookup.setNum(origGround)) {
            changeTileHeight(doc, nx, ny, newHeight + needDiff, lookup, theater, { ...nested, nonMorphableMove: true }, reserved)
          }
        } else if ((origShape.cx > 1 && origShape.cy > 1 && e < 0 && i < 0) || ((origShape.cx < 2 || origShape.cy < 2) && e > 0 && i > 0)) {
          changeTileHeight(doc, nx, ny, newHeight, lookup, theater, { ...nested, nonMorphableMove: false }, reserved)
        } else if (diff - needDiff !== 0) {
          changeTileHeight(doc, nx, ny, newHeight + needDiff, lookup, theater, { ...nested, nonMorphableMove: false }, reserved)
        }
      }
    }
  }

  if (!options.noSlopes) {
    for (let i = -1; i < 2; i++) {
      for (let e = -1; e < 2; e++) {
        createSlopesAt(doc, rx + i, ry + e, theater, options.disableSlopeCorrection === true)
      }
    }
  }
}

function heightBrushSize(options: HeightBrushOptions): { w: number; h: number } {
  const w = options.brushW ?? options.brush ?? 1
  const h = options.brushH ?? options.brush ?? 1
  return { w, h }
}

/** FA2 `ACTIONMODE_HEIGHTEN`：morphable 刷同高格，再 ChangeTileHeight。 */
export function heightenGround(
  doc: MapDocument,
  rx: number,
  ry: number,
  lookup: HeightTileLookup,
  theater: TheaterIndex,
  options: HeightBrushOptions = {},
): void {
  applyHeightMode(doc, rx, ry, 1, lookup, theater, options)
}

/** FA2 `ACTIONMODE_LOWER`。 */
export function lowerGround(
  doc: MapDocument,
  rx: number,
  ry: number,
  lookup: HeightTileLookup,
  theater: TheaterIndex,
  options: HeightBrushOptions = {},
): void {
  applyHeightMode(doc, rx, ry, -1, lookup, theater, options)
}

function applyHeightMode(
  doc: MapDocument,
  rx: number,
  ry: number,
  delta: number,
  lookup: HeightTileLookup,
  theater: TheaterIndex,
  options: HeightBrushOptions,
): void {
  const { w, h } = heightBrushSize(options)
  const origin = peekCell(doc, rx, ry)
  const ground = origin.tileNum === 0xffff ? 0 : origin.tileNum
  const offsets = fa2CenteredRectOffsets(w, h)
  const disableSlopeCorrection = options.slopeCorrection === false
  const affected: HeightAffectRect = { left: rx, top: ry, right: rx, bottom: ry }
  if (lookup.morphable(ground)) {
    const oheight = options.lockHeight ?? origin.height
    const target = oheight + delta
    for (const { dx, dy } of offsets) {
      const cell = peekCell(doc, rx + dx, ry + dy)
      const tileNum = cell.tileNum === 0xffff ? 0 : cell.tileNum
      if (lookup.morphable(tileNum) && cell.height === oheight) writeHeight(doc, rx + dx, ry + dy, target)
    }
    for (const { dx, dy } of offsets) {
      const nx = rx + dx
      const ny = ry + dy
      const cell = peekCell(doc, nx, ny)
      const tileNum = cell.tileNum === 0xffff ? 0 : cell.tileNum
      if (lookup.morphable(tileNum) && cell.height === target) {
        changeTileHeight(doc, nx, ny, target, lookup, theater, {
          nonMorphableMove: false,
          onlyThisTile: options.onlyThisTile === true,
          noSlopes: true,
          disableSlopeCorrection,
          affected,
        })
      }
    }
    createSlopesInRect(doc, affected, theater, disableSlopeCorrection)
    return
  }
  changeTileHeight(doc, rx, ry, (options.lockHeight ?? origin.height) + delta, lookup, theater, {
    nonMorphableMove: false,
    onlyThisTile: options.onlyThisTile !== true,
    disableSlopeCorrection,
    affected,
  })
}

/**
 * FA2 `CIsoView::AutoLevel`：崖块旁 morphable 格按高差抬平，再 ChangeTileHeight。
 */
export function autoLevel(doc: MapDocument, lookup: HeightTileLookup, theater: TheaterIndex): void {
  const rules = new TheaterRules(theater)
  const cliffSet = rules.getGeneralValue('CliffSet')
  const slopeSet = rules.getGeneralValue('SlopeSetPieces')
  const cliffInfo = theater.sets[cliffSet]
  if (!cliffInfo || cliffSet < 0) return
  const iCliffStart = cliffInfo.startTileNum
  const isoSize = doc.isoSize
  const changed: Array<{ rx: number; ry: number }> = []

  for (let oy = 0; oy < isoSize; oy++) {
    for (let ox = 0; ox < isoSize; ox++) {
      if (!isValidIsoCell(ox, oy, doc.width, doc.height)) continue
      const f1 = peekCell(doc, ox, oy)
      const oGround = f1.tileNum === 0xffff ? 0 : f1.tileNum
      const oShape = lookup.shape(oGround)
      const oWidth = oShape.cx
      const oHeight = oShape.cy
      const heights: number[][] = []
      for (let p = 0; p < oWidth; p++) {
        heights[p] = []
        for (let k = 0; k < oHeight; k++) heights[p][k] = oShape.zHeight(p + k * oWidth)
      }
      const count = oWidth * oHeight
      const specialCliff = oGround >= 8 + iCliffStart && oGround <= 13 + iCliffStart

      for (let x = -1; x < 2; x++) {
        for (let y = -1; y < 2; y++) {
          if (x !== 0 && y !== 0) continue
          if (x === 0 && y === 0) continue
          if (!specialCliff) {
            if (count !== 4 && (x < 0 || y < 0)) continue
            if (heights[0]?.[0] && !heights[1]?.[1] && heights[1]?.[0] && heights[0]?.[1] && (x < 0 || y < 0)) continue
            if (heights[0]?.[0] && heights[1]?.[1] && (x < 0 || y > 0)) continue
            if (!heights[0]?.[0] && heights[1]?.[0] && heights[0]?.[1] && heights[1]?.[1] && (x < 0 || y < 0)) continue
          } else if (x > 0 || y > 0) continue

          const nx = ox + x
          const ny = oy + y
          if (nx < 0 || ny < 0 || nx >= isoSize || ny >= isoSize) continue
          const cur = peekCell(doc, nx, ny)
          const curGround = cur.tileNum === 0xffff ? 0 : cur.tileNum
          if (lookup.setNum(curGround) === lookup.setNum(oGround)) continue
          const oSet = lookup.setNum(oGround)
          if (!((oSet === cliffSet || oSet === slopeSet) && lookup.morphable(curGround))) continue

          let heightDiff = f1.height - cur.height
          const extra = specialCliff && oShape.zHeight(cur.subTile) === 0
          if (extra) heightDiff += 4
          if (Math.abs(heightDiff) > 1) {
            const height = extra ? f1.height + 4 : f1.height
            writeHeight(doc, nx, ny, height)
            changed.push({ rx: nx, ry: ny })
          } else if (heightDiff) {
            createSlopesAt(doc, nx, ny, theater)
          }
        }
      }
    }
  }

  for (const cell of changed) {
    changeTileHeight(doc, cell.rx, cell.ry, peekCell(doc, cell.rx, cell.ry).height, lookup, theater, {
      nonMorphableMove: false,
      onlyThisTile: false,
    })
  }
}
