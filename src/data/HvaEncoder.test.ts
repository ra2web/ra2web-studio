import { Matrix4 } from 'three'
import { describe, expect, it } from 'vitest'
import { HvaEncoder } from './HvaEncoder'
import { HvaFile, HvaSection } from './HvaFile'
import { VirtualFile } from './vfs/VirtualFile'

function makeHvaSection(name: string, matrices: Matrix4[]): HvaSection {
  const s = new HvaSection()
  s.name = name
  s.matrices = matrices
  return s
}

function parseBack(bytes: Uint8Array): HvaFile {
  const vf = VirtualFile.fromBytes(bytes, 'roundtrip.hva')
  return new HvaFile(vf)
}

describe('HvaEncoder.encode', () => {
  it('round-trips a single section single frame (identity matrix)', () => {
    const section = makeHvaSection('HULL', [new Matrix4().identity()])
    const bytes = HvaEncoder.encode({ sections: [section] })
    const back = parseBack(bytes)
    expect(back.sections).toHaveLength(1)
    expect(back.sections[0].name).toBe('HULL')
    expect(back.sections[0].matrices).toHaveLength(1)
    // 解析回来的 identity 矩阵 elements 应严格 = single 1 沿对角线
    const m = back.sections[0].matrices[0]
    expect(m.elements[0]).toBe(1)
    expect(m.elements[5]).toBe(1)
    expect(m.elements[10]).toBe(1)
    expect(m.elements[15]).toBe(1)
  })

  it('round-trips multi-section × multi-frame in correct order', () => {
    const m0 = new Matrix4().makeTranslation(1, 0, 0)
    const m1 = new Matrix4().makeTranslation(2, 0, 0)
    const m2 = new Matrix4().makeTranslation(3, 0, 0)
    const m3 = new Matrix4().makeTranslation(4, 0, 0)
    const sectionA = makeHvaSection('SECA', [m0, m1])
    const sectionB = makeHvaSection('SECB', [m2, m3])
    const bytes = HvaEncoder.encode({ sections: [sectionA, sectionB] })
    const back = parseBack(bytes)
    expect(back.sections).toHaveLength(2)
    expect(back.sections[0].name).toBe('SECA')
    expect(back.sections[1].name).toBe('SECB')
    expect(back.sections[0].matrices[0].elements[12]).toBeCloseTo(1, 5)
    expect(back.sections[0].matrices[1].elements[12]).toBeCloseTo(2, 5)
    expect(back.sections[1].matrices[0].elements[12]).toBeCloseTo(3, 5)
    expect(back.sections[1].matrices[1].elements[12]).toBeCloseTo(4, 5)
  })

  it('round-trips 4x3 transform components precisely', () => {
    const m = new Matrix4().set(
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      0, 0, 0, 1,
    )
    const section = makeHvaSection('M', [m])
    const bytes = HvaEncoder.encode({ sections: [section] })
    const back = parseBack(bytes)
    const got = back.sections[0].matrices[0]
    // 验证前 12 个 row-major 值（最后一行 0,0,0,1 由解析侧固定补）
    expect(got.elements[0]).toBeCloseTo(1, 5) // (0,0)
    expect(got.elements[4]).toBeCloseTo(2, 5) // (0,1)
    expect(got.elements[8]).toBeCloseTo(3, 5) // (0,2)
    expect(got.elements[12]).toBeCloseTo(4, 5) // (0,3)
    expect(got.elements[1]).toBeCloseTo(5, 5) // (1,0)
    expect(got.elements[5]).toBeCloseTo(6, 5) // (1,1)
    expect(got.elements[2]).toBeCloseTo(9, 5) // (2,0)
    expect(got.elements[10]).toBeCloseTo(11, 5) // (2,2)
    expect(got.elements[14]).toBeCloseTo(12, 5) // (2,3)
  })

  it('truncates section name to 16 bytes', () => {
    // 17 字符名字应被截断到 16 字节
    const longName = 'A'.repeat(20)
    const section = makeHvaSection(longName, [new Matrix4().identity()])
    const bytes = HvaEncoder.encode({ sections: [section] })
    const back = parseBack(bytes)
    expect(back.sections[0].name.length).toBeLessThanOrEqual(16)
    expect(back.sections[0].name).toBe('A'.repeat(16))
  })

  it('throws when sections list is empty', () => {
    expect(() => HvaEncoder.encode({ sections: [] })).toThrow(/at least one section/i)
  })

  it('throws when sections have mismatched frame counts', () => {
    const a = makeHvaSection('A', [new Matrix4().identity()])
    const b = makeHvaSection('B', [new Matrix4().identity(), new Matrix4().identity()])
    expect(() => HvaEncoder.encode({ sections: [a, b] })).toThrow(/frame count/i)
  })
})
