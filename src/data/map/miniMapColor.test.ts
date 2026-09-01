import { describe, expect, it } from 'vitest'
import { EMPTY_OVERLAY, OVRL_VEINS, RIPARIUS_BEGIN } from './constants'
import { cellMiniMapColor, scaleRadar } from './miniMapColor'

describe('cellMiniMapColor', () => {
  it('uses werhd radarLeft * 0.5 when there is no overlay', () => {
    const result = cellMiniMapColor({
      overlayId: EMPTY_OVERLAY,
      radar: { r: 80, g: 120, b: 40 },
      height: 0,
    })
    expect(result.source).toBe('radar')
    expect(result.color).toEqual(scaleRadar({ r: 80, g: 120, b: 40 }))
    expect(result.color).toEqual({ r: 40, g: 60, b: 20 })
  })

  it('uses FA2 Mini_UpdatePos ore and vein colors over radar', () => {
    expect(cellMiniMapColor({ overlayId: RIPARIUS_BEGIN, radar: { r: 80, g: 120, b: 40 }, height: 0 })).toEqual({
      source: 'overlay',
      color: { r: 250, g: 250, b: 0 },
    })
    expect(cellMiniMapColor({ overlayId: OVRL_VEINS, radar: { r: 80, g: 120, b: 40 }, height: 1 })).toEqual({
      source: 'overlay',
      color: { r: 190, g: 180, b: 120 },
    })
  })
})
