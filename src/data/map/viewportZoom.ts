import { projectCell } from './isoCoords'

export const VIEWPORT_SCALE_MIN = 0.25
export const VIEWPORT_SCALE_MAX = 4
export const DEFAULT_VIEWPORT_SCALE = 0.45

export function clampViewportScale(scale: number): number {
  return Math.min(VIEWPORT_SCALE_MAX, Math.max(VIEWPORT_SCALE_MIN, scale))
}

/**
 * FA2 `CIsoView::Zoom`：缩放后鼠标所在像素对应的世界点不变。
 * `clientX/Y` 相对画布左上。
 */
export function zoomAroundClient(
  panX: number,
  panY: number,
  scale: number,
  nextScale: number,
  clientX: number,
  clientY: number,
): { panX: number; panY: number; scale: number } {
  const clamped = clampViewportScale(nextScale)
  const worldX = (clientX - panX) / scale
  const worldY = (clientY - panY) / scale
  return {
    scale: clamped,
    panX: clientX - worldX * clamped,
    panY: clientY - worldY * clamped,
  }
}

/** 把已知世界点钉在当前屏幕锚点上（双指中心跟随）。 */
export function followWorldAtClient(
  worldX: number,
  worldY: number,
  nextScale: number,
  clientX: number,
  clientY: number,
): { panX: number; panY: number; scale: number } {
  const scale = clampViewportScale(nextScale)
  return {
    scale,
    panX: clientX - worldX * scale,
    panY: clientY - worldY * scale,
  }
}

export function worldFromCanvasClient(
  clientX: number,
  clientY: number,
  panX: number,
  panY: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: (clientX - panX) / scale,
    y: (clientY - panY) / scale,
  }
}

export function panToCenterWorld(
  worldX: number,
  worldY: number,
  viewWidth: number,
  viewHeight: number,
  scale: number,
): { panX: number; panY: number } {
  return {
    panX: viewWidth / 2 - worldX * scale,
    panY: viewHeight / 2 - worldY * scale,
  }
}

/** FA2 `CIsoView::UpdateDialog(bRepos)`：打开地图时把 `isoSize/2` 格放到视口中心。 */
export function panToMapCenter(
  isoSize: number,
  viewWidth: number,
  viewHeight: number,
  scale: number,
): { panX: number; panY: number } {
  const mid = Math.trunc(isoSize / 2)
  const origin = projectCell(mid, mid, 0, isoSize)
  return panToCenterWorld(origin.px, origin.py, viewWidth, viewHeight, scale)
}
