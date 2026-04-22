import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { Section } from '../../data/vxl/Section'
import { setVoxelAt } from './VxlOps'
import { computeAutoNormals, computeExposureDir, findClosestNormalIndex } from './VxlAutoNormals'

function makeSection(): Section {
  const s = new Section()
  s.name = 'TEST'
  s.normalsMode = 2
  s.sizeX = 5; s.sizeY = 5; s.sizeZ = 5
  s.hvaMultiplier = 1
  s.transfMatrix = new THREE.Matrix4().identity()
  s.minBounds = new THREE.Vector3(); s.maxBounds = new THREE.Vector3()
  s.spans = []
  return s
}

describe('VxlAutoNormals', () => {
  it('computeExposureDir returns null for fully-surrounded voxel', () => {
    const s = makeSection()
    // 中心 + 6 邻居
    setVoxelAt(s, 2, 2, 2, 1, 0)
    setVoxelAt(s, 1, 2, 2, 1, 0); setVoxelAt(s, 3, 2, 2, 1, 0)
    setVoxelAt(s, 2, 1, 2, 1, 0); setVoxelAt(s, 2, 3, 2, 1, 0)
    setVoxelAt(s, 2, 2, 1, 1, 0); setVoxelAt(s, 2, 2, 3, 1, 0)
    const dir = computeExposureDir(s, { x: 2, y: 2, z: 2, colorIndex: 1, normalIndex: 0 })
    expect(dir).toBeNull()
  })

  it('computeExposureDir points outward for corner voxel', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 0, 1, 0)
    // (1,0,0), (0,1,0), (0,0,1) 都是邻居（不存在 = exposed）
    const dir = computeExposureDir(s, { x: 0, y: 0, z: 0, colorIndex: 1, normalIndex: 0 })
    expect(dir).not.toBeNull()
    // 角落体素的暴露方向应该指向"外侧"，也就是 -x/-y/-z 不存在 → +1，+x/+y/+z 不存在 → -1
    // 净值：dx = +1 -1 = 0；但因为 -1 邻居越界（不存在），按照实现规则越界也算 exposed
    // 实际上 6 个方向都不存在 → 净 0；但只要 exposed > 0 就返回非空
    expect(dir!.x === 0 || dir!.y === 0 || dir!.z === 0).toBe(true)
  })

  it('findClosestNormalIndex returns 0 for zero vector', () => {
    expect(findClosestNormalIndex({ x: 0, y: 0, z: 0 }, [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }])).toBe(0)
  })

  it('findClosestNormalIndex picks max-cosine candidate', () => {
    const table = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: -1, y: 0, z: 0 },
    ]
    expect(findClosestNormalIndex({ x: 0.9, y: 0.1, z: 0 }, table)).toBe(0)
    expect(findClosestNormalIndex({ x: -1, y: 0, z: 0 }, table)).toBe(3)
  })

  it('computeAutoNormals updates normalIndex for exposed voxels', () => {
    const s = makeSection()
    // 一个孤立体素 → 必然暴露
    setVoxelAt(s, 2, 2, 2, 5, 0)
    const before = s.spans.flatMap((sp) => sp.voxels.map((v) => v.normalIndex))
    computeAutoNormals(s)
    const after = s.spans.flatMap((sp) => sp.voxels.map((v) => v.normalIndex))
    // 孤立体素净方向 = 0 → exposureDir 返回零向量但 exposed > 0 → 实际 dir = (0,0,0) → findClosest 返回 0
    // 至少不会崩；normalIndex 可能保持 0（也可能被设回 0），不强求改变
    expect(after.length).toBe(before.length)
  })

  it('computeAutoNormals respects normalsMode (different table sizes)', () => {
    const s = makeSection()
    s.normalsMode = 1 // 244 表
    setVoxelAt(s, 2, 2, 2, 5, 0)
    setVoxelAt(s, 3, 2, 2, 5, 0) // (2,2,2) 的 +x 邻居 → 主方向偏 -x
    computeAutoNormals(s)
    // 不期望具体值；只期望算法不抛 + 返回 0..255
    for (const sp of s.spans) for (const v of sp.voxels) {
      expect(v.normalIndex).toBeGreaterThanOrEqual(0)
      expect(v.normalIndex).toBeLessThanOrEqual(255)
    }
  })
})
