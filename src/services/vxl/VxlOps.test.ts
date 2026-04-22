import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { Section } from '../../data/vxl/Section'
import {
  cloneSection, floodFill2D, getVoxelAt, removeVoxelAt,
  replaceColor, resizeSectionNearest, setVoxelAt,
} from './VxlOps'

function makeSection(): Section {
  const s = new Section()
  s.name = 'TEST'
  s.normalsMode = 2
  s.sizeX = 4
  s.sizeY = 4
  s.sizeZ = 4
  s.hvaMultiplier = 1
  s.transfMatrix = new THREE.Matrix4().identity()
  s.minBounds = new THREE.Vector3(-2, -2, -2)
  s.maxBounds = new THREE.Vector3(2, 2, 2)
  s.spans = []
  return s
}

describe('VxlOps', () => {
  it('setVoxelAt + getVoxelAt round-trip', () => {
    const s = makeSection()
    expect(getVoxelAt(s, 1, 2, 3)).toBeNull()
    expect(setVoxelAt(s, 1, 2, 3, 17, 5)).toBe(true)
    expect(getVoxelAt(s, 1, 2, 3)).toEqual({ x: 1, y: 2, z: 3, colorIndex: 17, normalIndex: 5 })
    // setting same value returns false (no change)
    expect(setVoxelAt(s, 1, 2, 3, 17, 5)).toBe(false)
    // changing one field returns true
    expect(setVoxelAt(s, 1, 2, 3, 18, 5)).toBe(true)
    expect(getVoxelAt(s, 1, 2, 3)?.colorIndex).toBe(18)
  })

  it('voxels are inserted in z-ascending order', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 3, 1, 0)
    setVoxelAt(s, 0, 0, 0, 2, 0)
    setVoxelAt(s, 0, 0, 2, 3, 0)
    const span = s.spans.find((sp) => sp.x === 0 && sp.y === 0)!
    expect(span.voxels.map((v) => v.z)).toEqual([0, 2, 3])
  })

  it('removeVoxelAt removes only target z', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 1, 1, 0)
    setVoxelAt(s, 0, 0, 2, 2, 0)
    expect(removeVoxelAt(s, 0, 0, 1)).toBe(true)
    expect(getVoxelAt(s, 0, 0, 1)).toBeNull()
    expect(getVoxelAt(s, 0, 0, 2)).not.toBeNull()
    expect(removeVoxelAt(s, 0, 0, 1)).toBe(false)
  })

  it('out-of-bounds setVoxelAt is silently ignored', () => {
    const s = makeSection()
    expect(setVoxelAt(s, -1, 0, 0, 1, 0)).toBe(false)
    expect(setVoxelAt(s, 0, 4, 0, 1, 0)).toBe(false)
    expect(s.spans.length).toBe(0)
  })

  it('replaceColor swaps only matching color', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 0, 5, 1)
    setVoxelAt(s, 1, 0, 0, 5, 2)
    setVoxelAt(s, 2, 0, 0, 7, 3)
    expect(replaceColor(s, 5, 9)).toBe(2)
    expect(getVoxelAt(s, 0, 0, 0)?.colorIndex).toBe(9)
    expect(getVoxelAt(s, 1, 0, 0)?.colorIndex).toBe(9)
    expect(getVoxelAt(s, 2, 0, 0)?.colorIndex).toBe(7)
    // normals preserved
    expect(getVoxelAt(s, 0, 0, 0)?.normalIndex).toBe(1)
    expect(getVoxelAt(s, 1, 0, 0)?.normalIndex).toBe(2)
  })

  it('replaceColor with same indices is a no-op', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 0, 5, 1)
    expect(replaceColor(s, 5, 5)).toBe(0)
  })

  it('floodFill2D fills connected same-color region in slice plane', () => {
    const s = makeSection()
    // 一个 3x3 同色块在 z=0 平面：
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) setVoxelAt(s, x, y, 0, 5, 0)
    // 一个 disconnected 同色块
    setVoxelAt(s, 3, 3, 0, 5, 0)
    // 不同色作为屏障：把 (1,2,0) 改成 9，分割连通性 → 没用，因为还是 4-way 连通
    const filled = floodFill2D(s, 'z', 0, 0, 0, 9, 0)
    expect(filled).toBe(9) // 3x3 = 9 个，不会跨越到 (3,3)
    expect(getVoxelAt(s, 3, 3, 0)?.colorIndex).toBe(5)
    expect(getVoxelAt(s, 0, 0, 0)?.colorIndex).toBe(9)
  })

  it('cloneSection creates deep copy', () => {
    const s = makeSection()
    setVoxelAt(s, 1, 2, 3, 17, 5)
    const c = cloneSection(s, 'CLONED')
    expect(c.name).toBe('CLONED')
    expect(c.spans.length).toBe(1)
    // 改原始 → clone 不变
    setVoxelAt(s, 1, 2, 3, 99, 5)
    expect(getVoxelAt(c, 1, 2, 3)?.colorIndex).toBe(17)
    // 改 clone → 原始不变
    setVoxelAt(c, 0, 0, 0, 7, 0)
    expect(getVoxelAt(s, 0, 0, 0)).toBeNull()
  })

  it('resizeSectionNearest doubles voxel positions', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 0, 5, 0)
    setVoxelAt(s, 3, 3, 3, 7, 0)
    resizeSectionNearest(s, 8, 8, 8)
    expect(s.sizeX).toBe(8)
    expect(s.sizeY).toBe(8)
    expect(s.sizeZ).toBe(8)
    // 公式: floor((v + 0.5) * new / old)
    // (0,0,0) → floor(0.5 * 8 / 4) = 1
    // (3,3,3) → floor(3.5 * 8 / 4) = 7
    expect(getVoxelAt(s, 1, 1, 1)?.colorIndex).toBe(5)
    expect(getVoxelAt(s, 7, 7, 7)?.colorIndex).toBe(7)
  })

  it('resizeSectionNearest no-op when sizes match', () => {
    const s = makeSection()
    setVoxelAt(s, 1, 1, 1, 5, 0)
    const before = s.spans.map((sp) => ({ x: sp.x, y: sp.y, voxels: sp.voxels.slice() }))
    resizeSectionNearest(s, 4, 4, 4)
    expect(s.spans).toEqual(before)
  })
})
