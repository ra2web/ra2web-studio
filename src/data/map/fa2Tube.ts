import type { MapTube } from './types'

/** FA2 `ETubeDirection`（Tube.h）。 */
export const TubeDir = {
  Undefined: -1,
  Top: 0,
  TopRight: 1,
  Right: 2,
  BottomRight: 3,
  Bottom: 4,
  BottomLeft: 5,
  Left: 6,
  TopLeft: 7,
} as const

export type TubeDirection = (typeof TubeDir)[keyof typeof TubeDir]

const OPPOSITE: TubeDirection[] = [
  TubeDir.Bottom,
  TubeDir.BottomLeft,
  TubeDir.Left,
  TubeDir.TopLeft,
  TubeDir.Top,
  TubeDir.TopRight,
  TubeDir.Right,
  TubeDir.BottomRight,
]

/** FA2 `kDiffToDir[xadd+1][yadd+1]`。 */
const DIFF_TO_DIR: TubeDirection[][] = [
  [TubeDir.TopLeft, TubeDir.Top, TubeDir.TopRight],
  [TubeDir.Left, TubeDir.Undefined, TubeDir.Right],
  [TubeDir.BottomLeft, TubeDir.Bottom, TubeDir.BottomRight],
]

/** FA2 `dir_to_xy_table`，读取时 x/y 对调。 */
const DIR_TO_XY: Array<[number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
]

export type TubeWalkInfo = {
  pos: { x: number; y: number }
  direction: number
  nextPos: { x: number; y: number }
}

function sgn(value: number): number {
  if (value < 0) return -1
  return value > 0 ? 1 : 0
}

export function oppositeDir(dir: number): number {
  if (dir < 0 || dir > 7) return TubeDir.Undefined
  return OPPOSITE[dir]
}

export function dirToXy(dir: number): { x: number; y: number } {
  if (dir < 0 || dir > 7) return { x: 0, y: 0 }
  const [tableX, tableY] = DIR_TO_XY[dir]
  return { x: tableY, y: tableX }
}

function diffToDir(xadd: number, yadd: number): number {
  if (xadd < -1 || xadd > 1 || yadd < -1 || yadd > 1) return TubeDir.Undefined
  return DIFF_TO_DIR[xadd + 1][yadd + 1]
}

function stripDelimiter(parts: number[]): number[] {
  const end = parts.indexOf(TubeDir.Undefined)
  return end === -1 ? [...parts] : parts.slice(0, end)
}

function ensureDelimiter(parts: number[]): number[] {
  if (parts.length === 0 || parts[parts.length - 1] !== TubeDir.Undefined) {
    return [...parts, TubeDir.Undefined]
  }
  return [...parts]
}

/**
 * FA2 `CTube`：8 向隧道路径、反向与 INI 序列化。
 * 坐标与 FA2 一致：startX/startY 为 IsoMapPack 的 rx/ry。
 */
export class Fa2Tube {
  startX = 0
  startY = 0
  direction: number = TubeDir.Undefined
  endX = 0
  endY = 0
  parts: number[] = []

  static fromFields(
    startX: number,
    startY: number,
    direction: number,
    endX: number,
    endY: number,
    parts: number[],
  ): Fa2Tube {
    const tube = new Fa2Tube()
    tube.startX = startX
    tube.startY = startY
    tube.direction = direction
    tube.endX = endX
    tube.endY = endY
    tube.parts = ensureDelimiter(parts)
    return tube
  }

  /** FA2 `CTube(id, value)`：`startY,startX,dir,endY,endX,...parts`。 */
  static fromIni(value: string): Fa2Tube {
    const fields = value.split(',').map((item) => Number(item.trim()))
    const tube = new Fa2Tube()
    tube.startY = fields[0] || 0
    tube.startX = fields[1] || 0
    tube.direction = Number.isFinite(fields[2]) ? fields[2] : TubeDir.Undefined
    tube.endY = fields[3] || 0
    tube.endX = fields[4] || 0
    tube.parts = fields.slice(5).filter((item) => Number.isFinite(item))
    if (tube.parts.length === 0 || tube.parts[tube.parts.length - 1] !== TubeDir.Undefined) {
      tube.parts.push(TubeDir.Undefined)
    }
    return tube
  }

  /** FA2 `CTube::autocreate`，默认 `straightStartParts=1`。 */
  static autocreate(startX: number, startY: number, endX: number, endY: number, straightStartParts = 1): Fa2Tube {
    const tube = new Fa2Tube()
    tube.startX = startX
    tube.startY = startY
    tube.endX = startX
    tube.endY = startY
    tube.append(endX, endY, straightStartParts)
    return tube
  }

  isValid(): boolean {
    return this.direction !== TubeDir.Undefined && this.parts.length > 1
  }

  lastDirection(): number {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      if (this.parts[i] !== TubeDir.Undefined) return this.parts[i]
    }
    return this.direction
  }

  walk(walker: (info: TubeWalkInfo) => boolean): boolean {
    let pos = { x: this.startX, y: this.startY }
    for (const direction of this.parts) {
      const step = dirToXy(direction)
      const nextPos = direction === TubeDir.Undefined
        ? { x: -1, y: -1 }
        : { x: pos.x + step.x, y: pos.y + step.y }
      if (!walker({ pos: { ...pos }, direction, nextPos })) return false
      if (direction === TubeDir.Undefined) break
      pos = nextPos
    }
    return true
  }

  /** FA2 `CTube::append`。`forceStraightParts` 默认 -1。 */
  append(endX: number, endY: number, forceStraightParts = -1): boolean {
    const newParts = stripDelimiter(this.parts)
    const end = { x: endX, y: endY }
    let cur = { x: this.startX, y: this.startY }
    const existing: Array<{ x: number; y: number }> = []
    if (!this.walk((info) => {
      cur = { ...info.pos }
      existing.push({ ...info.pos })
      return true
    })) {
      return false
    }

    if (this.direction === TubeDir.Undefined) {
      const xMajor = Math.abs(end.x - this.startX) > Math.abs(end.y - this.startY)
      let addX = sgn(end.x - this.startX)
      let addY = sgn(end.y - this.startY)
      addX = xMajor ? addX : 0
      addY = xMajor ? 0 : addY
      this.direction = diffToDir(addX, addY)
    }

    const existingIndex = existing.findIndex((item) => item.x === end.x && item.y === end.y)
    if (existingIndex >= 0) {
      if (existingIndex === 0) return false
      newParts.length = existingIndex
      newParts.push(TubeDir.Undefined)
      this.endX = end.x
      this.endY = end.y
      this.parts = newParts
      return true
    }

    let n = 0
    while (end.x !== cur.x || end.y !== cur.y) {
      let addX = sgn(end.x - cur.x)
      let addY = sgn(end.y - cur.y)
      if (newParts.length < 1 && forceStraightParts < 0) {
        const forced = dirToXy(this.direction)
        addX = forced.x
        addY = forced.y
      }
      if (n++ < forceStraightParts) {
        const xMajorPart = Math.abs(end.x - this.endX) > Math.abs(end.y - this.endY)
        addX = xMajorPart ? addX : 0
        addY = xMajorPart ? 0 : addY
      }
      if (addX === 0 && addY === 0) break
      cur = { x: cur.x + addX, y: cur.y + addY }
      newParts.push(diffToDir(addX, addY))
    }

    newParts.push(TubeDir.Undefined)
    this.endX = cur.x
    this.endY = cur.y
    this.parts = newParts
    return true
  }

  /** FA2 `CTube::reverse`。 */
  reverse(): Fa2Tube {
    const next = new Fa2Tube()
    next.startX = this.endX
    next.startY = this.endY
    next.endX = this.startX
    next.endY = this.startY
    next.direction = oppositeDir(this.lastDirection())
    const reversed = [...this.parts].reverse().map((dir) => oppositeDir(dir))
    const first = reversed.findIndex((dir) => dir !== TubeDir.Undefined)
    next.parts = first === -1 ? [TubeDir.Undefined] : [...reversed.slice(first), TubeDir.Undefined]
    return next
  }

  /** FA2 `CTube::toString`：缺结尾 -1 时游戏会崩。 */
  toString(): string {
    const values = [this.startY, this.startX, this.direction, this.endY, this.endX, ...this.parts]
    let text = values.join(',')
    if (this.parts.length === 0 || this.parts[this.parts.length - 1] !== TubeDir.Undefined) {
      text += ',-1'
    }
    return text
  }

  equals(other: Fa2Tube): boolean {
    return (
      this.startX === other.startX
      && this.startY === other.startY
      && this.direction === other.direction
      && this.endX === other.endX
      && this.endY === other.endY
      && this.parts.length === other.parts.length
      && this.parts.every((dir, index) => dir === other.parts[index])
    )
  }

  toMapTube(id: string): MapTube {
    return {
      id,
      startX: this.startX,
      startY: this.startY,
      startDir: this.direction,
      endX: this.endX,
      endY: this.endY,
      parts: stripDelimiter(this.parts),
    }
  }
}

export function fa2TubeFromMap(tube: MapTube): Fa2Tube {
  return Fa2Tube.fromFields(tube.startX, tube.startY, tube.startDir, tube.endX, tube.endY, tube.parts)
}

/** 视口折线：沿 parts 走出的格子（含起点与终点）。 */
export function walkTubeCells(tube: MapTube): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  fa2TubeFromMap(tube).walk((info) => {
    cells.push(info.pos)
    return true
  })
  return cells
}

export function nextTubeId(tubes: MapTube[]): string {
  let max = -1
  for (const tube of tubes) {
    const id = Number(tube.id)
    if (Number.isFinite(id)) max = Math.max(max, id)
  }
  return String(max + 1)
}
