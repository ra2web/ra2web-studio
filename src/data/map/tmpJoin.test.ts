import { describe, expect, it } from 'vitest'
import { joinedIsoCoverage, singleTileIsoHoles, tmpDiamondMask } from './tmpJoin'

describe('tmp diamond join', () => {
  it('paints 900 mask pixels and leaves iso-diamond holes on a single tile', () => {
    const mask = tmpDiamondMask()
    const opaque = mask.flat().filter(Boolean).length
    expect(opaque).toBe(900)
    const holes = singleTileIsoHoles(mask)
    expect(holes.length).toBe(30)
    expect(holes.some((item) => item.y < 15)).toBe(false)
  })

  it('fills those holes when four diagonal neighbors are blitted at ±30,±15', () => {
    const joined = joinedIsoCoverage()
    expect(joined.holes).toBe(0)
    expect(joined.covered).toBe(900)
  })
})
