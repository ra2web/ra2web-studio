import { describe, expect, it } from 'vitest'
import {
  FA2_CELL_HIGHLIGHT_COLORS,
  cellHighlightColor,
  formatFa2CellStatus,
} from './fa2CellCursor'

describe('FA2 cell cursor palette', () => {
  it('maps height 0 / 1 / 6 / 15 to FA2 highlight colors', () => {
    expect(cellHighlightColor(0)).toBe('#ffffff')
    expect(cellHighlightColor(1)).toBe('#aa00aa')
    expect(cellHighlightColor(6)).toBe('#ff3232')
    expect(cellHighlightColor(15)).toBe('#ffffff')
    expect(FA2_CELL_HIGHLIGHT_COLORS).toHaveLength(16)
  })

  it('clamps out-of-range heights to the 0..15 table', () => {
    expect(cellHighlightColor(-3)).toBe(FA2_CELL_HIGHLIGHT_COLORS[0])
    expect(cellHighlightColor(16)).toBe(FA2_CELL_HIGHLIGHT_COLORS[15])
    expect(cellHighlightColor(99.7)).toBe(FA2_CELL_HIGHLIGHT_COLORS[15])
  })

  it('formats the FA2 status pane as x / y - height', () => {
    expect(formatFa2CellStatus(12, 8, 4)).toBe('12 / 8 - 4')
  })
})
