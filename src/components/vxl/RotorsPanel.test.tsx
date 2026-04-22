import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RotorsPanel from './RotorsPanel'
import type { AnimMetadata } from '../../data/vxl/AnimMetadata'
import { renderWithProviders } from '../../test/render'

const SECTIONS = ['HULL', 'BLADE', 'TAIL']

function emptyAnim(): AnimMetadata { return { rotors: [] } }

describe('RotorsPanel', () => {
  it('renders empty state when no rotors', () => {
    renderWithProviders(
      <RotorsPanel sectionNames={SECTIONS} anim={emptyAnim()} onAnimChange={vi.fn()} />,
    )
    // 空状态文本（中英任一）
    const empty = screen.queryByText(/No rotors|尚未配置 rotor/)
    expect(empty).toBeTruthy()
  })

  it('clicking add appends new rotor with default values + first available section', () => {
    const onAnimChange = vi.fn()
    renderWithProviders(
      <RotorsPanel sectionNames={SECTIONS} anim={emptyAnim()} onAnimChange={onAnimChange} />,
    )
    fireEvent.click(screen.getByText(/Add Rotor|\u6dfb\u52a0 Rotor/))
    expect(onAnimChange).toHaveBeenCalledTimes(1)
    const next: AnimMetadata = onAnimChange.mock.calls[0][0]
    expect(next.rotors.length).toBe(1)
    expect(next.rotors[0]).toEqual({
      sectionName: 'HULL',
      axis: 'z',
      speedDegPerSec: 67,
      enabled: true,
    })
  })

  it('heuristic suggest adds rotors for BLADE/ROTOR/PROP-named sections', () => {
    const onAnimChange = vi.fn()
    renderWithProviders(
      <RotorsPanel sectionNames={['HULL', 'BLADE', 'TAIL_ROTOR', 'PROP1']} anim={emptyAnim()} onAnimChange={onAnimChange} />,
    )
    fireEvent.click(screen.getByText(/Auto-suggest|\u81ea\u52a8\u5efa\u8bae/))
    expect(onAnimChange).toHaveBeenCalledTimes(1)
    const next: AnimMetadata = onAnimChange.mock.calls[0][0]
    expect(next.rotors.length).toBe(3)
    const names = next.rotors.map((r) => r.sectionName).sort()
    expect(names).toEqual(['BLADE', 'PROP1', 'TAIL_ROTOR'])
  })

  it('heuristic suggest skips already-present rotors', () => {
    const onAnimChange = vi.fn()
    const anim: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    renderWithProviders(
      <RotorsPanel sectionNames={['HULL', 'BLADE', 'TAIL_ROTOR']} anim={anim} onAnimChange={onAnimChange} />,
    )
    fireEvent.click(screen.getByText(/Auto-suggest|\u81ea\u52a8\u5efa\u8bae/))
    const next: AnimMetadata = onAnimChange.mock.calls[0][0]
    // 仍然只有 BLADE + 新的 TAIL_ROTOR，没重复 BLADE
    expect(next.rotors.map((r) => r.sectionName).sort()).toEqual(['BLADE', 'TAIL_ROTOR'])
  })

  it('axis click updates axis', () => {
    const onAnimChange = vi.fn()
    const anim: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    renderWithProviders(
      <RotorsPanel sectionNames={SECTIONS} anim={anim} onAnimChange={onAnimChange} />,
    )
    // 三个轴按钮：X/Y/Z；点 X
    const xBtn = screen.getAllByText('X').find((el) => el.tagName.toLowerCase() === 'button')
    expect(xBtn).toBeTruthy()
    fireEvent.click(xBtn!)
    const next: AnimMetadata = onAnimChange.mock.calls[0][0]
    expect(next.rotors[0].axis).toBe('x')
  })

  it('toggle enabled checkbox', () => {
    const onAnimChange = vi.fn()
    const anim: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    renderWithProviders(
      <RotorsPanel sectionNames={SECTIONS} anim={anim} onAnimChange={onAnimChange} />,
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    const next: AnimMetadata = onAnimChange.mock.calls[0][0]
    expect(next.rotors[0].enabled).toBe(false)
  })

  it('delete button removes the row', () => {
    const onAnimChange = vi.fn()
    const anim: AnimMetadata = {
      rotors: [
        { sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true },
        { sectionName: 'TAIL', axis: 'x', speedDegPerSec: 30, enabled: true },
      ],
    }
    renderWithProviders(
      <RotorsPanel sectionNames={SECTIONS} anim={anim} onAnimChange={onAnimChange} />,
    )
    // 取第一个删除按钮（按 title 找）
    const deletes = screen.getAllByTitle(/Delete|删除/)
    fireEvent.click(deletes[0])
    const next: AnimMetadata = onAnimChange.mock.calls[0][0]
    expect(next.rotors.length).toBe(1)
    expect(next.rotors[0].sectionName).toBe('TAIL')
  })

  it('speed input updates speedDegPerSec', () => {
    const onAnimChange = vi.fn()
    const anim: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    renderWithProviders(
      <RotorsPanel sectionNames={SECTIONS} anim={anim} onAnimChange={onAnimChange} />,
    )
    const input = screen.getByDisplayValue('67') as HTMLInputElement
    fireEvent.change(input, { target: { value: '120' } })
    const next: AnimMetadata = onAnimChange.mock.calls[0][0]
    expect(next.rotors[0].speedDegPerSec).toBe(120)
  })
})
