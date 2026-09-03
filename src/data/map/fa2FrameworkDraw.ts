import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from './constants'
import { cellHighlightColor } from './fa2CellCursor'
import {
  SLOPE_DOWN_BOTTOM,
  SLOPE_DOWN_LEFT,
  SLOPE_DOWN_LEFTBOTTOM,
  SLOPE_DOWN_LEFTTOP,
  SLOPE_DOWN_RIGHT,
  SLOPE_DOWN_RIGHTBOTTOM,
  SLOPE_DOWN_RIGHTTOP,
  SLOPE_DOWN_TOP,
  SLOPE_UP_BOTTOM,
  SLOPE_UP_LEFT,
  SLOPE_UP_LEFTBOTTOM,
  SLOPE_UP_LEFTBOTTOM_AND_RIGHTTOP,
  SLOPE_UP_LEFTTOP,
  SLOPE_UP_LEFTTOP_AND_RIGHTBOTTOM,
  SLOPE_UP_RIGHT,
  SLOPE_UP_RIGHTBOTTOM,
  SLOPE_UP_RIGHTTOP,
  SLOPE_UP_TOP,
} from './fa2Slopes'
import { projectCell } from './isoCoords'
import {
  theaterGeneralValue,
  tileNumToSet,
  type TheaterIndex,
} from './theaterIndex'

export type FrameworkKind = 'height' | 'cliff' | 'water' | 'shore' | 'ramp' | 'special'

export type FrameworkCellDraw = {
  kind: FrameworkKind
  fill: string
  stroke: string
  /** Cliff 第 18 块 → `C18`；高度地板为 null。 */
  label: string | null
  /** height>0 的平底格立面上的高度数字；斜坡不写。 */
  riserText: string | null
}

export const FRAMEWORK_STROKE = '#1e293b'
export const FRAMEWORK_RISER_FILL = '#f1f5f9'
export const FRAMEWORK_RISER_STROKE = '#94a3b8'

const KIND_FILL: Record<Exclude<FrameworkKind, 'height'>, string> = {
  cliff: '#ff3232',
  water: '#00aaaa',
  shore: '#38bdf8',
  ramp: '#aa5500',
  special: '#c026d3',
}

/** 菱形角相对 cell.height 的抬升：0=顶 1=右 2=底 3=左。 */
const SLOPE_CORNER_DELTAS: Record<number, [number, number, number, number]> = {
  [SLOPE_UP_RIGHT]: [0, 1, 1, 0],
  [SLOPE_UP_BOTTOM]: [0, 0, 1, 1],
  [SLOPE_UP_LEFT]: [1, 0, 0, 1],
  [SLOPE_UP_TOP]: [1, 1, 0, 0],
  [SLOPE_UP_RIGHTBOTTOM]: [0, 0, 1, 0],
  [SLOPE_UP_LEFTBOTTOM]: [0, 0, 0, 1],
  [SLOPE_UP_LEFTTOP]: [1, 0, 0, 0],
  [SLOPE_UP_RIGHTTOP]: [0, 1, 0, 0],
  [SLOPE_DOWN_LEFTTOP]: [0, 1, 1, 1],
  [SLOPE_DOWN_RIGHTTOP]: [1, 0, 1, 1],
  [SLOPE_DOWN_RIGHTBOTTOM]: [1, 1, 0, 1],
  [SLOPE_DOWN_LEFTBOTTOM]: [1, 1, 1, 0],
  [SLOPE_DOWN_TOP]: [0, 1, 1, 1],
  [SLOPE_DOWN_RIGHT]: [1, 0, 1, 1],
  [SLOPE_DOWN_BOTTOM]: [1, 1, 0, 1],
  [SLOPE_DOWN_LEFT]: [1, 1, 1, 0],
  [SLOPE_UP_LEFTBOTTOM_AND_RIGHTTOP]: [0, 1, 0, 1],
  [SLOPE_UP_LEFTTOP_AND_RIGHTBOTTOM]: [1, 0, 1, 0],
}

function setMatchesName(set: { fileName: string; setName: string }, needles: string[]): boolean {
  const hay = `${set.fileName} ${set.setName}`.toLowerCase()
  return needles.some((needle) => hay.includes(needle))
}

function kindForMappedSet(index: TheaterIndex, setIndex: number): Exclude<FrameworkKind, 'height'> {
  const set = index.sets[setIndex]
  if (theaterGeneralValue(index, 'CliffSet') === setIndex || (set && setMatchesName(set, ['cliff']))) return 'cliff'
  if (theaterGeneralValue(index, 'WaterSet') === setIndex || (set && setMatchesName(set, ['water']))) return 'water'
  if (
    theaterGeneralValue(index, 'ShorePieces') === setIndex
    || (set && setMatchesName(set, ['shore']))
  ) {
    return 'shore'
  }
  if (
    theaterGeneralValue(index, 'RampBase') === setIndex
    || theaterGeneralValue(index, 'RampSmooth') === setIndex
    || theaterGeneralValue(index, 'MMRampBase') === setIndex
    || (set && setMatchesName(set, ['ramp', 'slope']))
  ) {
    return 'ramp'
  }
  return 'special'
}

/** 集文件名首字母 + 1-based 集内序号（Cliff 第 18 块 → C18）。 */
export function frameworkSetLabel(fileName: string, tileInSet: number): string {
  const letter = (fileName.match(/[A-Za-z]/)?.[0] ?? 'T').toUpperCase()
  return `${letter}${tileInSet + 1}`
}

/** RampBase 件号 1..18；RampSmooth 每 3 块对应一个 cardinal 坡。 */
export function frameworkRampNs(tileNum: number, index?: TheaterIndex | null): number | null {
  if (!index) return null
  const set = tileNumToSet(index, tileNum)
  if (!set) return null
  const tileInSet = tileNum - set.startTileNum
  const rampBase = theaterGeneralValue(index, 'RampBase')
  const rampSmooth = theaterGeneralValue(index, 'RampSmooth')
  const mmRamp = theaterGeneralValue(index, 'MMRampBase')
  if (set.setIndex === rampSmooth) {
    const ns = Math.floor(tileInSet / 3) + 1
    return ns >= 1 && ns <= 4 ? ns : null
  }
  if (
    set.setIndex === rampBase
    || set.setIndex === mmRamp
    || (set.marbleMadnessSet > 0 && setMatchesName(set, ['ramp', 'slope']))
  ) {
    const ns = tileInSet + 1
    return ns >= 1 && ns <= 18 ? ns : null
  }
  return null
}

export function frameworkSlopeCornerDeltas(ns: number): [number, number, number, number] | null {
  return SLOPE_CORNER_DELTAS[ns] ?? null
}

/** 四个菱形角的世界高度（顶/右/底/左）。斜坡按件号倾斜，平底四角同高。 */
export function frameworkSurfaceHeights(
  tileNum: number,
  height: number,
  index?: TheaterIndex | null,
): [number, number, number, number] {
  const ns = frameworkRampNs(tileNum, index)
  const deltas = ns !== null ? frameworkSlopeCornerDeltas(ns) : null
  if (!deltas) return [height, height, height, height]
  return [height + deltas[0], height + deltas[1], height + deltas[2], height + deltas[3]]
}

export function frameworkCellDraw(
  tileNum: number,
  height: number,
  index?: TheaterIndex | null,
): FrameworkCellDraw {
  const heightFill = cellHighlightColor(height)
  if (!index) {
    return {
      kind: 'height',
      fill: heightFill,
      stroke: FRAMEWORK_STROKE,
      label: null,
      riserText: height > 0 ? String(Math.trunc(height)) : null,
    }
  }
  const set = tileNumToSet(index, tileNum)
  if (set && set.marbleMadnessSet > 0) {
    const kind = kindForMappedSet(index, set.setIndex)
    return {
      kind,
      fill: KIND_FILL[kind],
      stroke: FRAMEWORK_STROKE,
      label: frameworkSetLabel(set.fileName, tileNum - set.startTileNum),
      riserText: kind === 'ramp' || height <= 0 ? null : String(Math.trunc(height)),
    }
  }
  return {
    kind: 'height',
    fill: heightFill,
    stroke: FRAMEWORK_STROKE,
    label: null,
    riserText: height > 0 ? String(Math.trunc(height)) : null,
  }
}

function diamondVerts(origin: { px: number; py: number }): Array<{ x: number; y: number }> {
  const hw = RA2_ISO_TILE_WIDTH / 2
  const hh = RA2_ISO_TILE_HEIGHT / 2
  return [
    { x: origin.px, y: origin.py },
    { x: origin.px + hw, y: origin.py + hh },
    { x: origin.px, y: origin.py + hh * 2 },
    { x: origin.px - hw, y: origin.py + hh },
  ]
}

function surfaceVerts(
  rx: number,
  ry: number,
  zs: [number, number, number, number],
  isoSize: number,
): Array<{ x: number; y: number }> {
  return zs.map((z, corner) => diamondVerts(projectCell(rx, ry, z, isoSize))[corner])
}

function pathVerts(ctx: CanvasRenderingContext2D, verts: Array<{ x: number; y: number }>) {
  ctx.beginPath()
  ctx.moveTo(verts[0].x, verts[0].y)
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y)
  ctx.closePath()
}

function fillQuad(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  fill: string,
  stroke: string,
) {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(c.x, c.y)
  ctx.lineTo(d.x, d.y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.stroke()
}

/** 只有悬崖才画立面。抬升地板和斜坡是连续顶面，立面会盖住邻格。 */
export function frameworkPaintsRiser(kind: FrameworkKind): boolean {
  return kind === 'cliff'
}

export function paintFrameworkCell(
  ctx: CanvasRenderingContext2D,
  args: {
    rx: number
    ry: number
    height: number
    tileNum: number
    isoSize: number
    index?: TheaterIndex | null
  },
) {
  const spec = frameworkCellDraw(args.tileNum, args.height, args.index)
  const zs = frameworkSurfaceHeights(args.tileNum, args.height, args.index)
  const up = surfaceVerts(args.rx, args.ry, zs, args.isoSize)
  if (frameworkPaintsRiser(spec.kind) && args.height > 0) {
    const flat = diamondVerts(projectCell(args.rx, args.ry, 0, args.isoSize))
    for (const [a, b] of [[1, 2], [2, 3]] as const) {
      fillQuad(ctx, flat[a], flat[b], up[b], up[a], FRAMEWORK_RISER_FILL, FRAMEWORK_RISER_STROKE)
    }
    if (spec.riserText) {
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(spec.riserText, (flat[2].x + up[2].x) / 2, (flat[2].y + up[2].y) / 2)
    }
  }
  pathVerts(ctx, up)
  ctx.fillStyle = spec.fill
  ctx.fill()
  ctx.strokeStyle = spec.stroke
  ctx.stroke()
  if (spec.label) {
    ctx.fillStyle = '#ffffff'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      spec.label,
      (up[0].x + up[1].x + up[2].x + up[3].x) / 4,
      (up[0].y + up[1].y + up[2].y + up[3].y) / 4,
    )
  }
}
