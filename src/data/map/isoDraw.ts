import {
  EMPTY_OVERLAY,
  OVRL_VEINHOLE,
  RA2_ISO_TILE_HEIGHT,
  RA2_ISO_TILE_WIDTH,
} from './constants'

export type ScreenOrigin = { px: number; py: number }

export type TmpBlitPixels = {
  width: number
  height: number
  drawOffsetX?: number
  drawOffsetY?: number
  blockWidth?: number
  blockHeight?: number
}

/**
 * Studio `projectCell` is the isometric diamond top (hit-test / placeholders).
 * FA2 `ProjectCoords3d` is the 60×30 bounding-box top-left; diamond top is +f_x/2 on X.
 * TMP blit is FA2 `drawCoords + (sX,sY)` and werhd top-center + extra pad, which in
 * diamond-top space is `origin - blockWidth/2 + sX` — not `origin - spriteWidth/2`.
 *
 * 单格 TMP 菱形盖不满命中菱形（约 30px 洞）；邻格按 ±30,±15 1:1 拼接后这些洞被盖住。
 * 必须先在世界像素整数格上拼好地形，再整体缩放，不能对每块 sprite 分别 scale。
 */
export function tmpBlitPosition(origin: ScreenOrigin, pixels: TmpBlitPixels): { x: number; y: number } {
  const blockWidth = pixels.blockWidth ?? RA2_ISO_TILE_WIDTH
  return {
    x: origin.px - blockWidth / 2 + (pixels.drawOffsetX ?? 0),
    y: origin.py + (pixels.drawOffsetY ?? 0),
  }
}

/** FA2 overlay: `(f_x/2 - w/2, -h/2)` from bbox top-left. */
export function overlayBlitPosition(
  origin: ScreenOrigin,
  width: number,
  height: number,
  overlayId = EMPTY_OVERLAY,
): { x: number; y: number } {
  let y = origin.py - height / 2
  if (overlayId === OVRL_VEINHOLE) y -= (RA2_ISO_TILE_HEIGHT * 3) / 2
  else if ((overlayId >= 0x4a && overlayId <= 0x65) || (overlayId >= 0xcd && overlayId <= 0xec)) {
    y += RA2_ISO_TILE_HEIGHT / 2
  }
  return { x: origin.px - width / 2, y }
}

/** FA2 unit/building SHP: `(f_x/2 - w/2, f_y/2 - h/2)` from bbox top-left. */
export function objectBlitPosition(origin: ScreenOrigin, width: number, height: number): { x: number; y: number } {
  return {
    x: origin.px - width / 2,
    y: origin.py + RA2_ISO_TILE_HEIGHT / 2 - height / 2,
  }
}

/** FA2 `GetMiniMapPos` before DIB height centering. */
export function miniMapIso(rx: number, ry: number, isoSize: number): { x: number; y: number } {
  return {
    x: isoSize - rx + ry,
    y: (rx + ry) / 2,
  }
}

export function unprojectMiniMapIso(x: number, y: number, isoSize: number): { rx: number; ry: number } {
  const diff = x - isoSize
  return {
    rx: y - diff / 2,
    ry: y + diff / 2,
  }
}
