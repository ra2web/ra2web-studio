/** FA2 `CIsoView::DrawCellCursor` `_cell_hilight_colors[0..15]`。 */
export const FA2_CELL_HIGHLIGHT_COLORS = [
  '#ffffff',
  '#aa00aa',
  '#00aaaa',
  '#00aa00',
  '#5aff5a',
  '#ffff5a',
  '#ff3232',
  '#aa5500',
  '#aa0000',
  '#55ffff',
  '#5050ff',
  '#0000aa',
  '#000000',
  '#555555',
  '#aaaaaa',
  '#ffffff',
] as const

/** FA2 `DrawCell(..., touchNeighbours, RGB(60, 60, 255))`。 */
export const FA2_CELL_NEIGHBOR_COLOR = '#3c3cff'

/** FA2 2D→3D 抬升虚线 `RGB(60, 60, 60)`。 */
export const FA2_CELL_DROP_COLOR = '#3c3c3c'

/** FA2 写成 `clamp(height, 0, 16)` 再当下标会越界；按表长钳到 0..15。 */
export function cellHighlightColor(height: number): string {
  const index = Math.min(15, Math.max(0, Math.trunc(height)))
  return FA2_CELL_HIGHLIGHT_COLORS[index]
}

/** FA2 状态栏第二栏：`x / y - height`。 */
export function formatFa2CellStatus(rx: number, ry: number, height: number): string {
  return `${rx} / ${ry} - ${height}`
}
