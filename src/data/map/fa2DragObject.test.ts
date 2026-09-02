import { describe, expect, it } from 'vitest'
import { applyFa2Drag, pickFa2DragTarget } from './fa2DragObject'
import { MapDocument } from './MapDocument'
import type { MapTechno } from './types'

function techno(partial: Partial<MapTechno> & Pick<MapTechno, 'id' | 'name' | 'rx' | 'ry'>): MapTechno {
  return {
    owner: 'Americans',
    health: 256,
    direction: 64,
    mission: 'Guard',
    tag: 'none',
    veterancy: 0,
    group: -1,
    onBridge: false,
    recruitable: false,
    aiRecruitable: false,
    extra: [],
    ...partial,
  }
}

describe('pickFa2DragTarget', () => {
  it('prefers infantry then units, and uses the structure origin for foundation clicks', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.infantry.push(techno({ id: 'i1', name: 'E1', rx: 8, ry: 8, subCell: 0 }))
    doc.units.push(techno({ id: 'u1', name: 'MTNK', rx: 8, ry: 8 }))
    expect(pickFa2DragTarget(doc, 8, 8)?.kind).toBe('infantry')
    doc.infantry = []
    expect(pickFa2DragTarget(doc, 8, 8)?.id).toBe('u1')
    doc.units = []
    doc.structures.push(techno({ id: 's1', name: 'GAPOWR', rx: 6, ry: 6 }))
    expect(pickFa2DragTarget(doc, 7, 6, { GAPOWR: { w: 2, h: 2 } })).toEqual({
      kind: 'structure',
      id: 's1',
      rx: 6,
      ry: 6,
    })
  })

  it('picks start waypoints and ignores smudges', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const start = doc.waypoints.find((item) => item.number === 0)
    if (!start) throw new Error('expected start waypoint')
    expect(pickFa2DragTarget(doc, start.rx, start.ry)).toEqual({
      kind: 'waypoint',
      id: '0',
      rx: start.rx,
      ry: start.ry,
    })
    doc.smudges.push({ id: 'sm1', name: 'CR1', rx: 5, ry: 5, extra: 0 })
    expect(pickFa2DragTarget(doc, 5, 5)).toBeNull()
  })

  it('picks the infantry on the clicked subcell', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.infantry.push(techno({ id: 'i1', name: 'E1', rx: 8, ry: 8, subCell: 0 }))
    doc.infantry.push(techno({ id: 'i2', name: 'E1', rx: 8, ry: 8, subCell: 3 }))
    expect(pickFa2DragTarget(doc, 8, 8, {}, 3)?.id).toBe('i2')
    expect(pickFa2DragTarget(doc, 8, 8, {}, 0)?.id).toBe('i1')
  })
})

describe('applyFa2Drag', () => {
  it('moves a unit and Shift-copies infantry onto a free subcell', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.units.push(techno({ id: 'u1', name: 'MTNK', rx: 8, ry: 8 }))
    expect(applyFa2Drag(doc, { kind: 'unit', id: 'u1', rx: 8, ry: 8, toRx: 9, toRy: 10, copy: false })).toBe(true)
    expect(doc.units[0]).toMatchObject({ id: 'u1', rx: 9, ry: 10 })
    doc.infantry.push(techno({ id: 'i1', name: 'E1', rx: 4, ry: 4, subCell: 0 }))
    expect(applyFa2Drag(doc, { kind: 'infantry', id: 'i1', rx: 4, ry: 4, toRx: 5, toRy: 5, copy: true })).toBe(true)
    expect(doc.infantry).toHaveLength(2)
    expect(doc.infantry[0]).toMatchObject({ id: 'i1', rx: 4, ry: 4 })
    expect(doc.infantry[1]).toMatchObject({ name: 'E1', rx: 5, ry: 5 })
    expect(doc.infantry[1].id).not.toBe('i1')
  })

  it('moves a start waypoint and does not duplicate its number', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const start = doc.waypoints.find((item) => item.number === 0)
    if (!start) throw new Error('expected start waypoint')
    const from = { rx: start.rx, ry: start.ry }
    expect(applyFa2Drag(doc, { kind: 'waypoint', id: '0', rx: from.rx, ry: from.ry, toRx: 3, toRy: 4, copy: true })).toBe(true)
    expect(doc.waypoints.filter((item) => item.number === 0)).toHaveLength(1)
    expect(doc.waypoints.find((item) => item.number === 0)).toMatchObject({ rx: 3, ry: 4 })
  })
})
