import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CsfViewer from './CsfViewer'
import { CsfLanguage, type CsfDraft } from '../../data/CsfFile'
import { renderWithProviders } from '../../test/render'

function makeDraft(): CsfDraft {
  return {
    version: 3,
    language: CsfLanguage.EnglishUS,
    entries: [
      { key: 'NAME:GDI', value: 'Global Defense Initiative' },
      { key: 'NAME:NOD', value: 'Brotherhood of Nod' },
      { key: 'WITH:EXTRA', value: 'Main', extraValue: 'Annotation' },
    ],
  }
}

describe('CsfViewer (read-only fallback)', () => {
  it('does not render edit controls when draft prop is omitted', () => {
    // 这里没传 selectedFile / target，自然 source.resolved 为 null，组件会落到"等待中"或加载状态
    // 我们仅断言：编辑工具栏（"新增条目"按钮）不出现
    renderWithProviders(<CsfViewer />)
    expect(screen.queryByText('Add row')).toBeNull()
  })
})

describe('CsfViewer (edit mode via draft prop)', () => {
  it('renders editable rows with toolbar when draft + onDraftChange provided', () => {
    renderWithProviders(
      <CsfViewer draft={makeDraft()} onDraftChange={vi.fn()} />,
    )
    expect(screen.getByText('Add row')).toBeTruthy()
    expect(screen.getByText('NAME:GDI')).toBeTruthy()
    expect(screen.getByText('Global Defense Initiative')).toBeTruthy()
  })

  it('readOnly=true forces fallback: no edit toolbar even with draft', () => {
    renderWithProviders(
      <CsfViewer draft={makeDraft()} onDraftChange={vi.fn()} readOnly />,
    )
    expect(screen.queryByText('Add row')).toBeNull()
  })

  it('double-click value cell opens textarea, Ctrl+Enter commits new value', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    // 找 GDI 那条 value 单元格
    const cell = screen.getByText('Global Defense Initiative')
    fireEvent.doubleClick(cell)
    // textarea 应被插入
    const textarea = await waitFor(() =>
      screen.getByDisplayValue('Global Defense Initiative') as HTMLTextAreaElement,
    )
    fireEvent.change(textarea, { target: { value: 'GDI v2' } })
    // Ctrl+Enter 提交
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next: CsfDraft = onChange.mock.calls[0][0]
    expect(next.entries[0].value).toBe('GDI v2')
    expect(next.entries[0].key).toBe('NAME:GDI') // key 未变
  })

  it('double-click key cell + Enter renames; toUpperCase applied', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    const keyCell = screen.getByText('NAME:GDI')
    fireEvent.doubleClick(keyCell)
    const input = await waitFor(() => screen.getByDisplayValue('NAME:GDI') as HTMLInputElement)
    fireEvent.change(input, { target: { value: 'name:gdi_v2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next: CsfDraft = onChange.mock.calls[0][0]
    expect(next.entries[0].key).toBe('NAME:GDI_V2')
  })

  it('rejects duplicate key (does not call onDraftChange, shows red message)', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    const keyCell = screen.getByText('NAME:GDI')
    fireEvent.doubleClick(keyCell)
    const input = await waitFor(() => screen.getByDisplayValue('NAME:GDI') as HTMLInputElement)
    fireEvent.change(input, { target: { value: 'NAME:NOD' } }) // 与第二条冲突
    // 红色提示出现
    await waitFor(() => expect(screen.getByText('Key already exists')).toBeTruthy())
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects empty key', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    const keyCell = screen.getByText('NAME:GDI')
    fireEvent.doubleClick(keyCell)
    const input = await waitFor(() => screen.getByDisplayValue('NAME:GDI') as HTMLInputElement)
    fireEvent.change(input, { target: { value: '   ' } })
    await waitFor(() => expect(screen.getByText('Key cannot be empty')).toBeTruthy())
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('IME composing Enter does not commit', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    const cell = screen.getByText('Global Defense Initiative')
    fireEvent.doubleClick(cell)
    const textarea = await waitFor(() =>
      screen.getByDisplayValue('Global Defense Initiative') as HTMLTextAreaElement,
    )
    fireEvent.change(textarea, { target: { value: 'X' } })
    // 模拟 IME composing 中按 Ctrl+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, isComposing: true } as any)
    expect(onChange).not.toHaveBeenCalled()
    // 真正 Ctrl+Enter（非 composing）应触发
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
  })

  it('addRow appends a new entry with placeholder key', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    fireEvent.click(screen.getByText('Add row'))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next: CsfDraft = onChange.mock.calls[0][0]
    expect(next.entries).toHaveLength(4)
    expect(next.entries[3].key).toMatch(/^NEW_LABEL/)
    expect(next.entries[3].value).toBe('')
  })

  it('deletes selected rows when delete button is clicked', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    // 选中第二行 (index 1) checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByText(/Delete selected/))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next: CsfDraft = onChange.mock.calls[0][0]
    expect(next.entries).toHaveLength(2)
    expect(next.entries.find((e) => e.key === 'NAME:NOD')).toBeUndefined()
  })

  it('extra value cell shows + button when no extraValue, double-click adds it', async () => {
    const onChange = vi.fn()
    renderWithProviders(<CsfViewer draft={makeDraft()} onDraftChange={onChange} />)
    // 第一条 entry 没有 extraValue，应显示 "+" 按钮
    const addExtraButtons = screen.getAllByText(/\+ Extra/)
    expect(addExtraButtons.length).toBeGreaterThan(0)
    fireEvent.click(addExtraButtons[0])
    const input = await waitFor(() => screen.getAllByPlaceholderText(/Extra/i)[0] as HTMLInputElement)
    fireEvent.change(input, { target: { value: 'NewExtra' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    const next: CsfDraft = onChange.mock.calls[0][0]
    expect(next.entries[0].extraValue).toBe('NewExtra')
  })
})
