import { MAX_HEIGHT } from './constants'
import type { MapTheater } from './constants'
import { classifyCliffDirection, placeFa2Cliff } from './fa2Cliff'
import { createSlopesInRect } from './fa2Slopes'
import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'
import { cliffFootprint, type TmpTileShape } from './tmpCatalog'

const ORTHO = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const

export type PaintCliffRampOptions = {
  width?: number
  shapeOf?: (tileInSet: number) => TmpTileShape | undefined
}

function clampHeight(value: number): number {
  return Math.max(0, Math.min(MAX_HEIGHT, value))
}

function isCliffCell(doc: MapDocument, rx: number, ry: number, rules: TheaterRules, cliffSet: number): boolean {
  if (cliffSet < 0 || !isValidIsoCell(rx, ry, doc.width, doc.height)) return false
  return rules.getSetNum(doc.getCell(rx, ry).tileNum) === cliffSet
}

function firstNonCliff(
  doc: MapDocument,
  rx: number,
  ry: number,
  dx: number,
  dy: number,
  rules: TheaterRules,
  cliffSet: number,
  maxSteps = 3,
): { rx: number; ry: number; height: number } | null {
  for (let step = 1; step <= maxSteps; step++) {
    const nx = rx + dx * step
    const ny = ry + dy * step
    if (!isValidIsoCell(nx, ny, doc.width, doc.height)) return null
    if (isCliffCell(doc, nx, ny, rules, cliffSet)) continue
    return { rx: nx, ry: ny, height: doc.getCell(nx, ny).height }
  }
  return null
}

function cliffSpan(
  doc: MapDocument,
  rx: number,
  ry: number,
  dx: number,
  dy: number,
  rules: TheaterRules,
  cliffSet: number,
): number {
  let count = 0
  while (count < 8 && isCliffCell(doc, rx + dx * (count + 1), ry + dy * (count + 1), rules, cliffSet)) {
    count += 1
  }
  return count
}

function countValidSteps(
  doc: MapDocument,
  rx: number,
  ry: number,
  dx: number,
  dy: number,
  maxSteps: number,
): number {
  let ok = 0
  for (let step = 1; step <= maxSteps; step++) {
    if (!isValidIsoCell(rx + dx * step, ry + dy * step, doc.width, doc.height)) break
    ok += 1
  }
  return ok
}

/** FAData CliffFront/BackData 组别 → 墙面朝向（Studio 轴向）。 */
const FRONT_HORIZ_TILES = new Set([1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
const FRONT_VERTIC_TILES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 32, 33])
const BACK_HORIZ_TILES = new Set([22, 23, 24, 25, 28, 29, 30, 31])
const BACK_VERTIC_TILES = new Set([0, 2, 3, 26, 27, 34, 35, 36, 37, 38, 39])

/** 点击件的组别直接给出墙面朝向；未知件回退为「朝更低的非崖邻格」探测。 */
export function cliffRampOutward(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
): { ox: number; oy: number } | null {
  const rules = new TheaterRules(theater)
  const cliffSet = rules.getGeneralValue('CliffSet')
  if (!isCliffCell(doc, rx, ry, rules, cliffSet)) return null
  const setStart = theater.sets[cliffSet]?.startTileNum ?? 0
  const inSet = doc.getCell(rx, ry).tileNum - setStart
  if (FRONT_HORIZ_TILES.has(inSet)) return { ox: 1, oy: 0 }
  if (FRONT_VERTIC_TILES.has(inSet)) return { ox: 0, oy: 1 }
  if (BACK_HORIZ_TILES.has(inSet)) return { ox: -1, oy: 0 }
  if (BACK_VERTIC_TILES.has(inSet)) return { ox: 0, oy: -1 }
  let best: { ox: number; oy: number; score: number } | null = null
  for (const { dx, dy } of ORTHO) {
    const sample = firstNonCliff(doc, rx, ry, dx, dy, rules, cliffSet)
    if (!sample) continue
    const preferFront = dx + dy
    if (
      !best
      || sample.height < best.score
      || (sample.height === best.score && preferFront > best.ox + best.oy)
    ) {
      best = { ox: dx, oy: dy, score: sample.height }
    }
  }
  return best ? { ox: best.ox, oy: best.oy } : null
}

function clearTileNum(theater: TheaterIndex): number {
  const rules = new TheaterRules(theater)
  const clearSet = rules.getGeneralValue('ClearTile')
  return clearSet >= 0 ? rules.getTileNumFromSet(clearSet, 0) : 0
}

function writeMorphable(
  doc: MapDocument,
  rx: number,
  ry: number,
  height: number,
  tileNum: number,
): void {
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  const cell = doc.getCell(rx, ry)
  cell.tileNum = tileNum
  cell.subTile = 0
  cell.height = clampHeight(height)
  doc.setCell(cell)
}

type RampCleanup = { ox: number; oy: number; high: number; low: number; clear: number; depth: number }

/** 在墙段靠坡口的一端放 FAData 端头件（1/21/28/29），收掉直线件的裸端面。 */
function placeCliffCap(
  doc: MapDocument,
  at: { rx: number; ry: number },
  tileInSet: number,
  base: number,
  cliffSet: number,
  theater: TheaterIndex,
  shapeOf?: (tileInSet: number) => TmpTileShape | undefined,
): void {
  const setInfo = theater.sets[cliffSet]
  if (!setInfo) return
  const shape = shapeOf?.(tileInSet)
  const fp = cliffFootprint(shape, tileInSet)
  const tileNum = setInfo.startTileNum + Math.min(tileInSet, Math.max(0, setInfo.tilesInSet - 1))
  let p = 0
  for (let i = 0; i < fp.cx; i++) {
    for (let e = 0; e < fp.cy; e++) {
      const px = at.rx + i
      const py = at.ry + e
      if (isValidIsoCell(px, py, doc.width, doc.height)) {
        const cell = doc.getCell(px, py)
        cell.tileNum = tileNum
        cell.subTile = p
        cell.height = clampHeight(base + (fp.zHeight[p] ?? 4))
        doc.setCell(cell)
      }
      p++
    }
  }
}

function repairCliffSide(
  doc: MapDocument,
  start: { rx: number; ry: number },
  tx: number,
  ty: number,
  theater: TheaterIndex,
  theaterName: MapTheater,
  rules: TheaterRules,
  cliffSet: number,
  face: 'front' | 'back',
  shapeOf: ((tileInSet: number) => TmpTileShape | undefined) | undefined,
  cleanup: RampCleanup,
): Array<{ rx: number; ry: number }> | null {
  const startIsCliff = isCliffCell(doc, start.rx, start.ry, rules, cliffSet)
  let rx = start.rx
  let ry = start.ry
  if (startIsCliff) {
    for (let i = 0; i < 64; i++) {
      const nx = rx + tx
      const ny = ry + ty
      if (!isCliffCell(doc, nx, ny, rules, cliffSet)) break
      rx = nx
      ry = ny
    }
  }
  const len = startIsCliff ? Math.abs(rx - start.rx) + Math.abs(ry - start.ry) + 1 : 0
  const startCell = isValidIsoCell(start.rx, start.ry, doc.width, doc.height) ? doc.getCell(start.rx, start.ry) : null
  // FA2 PlaceCliff：`startheight -= tiles[bSubTile].bZHeight`，从起点崖格反推墙基准高度。
  const setStart = theater.sets[cliffSet]?.startTileNum ?? 0
  const startInSet = startCell ? startCell.tileNum - setStart : -1
  const startZ = startCell && startInSet >= 0
    ? (shapeOf?.(startInSet)?.subtiles[startCell.subTile]?.zHeight
      ?? cliffFootprint(undefined, startInSet).zHeight[startCell.subTile]
      ?? 0)
    : 0
  const startBase = Math.max(0, (startCell?.height ?? 0) - startZ)
  // 统一正向铺满 [from..end]：负向 walk 会漏铺起点、越界铺终点（FA2 靠 startOffset 补偿，此处已关）。
  const from = { rx: Math.min(start.rx, rx), ry: Math.min(start.ry, ry) }
  const dest = { rx: Math.max(start.rx, rx) + Math.abs(tx), ry: Math.max(start.ry, ry) + Math.abs(ty) }
  if (!startIsCliff) return null
  if (len < 2) {
    // 残段放不下一个完整崖件：不立 1 格孤柱，按坡道同相位补一整列台阶，
    // 让相邻两次开坡无缝合并成一个坡面。
    const filled: Array<{ rx: number; ry: number }> = []
    for (let step = 0; step <= cleanup.depth; step++) {
      const cx = start.rx + cleanup.ox * step
      const cy = start.ry + cleanup.oy * step
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) break
      const height = Math.max(cleanup.low, cleanup.high - 1 - step)
      writeMorphable(doc, cx, cy, height, cleanup.clear)
      filled.push({ rx: cx, ry: cy })
    }
    return filled
  }
  if (!classifyCliffDirection(dest.rx - from.rx, dest.ry - from.ry)) return null
  placeFa2Cliff(doc, from, dest, theater, theaterName, {
    face,
    pick: (tiles) => tiles[0] ?? -1,
    shapeOf,
    applyStartOffset: false,
    startHeight: startBase,
  })
  // 靠坡口的一端（start 格）盖端头件，收掉直线件的裸端面。
  const alongRy = ty !== 0
  const capTile = face === 'front' ? (alongRy ? 1 : 21) : (alongRy ? 28 : 29)
  placeCliffCap(doc, start, capTile, startBase, cliffSet, theater, shapeOf)
  return null
}

type CorridorCell = { rx: number; ry: number; height: number }

/**
 * 坡道区域局部平整：morphable 格与 morphable 邻格落差 ≥2 时垫成阶梯（只垫高低洼），
 * 让四角坡-坡交汇处的洼格变成可放斜坡件的 1 级台阶。崖件与崖邻居不参与。
 */
function levelMorphableInRect(
  doc: MapDocument,
  rect: { left: number; top: number; right: number; bottom: number },
  theater: TheaterIndex,
  pad: number,
): void {
  const rules = new TheaterRules(theater)
  for (let iter = 0; iter < 8; iter++) {
    let changed = false
    for (let ry = rect.top - pad; ry <= rect.bottom + pad; ry++) {
      for (let rx = rect.left - pad; rx <= rect.right + pad; rx++) {
        if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
        const cell = doc.getCell(rx, ry)
        if (!rules.isMorphable(cell.tileNum)) continue
        let maxNeighbor = -1
        let minNeighbor = Number.POSITIVE_INFINITY
        for (const { dx, dy } of ORTHO) {
          const nx = rx + dx
          const ny = ry + dy
          if (!isValidIsoCell(nx, ny, doc.width, doc.height)) continue
          const neighbor = doc.getCell(nx, ny)
          if (!rules.isMorphable(neighbor.tileNum)) continue
          if (neighbor.height > maxNeighbor) maxNeighbor = neighbor.height
          if (neighbor.height < minNeighbor) minNeighbor = neighbor.height
        }
        if (maxNeighbor - cell.height > 1) {
          // 垫洼
          cell.height = clampHeight(maxNeighbor - 1)
          doc.setCell(cell)
          changed = true
        } else if (Number.isFinite(minNeighbor) && cell.height - minNeighbor > 1 && cell.height - maxNeighbor > 0) {
          // 削峰：比所有 morphable 邻居都高、且比最低邻居高 ≥2 的孤立凸起
          cell.height = clampHeight(minNeighbor + 1)
          doc.setCell(cell)
          changed = true
        }
      }
    }
    if (!changed) break
  }
}

function corridorCells(
  doc: MapDocument,
  rx: number,
  ry: number,
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  width: number,
  half: number,
  originStep: number,
  depth: number,
  high: number,
): CorridorCell[] {
  const cells: CorridorCell[] = []
  const seen = new Set<string>()
  for (let step = 0; step < depth; step++) {
    const height = high - 1 - step
    for (let w = 0; w < width; w++) {
      const cx = rx + ox * (originStep + step) + tx * (w - half)
      const cy = ry + oy * (originStep + step) + ty * (w - half)
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) continue
      const key = `${cx},${cy}`
      if (seen.has(key)) continue
      seen.add(key)
      cells.push({ rx: cx, ry: cy, height })
    }
  }
  return cells
}

function applyCorridor(doc: MapDocument, cells: CorridorCell[], tileNum: number): { left: number; top: number; right: number; bottom: number } | null {
  if (cells.length === 0) return null
  const rect = { left: cells[0].rx, top: cells[0].ry, right: cells[0].rx, bottom: cells[0].ry }
  for (const cell of cells) {
    writeMorphable(doc, cell.rx, cell.ry, cell.height, tileNum)
    if (cell.rx < rect.left) rect.left = cell.rx
    if (cell.ry < rect.top) rect.top = cell.ry
    if (cell.rx > rect.right) rect.right = cell.rx
    if (cell.ry > rect.bottom) rect.bottom = cell.ry
  }
  return rect
}

/** 拖刷经过非崖格时的持续平整：垫平局部落差并重算斜坡件。 */
export function smoothRampArea(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  width = 2,
): void {
  const half = Math.max(1, Math.ceil(width / 2))
  const rect = { left: rx - half, top: ry - half, right: rx + half, bottom: ry + half }
  // 拖刷清理孤立残崖（崖邻居 ≤1 的孤子/孤对）：转成草地并入平整。成片墙（崖邻居 ≥2）不动。
  const rules = new TheaterRules(theater)
  const cliffSet = rules.getGeneralValue('CliffSet')
  const clear = clearTileNum(theater)
  if (cliffSet >= 0) {
    const isCliff = (cx: number, cy: number) => isCliffCell(doc, cx, cy, rules, cliffSet)
    const targets: Array<{ rx: number; ry: number }> = []
    for (let cy = rect.top - 1; cy <= rect.bottom + 1; cy++) {
      for (let cx = rect.left - 1; cx <= rect.right + 1; cx++) {
        if (!isCliff(cx, cy)) continue
        let cliffNeighbors = 0
        for (const { dx, dy } of ORTHO) {
          if (isCliff(cx + dx, cy + dy)) cliffNeighbors += 1
        }
        if (cliffNeighbors <= 1) targets.push({ rx: cx, ry: cy })
      }
    }
    for (const cell of targets) {
      writeMorphable(doc, cell.rx, cell.ry, doc.getCell(cell.rx, cell.ry).height, clear)
    }
  }
  levelMorphableInRect(doc, rect, theater, 1)
  createSlopesInRect(doc, rect, theater, true, 1)
}

/** 在崖壁上切开缺口，铺 4 级 RampBase 阶梯接到低地。 */
export function paintCliffRamp(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  theaterName: MapTheater,
  options: PaintCliffRampOptions = {},
): boolean {
  const rules = new TheaterRules(theater)
  const cliffSet = rules.getGeneralValue('CliffSet')
  if (!isCliffCell(doc, rx, ry, rules, cliffSet)) return false
  const outward = cliffRampOutward(doc, rx, ry, theater)
  if (!outward) return false

  const width = Math.max(2, options.width ?? 2)
  const half = Math.floor((width - 1) / 2)
  const tx = outward.oy
  const ty = -outward.ox
  const inland = firstNonCliff(doc, rx, ry, -outward.ox, -outward.oy, rules, cliffSet)
  const low = firstNonCliff(doc, rx, ry, outward.ox, outward.oy, rules, cliffSet)
  const cliffH = doc.getCell(rx, ry).height
  const high = Math.max(inland?.height ?? 0, cliffH)
  const lowH = low?.height ?? Math.max(0, high - 4)
  const depth = Math.max(1, high - lowH)
  // 墙厚回溯最多 1 格（外列 → rim 列）。点击角件附近时沿 -outward 可能连着一串
  // 别的崖（邻墙 / 角件），不 clamp 会把台阶起点拉进台面深处、横挖出斜沟。
  const inlandSpan = Math.min(1, cliffSpan(doc, rx, ry, -outward.ox, -outward.oy, rules, cliffSet))
  const outlandSpan = Math.min(2, cliffSpan(doc, rx, ry, outward.ox, outward.oy, rules, cliffSet))
  const afterCliff = countValidSteps(
    doc,
    rx + outward.ox * outlandSpan,
    ry + outward.oy * outlandSpan,
    outward.ox,
    outward.oy,
    depth,
  )
  const neededLow = Math.max(0, depth - (outlandSpan + 1))
  const extraCarve = Math.max(0, neededLow - afterCliff)
  const originStep = -inlandSpan - extraCarve
  const clear = clearTileNum(theater)
  const stairs = corridorCells(doc, rx, ry, outward.ox, outward.oy, tx, ty, width, half, originStep, depth, high)
  const stairKeys = new Set(stairs.map((cell) => `${cell.rx},${cell.ry}`))
  for (let pad = 1; pad <= 2; pad++) {
    for (let w = 0; w < width; w++) {
      const cx = rx - outward.ox * (inlandSpan + pad) + tx * (w - half)
      const cy = ry - outward.oy * (inlandSpan + pad) + ty * (w - half)
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) continue
      if (stairKeys.has(`${cx},${cy}`)) continue
      if (isCliffCell(doc, cx, cy, rules, cliffSet)) continue
      if (!rules.isMorphable(doc.getCell(cx, cy).tileNum)) continue
      if (doc.getCell(cx, cy).height >= high) continue
      writeMorphable(doc, cx, cy, high, clear)
    }
  }
  const rect = applyCorridor(doc, stairs, clear)
  if (!rect) return false

  const face: 'front' | 'back' = outward.ox + outward.oy > 0 ? 'front' : 'back'
  const left = { rx: rx - tx * (half + 1), ry: ry - ty * (half + 1) }
  const right = { rx: rx + tx * (width - half), ry: ry + ty * (width - half) }
  const cleanup: RampCleanup = { ox: outward.ox, oy: outward.oy, high, low: lowH, clear, depth }
  const clearedSides = [
    ...(repairCliffSide(doc, left, -tx, -ty, theater, theaterName, rules, cliffSet, face, options.shapeOf, cleanup) ?? []),
    ...(repairCliffSide(doc, right, tx, ty, theater, theaterName, rules, cliffSet, face, options.shapeOf, cleanup) ?? []),
  ]
  for (const cell of clearedSides) {
    if (cell.rx < rect.left) rect.left = cell.rx
    if (cell.ry < rect.top) rect.top = cell.ry
    if (cell.rx > rect.right) rect.right = cell.rx
    if (cell.ry > rect.bottom) rect.bottom = cell.ry
  }
  applyCorridor(doc, stairs, clear)
  for (let pad = 1; pad <= 2; pad++) {
    for (let w = 0; w < width; w++) {
      const cx = rx - outward.ox * (inlandSpan + pad) + tx * (w - half)
      const cy = ry - outward.oy * (inlandSpan + pad) + ty * (w - half)
      if (cx < rect.left) rect.left = cx
      if (cy < rect.top) rect.top = cy
      if (cx > rect.right) rect.right = cx
      if (cy > rect.bottom) rect.bottom = cy
    }
  }
  levelMorphableInRect(doc, rect, theater, 2)
  createSlopesInRect(doc, rect, theater, true, 2)
  return true
}
