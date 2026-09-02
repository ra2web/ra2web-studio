export const VIEWPORT_SCALE_MIN = 0.25
export const VIEWPORT_SCALE_MAX = 4

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
