import { MAX_HEIGHT } from './constants'
import type { MapTheater } from './constants'
import { classifyCliffDirection, cliffTilesFor, placeFa2Cliff } from './fa2Cliff'
import type { HeightTileLookup } from './fa2Height'
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

export type HighlandCell = { rx: number; ry: number }

export type HighlandOutlineRun = {
  from: HighlandCell
  to: HighlandCell
  face: 'front' | 'back'
}

export type PaintHighlandOptions = {
  delta?: number
  shapeOf?: (tileInSet: number) => TmpTileShape | undefined
  lookup?: HeightTileLookup
}

function keyOf(rx: number, ry: number): string {
  return `${rx},${ry}`
}

function clampHeight(value: number): number {
  return Math.max(0, Math.min(MAX_HEIGHT, value))
}

function uniqueCells(cells: HighlandCell[]): HighlandCell[] {
  const seen = new Set<string>()
  const out: HighlandCell[] = []
  for (const cell of cells) {
    const key = keyOf(cell.rx, cell.ry)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cell)
  }
  return out
}

/** 取 CliffSet 第一件的最大 bZHeight，缺省 4。 */
export function defaultCliffDelta(
  theater: TheaterIndex | null | undefined,
  shapeOf?: (tileInSet: number) => TmpTileShape | undefined,
): number {
  if (!theater) return 4
  const tileInSet = cliffTilesFor('front')[0] ?? 0
  const footprint = cliffFootprint(shapeOf?.(tileInSet), tileInSet)
  return Math.max(1, ...footprint.zHeight)
}

/**
 * 4 连通台面边沿（blob 内侧一圈），按外法线切成 placeFa2Cliff 线段。
 * 官方地图验证：四条崖线的高子格全部压在台面边沿（rim）上，低子格落在外侧。
 * 朝屏幕下方（+rx / +ry 法线）用 front，朝上方用 back。
 */
export function highlandOutlineRuns(cells: HighlandCell[]): HighlandOutlineRun[] {
  const blob = new Set(cells.map((cell) => keyOf(cell.rx, cell.ry)))
  const unused = new Set<string>()
  const edges: Array<{ rx: number; ry: number; ox: number; oy: number }> = []
  for (const cell of cells) {
    for (const { dx, dy } of ORTHO) {
      if (blob.has(keyOf(cell.rx + dx, cell.ry + dy))) continue
      const edge = { rx: cell.rx, ry: cell.ry, ox: dx, oy: dy }
      const id = `${edge.rx},${edge.ry},${edge.ox},${edge.oy}`
      if (unused.has(id)) continue
      edges.push(edge)
      unused.add(id)
    }
  }

  const has = (rx: number, ry: number, ox: number, oy: number) => unused.has(`${rx},${ry},${ox},${oy}`)
  const take = (rx: number, ry: number, ox: number, oy: number) => unused.delete(`${rx},${ry},${ox},${oy}`)

  const runs: HighlandOutlineRun[] = []
  for (const start of edges) {
    if (!has(start.rx, start.ry, start.ox, start.oy)) continue
    const tx = start.oy
    const ty = -start.ox
    let rx = start.rx
    let ry = start.ry
    while (has(rx - tx, ry - ty, start.ox, start.oy)) {
      rx -= tx
      ry -= ty
    }
    const from = { rx, ry }
    while (has(rx, ry, start.ox, start.oy)) {
      take(rx, ry, start.ox, start.oy)
      rx += tx
      ry += ty
    }
    runs.push({
      from,
      to: { rx, ry },
      face: start.ox + start.oy > 0 ? 'front' : 'back',
    })
  }
  return runs
}

function raiseBlob(
  doc: MapDocument,
  cells: HighlandCell[],
  theater: TheaterIndex | null,
  delta: number,
): void {
  const rules = theater ? new TheaterRules(theater) : null
  const cliffSet = rules?.getGeneralValue('CliffSet') ?? -1
  const clearSet = rules?.getGeneralValue('ClearTile') ?? -1
  const clear = rules && clearSet >= 0 ? rules.getTileNumFromSet(clearSet, 0) : 0
  for (const { rx, ry } of cells) {
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    const cell = doc.getCell(rx, ry)
    const isCliff = Boolean(rules && cliffSet >= 0 && rules.getSetNum(cell.tileNum) === cliffSet)
    if (isCliff) {
      cell.tileNum = clear
      cell.subTile = 0
    } else if (rules && !rules.isMorphable(cell.tileNum)) {
      continue
    }
    cell.height = clampHeight(cell.height + delta)
    doc.setCell(cell)
  }
}

function flattenInterior(
  doc: MapDocument,
  cells: HighlandCell[],
  theater: TheaterIndex | null,
  platformHeight: number,
): void {
  const rules = theater ? new TheaterRules(theater) : null
  const cliffSet = rules?.getGeneralValue('CliffSet') ?? -1
  const clearSet = rules?.getGeneralValue('ClearTile') ?? -1
  const clear = rules && clearSet >= 0 ? rules.getTileNumFromSet(clearSet, 0) : 0
  for (const { rx, ry } of cells) {
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    const cell = doc.getCell(rx, ry)
    const isCliff = Boolean(rules && cliffSet >= 0 && rules.getSetNum(cell.tileNum) === cliffSet)
    if (isCliff) {
      if (cell.height === platformHeight) continue
      cell.tileNum = clear
      cell.subTile = 0
      cell.height = platformHeight
      doc.setCell(cell)
      continue
    }
    if (rules && !rules.isMorphable(cell.tileNum)) continue
    cell.height = platformHeight
    doc.setCell(cell)
  }
}

function placeOutlineCliffs(
  doc: MapDocument,
  cells: HighlandCell[],
  theater: TheaterIndex,
  theaterName: MapTheater,
  shapeOf?: (tileInSet: number) => TmpTileShape | undefined,
  startHeight = 0,
): void {
  const rules = new TheaterRules(theater)
  if (rules.getGeneralValue('CliffSet') < 0) return
  const setInfo = theater.sets[rules.getGeneralValue('CliffSet')]
  if (!setInfo || setInfo.tilesInSet < 20) return

  const pickLargest = (tiles: number[]): number => {
    let best = tiles[0] ?? -1
    let bestArea = -1
    for (const tile of tiles) {
      const size = cliffFootprint(shapeOf?.(tile), tile)
      const area = size.cx * size.cy
      if (area > bestArea) {
        best = tile
        bestArea = area
      }
    }
    return best
  }
  // 统一正向铺（沿 rx 用 horiz_right、沿 ry 用 vertic_bottom），back 先铺，
  // front 起步时能探测到 back 的崖并换 FA2 转角件（cornertop / cornerleft）。
  const ordered = highlandOutlineRuns(cells)
    .map((raw) => {
      const alongRx = raw.from.ry === raw.to.ry
      let run = raw
      if (alongRx && raw.to.rx < raw.from.rx) {
        run = { ...raw, from: { rx: raw.to.rx + 1, ry: raw.from.ry }, to: { rx: raw.from.rx + 1, ry: raw.from.ry } }
      } else if (!alongRx && raw.to.ry < raw.from.ry) {
        run = { ...raw, from: { rx: raw.from.rx, ry: raw.to.ry + 1 }, to: { rx: raw.from.rx, ry: raw.from.ry + 1 } }
      }
      const order = (run.face === 'back' ? 0 : 10) + (alongRx ? 0 : 1)
      return { run, order }
    })
    .sort((a, b) => a.order - b.order)
  for (const { run } of ordered) {
    if (!classifyCliffDirection(run.to.rx - run.from.rx, run.to.ry - run.from.ry)) continue
    placeFa2Cliff(doc, run.from, run.to, theater, theaterName, {
      face: run.face,
      pick: pickLargest,
      shapeOf,
      startHeight,
      applyStartOffset: false,
    })
  }
}

/** 涂抹区域一次加满一层崖高，轮廓铺正/反悬崖；只压平内部，边沿保留完整崖件。 */
export function paintHighland(
  doc: MapDocument,
  cells: HighlandCell[],
  theater: TheaterIndex | null,
  theaterName: MapTheater,
  options: PaintHighlandOptions = {},
): void {
  const unique = uniqueCells(cells).filter((cell) => isValidIsoCell(cell.rx, cell.ry, doc.width, doc.height))
  if (unique.length === 0) return
  const delta = options.delta ?? defaultCliffDelta(theater, options.shapeOf)
  const baseH = unique.length > 0 ? doc.getCell(unique[0].rx, unique[0].ry).height : 0
  const expectH = Math.max(0, Math.min(MAX_HEIGHT, baseH + delta))
  raiseBlob(doc, unique, theater, delta)
  if (theater) {
    placeOutlineCliffs(doc, unique, theater, theaterName, options.shapeOf, baseH)
  }
  flattenInterior(doc, unique, theater, expectH)
}
