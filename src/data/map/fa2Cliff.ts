import faDataText from './fa2/FAData.ini?raw'
import type { MapTheater } from './constants'
import { isValidIsoCell } from './isoCoords'
import { MapIni } from './MapIni'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'

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

function footprint(tileInSet: number): { cx: number; cy: number } {
  if (tileInSet === 7 || tileInSet === 17 || tileInSet === 25 || tileInSet === 37) return { cx: 2, cy: 1 }
  return { cx: 2, cy: 2 }
}

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
}

/**
 * FA2 CCliffModifier::PlaceCliff：按 FAData CliffFront/Back 表沿 8 向放置 CliffSet 件。
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

  const offset = startOffset(options.face, walk.dir)
  let rx = from.rx + offset.dx
  let ry = from.ry + offset.dy
  const startHeight = doc.getCell(from.rx, from.ry).height
  const pick = options.pick ?? ((tiles: number[]) => tiles[0] ?? -1)

  let steps = 0
  while ((rx !== to.rx || ry !== to.ry) && steps < 512) {
    steps += 1
    const remainingX = to.rx - rx
    const remainingY = to.ry - ry
    let prefix = walk.type
    for (const [dx, dy, name] of CORNERS) {
      const nx = rx + dx
      const ny = ry + dy
      if (!isValidIsoCell(nx, ny, doc.width, doc.height)) continue
      if (rules.getSetNum(doc.getCell(nx, ny).tileNum) !== cliffSet) continue
      if (listTiles(values, `${walk.type}${name}`).length > 0) {
        prefix = `${walk.type}${name}`
        break
      }
    }
    const candidates = listTiles(values, prefix)
    if (candidates.length === 0) break
    const fitting = candidates.filter((tile) => {
      const size = footprint(tile)
      if (walk.addx > 0 && remainingX < size.cx) return false
      if (walk.addy > 0 && remainingY < size.cy) return false
      if (walk.addx < 0 && remainingX > -size.cx) return false
      if (walk.addy < 0 && remainingY > -size.cy) return false
      return true
    })
    if (fitting.length === 0) break
    const tileInSet = pick(fitting)
    if (tileInSet < 0) break
    const { cx, cy } = footprint(tileInSet)
    if (walk.addx < 0) rx += cx * walk.addx
    if (walk.addy < 0) ry += cy * walk.addy
    const tileNum = setInfo.startTileNum + Math.min(tileInSet, Math.max(0, setInfo.tilesInSet - 1))
    for (let i = 0; i < cx; i++) {
      for (let e = 0; e < cy; e++) {
        const px = rx + i
        const py = ry + e
        if (!isValidIsoCell(px, py, doc.width, doc.height)) continue
        const cell = doc.getCell(px, py)
        cell.tileNum = tileNum
        cell.subTile = Math.min(e * cx + i, 3)
        cell.height = Math.max(0, Math.min(14, startHeight + 4))
        doc.setCell(cell)
      }
    }
    if (walk.addx > 0) rx += cx * walk.addx
    if (walk.addy > 0) ry += cy * walk.addy
    if (options.face === 'front' && (walk.dir === 'verticdiag_top' || walk.dir === 'verticdiag_bottom')) {
      ry += walk.dir === 'verticdiag_top' ? 2 : -2
    }
    if (options.face === 'back' && (walk.dir === 'verticdiag_top' || walk.dir === 'verticdiag_bottom')) {
      rx += walk.dir === 'verticdiag_top' ? 2 : -2
    }
  }
  return steps > 0
}

export function cliffTilesFor(face: 'front' | 'back', theater: MapTheater = 'TEMPERATE'): number[] {
  const values = sectionMap(cliffSectionName(face, theater, false))
  if (!values) return []
  return listTiles(values, 'horiz_')
}
