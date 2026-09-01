import {
  EMPTY_OVERLAY,
  OVRL_VEINHOLE,
  OVRL_VEINHOLEBORDER,
  OVRL_VEINS,
} from './constants'

export type MiniMapRgb = { r: number; g: number; b: number }

/** werhd `TileCollection.getTileRadarColor`: `radarLeft * 0.5`. */
export const MINIMAP_RADAR_SCALE = 0.5

export type MiniMapColorSource = 'object' | 'overlay' | 'radar' | 'fallback'

export function scaleRadar(color: MiniMapRgb, scale = MINIMAP_RADAR_SCALE): MiniMapRgb {
  return {
    r: Math.round(color.r * scale),
    g: Math.round(color.g * scale),
    b: Math.round(color.b * scale),
  }
}

/** FA2 `isGreenTiberium` (RA2 ore / tib ranges). */
export function isGreenTiberium(overlayId: number): boolean {
  return (overlayId > 0x65 && overlayId <= 0x79) || (overlayId > 0x82 && overlayId < 0xa7)
}

/** FA2 `Mini_UpdatePos` overlay colors (RA2). */
export function overlayMiniMapColor(overlayId: number): MiniMapRgb | null {
  if (overlayId === EMPTY_OVERLAY) return null
  if (isGreenTiberium(overlayId)) return { r: 250, g: 250, b: 0 }
  if (overlayId === OVRL_VEINS) return { r: 190, g: 180, b: 120 }
  if (overlayId === OVRL_VEINHOLE || overlayId === OVRL_VEINHOLEBORDER) return { r: 165, g: 160, b: 120 }
  return { r: 20, g: 20, b: 20 }
}

export function fallbackTerrainColor(height: number): MiniMapRgb {
  const shade = 50 + height * 12
  return { r: shade, g: shade + 18, b: Math.max(0, shade - 8) }
}

export function cellMiniMapColor(input: {
  overlayId: number
  radar?: MiniMapRgb | null
  height: number
}): { color: MiniMapRgb; source: MiniMapColorSource } {
  const overlay = overlayMiniMapColor(input.overlayId)
  if (overlay) return { color: overlay, source: 'overlay' }
  if (input.radar) return { color: scaleRadar(input.radar), source: 'radar' }
  return { color: fallbackTerrainColor(input.height), source: 'fallback' }
}

export function rgbCss(color: MiniMapRgb): string {
  return `rgb(${color.r},${color.g},${color.b})`
}
