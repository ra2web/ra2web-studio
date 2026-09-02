import { describe, expect, it } from 'vitest'
import { MapIni } from './MapIni'
import { collectRulesObjectNames, formatObjectLabel, lookupObjectTitle } from './fa2ObjectLabel'

describe('fa2ObjectLabel', () => {
  it('prefers CSF via UIName then shows the type code in brackets', () => {
    const ini = MapIni.parse('[E1]\nUIName=Name:E1\nName=GI\n')
    const names = {
      ...collectRulesObjectNames(ini),
      csf: { 'NAME:E1': '美国大兵' },
    }
    expect(lookupObjectTitle('E1', names)).toBe('美国大兵')
    expect(formatObjectLabel('E1', names)).toBe('美国大兵 [E1]')
    expect(formatObjectLabel('E1', names, { missingArt: true, missingText: '素材丢失' })).toBe('美国大兵 [E1] (素材丢失)')
  })

  it('falls back to rules Name then the raw code', () => {
    const ini = MapIni.parse('[MTNK]\nName=Grizzly Tank\n[ORCA]\n')
    const names = { ...collectRulesObjectNames(ini), csf: {} }
    expect(formatObjectLabel('MTNK', names)).toBe('Grizzly Tank [MTNK]')
    expect(formatObjectLabel('ORCA', names)).toBe('ORCA')
  })
})
