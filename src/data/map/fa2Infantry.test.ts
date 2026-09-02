import { describe, expect, it } from 'vitest'
import { allocateInfantrySubCell, infantryDrawSlot, infantrySubCellFromWorld, infantrySubPosOffset, preferInfantrySubCell } from './fa2Infantry'
import { INFANTRY_SUBPOS_COUNT } from './constants'

describe('allocateInfantrySubCell', () => {
  it('allows three infantry per cell like FA2 SUBPOS_COUNT', () => {
    const existing: Array<{ subCell?: number }> = []
    expect(allocateInfantrySubCell(existing)).toBe(0)
    existing.push({ subCell: 0 })
    expect(allocateInfantrySubCell(existing)).toBe(2)
    expect(existing[0].subCell).toBe(1)
    existing.push({ subCell: 2 })
    expect(allocateInfantrySubCell(existing)).toBe(3)
    existing.push({ subCell: 3 })
    expect(allocateInfantrySubCell(existing)).toBeNull()
    expect(existing).toHaveLength(INFANTRY_SUBPOS_COUNT)
  })

  it('maps INI pos to FA2 draw slots', () => {
    expect(infantryDrawSlot(0)).toBe(0)
    expect(infantryDrawSlot(1)).toBe(0)
    expect(infantryDrawSlot(2)).toBe(1)
    expect(infantryDrawSlot(3)).toBe(2)
    expect(infantrySubPosOffset(0)).toEqual({ x: 0, y: -7.5 })
  })

  it('picks the nearest subcell from a world click and prefers an empty slot', () => {
    const origin = { px: 100, py: 40 }
    expect(infantrySubCellFromWorld(100, 32.5, origin)).toBe(0)
    expect(infantrySubCellFromWorld(115, 40, origin)).toBe(2)
    expect(infantrySubCellFromWorld(85, 40, origin)).toBe(3)
    expect(preferInfantrySubCell([], 3)).toBe(3)
    expect(preferInfantrySubCell([{ subCell: 3 }], 0)).toBe(0)
    expect(preferInfantrySubCell([{ subCell: 3 }], 3)).not.toBe(3)
  })
})
