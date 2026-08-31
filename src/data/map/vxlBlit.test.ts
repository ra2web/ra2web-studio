import { describe, expect, it } from 'vitest'
import { blitVoxelsToRgba } from './vxlBlit'

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
})
