import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from './constants'

/** TMP unpack diamond (XCC decode_tile / werhd TmpDrawable). 60×30 → 900 opaque mask pixels. */
export function tmpDiamondMask(blockWidth = RA2_ISO_TILE_WIDTH, blockHeight = RA2_ISO_TILE_HEIGHT): boolean[][] {
  const mask = Array.from({ length: blockHeight }, () => Array.from({ length: blockWidth }, () => false))
  let targetIndex = blockWidth / 2 - 2
  let row = 0
  let rowWidth = 0
  const halfHeight = blockHeight / 2
  for (; row < halfHeight; row++) {
    rowWidth += 4
    for (let column = 0; column < rowWidth; column++) {
      const x = targetIndex % blockWidth
      const y = Math.floor(targetIndex / blockWidth)
      if (y >= 0 && y < blockHeight && x >= 0 && x < blockWidth) mask[y][x] = true
      targetIndex++
    }
    targetIndex += blockWidth - (rowWidth + 2)
  }
  for (targetIndex += 4; row < blockHeight; row++) {
    rowWidth -= 4
    for (let column = 0; column < rowWidth; column++) {
      const x = targetIndex % blockWidth
      const y = Math.floor(targetIndex / blockWidth)
      if (y >= 0 && y < blockHeight && x >= 0 && x < blockWidth) mask[y][x] = true
      targetIndex++
    }
    targetIndex += blockWidth - (rowWidth - 2)
  }
  return mask
}

function inHitDiamond(localX: number, localY: number): boolean {
  const dx = (localX + 0.5 - RA2_ISO_TILE_WIDTH / 2) / (RA2_ISO_TILE_WIDTH / 2)
  const dy = (localY + 0.5) / (RA2_ISO_TILE_HEIGHT / 2) - 1
  return Math.abs(dx) + Math.abs(dy) <= 1
}

/**
 * Hit-test diamond pixels that a *single* TMP does not paint.
 * Neighbors at (±halfW, ±halfH) cover these when tiles are joined at 1:1.
 */
export function singleTileIsoHoles(mask = tmpDiamondMask()): Array<{ x: number; y: number }> {
  const holes: Array<{ x: number; y: number }> = []
  for (let y = 0; y < RA2_ISO_TILE_HEIGHT; y++) {
    for (let x = 0; x < RA2_ISO_TILE_WIDTH; x++) {
      if (inHitDiamond(x, y) && !mask[y][x]) holes.push({ x, y })
    }
  }
  return holes
}

export function neighborBlitOffsets(): Array<{ x: number; y: number }> {
  const hx = RA2_ISO_TILE_WIDTH / 2
  const hy = RA2_ISO_TILE_HEIGHT / 2
  return [
    { x: -hx, y: hy },
    { x: hx, y: hy },
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
  ]
}

/** Union of a tile and its four diagonal neighbors. Joined 1:1 iso diamonds have no holes. */
export function joinedIsoCoverage(mask = tmpDiamondMask()): { covered: number; holes: number } {
  const padX = RA2_ISO_TILE_WIDTH
  const padY = RA2_ISO_TILE_HEIGHT
  const width = RA2_ISO_TILE_WIDTH + padX * 2
  const height = RA2_ISO_TILE_HEIGHT + padY * 2
  const canvas = Array.from({ length: height }, () => Array.from({ length: width }, () => 0))
  const stamp = (ox: number, oy: number) => {
    for (let y = 0; y < mask.length; y++) {
      for (let x = 0; x < mask[y].length; x++) {
        if (mask[y][x]) canvas[oy + y][ox + x] += 1
      }
    }
  }
  const originX = padX
  const originY = padY
  stamp(originX, originY)
  for (const offset of neighborBlitOffsets()) stamp(originX + offset.x, originY + offset.y)
  let covered = 0
  let holes = 0
  for (let y = 0; y < RA2_ISO_TILE_HEIGHT; y++) {
    for (let x = 0; x < RA2_ISO_TILE_WIDTH; x++) {
      if (!inHitDiamond(x, y)) continue
      if (canvas[originY + y][originX + x] > 0) covered++
      else holes++
    }
  }
  return { covered, holes }
}
