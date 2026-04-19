import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CopyFileDialog from './CopyFileDialog'
import type { ProjectTreeNode } from '../../types/studio'
import { renderWithProviders } from '../../test/render'

function makeTree(): ProjectTreeNode[] {
  // 模拟项目结构：
  //   art/        (dir)
  //     icons/    (dir)
  //   data.mix    (top-level mix file)
  //   src/foo.shp (file，源)
  //   notes.txt   (普通文件，应被过滤掉)
  return [
    {
      path: 'art',
      name: 'art',
      kind: 'directory',
      size: 0,
      lastModified: 0,
      children: [
        {
          path: 'art/icons',
          name: 'icons',
          kind: 'directory',
          size: 0,
          lastModified: 0,
          children: [],
        },
      ],
    },
    {
      path: 'data.mix',
      name: 'data.mix',
      kind: 'file',
      size: 1024,
      lastModified: 0,
      extension: 'mix',
    },
    {
      path: 'src',
      name: 'src',
      kind: 'directory',
      size: 0,
      lastModified: 0,
      children: [
        {
          path: 'src/foo.shp',
          name: 'foo.shp',
          kind: 'file',
          size: 100,
          lastModified: 0,
          extension: 'shp',
        },
      ],
    },
    {
      path: 'notes.txt',
      name: 'notes.txt',
      kind: 'file',
      size: 200,
      lastModified: 0,
      extension: 'txt',
    },
  ]
}

describe('CopyFileDialog', () => {
  it('default destination = source parent dir; submit posts directory destination + new name', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    renderWithProviders(
      <CopyFileDialog
        open
        projectName="Demo"
        tree={makeTree()}
        sourceRelativePath="src/foo.shp"
        existingFilePaths={new Set(['src/foo.shp'])}
        existingMixEntries={new Set()}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    // 文件名 input 应被填成源 basename
    const input = screen.getByDisplayValue('foo.shp') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bar.shp' } })

    // 默认选中 source parent (= 'src')，所以预览应该是 src/bar.shp
    // 点确定
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onConfirm).toHaveBeenCalledWith(
      { kind: 'directory', projectName: 'Demo', relativePath: 'src' },
      'bar.shp',
    )
  })

  it('selecting a top-level MIX node yields a mix destination', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(
      <CopyFileDialog
        open
        projectName="Demo"
        tree={makeTree()}
        sourceRelativePath="src/foo.shp"
        existingFilePaths={new Set(['src/foo.shp'])}
        existingMixEntries={new Set()}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    )

    // 点击 data.mix 节点
    fireEvent.click(screen.getByText('data.mix'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    const [destination, newName] = onConfirm.mock.calls[0]
    expect(destination).toEqual({
      kind: 'mix',
      projectName: 'Demo',
      owningMixPath: 'data.mix',
      containerChain: [],
    })
    expect(newName).toBe('foo.shp')
  })

  it('blocks submit when target already exists at chosen directory', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(
      <CopyFileDialog
        open
        projectName="Demo"
        tree={makeTree()}
        sourceRelativePath="src/foo.shp"
        // 模拟 art/foo.shp 已存在
        existingFilePaths={new Set(['src/foo.shp', 'art/foo.shp'])}
        existingMixEntries={new Set()}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    )

    // 选 art 目录
    fireEvent.click(screen.getByText('art'))
    // 校验错误条出现 + 提交按钮 disabled
    await waitFor(() => {
      expect(
        screen.getByText('A file with this name already exists at the destination'),
      ).toBeTruthy()
    })
    const confirmBtn = screen.getByRole('button', { name: 'Copy' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
    fireEvent.click(confirmBtn)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('blocks submit when destination = source dir + name unchanged', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(
      <CopyFileDialog
        open
        projectName="Demo"
        tree={makeTree()}
        sourceRelativePath="src/foo.shp"
        existingFilePaths={new Set(['src/foo.shp'])}
        existingMixEntries={new Set()}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    )

    // 默认状态：dir=src, name=foo.shp → 应当报 sameAsSource
    await waitFor(() => {
      expect(screen.getByText('Destination is the same as source')).toBeTruthy()
    })
    const confirmBtn = screen.getByRole('button', { name: 'Copy' }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
  })

  it('blocks submit when name contains path separator', async () => {
    renderWithProviders(
      <CopyFileDialog
        open
        projectName="Demo"
        tree={makeTree()}
        sourceRelativePath="src/foo.shp"
        existingFilePaths={new Set(['src/foo.shp'])}
        existingMixEntries={new Set()}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    )
    const input = screen.getByDisplayValue('foo.shp') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'sub/bar.shp' } })
    await waitFor(() => {
      expect(screen.getByText('New name cannot contain path separators')).toBeTruthy()
    })
  })

  it('does not submit on Enter while IME is composing', async () => {
    const onConfirm = vi.fn()
    renderWithProviders(
      <CopyFileDialog
        open
        projectName="Demo"
        tree={makeTree()}
        sourceRelativePath="src/foo.shp"
        existingFilePaths={new Set(['src/foo.shp'])}
        existingMixEntries={new Set()}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    )
    const input = screen.getByDisplayValue('foo.shp') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bar.shp' } })
    // 模拟 IME 组词期间按下 Enter（isComposing=true）
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true } as any)
    expect(onConfirm).not.toHaveBeenCalled()
    // 真正 Enter（无 IME）应触发提交
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('returns null when not open', () => {
    const { container } = renderWithProviders(
      <CopyFileDialog
        open={false}
        projectName="Demo"
        tree={makeTree()}
        sourceRelativePath="src/foo.shp"
        existingFilePaths={new Set()}
        existingMixEntries={new Set()}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
