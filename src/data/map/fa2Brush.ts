/** FA2 `m_BrushSize_x` × `m_BrushSize_y` 在 iso 格 (rx, ry) 上的矩形。 */

/** FA2 PlaceTile / 铺矿：从点击格沿 +rx/+ry 铺 w×h。等距投影下是斜菱形。 */
export function fa2PaintRectOffsets(w: number, h = w): Array<{ dx: number; dy: number }> {
  const bw = Math.max(1, w)
  const bh = Math.max(1, h)
  const out: Array<{ dx: number; dy: number }> = []
  for (let dx = 0; dx < bw; dx++) {
    for (let dy = 0; dy < bh; dy++) out.push({ dx, dy })
  }
  return out
}

/** FA2 HeightenTile：`m = -bx/2 .. bx/2` 的中心矩形。 */
export function fa2CenteredRectOffsets(w: number, h = w): Array<{ dx: number; dy: number }> {
  const bw = Math.max(1, w)
  const bh = Math.max(1, h)
  const left = bw < 2 ? 0 : -Math.floor(bw / 2)
  const right = Math.floor(bw / 2) + 1
  const top = bh < 2 ? 0 : -Math.floor(bh / 2)
  const bottom = Math.floor(bh / 2) + 1
  const out: Array<{ dx: number; dy: number }> = []
  for (let dx = left; dx < right; dx++) {
    for (let dy = top; dy < bottom; dy++) out.push({ dx, dy })
  }
  return out
}

/** 曼哈顿菱形；等距投影后接近屏幕轴对齐正方形。 */
export function manhattanDiamondOffsets(brush: number): Array<{ dx: number; dy: number }> {
  const size = Math.max(1, brush)
  const out: Array<{ dx: number; dy: number }> = []
  for (let dy = -size + 1; dy < size; dy++) {
    for (let dx = -size + 1; dx < size; dx++) {
      if (Math.abs(dx) + Math.abs(dy) >= size) continue
      out.push({ dx, dy })
    }
  }
  return out
}
