import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from './constants'

export type IsoCell = {
  dx: number
  dy: number
  rx: number
  ry: number
}

/** FA2 / RA2 等距投影。x/y 为 IsoMapPack 的 wX/wY。 */
export function projectCell(rx: number, ry: number, z: number, isoSize: number): { px: number; py: number } {
  const halfX = RA2_ISO_TILE_WIDTH / 2
  const halfY = RA2_ISO_TILE_HEIGHT / 2
  return {
    px: (isoSize - 2 - rx + ry) * halfX,
    py: (ry + rx - z) * halfY,
  }
}

export function unprojectCell(px: number, py: number, z: number, isoSize: number): { rx: number; ry: number } {
  const fX = RA2_ISO_TILE_WIDTH
  const fY = RA2_ISO_TILE_HEIGHT
  const cx = px
  const cy = py + z * (fY / 2)
  return {
    rx: cy / fY - cx / fX + (isoSize - 2) / 2,
    ry: cy / fY + cx / fX - (isoSize - 2) / 2,
  }
}

export function cellToDiamond(rx: number, ry: number, z: number, isoSize: number): { x: number; y: number }[] {
  const origin = projectCell(rx, ry, z, isoSize)
  const hw = RA2_ISO_TILE_WIDTH / 2
  const hh = RA2_ISO_TILE_HEIGHT / 2
  return [
    { x: origin.px, y: origin.py },
    { x: origin.px + hw, y: origin.py + hh },
    { x: origin.px, y: origin.py + hh * 2 },
    { x: origin.px - hw, y: origin.py + hh },
  ]
}

export function hitTestDiamond(
  px: number,
  py: number,
  rx: number,
  ry: number,
  z: number,
  isoSize: number,
): boolean {
  const origin = projectCell(rx, ry, z, isoSize)
  const dx = (px - origin.px) / (RA2_ISO_TILE_WIDTH / 2)
  const dy = (py - origin.py) / (RA2_ISO_TILE_HEIGHT / 2) - 1
  return Math.abs(dx) + Math.abs(dy) <= 1
}

/**
 * 与 ra2web 引擎 MapFile.readTiles 一致的可见格遍历。
 * tileCount = (2*width-1)*height
 */
export function forEachIsoCell(
  width: number,
  height: number,
  visit: (cell: IsoCell) => void,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= 2 * width - 2; x++) {
      const dy = 2 * y + (x % 2)
      const rx = (x + dy) / 2 + 1
      const ry = dy - rx + width + 1
      visit({ dx: x, dy, rx, ry })
    }
  }
}

export function isoSizeOf(width: number, height: number): number {
  return width + height
}

export function isValidIsoCell(rx: number, ry: number, width: number, height: number): boolean {
  const dx = rx - ry + width - 1
  const dy = rx + ry - width - 1
  return dx >= 0 && dx < 2 * width && dy >= 0 && dy < 2 * height
}

export function waypointCell(rx: number, ry: number): number {
  return ry * 1000 + rx
}

export function parseWaypointCell(value: number): { rx: number; ry: number } {
  const ry = Math.floor(value / 1000)
  return { ry, rx: value - ry * 1000 }
}
