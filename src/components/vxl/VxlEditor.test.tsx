import * as THREE from 'three'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import VxlEditor, { type VxlEditorSession } from './VxlEditor'
import { Section } from '../../data/vxl/Section'
import { cloneVxlDraft, type VxlDraft } from '../../data/vxl/VxlDraft'
import { renderWithProviders } from '../../test/render'

// VxlSceneRenderer 用了 three.js + WebGL，在 jsdom 下没办法初始化 → mock 成空 div
vi.mock('./VxlSceneRenderer', () => ({
  default: () => <div data-testid="vxl-scene-mock" />,
}))

function makeSection(name: string): Section {
  const s = new Section()
  s.name = name
  s.normalsMode = 2
  s.sizeX = 4
  s.sizeY = 4
  s.sizeZ = 4
  s.hvaMultiplier = 1
  s.transfMatrix = new THREE.Matrix4().identity()
  s.minBounds = new THREE.Vector3(-1, -1, -1)
  s.maxBounds = new THREE.Vector3(1, 1, 1)
  s.spans = []
  return s
}

function makeSession(): VxlEditorSession {
  const sections = [makeSection('HULL'), makeSection('TURRET')]
  const palette = new Uint8Array(768)
  const draft: VxlDraft = { embeddedPalette: palette, sections }
  return {
    filePath: 'art/units/pla.vxl',
    hvaFilePath: 'art/units/pla.hva',
    vxlOriginal: cloneVxlDraft(draft),
    vxl: draft,
    hvaOriginal: null,
    hva: null,
    animOriginal: null,
    anim: { rotors: [] },
    loading: false,
    error: null,
  }
}

describe('VxlEditor', () => {
  it('renders portal with filename and section list', () => {
    renderWithProviders(
      <VxlEditor
        session={makeSession()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    )
    expect(screen.getByText(/VXL/)).toBeTruthy()
    expect(screen.getByText('pla.vxl')).toBeTruthy()
    expect(screen.getByText('HULL')).toBeTruthy()
    expect(screen.getByText('TURRET')).toBeTruthy()
    // 默认选中第一个 section → 右栏 metadata 显示 HULL 的 name input
    const nameInput = screen.getByDisplayValue('HULL') as HTMLInputElement
    expect(nameInput).toBeTruthy()
  })

  it('clicking close (X) when not dirty triggers onExit immediately', async () => {
    const onExit = vi.fn()
    renderWithProviders(
      <VxlEditor
        session={makeSession()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onExit={onExit}
      />,
    )
    const closeBtn = screen.getByTitle('Close')
    fireEvent.click(closeBtn)
    // 异步：handleRequestExit 是 async，但 not dirty 时不弹 confirm，立即 onExit
    await new Promise((r) => setTimeout(r, 10))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('selecting a different section in left list updates highlight', () => {
    const onChange = vi.fn()
    renderWithProviders(
      <VxlEditor
        session={makeSession()}
        onChange={onChange}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    )
    // 默认 HULL；点击 TURRET
    fireEvent.click(screen.getByText('TURRET'))
    // 右栏 name input 应切到 TURRET（用 displayValue 找）
    expect(screen.getByDisplayValue('TURRET')).toBeTruthy()
  })

  it('changing a transform matrix cell calls onChange with updated draft', () => {
    const onChange = vi.fn()
    renderWithProviders(
      <VxlEditor
        session={makeSession()}
        onChange={onChange}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    )
    // 找 row 0 col 0 input（titled "row 0 col 0"）
    const cell = screen.getByTitle('row 0 col 0') as HTMLInputElement
    expect(cell.value).toBe('1') // identity 第 [0,0] 位
    fireEvent.change(cell, { target: { value: '2.5' } })
    expect(onChange).toHaveBeenCalled()
    // 验证 payload：vxl.sections[0].transfMatrix.elements[0] 应为 2.5
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.vxl.sections[0].transfMatrix.elements[0]).toBeCloseTo(2.5, 5)
  })

  it('save button disabled when not dirty, enabled when dirty', () => {
    const session = makeSession()
    // 让 vxl !== vxlOriginal：修改 draft 的某 section name
    session.vxl = cloneVxlDraft(session.vxlOriginal)
    session.vxl.sections[0].name = 'CHANGED'

    renderWithProviders(
      <VxlEditor
        session={session}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    )
    const saveBtn = screen.getByTitle('Save') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(false)
  })

  it('save button disabled when clean (vxl === vxlOriginal)', () => {
    renderWithProviders(
      <VxlEditor
        session={makeSession()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    )
    const saveBtn = screen.getByTitle('Save') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
  })

  it('defaults to orbit tool (highlighted in toolbar)', () => {
    renderWithProviders(
      <VxlEditor
        session={makeSession()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    )
    const orbitBtn = screen.getByTitle('Orbit') as HTMLButtonElement
    // active 工具按钮带 bg-blue-600
    expect(orbitBtn.className).toContain('bg-blue-600')
    const pencilBtn = screen.getByTitle('Pencil') as HTMLButtonElement
    expect(pencilBtn.className).not.toContain('bg-blue-600')
  })

  it('add section button creates a new entry via onChange', () => {
    const onChange = vi.fn()
    renderWithProviders(
      <VxlEditor
        session={makeSession()}
        onChange={onChange}
        onSave={vi.fn()}
        onExit={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTitle('Add'))
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall.vxl.sections.length).toBe(3) // 2 + 1 new
    expect(lastCall.vxl.sections[2].name.startsWith('NEW_')).toBe(true)
  })
})
