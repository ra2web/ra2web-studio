import { describe, expect, it } from 'vitest'
import { MapDocument } from './MapDocument'
import {
  deleteWaypointAt,
  FA2_SP_HOME_WAYPOINT,
  FA2_SP_HOME_WAYPOINT_NEXT,
  firstMissingStartWaypoint,
  nextFreeWaypointNumber,
  placeFa2Waypoint,
} from './fa2Waypoint'

function mpDoc(): MapDocument {
  return MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
}

describe('placeFa2Waypoint', () => {
  it('moves an existing start waypoint instead of appending a new id', () => {
    const doc = mpDoc()
    expect(doc.waypoints).toHaveLength(8)
    const result = placeFa2Waypoint(doc, 2, 3, { startNumber: 3 })
    expect(result).toEqual({ placed: true, number: 3 })
    expect(doc.waypoints).toHaveLength(8)
    expect(doc.waypoints.filter((item) => item.number === 3)).toHaveLength(1)
    expect(doc.waypoints.find((item) => item.number === 3)).toMatchObject({ rx: 2, ry: 3 })
  })

  it('does not place on a cell that already has a waypoint', () => {
    const doc = mpDoc()
    const occupied = doc.waypoints[0]
    const snapshot = doc.waypoints.map((item) => ({ ...item }))
    expect(placeFa2Waypoint(doc, occupied.rx, occupied.ry, { startNumber: 3 }).placed).toBe(false)
    expect(doc.waypoints).toEqual(snapshot)
  })

  it('creates the next free waypoint id like FA2 GetFree(Waypoints)', () => {
    const doc = mpDoc()
    expect(nextFreeWaypointNumber(doc.waypoints)).toBe(8)
    const result = placeFa2Waypoint(doc, 2, 3)
    expect(result).toEqual({ placed: true, number: 8 })
    expect(doc.waypoints.some((item) => item.number === 8 && item.rx === 2 && item.ry === 3)).toBe(true)
  })

  it('fills a skipped start index before the selected player', () => {
    const doc = mpDoc()
    doc.waypoints = doc.waypoints.filter((item) => item.number !== 1)
    expect(firstMissingStartWaypoint(doc.waypoints, 3)).toBe(1)
    const result = placeFa2Waypoint(doc, 2, 3, { startNumber: 3 })
    expect(result).toEqual({ placed: true, number: 1 })
    expect(doc.waypoints.find((item) => item.number === 1)).toMatchObject({ rx: 2, ry: 3 })
    expect(doc.waypoints.some((item) => item.number === 3)).toBe(true)
  })

  it('writes waypoints 98/99 on a single-player map', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: false })
    const result = placeFa2Waypoint(doc, 5, 6, { startNumber: 0 })
    expect(result).toEqual({ placed: true, number: FA2_SP_HOME_WAYPOINT })
    expect(doc.waypoints.find((item) => item.number === FA2_SP_HOME_WAYPOINT)).toMatchObject({ rx: 5, ry: 6 })
    expect(doc.waypoints.find((item) => item.number === FA2_SP_HOME_WAYPOINT_NEXT)).toMatchObject({ rx: 5, ry: 7 })
  })

  it('deletes only the waypoint on a cell', () => {
    const doc = mpDoc()
    const target = doc.waypoints.find((item) => item.number === 3)!
    expect(deleteWaypointAt(doc, target.rx, target.ry)).toBe(true)
    expect(doc.waypoints.some((item) => item.number === 3)).toBe(false)
    expect(doc.waypoints).toHaveLength(7)
  })
})
