import { describe, expect, it } from 'vitest'
import { CsfEncoder } from './CsfEncoder'
import { CsfFile, CsfLanguage, type CsfDraft } from './CsfFile'
import { VirtualFile } from './vfs/VirtualFile'

function parseBack(bytes: Uint8Array): CsfFile {
  const vf = VirtualFile.fromBytes(bytes, 'roundtrip.csf')
  return CsfFile.fromVirtualFile(vf)
}

describe('CsfEncoder.encode', () => {
  it('round-trips an empty entry table（header 字段保持）', () => {
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.EnglishUS,
      entries: [],
    }
    const bytes = CsfEncoder.encode(draft)
    const back = parseBack(bytes)
    expect(back.version).toBe(3)
    expect(back.language).toBe(CsfLanguage.EnglishUS)
    expect(back.entries).toHaveLength(0)
    expect(back.stats.declaredLabels).toBe(0)
    expect(back.stats.declaredValues).toBe(0)
  })

  it('round-trips ASCII entries (STR pair)', () => {
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.EnglishUS,
      entries: [
        { key: 'NAME:GDI', value: 'Global Defense Initiative' },
        { key: 'NAME:NOD', value: 'Brotherhood of Nod' },
        { key: 'EMPTY', value: '' },
      ],
    }
    const bytes = CsfEncoder.encode(draft)
    const back = parseBack(bytes)
    expect(back.entries).toHaveLength(3)
    expect(back.entries[0].key).toBe('NAME:GDI')
    expect(back.entries[0].value).toBe('Global Defense Initiative')
    expect(back.entries[0].extraValue).toBeUndefined()
    expect(back.entries[1].key).toBe('NAME:NOD')
    expect(back.entries[1].value).toBe('Brotherhood of Nod')
    expect(back.entries[2].key).toBe('EMPTY')
    expect(back.entries[2].value).toBe('')
  })

  it('round-trips STRW entries with extraValue', () => {
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.EnglishUS,
      entries: [
        { key: 'WITH:EXTRA', value: 'Main string', extraValue: 'AnnotationASCII' },
        { key: 'WITHOUT:EXTRA', value: 'No extra here' },
      ],
    }
    const bytes = CsfEncoder.encode(draft)
    const back = parseBack(bytes)
    expect(back.entries).toHaveLength(2)
    expect(back.entries[0].value).toBe('Main string')
    expect(back.entries[0].extraValue).toBe('AnnotationASCII')
    expect(back.entries[1].extraValue).toBeUndefined()
  })

  it('round-trips UTF-16 CJK characters', () => {
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.ChineseCN,
      entries: [
        { key: 'THEME:INTRO', value: '开场' },
        { key: 'NAME:坦克', value: '盟军坦克' },
      ],
    }
    const bytes = CsfEncoder.encode(draft)
    const back = parseBack(bytes)
    expect(back.language).toBe(CsfLanguage.ChineseCN)
    expect(back.entries[0].value).toBe('开场')
    expect(back.entries[1].value).toBe('盟军坦克')
  })

  it('CJK XOR bytes are actually inverted on disk', () => {
    // '开' = U+5F00；UTF-16LE bytes = [0x00, 0x5F]，XOR 0xFF → [0xFF, 0xA0]
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.ChineseCN,
      entries: [{ key: 'A', value: '开' }],
    }
    const bytes = CsfEncoder.encode(draft)
    // 文件结构：header 24 + label-magic 4 + pairCount 4 + keyLength 4 + key 1 + str-magic 4 + charLength 4 + 2 字节 value
    const valueOffset = 24 + 4 + 4 + 4 + 1 + 4 + 4
    expect(bytes[valueOffset]).toBe(0xff)
    expect(bytes[valueOffset + 1]).toBe(0xa0)
  })

  it('throws on duplicate keys', () => {
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.EnglishUS,
      entries: [
        { key: 'DUP', value: 'a' },
        { key: 'dup', value: 'b' }, // 大小写不同也算重复（toUpperCase 后）
      ],
    }
    expect(() => CsfEncoder.encode(draft)).toThrow(/duplicate/i)
  })

  it('throws on empty key', () => {
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.EnglishUS,
      entries: [{ key: '', value: 'x' }],
    }
    expect(() => CsfEncoder.encode(draft)).toThrow(/empty/i)
  })

  it('uppercases keys on encode', () => {
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.EnglishUS,
      entries: [{ key: 'lower:case', value: 'value' }],
    }
    const bytes = CsfEncoder.encode(draft)
    const back = parseBack(bytes)
    expect(back.entries[0].key).toBe('LOWER:CASE')
  })

  it('preserves header version + language across many entries', () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      key: `LBL_${i.toString(16).toUpperCase().padStart(4, '0')}`,
      value: `Value ${i}`,
    }))
    const draft: CsfDraft = {
      version: 3,
      language: CsfLanguage.German,
      entries,
    }
    const bytes = CsfEncoder.encode(draft)
    const back = parseBack(bytes)
    expect(back.version).toBe(3)
    expect(back.language).toBe(CsfLanguage.German)
    expect(back.entries).toHaveLength(50)
    expect(back.entries[25].key).toBe('LBL_0019')
    expect(back.entries[25].value).toBe('Value 25')
  })
})
