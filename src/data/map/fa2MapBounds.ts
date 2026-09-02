import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from './constants'
import { projectCell } from './isoCoords'

export type AxisRect = {
  x1: number
  y1: number
  x2: number
  y2: number
}

export type MapBoundRects = {
  /** FA2 红框：`Size` 有效区。 */
  valid: AxisRect
  /** FA2 蓝框：`LocalSize` 可视区。 */
  visible: AxisRect
}

type MapBoundSource = {
  width: number
  height: number
  isoSize: number
  localX: number
  localY: number
  localWidth: number
  localHeight: number
}

/**
 * FA2 `RenderUIOverlay` 把 `ProjectCoords` 再偏 `+ (f_x/2, f_y/2)` 后画轴对齐矩形。
 * 与 Studio `projectCell` 同公式，因此这里补同样的半格偏移。
 */
function overlayCorner(rx: number, ry: number, isoSize: number): { x: number; y: number } {
  const origin = projectCell(rx, ry, 0, isoSize)
  return {
    x: origin.px + RA2_ISO_TILE_WIDTH / 2,
    y: origin.py + RA2_ISO_TILE_HEIGHT / 2,
  }
}

export function fa2ValidMapRect(width: number, height: number, isoSize: number): AxisRect {
  const topLeft = overlayCorner(width, 1, isoSize)
  const bottomRight = overlayCorner(height, isoSize - 1, isoSize)
  return {
    x1: topLeft.x,
    y1: topLeft.y,
    x2: bottomRight.x,
    y2: bottomRight.y,
  }
}

export function fa2VisibleMapRect(valid: AxisRect, localX: number, localY: number, localWidth: number, localHeight: number): AxisRect {
  return {
    x1: valid.x1 + localX * RA2_ISO_TILE_WIDTH - RA2_ISO_TILE_WIDTH / 2,
    y1: valid.y1 + (localY - 4) * RA2_ISO_TILE_HEIGHT,
    x2: valid.x1 + (localX + localWidth) * RA2_ISO_TILE_WIDTH - RA2_ISO_TILE_WIDTH / 2,
    y2: valid.y1 + localY * RA2_ISO_TILE_HEIGHT + localHeight * RA2_ISO_TILE_HEIGHT,
  }
}

export function fa2MapBoundRects(doc: MapBoundSource): MapBoundRects {
  const valid = fa2ValidMapRect(doc.width, doc.height, doc.isoSize)
  return {
    valid,
    visible: fa2VisibleMapRect(valid, doc.localX, doc.localY, doc.localWidth, doc.localHeight),
  }
}

export const FA2_VALID_BOUND_COLOR = '#ff0000'
export const FA2_VISIBLE_BOUND_COLOR = '#0000ff'

export function strokeFa2MapBounds(
  ctx: Pick<CanvasRenderingContext2D, 'strokeStyle' | 'lineWidth' | 'strokeRect'>,
  bounds: MapBoundRects,
  scale: number,
): void {
  const px = 1 / Math.max(scale, 0.2)
  strokeDoubleRect(ctx, bounds.valid, FA2_VALID_BOUND_COLOR, px, 1)
  strokeDoubleRect(ctx, bounds.visible, FA2_VISIBLE_BOUND_COLOR, px, -1)
}

function strokeDoubleRect(
  ctx: Pick<CanvasRenderingContext2D, 'strokeStyle' | 'lineWidth' | 'strokeRect'>,
  rect: AxisRect,
  color: string,
  px: number,
  outset: number,
): void {
  const width = rect.x2 - rect.x1
  const height = rect.y2 - rect.y1
  if (width <= 0 || height <= 0) return
  ctx.strokeStyle = color
  ctx.lineWidth = px
  ctx.strokeRect(rect.x1, rect.y1, width, height)
  const shift = outset * px
  ctx.strokeRect(rect.x1 - shift, rect.y1 - shift, width + shift * 2, height + shift * 2)
}
