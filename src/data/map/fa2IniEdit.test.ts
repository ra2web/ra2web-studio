import { describe, expect, it } from 'vitest'
import { applyIniEdit, isPackedIniSection, listIniSections } from './fa2IniEdit'
import { MapDocument } from './MapDocument'

describe('FA2 INI editor', () => {
  it('skips packed sections and writes Basic through a full reload', () => {
    expect(isPackedIniSection('IsoMapPack5')).toBe(true)
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', name: 'Old' })
    doc.setOverlay(12, 12, 102, 4)
    const cell = doc.getCell(12, 12)
    cell.tileNum = 9
    doc.setCell(cell)
    applyIniEdit(doc, (ini) => { ini.setValue('Basic', 'Name', 'Renamed') })
    expect(doc.basic.name).toBe('Renamed')
    expect(doc.getOverlay(12, 12)).toEqual({ id: 102, value: 4 })
    expect(doc.getCell(12, 12).tileNum).toBe(9)
    expect(listIniSections(doc)).toContain('Basic')
    expect(listIniSections(doc).some((name) => name.toLowerCase() === 'isomappack5')).toBe(false)
  })

  it('keeps extra sections after SetIni-style edits', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    applyIniEdit(doc, (ini) => { ini.setValue('ScriptExtra', '1', 'abc') })
    expect(doc.toIniString()).toMatch(/\[ScriptExtra\]/)
    expect(doc.toIniString()).toMatch(/1=abc/)
  })
})
