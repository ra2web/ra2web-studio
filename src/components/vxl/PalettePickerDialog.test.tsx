import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PalettePickerDialog, { type PaletteEntry } from './PalettePickerDialog'
import { renderWithProviders } from '../../test/render'

const ENTRIES: PaletteEntry[] = [
  { source: 'mix', path: 'LOCAL.MIX/unit.pal', basename: 'unit.pal' },
  { source: 'mix', path: 'LOCAL.MIX/snow.pal', basename: 'snow.pal' },
  { source: 'project', path: 'pal/custom.pal', basename: 'custom.pal' },
]

describe('PalettePickerDialog', () => {
  it('does not render when closed', () => {
    renderWithProviders(
      <PalettePickerDialog open={false} entries={ENTRIES} onCancel={vi.fn()} onPick={vi.fn()} />,
    )
    expect(screen.queryByText('unit.pal')).toBeNull()
  })

  it('renders all entries with project group first', () => {
    renderWithProviders(
      <PalettePickerDialog open={true} entries={ENTRIES} onCancel={vi.fn()} onPick={vi.fn()} />,
    )
    const items = screen.getAllByRole('button')
      .filter((b) => /\.pal$/.test(b.textContent ?? ''))
    expect(items.length).toBe(3)
    // 第一个应该是 project
    expect(items[0].textContent).toContain('custom.pal')
  })

  it('filters by query string', () => {
    renderWithProviders(
      <PalettePickerDialog open={true} entries={ENTRIES} onCancel={vi.fn()} onPick={vi.fn()} />,
    )
    const search = screen.getByPlaceholderText(/Search|搜索/) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'snow' } })
    expect(screen.queryByText('unit.pal')).toBeNull()
    expect(screen.queryByText('custom.pal')).toBeNull()
    expect(screen.getByText('snow.pal')).toBeTruthy()
  })

  it('clicking entry calls onPick with that entry', () => {
    const onPick = vi.fn()
    renderWithProviders(
      <PalettePickerDialog open={true} entries={ENTRIES} onCancel={vi.fn()} onPick={onPick} />,
    )
    fireEvent.click(screen.getByText('snow.pal'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ basename: 'snow.pal' }))
  })

  it('renders empty state when no entries', () => {
    renderWithProviders(
      <PalettePickerDialog open={true} entries={[]} onCancel={vi.fn()} onPick={vi.fn()} />,
    )
    expect(screen.getByText(/No palettes|没有找到/)).toBeTruthy()
  })

  it('renders loading state', () => {
    renderWithProviders(
      <PalettePickerDialog open={true} entries={[]} loading onCancel={vi.fn()} onPick={vi.fn()} />,
    )
    expect(screen.getByText(/Loading|加载/)).toBeTruthy()
  })
})
