import { describe, expect, it } from 'vitest'
import { MapDocument } from './MapDocument'
import { validateMap } from './mapValidate'

describe('FA2 Check map', () => {
  it('warns when a multiplayer map is missing waypoints 0-7', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
    doc.waypoints = doc.waypoints.filter((item) => item.number !== 3)
    const issues = validateMap(doc)
    expect(issues.some((issue) => issue.code === 'mp-waypoints')).toBe(true)
  })

  it('errors when a tube has no reverse counterpart', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.tubes.push({
      id: '0',
      startX: 10,
      startY: 10,
      startDir: 2,
      endX: 12,
      endY: 10,
      parts: [2, 2],
    })
    const issues = validateMap(doc)
    expect(issues.some((issue) => issue.code === 'tube-counterpart')).toBe(true)
  })

  it('accepts a bidirectional tube pair', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.tubes.push(
      { id: '0', startX: 10, startY: 10, startDir: 2, endX: 12, endY: 10, parts: [2, 2] },
      { id: '1', startX: 12, startY: 10, startDir: 6, endX: 10, endY: 10, parts: [6, 6] },
    )
    const issues = validateMap(doc)
    expect(issues.some((issue) => issue.code.startsWith('tube-'))).toBe(false)
  })
})
