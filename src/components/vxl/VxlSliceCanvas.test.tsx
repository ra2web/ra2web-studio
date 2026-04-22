import * as THREE from 'three'
import { fireEvent } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Section } from '../../data/vxl/Section'
import VxlSliceCanvas from './VxlSliceCanvas'
import { setVoxelAt, getVoxelAt } from '../../services/vxl/VxlOps'
import { installCanvasStubs } from '../../test/mocks/canvasStub'
import { renderWithProviders } from '../../test/render'

beforeAll(() => {
  installCanvasStubs()
})

function makeSection(): Section {
  const s = new Section()
  s.name = 'TEST'
  s.normalsMode = 2
  s.sizeX = 4; s.sizeY = 4; s.sizeZ = 4
  s.hvaMultiplier = 1
  s.transfMatrix = new THREE.Matrix4().identity()
  s.minBounds = new THREE.Vector3(); s.maxBounds = new THREE.Vector3()
  s.spans = []
  return s
}

describe('VxlSliceCanvas', () => {
  it('renders without crashing for empty section', () => {
    const section = makeSection()
    const { container } = renderWithProviders(
      <VxlSliceCanvas
        sections={[section]}
        sectionIndex={0}
        axis="z"
        sliceIndex={0}
        paletteBytes={new Uint8Array(768)}
        tool="pencil"
        colorIndex={1}
        normalIndex={0}
      />,
    )
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('mousedown with pencil tool calls onMutated and onCommand', () => {
    const section = makeSection()
    const onMutated = vi.fn()
    const onCommand = vi.fn()
    const { container } = renderWithProviders(
      <VxlSliceCanvas
        sections={[section]}
        sectionIndex={0}
        axis="z"
        sliceIndex={0}
        paletteBytes={new Uint8Array(768)}
        tool="pencil"
        colorIndex={5}
        normalIndex={2}
        onMutated={onMutated}
        onCommand={onCommand}
      />,
    )
    const canvas = container.querySelector('canvas')!
    // jsdom getBoundingClientRect 返回 0 size；我们 stub 一下
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64, x: 0, y: 0, toJSON: () => '' }),
    })
    // 点击 (8, 8) → cell (0, 0)（CELL = 16）
    fireEvent.mouseDown(canvas, { clientX: 8, clientY: 8 })
    expect(onMutated).toHaveBeenCalled()
    // 检查 voxel 已写入
    expect(getVoxelAt(section, 0, 0, 0)).toEqual({ x: 0, y: 0, z: 0, colorIndex: 5, normalIndex: 2 })
    // mouseup → finish stroke → onCommand called once
    fireEvent.mouseUp(canvas)
    expect(onCommand).toHaveBeenCalledTimes(1)
    expect(onCommand.mock.calls[0][0].patches.length).toBeGreaterThan(0)
  })

  it('eyedropper picks color and normal from clicked voxel', () => {
    const section = makeSection()
    setVoxelAt(section, 1, 1, 0, 17, 8)
    const onEyedropper = vi.fn()
    const { container } = renderWithProviders(
      <VxlSliceCanvas
        sections={[section]}
        sectionIndex={0}
        axis="z"
        sliceIndex={0}
        paletteBytes={new Uint8Array(768)}
        tool="eyedropper"
        colorIndex={0}
        normalIndex={0}
        onEyedropper={onEyedropper}
      />,
    )
    const canvas = container.querySelector('canvas')!
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64, x: 0, y: 0, toJSON: () => '' }),
    })
    // 点击 cell (1, 1) → x=1, y=1
    fireEvent.mouseDown(canvas, { clientX: 24, clientY: 24 })
    expect(onEyedropper).toHaveBeenCalledWith(17, 8)
  })

  it('orbit tool does not trigger any edit on mousedown', () => {
    const section = makeSection()
    setVoxelAt(section, 0, 0, 0, 9, 1)
    const onMutated = vi.fn()
    const onCommand = vi.fn()
    const { container } = renderWithProviders(
      <VxlSliceCanvas
        sections={[section]}
        sectionIndex={0}
        axis="z"
        sliceIndex={0}
        paletteBytes={new Uint8Array(768)}
        tool="orbit"
        colorIndex={5}
        normalIndex={2}
        onMutated={onMutated}
        onCommand={onCommand}
      />,
    )
    const canvas = container.querySelector('canvas')!
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64, x: 0, y: 0, toJSON: () => '' }),
    })
    fireEvent.mouseDown(canvas, { clientX: 8, clientY: 8 })
    fireEvent.mouseUp(canvas)
    expect(onMutated).not.toHaveBeenCalled()
    expect(onCommand).not.toHaveBeenCalled()
    // 已有体素未被改写
    expect(getVoxelAt(section, 0, 0, 0)?.colorIndex).toBe(9)
    // cursor 应该是 default
    expect(canvas.className).toContain('cursor-default')
  })

  it('eraser removes voxel at clicked cell', () => {
    const section = makeSection()
    setVoxelAt(section, 2, 0, 0, 9, 1)
    const { container } = renderWithProviders(
      <VxlSliceCanvas
        sections={[section]}
        sectionIndex={0}
        axis="z"
        sliceIndex={0}
        paletteBytes={new Uint8Array(768)}
        tool="eraser"
        colorIndex={0}
        normalIndex={0}
      />,
    )
    const canvas = container.querySelector('canvas')!
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 64, bottom: 64, width: 64, height: 64, x: 0, y: 0, toJSON: () => '' }),
    })
    // (2,0) cell = (40, 8)
    fireEvent.mouseDown(canvas, { clientX: 40, clientY: 8 })
    expect(getVoxelAt(section, 2, 0, 0)).toBeNull()
  })
})
