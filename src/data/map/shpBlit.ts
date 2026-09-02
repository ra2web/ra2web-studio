export type IndexedRgba = {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export type ShpBlitFrame = {
  width: number
  height: number
  x: number
  y: number
  imageData: Uint8Array
}

export function shpFrameHasPixels(image: ShpBlitFrame | undefined): boolean {
  if (!image || image.width <= 0 || image.height <= 0) return false
  for (let i = 0; i < image.imageData.length; i++) {
    if (image.imageData[i] !== 0) return true
  }
  return false
}

export function pickShpFrame<T extends ShpBlitFrame>(images: T[], frame: number): T | null {
  const preferred = images[frame] ?? images[0]
  if (shpFrameHasPixels(preferred)) return preferred
  return images.find((image) => shpFrameHasPixels(image)) ?? null
}

/** FA2 用 SHP `wMaxWidth/wMaxHeight` 画布，把帧放在 (x,y)。 */
export function compositeShpFrame(shpSize: { width: number; height: number }, image: ShpBlitFrame): {
  indexed: Uint8Array
  width: number
  height: number
} {
  const width = Math.max(1, shpSize.width, image.x + image.width, image.width)
  const height = Math.max(1, shpSize.height, image.y + image.height, image.height)
  if (image.x === 0 && image.y === 0 && width === image.width && height === image.height) {
    return { indexed: image.imageData, width, height }
  }
  const indexed = new Uint8Array(width * height)
  for (let row = 0; row < image.height; row++) {
    const destY = image.y + row
    if (destY < 0 || destY >= height) continue
    for (let col = 0; col < image.width; col++) {
      const destX = image.x + col
      if (destX < 0 || destX >= width) continue
      indexed[destY * width + destX] = image.imageData[row * image.width + col] ?? 0
    }
  }
  return { indexed, width, height }
}

/** FA2 `Blit_Pal`：把 src 非 0 像素叠到 dest (0,0)。 */
export function blitIndexedOver(
  dest: Uint8Array,
  destWidth: number,
  destHeight: number,
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
): void {
  const rows = Math.min(destHeight, srcHeight)
  const cols = Math.min(destWidth, srcWidth)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const color = src[row * srcWidth + col] ?? 0
      if (color === 0) continue
      dest[row * destWidth + col] = color
    }
  }
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

export function overlayRgba(base: IndexedRgba, extra: IndexedRgba): IndexedRgba {
  const width = Math.max(base.width, extra.width)
  const height = Math.max(base.height, extra.height)
  const rgba = new Uint8ClampedArray(width * height * 4)
  const blit = (src: IndexedRgba, dx = 0, dy = 0) => {
    for (let row = 0; row < src.height; row++) {
      const destY = dy + row
      if (destY < 0 || destY >= height) continue
      for (let col = 0; col < src.width; col++) {
        const destX = dx + col
        if (destX < 0 || destX >= width) continue
        const srcOffset = (row * src.width + col) * 4
        if ((src.rgba[srcOffset + 3] ?? 0) === 0) continue
        const destOffset = (destY * width + destX) * 4
        rgba[destOffset] = src.rgba[srcOffset] ?? 0
        rgba[destOffset + 1] = src.rgba[srcOffset + 1] ?? 0
        rgba[destOffset + 2] = src.rgba[srcOffset + 2] ?? 0
        rgba[destOffset + 3] = 255
      }
    }
  }
  blit(base)
  blit(extra)
  return { width, height, rgba }
}

/** FA2 `Blit_PalD` 炮台：叠到主 SHP 画布 (dx,dy)，超出部分裁掉。 */
export function overlayRgbaAt(base: IndexedRgba, extra: IndexedRgba, dx: number, dy: number): IndexedRgba {
  const rgba = new Uint8ClampedArray(base.rgba)
  for (let row = 0; row < extra.height; row++) {
    const destY = dy + row
    if (destY < 0 || destY >= base.height) continue
    for (let col = 0; col < extra.width; col++) {
      const destX = dx + col
      if (destX < 0 || destX >= base.width) continue
      const srcOffset = (row * extra.width + col) * 4
      if ((extra.rgba[srcOffset + 3] ?? 0) === 0) continue
      const destOffset = (destY * base.width + destX) * 4
      rgba[destOffset] = extra.rgba[srcOffset] ?? 0
      rgba[destOffset + 1] = extra.rgba[srcOffset + 1] ?? 0
      rgba[destOffset + 2] = extra.rgba[srcOffset + 2] ?? 0
      rgba[destOffset + 3] = 255
    }
  }
  return { width: base.width, height: base.height, rgba }
}

/**
 * FA2 `Blit_Pal(..., 0, 0, head.cx, head.cy, anim, ...)`：子图叠到主 SHP 画布并裁切。
 * 若用 `overlayRgba` 按较大 SuperAnim 撑开画布再居中，超时空传送装置会裂成底座和光球两块。
 * 主图完全空白（缺 SHP）时才把第一张子图当作画布，避免 GARADR 这类空帧建筑丢 ActiveAnim。
 */
export function overlayBuildingSubgraphic(base: IndexedRgba, extra: IndexedRgba): IndexedRgba {
  if (!rgbaHasOpaque(base)) return extra
  return overlayRgbaAt(base, extra, 0, 0)
}

export function emptyRgba(width: number, height: number): IndexedRgba {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  return { width: w, height: h, rgba: new Uint8ClampedArray(w * h * 4) }
}

export function rgbaHasOpaque(pixels: IndexedRgba | null | undefined): boolean {
  if (!pixels) return false
  for (let i = 3; i < pixels.rgba.length; i += 4) {
    if ((pixels.rgba[i] ?? 0) !== 0) return true
  }
  return false
}
