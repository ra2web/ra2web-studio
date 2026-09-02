import { describe, expect, it } from 'vitest'
import { fa2InfantryShpFrame, fa2UnitShpFrame } from './fa2Facing'

describe('fa2 facing', () => {
  it('inverts infantry SHP frames like FA2 (7 - direction/32)', () => {
    expect(fa2InfantryShpFrame(64)).toBe(5)
    expect(fa2InfantryShpFrame(0)).toBe(7)
    expect(fa2InfantryShpFrame(224)).toBe(0)
  })

  it('uses WalkFrames * dir + StartWalkFrame for infantry SHPs', () => {
    expect(fa2InfantryShpFrame(64, 8, 0)).toBe(40)
    expect(fa2InfantryShpFrame(0, 8, 8)).toBe(64)
  })

  it('uses direction/32 for vehicles', () => {
    expect(fa2UnitShpFrame(64)).toBe(2)
    expect(fa2UnitShpFrame(0)).toBe(0)
    expect(fa2UnitShpFrame(64, 8, 0)).toBe(24)
  })
})
