import { describe, expect, it } from 'vitest'
import { applyHvaToVoxels, blitVoxelsToRgba, facingStep, quantizedFacing } from './vxlBlit'

describe('blitVoxelsToRgba', () => {
  it('projects voxels into an opaque sprite', () => {
    const palette = new Uint8Array(768)
    palette[3] = 255
    palette[4] = 0
    palette[5] = 0
    const result = blitVoxelsToRgba(
      [{ x: 0, y: 0, z: 0, colorIndex: 1 }, { x: 1, y: 0, z: 0, colorIndex: 1 }],
      palette,
      2,
      1,
      1,
    )
    expect(result).not.toBeNull()
    expect(result!.width).toBeGreaterThan(4)
    expect(result!.rgba.some((value, index) => index % 4 === 3 && value === 255)).toBe(true)
  })

  it('quantizes RA2 facing to 8 directions and rotates the isometric sprite', () => {
    expect(facingStep(0)).toBe(0)
    expect(facingStep(64)).toBe(2)
    expect(quantizedFacing(64)).toBe(64)
    const palette = new Uint8Array(768)
    palette[3] = 255
    palette[4] = 0
    palette[5] = 0
    const voxels = [
      { x: 0, y: 4, z: 0, colorIndex: 1 },
      { x: 8, y: 4, z: 0, colorIndex: 1 },
    ]
    const north = blitVoxelsToRgba(voxels, palette, 8, 8, 1, { facing: 0 })
    const east = blitVoxelsToRgba(voxels, palette, 8, 8, 1, { facing: 64 })
    expect(north).not.toBeNull()
    expect(east).not.toBeNull()
    expect(Array.from(north!.rgba)).not.toEqual(Array.from(east!.rgba))
  })

  it('applies HVA translation but skips exploding scales', () => {
    const voxels = [{ x: 1, y: 2, z: 3, colorIndex: 4 }]
    const identity = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1] }
    expect(applyHvaToVoxels(voxels, identity)[0]).toMatchObject({ x: 6, y: 2, z: 3 })
    const huge = { elements: [100, 0, 0, 0, 0, 100, 0, 0, 0, 0, 100, 0, 0, 0, 0, 1] }
    expect(applyHvaToVoxels(voxels, huge)[0]).toMatchObject({ x: 1, y: 2, z: 3 })
  })
})
