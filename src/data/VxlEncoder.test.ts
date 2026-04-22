import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { VxlEncoder } from './VxlEncoder'
import { VxlFile } from './VxlFile'
import { VirtualFile } from './vfs/VirtualFile'
import { Section, type Voxel } from './vxl/Section'

function makePalette(): Uint8Array {
  // 256 个不同的 RGB triplets：r=g=b=index 的灰阶
  const out = new Uint8Array(768)
  for (let i = 0; i < 256; i++) {
    out[i * 3] = i
    out[i * 3 + 1] = i
    out[i * 3 + 2] = i
  }
  return out
}

function makeSection(name: string, sizeX: number, sizeY: number, sizeZ: number): Section {
  const s = new Section()
  s.name = name
  s.normalsMode = 2
  s.sizeX = sizeX
  s.sizeY = sizeY
  s.sizeZ = sizeZ
  s.hvaMultiplier = 1
  s.transfMatrix = new THREE.Matrix4().identity()
  s.minBounds = new THREE.Vector3(0, 0, 0)
  s.maxBounds = new THREE.Vector3(sizeX, sizeY, sizeZ)
  // 初始化空 spans 数组：每 (x,y) 一条空 span
  s.spans = []
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      s.spans.push({ x, y, voxels: [] })
    }
  }
  return s
}

function setVoxel(s: Section, x: number, y: number, v: Voxel): void {
  const span = s.spans.find((sp) => sp.x === x && sp.y === y)
  if (!span) throw new Error('span missing')
  span.voxels.push(v)
}

function parseBack(bytes: Uint8Array): VxlFile {
  const vf = VirtualFile.fromBytes(bytes, 'roundtrip.vxl')
  const file = new VxlFile()
  file.fromVirtualFile(vf)
  return file
}

describe('VxlEncoder.encode', () => {
  it('round-trips an empty section list (palette only)', () => {
    const palette = makePalette()
    const bytes = VxlEncoder.encode({ embeddedPalette: palette, sections: [] })
    const back = parseBack(bytes)
    expect(back.sections).toHaveLength(0)
    expect(back.embeddedPalette).toHaveLength(768)
    expect(back.embeddedPalette[0]).toBe(0)
    expect(back.embeddedPalette[3 * 7 + 1]).toBe(7) // r=g=b=7 at index 7
  })

  it('round-trips a single section with one voxel', () => {
    const palette = makePalette()
    const section = makeSection('BARREL', 4, 4, 4)
    setVoxel(section, 2, 1, { x: 2, y: 1, z: 3, colorIndex: 42, normalIndex: 17 })
    const bytes = VxlEncoder.encode({ embeddedPalette: palette, sections: [section] })
    const back = parseBack(bytes)
    expect(back.sections).toHaveLength(1)
    const s = back.sections[0]
    expect(s.name).toBe('BARREL')
    expect(s.sizeX).toBe(4)
    expect(s.sizeY).toBe(4)
    expect(s.sizeZ).toBe(4)
    expect(s.normalsMode).toBe(2)
    expect(back.voxelCount).toBe(1)
    const span = s.spans.find((sp) => sp.x === 2 && sp.y === 1)
    expect(span).toBeTruthy()
    expect(span!.voxels).toHaveLength(1)
    expect(span!.voxels[0]).toMatchObject({ x: 2, y: 1, z: 3, colorIndex: 42, normalIndex: 17 })
  })

  it('round-trips a span with multiple consecutive voxels (single run)', () => {
    const palette = makePalette()
    const section = makeSection('TUBE', 2, 2, 8)
    setVoxel(section, 0, 0, { x: 0, y: 0, z: 2, colorIndex: 1, normalIndex: 1 })
    setVoxel(section, 0, 0, { x: 0, y: 0, z: 3, colorIndex: 2, normalIndex: 1 })
    setVoxel(section, 0, 0, { x: 0, y: 0, z: 4, colorIndex: 3, normalIndex: 1 })
    const bytes = VxlEncoder.encode({ embeddedPalette: palette, sections: [section] })
    const back = parseBack(bytes)
    const span = back.sections[0].spans.find((sp) => sp.x === 0 && sp.y === 0)
    expect(span!.voxels.map((v) => v.colorIndex)).toEqual([1, 2, 3])
    expect(span!.voxels.map((v) => v.z)).toEqual([2, 3, 4])
  })

  it('round-trips a span with two non-adjacent runs (skip gap)', () => {
    const palette = makePalette()
    const section = makeSection('GAP', 1, 1, 16)
    setVoxel(section, 0, 0, { x: 0, y: 0, z: 1, colorIndex: 10, normalIndex: 0 })
    setVoxel(section, 0, 0, { x: 0, y: 0, z: 2, colorIndex: 11, normalIndex: 0 })
    setVoxel(section, 0, 0, { x: 0, y: 0, z: 9, colorIndex: 20, normalIndex: 0 })
    setVoxel(section, 0, 0, { x: 0, y: 0, z: 10, colorIndex: 21, normalIndex: 0 })
    const bytes = VxlEncoder.encode({ embeddedPalette: palette, sections: [section] })
    const back = parseBack(bytes)
    const span = back.sections[0].spans.find((sp) => sp.x === 0 && sp.y === 0)
    expect(span!.voxels.map((v) => v.z)).toEqual([1, 2, 9, 10])
    expect(span!.voxels.map((v) => v.colorIndex)).toEqual([10, 11, 20, 21])
  })

  it('round-trips multi-section + custom transform matrix', () => {
    const palette = makePalette()
    const s1 = makeSection('HULL', 3, 3, 3)
    setVoxel(s1, 1, 1, { x: 1, y: 1, z: 1, colorIndex: 5, normalIndex: 5 })
    const s2 = makeSection('TURRET', 2, 2, 2)
    s2.hvaMultiplier = 2.5
    s2.transfMatrix = new THREE.Matrix4().makeTranslation(1, 2, 3)
    setVoxel(s2, 0, 0, { x: 0, y: 0, z: 0, colorIndex: 99, normalIndex: 0 })

    const bytes = VxlEncoder.encode({ embeddedPalette: palette, sections: [s1, s2] })
    const back = parseBack(bytes)
    expect(back.sections).toHaveLength(2)
    expect(back.sections[0].name).toBe('HULL')
    expect(back.sections[1].name).toBe('TURRET')
    expect(back.sections[1].hvaMultiplier).toBeCloseTo(2.5, 5)
    // 平移矩阵的 (0,3) (1,3) (2,3) 应分别为 1, 2, 3
    expect(back.sections[1].transfMatrix.elements[12]).toBeCloseTo(1, 5)
    expect(back.sections[1].transfMatrix.elements[13]).toBeCloseTo(2, 5)
    expect(back.sections[1].transfMatrix.elements[14]).toBeCloseTo(3, 5)
  })

  it('throws when section sizeX/Y is invalid', () => {
    const palette = makePalette()
    const s = makeSection('X', 2, 2, 2)
    s.sizeX = 0
    expect(() => VxlEncoder.encode({ embeddedPalette: palette, sections: [s] })).toThrow(
      /invalid sizeX/i,
    )
  })

  it('pads short palette to 768 bytes', () => {
    const palette = new Uint8Array([1, 2, 3])
    const bytes = VxlEncoder.encode({ embeddedPalette: palette, sections: [] })
    const back = parseBack(bytes)
    expect(back.embeddedPalette).toHaveLength(768)
    expect(back.embeddedPalette[0]).toBe(1)
    expect(back.embeddedPalette[1]).toBe(2)
    expect(back.embeddedPalette[2]).toBe(3)
    expect(back.embeddedPalette[3]).toBe(0)
  })
})
