import { describe, expect, it } from 'vitest'
import { countOverlaps, shapeToVoxels, type ShapeParams, type SectionSize } from './VxlShapeBuilder'

const SIZE: SectionSize = { x: 32, y: 32, z: 32 }

function defaultParams(): ShapeParams {
  return {
    kind: 'box',
    x0: 4, y0: 4, z0: 4,
    sx: 8, sy: 8, sz: 8,
    hollow: false,
    wallThickness: 1,
    cylinderAxis: 'z',
  }
}

describe('VxlShapeBuilder', () => {
  it('solid box: voxel count = sx * sy * sz', () => {
    const v = shapeToVoxels({ ...defaultParams(), sx: 5, sy: 4, sz: 3 }, SIZE)
    expect(v.length).toBe(5 * 4 * 3)
  })

  it('hollow box wt=1: voxel count = total - inner cube', () => {
    const total = 8 * 8 * 8
    const inner = 6 * 6 * 6 // (sx-2*wt)^3
    const v = shapeToVoxels({ ...defaultParams(), hollow: true, wallThickness: 1 }, SIZE)
    expect(v.length).toBe(total - inner)
  })

  it('hollow box wt=2: thicker shell', () => {
    const total = 8 * 8 * 8
    const inner = 4 * 4 * 4
    const v = shapeToVoxels({ ...defaultParams(), hollow: true, wallThickness: 2 }, SIZE)
    expect(v.length).toBe(total - inner)
  })

  it('hollow box: when wt >= half size, becomes effectively solid', () => {
    // 8x8x8 box, wt = 4 → 全部都在壳上
    const v = shapeToVoxels({ ...defaultParams(), hollow: true, wallThickness: 4 }, SIZE)
    expect(v.length).toBe(8 * 8 * 8)
  })

  it('solid sphere: contains center, excludes far corner', () => {
    const v = shapeToVoxels({ ...defaultParams(), kind: 'sphere' }, SIZE)
    const set = new Set(v.map(([x, y, z]) => `${x},${y},${z}`))
    // 中心一定在
    expect(set.has('7,7,7')).toBe(true)
    expect(set.has('8,8,8')).toBe(true)
    // 包围盒角不应在球内（8/2=4 半径，对角距离 ~6.9 > 4）
    expect(set.has('4,4,4')).toBe(false)
    expect(set.has('11,11,11')).toBe(false)
  })

  it('hollow sphere: center is empty, surface is filled', () => {
    const solid = shapeToVoxels({ ...defaultParams(), kind: 'sphere' }, SIZE)
    const hollow = shapeToVoxels({ ...defaultParams(), kind: 'sphere', hollow: true, wallThickness: 1 }, SIZE)
    expect(hollow.length).toBeLessThan(solid.length)
    expect(hollow.length).toBeGreaterThan(0)
  })

  it('cylinder along Z: extends full Z range', () => {
    const v = shapeToVoxels({
      ...defaultParams(), kind: 'cylinder', cylinderAxis: 'z',
      sx: 8, sy: 8, sz: 10,
    }, SIZE)
    const zs = new Set(v.map(([, , z]) => z))
    expect(zs.size).toBe(10)
    // 中心列 (7,7,*) 应该被全长覆盖（在 XY 椭圆中心）
    const onAxis = v.filter(([x, y]) => x === 7 && y === 7)
    expect(onAxis.length).toBe(10)
  })

  it('cylinder along X: extends full X range, no Z below z0', () => {
    const v = shapeToVoxels({
      ...defaultParams(), kind: 'cylinder', cylinderAxis: 'x',
      x0: 4, y0: 4, z0: 4, sx: 12, sy: 8, sz: 8,
    }, SIZE)
    const xs = new Set(v.map(([x]) => x))
    expect(xs.size).toBe(12)
    // 没有 z < 4 或 z >= 12 的体素
    expect(v.every(([, , z]) => z >= 4 && z < 12)).toBe(true)
  })

  it('clamps to section size: voxels never out of bounds', () => {
    const small: SectionSize = { x: 6, y: 6, z: 6 }
    const v = shapeToVoxels({ ...defaultParams(), x0: 4, y0: 4, z0: 4, sx: 8, sy: 8, sz: 8 }, small)
    // box 包围盒 (4..11)，但 size=6 → clamp 到 (4..5)
    expect(v.every(([x, y, z]) => x < 6 && y < 6 && z < 6)).toBe(true)
    expect(v.length).toBe(2 * 2 * 2)
  })

  it('countOverlaps reports voxels intersecting occupied set', () => {
    const v: Array<[number, number, number]> = [[0, 0, 0], [1, 0, 0], [2, 0, 0]]
    const occupied = new Set(['1,0,0'])
    const n = countOverlaps(v, (x, y, z) => occupied.has(`${x},${y},${z}`))
    expect(n).toBe(1)
  })

  it('size 1 box = single voxel at origin', () => {
    const v = shapeToVoxels({ ...defaultParams(), sx: 1, sy: 1, sz: 1 }, SIZE)
    expect(v).toEqual([[4, 4, 4]])
  })
})
