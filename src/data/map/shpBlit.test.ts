import { describe, expect, it } from 'vitest'
import { blitIndexedToRgba, compositeShpFrame, overlayBuildingSubgraphic, overlayRgba, overlayRgbaAt, pickShpFrame, shpFrameHasPixels } from './shpBlit'

describe('blitIndexedToRgba', () => {
  it('skips color index 0 and writes palette RGB', () => {
    const palette = new Uint8Array(768)
    palette[3] = 10
    palette[4] = 20
    palette[5] = 30
    const indexed = new Uint8Array([0, 1, 1, 0])
    const result = blitIndexedToRgba(indexed, 2, 2, palette)
    expect(result.rgba[3]).toBe(0)
    expect(result.rgba[4]).toBe(10)
    expect(result.rgba[5]).toBe(20)
    expect(result.rgba[6]).toBe(30)
    expect(result.rgba[7]).toBe(255)
  })
})

describe('compositeShpFrame', () => {
  it('places a frame onto the SHP canvas at x,y like FA2 wMaxWidth', () => {
    const frame = { width: 1, height: 1, x: 1, y: 0, imageData: new Uint8Array([7]) }
    const result = compositeShpFrame({ width: 3, height: 1 }, frame)
    expect(result.width).toBe(3)
    expect(result.height).toBe(1)
    expect([...result.indexed]).toEqual([0, 7, 0])
  })
})

describe('pickShpFrame', () => {
  it('skips empty frames and uses the first frame with pixels', () => {
    const empty = { width: 1, height: 1, x: 0, y: 0, imageData: new Uint8Array([0]) }
    const filled = { width: 1, height: 1, x: 0, y: 0, imageData: new Uint8Array([4]) }
    expect(shpFrameHasPixels(empty)).toBe(false)
    expect(pickShpFrame([empty, filled], 0)).toBe(filled)
  })
})

describe('overlayRgba', () => {
  it('keeps extra opaque pixels on top of the base sprite', () => {
    const base = blitIndexedToRgba(new Uint8Array([1, 0, 0, 0]), 2, 2, (() => {
      const palette = new Uint8Array(768)
      palette[3] = 10
      return palette
    })())
    const extra = blitIndexedToRgba(new Uint8Array([0, 1, 0, 0]), 2, 2, (() => {
      const palette = new Uint8Array(768)
      palette[3] = 20
      return palette
    })())
    const result = overlayRgba(base, extra)
    expect(result.rgba[0]).toBe(10)
    expect(result.rgba[4]).toBe(20)
  })
})

describe('overlayBuildingSubgraphic', () => {
  it('clips a larger SuperAnim to the main SHP so Chronosphere stays one sprite', () => {
    const palette = new Uint8Array(768)
    palette[3] = 10
    palette[6] = 20
    const base = blitIndexedToRgba(new Uint8Array([1, 0, 0, 0]), 2, 2, palette)
    const extraIndexed = new Uint8Array(16)
    extraIndexed[15] = 2
    const extra = blitIndexedToRgba(extraIndexed, 4, 4, palette)
    const result = overlayBuildingSubgraphic(base, extra)
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.rgba[0]).toBe(10)
    expect(result.rgba[3]).toBe(255)
    expect([...result.rgba].some((value, index) => index % 4 === 0 && value === 20)).toBe(false)
  })

  it('uses the anim canvas when the main SHP has no pixels', () => {
    const palette = new Uint8Array(768)
    palette[3] = 20
    const base = blitIndexedToRgba(new Uint8Array([0, 0, 0, 0]), 2, 2, palette)
    const extra = blitIndexedToRgba(new Uint8Array([0, 1, 0, 0]), 2, 2, palette)
    const result = overlayBuildingSubgraphic(base, extra)
    expect(result.rgba[4]).toBe(20)
  })
})

describe('overlayRgbaAt', () => {
  it('blits extra pixels at dx,dy and clips to the base canvas', () => {
    const palette = new Uint8Array(768)
    palette[3] = 10
    palette[6] = 20
    const base = blitIndexedToRgba(new Uint8Array([1, 0, 0, 0]), 2, 2, palette)
    const extra = blitIndexedToRgba(new Uint8Array([2]), 1, 1, palette)
    const result = overlayRgbaAt(base, extra, 1, 0)
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.rgba[0]).toBe(10)
    expect(result.rgba[4]).toBe(20)
  })
})
