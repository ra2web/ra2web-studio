export const RA2_ISO_TILE_WIDTH = 60
export const RA2_ISO_TILE_HEIGHT = 30
export const MAP_MIN_SIZE = 16
export const MAP_MAX_SIZE = 400
export const MAP_MAX_SUM = 512
export const OVERLAY_PLANE = 512
export const OVERLAY_PLANE_SIZE = OVERLAY_PLANE * OVERLAY_PLANE
export const EMPTY_OVERLAY = 0xff
export const EMPTY_TILE = 0xffff
export const MAP_FIELD_BYTES = 11
export const MAX_HEIGHT = 14
export const MAX_UNDO_TERRAIN = 64
export const PACK_LINE_WIDTH = 70
export const INFANTRY_SUBPOS_COUNT = 3

export const THEATERS = [
  'TEMPERATE',
  'SNOW',
  'URBAN',
  'NEWURBAN',
  'LUNAR',
  'DESERT',
] as const

export type MapTheater = (typeof THEATERS)[number]

export const ORE_RANGES = {
  riparius: [102, 121] as const,
  cruentus: [27, 38] as const,
  vinifera: [127, 146] as const,
  aboreus: [147, 166] as const,
}

export const OVRL_VEINS = 0x7e
export const OVRL_VEINHOLE = 0xa7
export const OVRL_TRACK_BEGIN = 0x27
export const OVRL_TRACK_END = 0x36

export const DEFAULT_HOUSE_NAMES = [
  'Neutral',
  'Special',
  'Americans',
  'Alliance',
  'French',
  'Germans',
  'British',
  'Africans',
  'Confederates',
  'Russians',
  'YuriCountry',
] as const

export const PLAYABLE_HOUSES = DEFAULT_HOUSE_NAMES.slice(2)

export function isTheater(value: string): value is MapTheater {
  return (THEATERS as readonly string[]).includes(value.toUpperCase())
}

export function validateMapSize(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return '尺寸必须是整数'
  if (width < MAP_MIN_SIZE || height < MAP_MIN_SIZE) return `宽高至少 ${MAP_MIN_SIZE}`
  if (width > MAP_MAX_SIZE || height > MAP_MAX_SIZE) return `宽高至多 ${MAP_MAX_SIZE}`
  if (width + height > MAP_MAX_SUM) return `宽+高不能超过 ${MAP_MAX_SUM}`
  return null
}

export function overlayIndex(rx: number, ry: number): number {
  return rx + OVERLAY_PLANE * ry
}
