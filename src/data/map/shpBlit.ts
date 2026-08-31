export type IndexedRgba = {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export function blitIndexedToRgba(
  indexed: Uint8Array,
  width: number,
  height: number,
  palette: Uint8Array,
): IndexedRgba {
  const rgba = new Uint8ClampedArray(Math.max(0, width) * Math.max(0, height) * 4)
  const limit = Math.min(indexed.length, width * height)
  for (let i = 0; i < limit; i++) {
    const colorIndex = indexed[i] ?? 0
    if (colorIndex === 0) continue
    const offset = i * 4
    const pal = colorIndex * 3
    rgba[offset] = palette[pal] ?? 0
    rgba[offset + 1] = palette[pal + 1] ?? 0
    rgba[offset + 2] = palette[pal + 2] ?? 0
    rgba[offset + 3] = 255
  }
  return { width, height, rgba }
}
