import { describe, expect, it } from 'vitest'
import { followWorldAtClient, worldFromCanvasClient, zoomAroundClient } from './viewportZoom'

describe('zoomAroundClient', () => {
  it('keeps the world point under the cursor after zoom', () => {
    const panX = 80
    const panY = 40
    const scale = 0.45
    const clientX = 320
    const clientY = 180
    const before = worldFromCanvasClient(clientX, clientY, panX, panY, scale)
    const next = zoomAroundClient(panX, panY, scale, scale * 1.1, clientX, clientY)
    const after = worldFromCanvasClient(clientX, clientY, next.panX, next.panY, next.scale)
    expect(next.scale).toBeCloseTo(0.495)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(next.panX).not.toBe(panX)
    expect(next.panY).not.toBe(panY)
  })

  it('does not leave the origin pinned when zooming out', () => {
    const next = zoomAroundClient(80, 40, 0.45, 0.45 / 1.1, 400, 300)
    expect(next.panX).not.toBe(80)
    expect(next.panY).not.toBe(40)
    const world = worldFromCanvasClient(400, 300, next.panX, next.panY, next.scale)
    expect(world.x).toBeCloseTo((400 - 80) / 0.45)
    expect(world.y).toBeCloseTo((300 - 40) / 0.45)
  })
})

describe('followWorldAtClient', () => {
  it('moves pan so a stored world point follows the pinch midpoint', () => {
    const worldX = 100
    const worldY = 50
    const next = followWorldAtClient(worldX, worldY, 0.9, 220, 160)
    const under = worldFromCanvasClient(220, 160, next.panX, next.panY, next.scale)
    expect(under.x).toBeCloseTo(worldX)
    expect(under.y).toBeCloseTo(worldY)
  })
})
