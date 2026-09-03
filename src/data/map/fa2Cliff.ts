import faDataText from './fa2/FAData.ini?raw'
import type { MapTheater } from './constants'
import { isValidIsoCell } from './isoCoords'
import { MapIni } from './MapIni'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'
import { cliffFootprint, type TmpTileShape } from './tmpCatalog'

type CliffDir =
  | 'horiz_left'
  | 'horiz_right'
  | 'horizdiag_left'
  | 'horizdiag_right'
  | 'vertic_top'
  | 'vertic_bottom'
  | 'verticdiag_top'
  | 'verticdiag_bottom'

export type CliffWalk = {
  dir: CliffDir
  addx: number
  addy: number
  type: string
}

const iniCache = MapIni.parse(faDataText)

function sectionMap(name: string): Map<string, string> | null {
  const section = iniCache.getSection(name)
  if (!section) return null
  return new Map(section.entries.map((entry) => [entry.key.toLowerCase(), entry.value]))
}

function cliffSectionName(face: 'front' | 'back', theater: MapTheater, alternative: boolean): string {
  const base = face === 'front' ? 'CliffFrontData' : 'CliffBackData'
  const alt = alternative ? 'Alt' : ''
  const withTheater = `${base}${alt}${theater}`
  if (iniCache.getSection(withTheater)) return withTheater
  const plain = `${base}${alt}`
  if (iniCache.getSection(plain)) return plain
  return base
}

function listTiles(values: Map<string, string>, prefix: string): number[] {
  const count = Number(values.get(`${prefix}c`.toLowerCase()) ?? '0') || 0
  const tiles: number[] = []
  for (let i = 0; i < count; i++) {
    const raw = values.get(`${prefix}${i}`.toLowerCase())
    if (raw === undefined || raw === '') continue
    tiles.push(Number(raw))
  }
  return tiles
}

export function classifyCliffDirection(dx: number, dy: number): CliffWalk | null {
  let xDiff = dx
  let yDiff = dy
  if (xDiff > 0 && yDiff > 0 && yDiff / xDiff > 1.33) xDiff = 0
  if (xDiff < 0 && yDiff > 0 && yDiff / -xDiff > 1.33) xDiff = 0
  if (xDiff > 0 && yDiff < 0 && -yDiff / xDiff > 1.33) xDiff = 0
  if (xDiff < 0 && yDiff < 0 && -yDiff / -xDiff > 1.33) xDiff = 0
  if (yDiff > 0 && xDiff > 0 && xDiff / yDiff > 2) yDiff = 0
  if (yDiff < 0 && xDiff > 0 && xDiff / -yDiff > 2) yDiff = 0
  if (yDiff > 0 && xDiff < 0 && -xDiff / yDiff > 2) yDiff = 0
  if (yDiff < 0 && xDiff < 0 && -xDiff / -yDiff > 2) yDiff = 0
  if (!xDiff && !yDiff) return null

  if (xDiff && yDiff) {
    if (xDiff > 0 && yDiff > 0) return { dir: 'verticdiag_bottom', addx: 1, addy: 1, type: 'vertic_diag_' }
    if (xDiff < 0 && yDiff < 0) return { dir: 'verticdiag_top', addx: -1, addy: -1, type: 'vertic_diag_' }
    if (xDiff < 0 && yDiff > 0) return { dir: 'horizdiag_right', addx: -1, addy: 1, type: 'horiz_diag_' }
    return { dir: 'horizdiag_left', addx: 1, addy: -1, type: 'horiz_diag_' }
  }
  if (yDiff < 0) return { dir: 'horiz_left', addx: 0, addy: -1, type: 'horiz_' }
  if (yDiff > 0) return { dir: 'horiz_right', addx: 0, addy: 1, type: 'horiz_' }
  if (xDiff < 0) return { dir: 'vertic_top', addx: -1, addy: 0, type: 'vertic_' }
  return { dir: 'vertic_bottom', addx: 1, addy: 0, type: 'vertic_' }
}

/** FA2 ModifyStartPos 直译。dx 沿 rx，dy 沿 ry。 */
function startOffset(face: 'front' | 'back', dir: CliffDir): { dx: number; dy: number } {
  if (face === 'front') {
    if (dir === 'horiz_right') return { dx: -1, dy: 0 }
    if (dir === 'horiz_left') return { dx: -1, dy: 1 }
    if (dir === 'vertic_top') return { dx: 1, dy: 0 }
    if (dir === 'verticdiag_top') return { dx: 1, dy: 1 }
    if (dir === 'verticdiag_bottom') return { dx: 0, dy: -1 }
    if (dir === 'horizdiag_right') return { dx: 1, dy: 0 }
    if (dir === 'horizdiag_left') return { dx: 0, dy: 1 }
    return { dx: 0, dy: 0 }
  }
  if (dir === 'verticdiag_top') return { dx: 1, dy: 1 }
  if (dir === 'verticdiag_bottom') return { dx: -1, dy: 0 }
  if (dir === 'horiz_left') return { dx: 0, dy: 1 }
  if (dir === 'vertic_top') return { dx: 1, dy: 0 }
  return { dx: 0, dy: 0 }
}

/**
 * FA2 GetTileToPlace 邻居探测，(drx, dry) 直译 FA2 的 (i, e)。
 * Studio 的 rx/ry 相对 IsoMapPack 文件是转置读入（FA2 读包时交换 wX/wY，
 * 见 MapData.cpp `pos = wY + wX*IsoSize`；Studio 不交换），投影公式两边字面相同，
 * 所以 Studio 世界 = FA2 世界的转置副本，FA2 几何按 x↔rx、y↔ry 直译即视觉正确。
 */
const CORNERS = [
  [0, -1, 'cornerleft_'],
  [0, 1, 'cornerright_'],
  [-1, 0, 'cornertop_'],
  [1, 0, 'cornerbottom_'],
] as const

export type PlaceCliffOptions = {
  face: 'front' | 'back'
  alternative?: boolean
  pick?: (tiles: number[]) => number
  /** TMP 件尺寸与 bZHeight；缺省则用 FAData 件号近似 2×2 / z=+4。 */
  shapeOf?: (tileInSet: number) => TmpTileShape | undefined
  /** 覆盖 PlaceCliff 的起点高度；缺省用 from 格当前高度。 */
  startHeight?: number
  /** 为 false 时不因邻格改用转角件（围矩形高地用直线件封边）。缺省 true。 */
  corners?: boolean
  /** 为 false 时不套 FA2 ModifyStartPos。高地轮廓已经把印章原点放在落差上。缺省 true。 */
  applyStartOffset?: boolean
}

/**
 * FA2 CCliffModifier::PlaceCliff：按 FAData CliffFront/Back 表沿 8 向放置 CliffSet 件。
 * FA2 几何按 x↔rx、y↔ry 直译（Studio 世界是文件坐标的转置副本，见 CORNERS 注释）：
 * TILEDATA cx 沿 rx、cy 沿 ry；subtile p=i*cy+e 写到 (rx+i, ry+e)，与 fa2PlaceTile 同轴。
 */
export function placeFa2Cliff(
  doc: MapDocument,
  from: { rx: number; ry: number },
  to: { rx: number; ry: number },
  theater: TheaterIndex,
  theaterName: MapTheater,
  options: PlaceCliffOptions,
): boolean {
  const walk = classifyCliffDirection(to.rx - from.rx, to.ry - from.ry)
  if (!walk) return false
  const values = sectionMap(cliffSectionName(options.face, theaterName, options.alternative === true))
  if (!values) return false
  const rules = new TheaterRules(theater)
  const cliffSet = rules.getGeneralValue('CliffSet')
  if (cliffSet < 0) return false
  const setInfo = theater.sets[cliffSet]
  if (!setInfo || setInfo.tilesInSet < 20) return false

  // offset.dx 沿 rx（FA2 x 直译），offset.dy 沿 ry。
  const offset = options.applyStartOffset === false ? { dx: 0, dy: 0 } : startOffset(options.face, walk.dir)
  let fx = from.rx + offset.dx
  let fy = from.ry + offset.dy
  const startHeight = options.startHeight ?? doc.getCell(from.rx, from.ry).height
  const pick = options.pick ?? ((tiles: number[]) => tiles[0] ?? -1)
  const straight = new Set(listTiles(values, walk.type))

  let steps = 0
  while ((fx !== to.rx || fy !== to.ry) && steps < 512) {
    steps += 1
    const remainingX = to.rx - fx
    const remainingY = to.ry - fy
    let prefix = walk.type
    if (options.corners !== false) {
      for (const [dx, dy, name] of CORNERS) {
        const nx = fx + dx
        const ny = fy + dy
        if (!isValidIsoCell(nx, ny, doc.width, doc.height)) continue
        const neighbor = doc.getCell(nx, ny)
        if (rules.getSetNum(neighbor.tileNum) !== cliffSet) continue
        const neighborInSet = neighbor.tileNum - setInfo.startTileNum
        if (straight.has(neighborInSet)) continue
        if (listTiles(values, `${walk.type}${name}`).length > 0) {
          prefix = `${walk.type}${name}`
          break
        }
      }
    }
    const candidates = listTiles(values, prefix)
    if (candidates.length === 0) break
    const fitting = candidates.filter((tile) => {
      const size = cliffFootprint(options.shapeOf?.(tile), tile)
      if (walk.addx > 0 && remainingX < size.cx) return false
      if (walk.addy > 0 && remainingY < size.cy) return false
      if (walk.addx < 0 && remainingX > -size.cx) return false
      if (walk.addy < 0 && remainingY > -size.cy) return false
      return true
    })
    if (fitting.length === 0) break
    const tileInSet = pick(fitting)
    if (tileInSet < 0) break
    const tmpShape = options.shapeOf?.(tileInSet)
    const shape = cliffFootprint(tmpShape, tileInSet)
    const { cx, cy, zHeight } = shape
    if (walk.addx < 0) fx += cx * walk.addx
    if (walk.addy < 0) fy += cy * walk.addy
    const tileNum = setInfo.startTileNum + Math.min(tileInSet, Math.max(0, setInfo.tilesInSet - 1))
    const anyPic = tmpShape ? tmpShape.subtiles.some((item) => item.hasPic) : false
    let p = 0
    for (let i = 0; i < cx; i++) {
      for (let e = 0; e < cy; e++) {
        const px = fx + i
        const py = fy + e
        const paint = !tmpShape || !anyPic || Boolean(tmpShape.subtiles[p]?.hasPic)
        if (paint && isValidIsoCell(px, py, doc.width, doc.height)) {
          const cell = doc.getCell(px, py)
          cell.tileNum = tileNum
          cell.subTile = p
          cell.height = Math.max(0, Math.min(14, startHeight + (zHeight[p] ?? 4)))
          doc.setCell(cell)
        }
        p++
      }
    }
    if (walk.addx > 0) fx += cx * walk.addx
    if (walk.addy > 0) fy += cy * walk.addy
    if (options.face === 'front' && (walk.dir === 'verticdiag_top' || walk.dir === 'verticdiag_bottom')) {
      fy += walk.dir === 'verticdiag_top' ? 2 : -2
    }
    if (options.face === 'back' && (walk.dir === 'verticdiag_top' || walk.dir === 'verticdiag_bottom')) {
      fx += walk.dir === 'verticdiag_top' ? 2 : -2
    }
  }
  return steps > 0
}

export function cliffTilesFor(face: 'front' | 'back', theater: MapTheater = 'TEMPERATE'): number[] {
  const values = sectionMap(cliffSectionName(face, theater, false))
  if (!values) return []
  return listTiles(values, 'horiz_')
}
