import { describe, expect, it } from 'vitest'
import { parseRulesObjectLists } from './rulesObjects'

describe('parseRulesObjectLists', () => {
  it('reads FA2-style type lists from rules.ini', () => {
    const lists = parseRulesObjectLists(`
[InfantryTypes]
0=E1
1=E2
[VehicleTypes]
0=MTNK
[BuildingTypes]
0=GACNST
[OverlayTypes]
102=ORE
`)
    expect(lists.infantry).toEqual(['E1', 'E2'])
    expect(lists.units).toEqual(['MTNK'])
    expect(lists.structures).toEqual(['GACNST'])
    expect(lists.overlays).toEqual(['ORE'])
  })
})
