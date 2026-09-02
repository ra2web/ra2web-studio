import { describe, expect, it } from 'vitest'
import {
  houseRgbFromColorName,
  houseRemapPalette,
  hsv255ToRgb,
  parseHouseColors,
} from './fa2HouseColor'

describe('fa2HouseColor', () => {
  it('maps named house colors used by FA2 when [Colors] is missing', () => {
    expect(houseRgbFromColorName('DarkOrange')).toEqual({ r: 210, g: 80, b: 0 })
    expect(houseRgbFromColorName('Gold')).toEqual({ r: 230, g: 200, b: 0 })
  })

  it('converts rules [Colors] HSV like FA2 GetColor so DarkRed is pure red', () => {
    expect(hsv255ToRgb(0, 230, 255)).toEqual({ r: 255, g: 25, b: 25 })
    const colors = parseHouseColors([
      { key: 'DarkRed', value: '0,230,255' },
      { key: 'Red', value: '20,255,184' },
    ])
    expect(houseRgbFromColorName('DarkRed', colors)).toEqual({ r: 255, g: 25, b: 25 })
    expect(houseRgbFromColorName('DarkRed', colors).g).toBeLessThan(40)
    expect(houseRgbFromColorName('Red', colors).g).toBeGreaterThan(80)
  })

  it('replaces unit pal 0x10-0x1F with FA2 house ramp (0x10 brightest)', () => {
    const pal = new Uint8Array(768)
    const remapped = houseRemapPalette(pal, { r: 255, g: 25, b: 25 })
    expect(remapped[0x10 * 3]).toBe(255)
    expect(remapped[0x10 * 3 + 1]).toBe(25)
    expect(remapped[0x1F * 3]).toBe(0)
    expect(remapped[0]).toBe(0)
  })
})
