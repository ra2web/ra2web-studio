/** FA2 IsoView `GetColor`：优先 rules/map `[Colors]` HSV，再回退名称 RGB。 */

const NAMED: Record<string, [number, number, number]> = {
  darkred: [130, 20, 20],
  grey: [120, 120, 120],
  lightgrey: [120, 120, 120],
  red: [240, 20, 20],
  lightgold: [220, 220, 150],
  yellow: [240, 240, 0],
  gold: [230, 200, 0],
  darkgreen: [50, 160, 70],
  neongreen: [10, 255, 10],
  green: [50, 200, 70],
  darkblue: [30, 30, 150],
  lightblue: [100, 100, 200],
  neonblue: [35, 205, 255],
  darkorange: [210, 80, 0],
  orange: [230, 120, 20],
}

export type HouseRgb = { r: number; g: number; b: number }

export type HouseColorTable = Record<string, HouseRgb>

/** FA2 `HSVToRGB`：h 0–255 → 0–360°，s/v 0–255 → 0–1。 */
export function hsv255ToRgb(h: number, s: number, v: number): HouseRgb {
  const hue = clampByte(h) * 360 / 255
  const sat = clampByte(s) / 255
  const val = clampByte(v) / 255
  const sector = Math.floor(hue / 60) % 6
  const c = sat * val
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = val - c
  let r = 0
  let g = 0
  let b = 0
  if (sector === 0) {
    r = c
    g = x
  } else if (sector === 1) {
    r = x
    g = c
  } else if (sector === 2) {
    g = c
    b = x
  } else if (sector === 3) {
    g = x
    b = c
  } else if (sector === 4) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return {
    r: Math.round(clamp01(r + m) * 255),
    g: Math.round(clamp01(g + m) * 255),
    b: Math.round(clamp01(b + m) * 255),
  }
}

export function parseHouseColorTriplet(value: string): HouseRgb | null {
  const parts = value.split(',').map((part) => Number.parseInt(part.trim(), 10))
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null
  return hsv255ToRgb(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0)
}

export function parseHouseColors(entries: Array<{ key: string; value: string }> | undefined): HouseColorTable {
  const table: HouseColorTable = {}
  for (const entry of entries ?? []) {
    const rgb = parseHouseColorTriplet(entry.value)
    if (!rgb) continue
    const key = entry.key.trim().toLowerCase().replace(/\s+/g, '')
    if (key) table[key] = rgb
  }
  return table
}

export function houseRgbFromColorName(color: string | undefined, colors?: HouseColorTable): HouseRgb {
  const key = (color ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const fromTable = colors?.[key]
  if (fromTable) return fromTable
  const named = NAMED[key]
  if (named) return { r: named[0], g: named[1], b: named[2] }
  return { r: 255, g: 255, b: 0 }
}

export function houseColorKey(rgb: HouseRgb): string {
  return `${rgb.r},${rgb.g},${rgb.b}`
}

/**
 * FA2 `CalculateHouseColorPalette`（32-bit）：n=0 为满亮度阵营色，n=15 为黑。
 * 不要加 0.28 底色，那会把 DarkRed 乘成泥棕。
 */
export function houseRemapPalette(base: Uint8Array, house: HouseRgb): Uint8Array {
  const pal = new Uint8Array(base)
  const relMax = 15
  for (let n = 0; n <= relMax; n++) {
    const v = relMax - n
    const offset = (0x10 + n) * 3
    pal[offset] = Math.round(house.r * v / relMax)
    pal[offset + 1] = Math.round(house.g * v / relMax)
    pal[offset + 2] = Math.round(house.b * v / relMax)
  }
  return pal
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, value))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
