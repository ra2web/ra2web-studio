import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { Section } from '../../data/vxl/Section'
import { setVoxelAt } from './VxlOps'
import { classifyVoxels, countConnectedComponents, planSplit, type SplitPlane } from './VxlSplit'

function makeSection(): Section {
  const s = new Section()
  s.name = 'TEST'
  s.normalsMode = 2
  s.sizeX = 16; s.sizeY = 16; s.sizeZ = 16
  s.hvaMultiplier = 1
  s.transfMatrix = new THREE.Matrix4().identity()
  s.minBounds = new THREE.Vector3(); s.maxBounds = new THREE.Vector3()
  s.spans = []
  return s
}

function fillBox(s: Section, x0: number, y0: number, z0: number, sx: number, sy: number, sz: number, color = 1) {
  for (let z = z0; z < z0 + sz; z++) for (let y = y0; y < y0 + sy; y++) for (let x = x0; x < x0 + sx; x++) {
    setVoxelAt(s, x, y, z, color, 0)
  }
}

describe('VxlSplit', () => {
  it('classifyVoxels: full-range plane on X splits a 4x4x4 cube cleanly', () => {
    const s = makeSection()
    fillBox(s, 0, 0, 0, 4, 4, 4)
    const plane: SplitPlane = {
      axis: 'x', k: 2,
      rangeAMin: 0, rangeAMax: 15,
      rangeBMin: 0, rangeBMax: 15,
    }
    const { sideA, sideB, untouched } = classifyVoxels(s, plane)
    expect(sideA.length).toBe(2 * 4 * 4)
    expect(sideB.length).toBe(2 * 4 * 4)
    expect(untouched.length).toBe(0)
  })

  it('classifyVoxels: limited Y range only touches voxels inside that band', () => {
    const s = makeSection()
    fillBox(s, 0, 0, 0, 4, 4, 4) // 64 voxels total
    const plane: SplitPlane = {
      axis: 'x', k: 2,
      rangeAMin: 1, rangeAMax: 2, // y∈[1,2]
      rangeBMin: 0, rangeBMax: 3, // z∈[0,3]
    }
    const { sideA, sideB, untouched } = classifyVoxels(s, plane)
    // 在 Y∈[1,2] 范围内的 voxels = 2(y) * 4(x) * 4(z) = 32；分两半
    expect(sideA.length).toBe(2 * 2 * 4)
    expect(sideB.length).toBe(2 * 2 * 4)
    // 不在 Y 范围内：y=0 和 y=3 → 2 * 4 * 4 = 32
    expect(untouched.length).toBe(32)
  })

  it('planSplit: choosing A side returns single component on simple cube', () => {
    const s = makeSection()
    fillBox(s, 0, 0, 0, 4, 4, 4)
    const plane: SplitPlane = {
      axis: 'x', k: 2,
      rangeAMin: 0, rangeAMax: 15,
      rangeBMin: 0, rangeBMax: 15,
    }
    const r = planSplit(s, plane, 'A')
    expect(r.moved.length).toBe(2 * 4 * 4)
    expect(r.movedComponents).toBe(1)
    expect(r.ok).toBe(true)
    expect(r.remain.length).toBe(2 * 4 * 4)
  })

  it('planSplit: chosen side empty returns ok=false', () => {
    const s = makeSection()
    // 只在 x=0..1 有体素
    fillBox(s, 0, 0, 0, 2, 4, 4)
    const plane: SplitPlane = {
      axis: 'x', k: 5, // k 比所有 voxel 都大 → B 侧空
      rangeAMin: 0, rangeAMax: 15,
      rangeBMin: 0, rangeBMax: 15,
    }
    const r = planSplit(s, plane, 'B')
    expect(r.moved.length).toBe(0)
    expect(r.movedComponents).toBe(0)
    expect(r.ok).toBe(false)
  })

  it('planSplit: chosen side has multiple components → ok=false', () => {
    const s = makeSection()
    // 两个互不接触的 2x2x2 块，都在切面 A 侧（x<5）
    fillBox(s, 0, 0, 0, 2, 2, 2)
    fillBox(s, 0, 5, 0, 2, 2, 2) // y 方向间隔 1 不接触
    const plane: SplitPlane = {
      axis: 'x', k: 5,
      rangeAMin: 0, rangeAMax: 15,
      rangeBMin: 0, rangeBMax: 15,
    }
    const r = planSplit(s, plane, 'A')
    expect(r.moved.length).toBe(16)
    expect(r.movedComponents).toBe(2)
    expect(r.ok).toBe(false)
  })

  it('countConnectedComponents: face-adjacent voxels are 1 component', () => {
    const vs = [
      { x: 0, y: 0, z: 0, colorIndex: 1, normalIndex: 0 },
      { x: 1, y: 0, z: 0, colorIndex: 1, normalIndex: 0 },
      { x: 1, y: 1, z: 0, colorIndex: 1, normalIndex: 0 },
    ]
    expect(countConnectedComponents(vs)).toBe(1)
  })

  it('countConnectedComponents: diagonal-only voxels are NOT connected', () => {
    const vs = [
      { x: 0, y: 0, z: 0, colorIndex: 1, normalIndex: 0 },
      { x: 1, y: 1, z: 0, colorIndex: 1, normalIndex: 0 },
    ]
    expect(countConnectedComponents(vs)).toBe(2)
  })

  it('planSplit on Y axis with limited X range', () => {
    const s = makeSection()
    fillBox(s, 0, 0, 0, 4, 4, 4)
    const plane: SplitPlane = {
      axis: 'y', k: 2,
      rangeAMin: 1, rangeAMax: 2, // x∈[1,2]
      rangeBMin: 0, rangeBMax: 3, // z∈[0,3]
    }
    const r = planSplit(s, plane, 'B')
    // 在 X∈[1,2] 的 voxels = 2 * 4(y) * 4(z) = 32；y>=2 → B = 2 * 2 * 4 = 16
    expect(r.moved.length).toBe(16)
    // X∈[0]∪[3] 没碰，全留下 + sideA
    expect(r.remain.length).toBe(64 - 16)
  })
})
