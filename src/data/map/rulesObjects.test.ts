import { describe, expect, it } from 'vitest'
import { parseBuildingFoundations, parseRulesObjectLists } from './rulesObjects'

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

  it('reads Foundation=WxH for building outlines', () => {
    const foundations = parseBuildingFoundations(`
[BuildingTypes]
0=GACNST
1=GAPILL
[GACNST]
Foundation=3x4
[GAPILL]
Foundation=1x1
`)
    expect(foundations.GACNST).toEqual({ w: 3, h: 4 })
    expect(foundations.GAPILL).toEqual({ w: 1, h: 1 })
  })

  it('reads Foundation from art.ini Image= chain when rules has no Foundation', () => {
    const foundations = parseBuildingFoundations(`
[BuildingTypes]
0=GAPOWR
[GAPOWR]
Image=GAPOWR
`, `
[GAPOWR]
Foundation=2x3
BibShape=GAPOWRB
`)
    expect(foundations.GAPOWR).toEqual({ w: 2, h: 3 })
  })
})
