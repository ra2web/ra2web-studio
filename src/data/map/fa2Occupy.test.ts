import { describe, expect, it } from 'vitest'
import { MapDocument } from './MapDocument'
import { canPlaceStructure, foundationCells, structureAt } from './fa2Occupy'

describe('fa2Occupy', () => {
  it('occupies w along +ry and h along +rx', () => {
    expect(foundationCells(10, 20, { w: 2, h: 3 })).toEqual([
      { rx: 10, ry: 20 },
      { rx: 11, ry: 20 },
      { rx: 12, ry: 20 },
      { rx: 10, ry: 21 },
      { rx: 11, ry: 21 },
      { rx: 12, ry: 21 },
    ])
  })

  it('rejects overlapping building foundations except GAPAVE', () => {
    const doc = MapDocument.create({ width: 20, height: 20, theater: 'TEMPERATE' })
    doc.structures.push({
      id: '1', owner: 'Americans', name: 'GAPOWR', health: 256, rx: 8, ry: 8,
      direction: 64, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
      onBridge: false, recruitable: false, aiRecruitable: false, extra: [],
    })
    const foundations = { GAPOWR: { w: 2, h: 3 }, GACNST: { w: 4, h: 4 }, GAPAVE: { w: 4, h: 4 } }
    expect(canPlaceStructure(doc, 8, 8, 'GACNST', foundations)).toBe(false)
    expect(canPlaceStructure(doc, 9, 8, 'GACNST', foundations)).toBe(false)
    expect(canPlaceStructure(doc, 12, 12, 'GACNST', foundations)).toBe(true)
    expect(canPlaceStructure(doc, 8, 8, 'GAPAVE', foundations)).toBe(true)
    expect(structureAt(doc, 9, 8, foundations)?.name).toBe('GAPOWR')
  })
})
