import { EMPTY_OVERLAY, overlayIndex, OVERLAY_PLANE_SIZE, validateMapSize } from './constants'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { cellKey, emptyCell } from './packs'

export type ResizeMapOptions = {
  /** FA2 `ResizeMap` iLeft：从西侧插入/删除的格数。 */
  left?: number
  /** FA2 `ResizeMap` iTop：从北侧插入/删除的格数。 */
  top?: number
}

function fa2Shift(oldWidth: number, newWidth: number, left: number, top: number): { xMove: number; yMove: number } {
  let xMove = newWidth - oldWidth
  xMove += top
  const yMove = top + left
  xMove += -left
  return { xMove, yMove }
}

/**
 * FA2 `CMapData::ResizeMap(iLeft, iTop, newWidth, newHeight)`。
 * left/top=0 时内容向 +X 平移 `(newW-oldW)`，新格出现在另一侧。
 */
export function resizeMap(doc: MapDocument, width: number, height: number, options: ResizeMapOptions = {}): string | null {
  const error = validateMapSize(width, height)
  if (error) return error
  const left = options.left ?? 0
  const top = options.top ?? 0
  const oldWidth = doc.width
  const oldHeight = doc.height
  const { xMove, yMove } = fa2Shift(oldWidth, width, left, top)
  const previous = doc.cells
  const oldOverlay = doc.overlay
  const oldOverlayData = doc.overlayData
  doc.width = width
  doc.height = height
  doc.localWidth = Math.max(1, width - 4)
  doc.localHeight = Math.max(1, height - 6)
  const next = new Map<string, ReturnType<typeof emptyCell>>()
  const nextOverlay = new Uint8Array(OVERLAY_PLANE_SIZE).fill(EMPTY_OVERLAY)
  const nextOverlayData = new Uint8Array(OVERLAY_PLANE_SIZE)
  forEachIsoCell(oldWidth, oldHeight, ({ rx, ry }) => {
    const nx = rx + xMove
    const ny = ry + yMove
    if (!isValidIsoCell(nx, ny, width, height)) return
    const src = previous.get(cellKey(rx, ry))
    next.set(cellKey(nx, ny), src ? { ...src, rx: nx, ry: ny } : emptyCell(nx, ny))
    const from = overlayIndex(rx, ry)
    const to = overlayIndex(nx, ny)
    nextOverlay[to] = oldOverlay[from] ?? EMPTY_OVERLAY
    nextOverlayData[to] = oldOverlayData[from] ?? 0
  })
  forEachIsoCell(width, height, ({ rx, ry }) => {
    if (!next.has(cellKey(rx, ry))) next.set(cellKey(rx, ry), emptyCell(rx, ry))
  })
  doc.cells = next
  doc.overlay = nextOverlay
  doc.overlayData = nextOverlayData
  const keep = (rx: number, ry: number) => isValidIsoCell(rx, ry, width, height)
  const shift = <T extends { rx: number; ry: number }>(items: T[]) => items.filter((item) => {
    item.rx += xMove
    item.ry += yMove
    return keep(item.rx, item.ry)
  })
  doc.units = shift(doc.units)
  doc.infantry = shift(doc.infantry)
  doc.aircraft = shift(doc.aircraft)
  doc.structures = shift(doc.structures)
  doc.terrains = shift(doc.terrains)
  doc.smudges = shift(doc.smudges)
  doc.waypoints = shift(doc.waypoints)
  doc.cellTags = shift(doc.cellTags)
  for (const house of doc.houses) {
    house.nodes = shift(house.nodes)
  }
  doc.tubes = doc.tubes.filter((tube) => {
    tube.startX += xMove
    tube.endX += xMove
    tube.startY += yMove
    tube.endY += yMove
    return keep(tube.startX, tube.startY) && keep(tube.endX, tube.endY)
  })
  return null
}

export { fa2Shift }
