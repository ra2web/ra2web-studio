import { describe, expect, it } from 'vitest'
import { hitTestDiamond, projectCell } from './isoCoords'
import { isTouchLikeEvent } from './mapTools'

describe('hitTestDiamond', () => {
  it('hits the projected cell interior and misses far away', () => {
    const isoSize = 32
    const origin = projectCell(10, 12, 0, isoSize)
    expect(hitTestDiamond(origin.px, origin.py + 15, 10, 12, 0, isoSize)).toBe(true)
    expect(hitTestDiamond(origin.px + 400, origin.py + 400, 10, 12, 0, isoSize)).toBe(false)
  })
})

describe('isTouchLikeEvent', () => {
  it('treats touch and pen as touch-like', () => {
    expect(isTouchLikeEvent({ pointerType: 'touch' })).toBe(true)
    expect(isTouchLikeEvent({ pointerType: 'pen' })).toBe(true)
    expect(isTouchLikeEvent({ pointerType: 'mouse' })).toBe(false)
  })
})
