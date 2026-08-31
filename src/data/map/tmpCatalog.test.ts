import { describe, expect, it } from 'vitest'
import { TERRAIN_GROUND, TERRAIN_ROUGH, TERRAIN_WATER } from './fa2Shore'
import {
  cliffFootprint,
  hackTerrainType,
  shapeFromTmp,
  shorePieceFromShape,
  subtileIndex,
} from './tmpCatalog'

describe('tmpCatalog', () => {
  it('reads TMP subtiles in FA2 column-major order (x * cy + y)', () => {
    const shape = shapeFromTmp({
      width: 2,
      height: 2,
      images: [
        { terrainType: 1, height: 10, tileData: new Uint8Array([1]) },
        { terrainType: 2, height: 20, tileData: new Uint8Array([1]) },
        { terrainType: 3, height: 30, tileData: new Uint8Array([1]) },
        { terrainType: 4, height: 40, tileData: new Uint8Array([1]) },
      ],
    })
    expect(shape.cx).toBe(2)
    expect(shape.cy).toBe(2)
    expect(shape.subtiles.map((item) => item.terrainType)).toEqual([1, 2, 3, 4])
    expect(shape.subtiles.map((item) => item.zHeight)).toEqual([10, 20, 30, 40])
    expect(subtileIndex(1, 0, 2)).toBe(2)
    expect(shape.subtiles[subtileIndex(1, 0, 2)]?.zHeight).toBe(30)
  })

  it('hacks ROUGH to GROUND and WaterSet to WATER', () => {
    expect(hackTerrainType(TERRAIN_ROUGH)).toBe(TERRAIN_GROUND)
    expect(hackTerrainType(0, true)).toBe(TERRAIN_WATER)
    expect(hackTerrainType(TERRAIN_WATER)).toBe(TERRAIN_WATER)
  })

  it('builds a ShorePiece with FA2 zHeight and hacked terrain', () => {
    const shape = shapeFromTmp({
      width: 2,
      height: 1,
      images: [
        { terrainType: TERRAIN_ROUGH, height: 2, tileData: new Uint8Array([1]) },
        { terrainType: TERRAIN_WATER, height: 0, tileData: new Uint8Array([1]) },
      ],
    })
    const piece = shorePieceFromShape(4, shape)
    expect(piece.setOffset).toBe(4)
    expect(piece.terrain).toEqual([TERRAIN_GROUND, TERRAIN_WATER])
    expect(piece.zHeight).toEqual([2, 0])
    expect(piece.hasPic).toEqual([true, true])
  })

  it('uses TMP footprint when placing cliffs, else FAData 2×2 / z=+4', () => {
    const shaped = cliffFootprint({
      cx: 2,
      cy: 1,
      subtiles: [
        { terrainType: 0, zHeight: 1, hasPic: true },
        { terrainType: 0, zHeight: 3, hasPic: true },
      ],
    }, 7)
    expect(shaped).toEqual({ cx: 2, cy: 1, zHeight: [1, 3] })
    expect(cliffFootprint(undefined, 7)).toEqual({ cx: 2, cy: 1, zHeight: [4, 4] })
    expect(cliffFootprint(undefined, 4).cx).toBe(2)
    expect(cliffFootprint(undefined, 4).cy).toBe(2)
  })
})
