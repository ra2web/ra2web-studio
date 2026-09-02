import type { TmpImage } from '../TmpImage'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from './constants'
import { emptyRgba, overlayRgbaAt, type IndexedRgba } from './shpBlit'

export type TmpRadarRgb = { r: number; g: number; b: number }

export type TmpRgba = {
  width: number
  height: number
  rgba: Uint8ClampedArray
  drawOffsetX: number
  drawOffsetY: number
  blockWidth: number
  blockHeight: number
  radarLeft: TmpRadarRgb
  radarRight: TmpRadarRgb
}

/** FA2 `XCC_GetTMPTileInfo` sX/sY and werhd extra pad: canvas grows left/up, blit origin shifts by the pad. */
export function tmpDrawOffset(image: Pick<TmpImage, 'hasExtraData' | 'x' | 'y' | 'extraX' | 'extraY'>): {
  offsetX: number
  offsetY: number
  drawOffsetX: number
  drawOffsetY: number
} {
  if (!image.hasExtraData) {
    return { offsetX: 0, offsetY: 0, drawOffsetX: 0, drawOffsetY: 0 }
  }
  const offsetX = Math.max(0, image.x - image.extraX)
  const offsetY = Math.max(0, image.y - image.extraY)
  return { offsetX, offsetY, drawOffsetX: -offsetX, drawOffsetY: -offsetY }
}

/** Port of engine TmpDrawable diamond unpack, writing RGBA via a 256-color palette. */
export function blitTmpToRgba(
  image: TmpImage,
  palette: Uint8Array,
  blockWidth: number,
  blockHeight: number,
): TmpRgba {
  const extra = tmpDrawOffset(image)
  let width = Math.max(blockWidth, 1) + extra.offsetX
  let height = Math.max(blockHeight, 1) + extra.offsetY
  if (image.hasExtraData) {
    const extraInX = Math.max(0, image.extraX - image.x)
    const extraInY = Math.max(0, image.extraY - image.y)
    width = Math.max(width, extraInX + Math.max(0, image.extraWidth))
    height = Math.max(height, extraInY + Math.max(0, image.extraHeight))
  }
  const rgba = new Uint8ClampedArray(width * height * 4)
  drawDiamond(image, palette, rgba, width, height, blockWidth, blockHeight, extra.offsetX, extra.offsetY)
  if (image.hasExtraData && image.extraData) {
    drawExtra(image, palette, rgba, width, height)
  }
  return {
    width,
    height,
    rgba,
    drawOffsetX: extra.drawOffsetX,
    drawOffsetY: extra.drawOffsetY,
    blockWidth,
    blockHeight,
    radarLeft: { r: image.radarLeft?.r ?? 0, g: image.radarLeft?.g ?? 0, b: image.radarLeft?.b ?? 0 },
    radarRight: { r: image.radarRight?.r ?? 0, g: image.radarRight?.g ?? 0, b: image.radarRight?.b ?? 0 },
  }
}

function drawDiamond(
  image: TmpImage,
  palette: Uint8Array,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  blockWidth: number,
  blockHeight: number,
  offsetX: number,
  offsetY: number,
): void {
  const halfHeight = blockHeight / 2
  let targetIndex = blockWidth / 2 - 2 + width * offsetY + offsetX
  const targetLength = width * height
  let sourceIndex = 0
  let row = 0
  let rowWidth = 0
  for (; row < halfHeight; row++) {
    rowWidth += 4
    for (let column = 0; column < rowWidth; column++) {
      const colorIndex = image.tileData[sourceIndex++] ?? 0
      if (colorIndex !== 0 && targetIndex >= 0 && targetIndex < targetLength) {
        putColor(rgba, targetIndex, colorIndex, palette)
      }
      targetIndex++
    }
    targetIndex += width - (rowWidth + 2)
  }
  for (targetIndex += 4; row < blockHeight; row++) {
    rowWidth -= 4
    for (let column = 0; column < rowWidth; column++) {
      const colorIndex = image.tileData[sourceIndex++] ?? 0
      if (targetIndex >= 0 && targetIndex < targetLength && colorIndex !== 0) {
        putColor(rgba, targetIndex, colorIndex, palette)
      }
      targetIndex++
    }
    targetIndex += width - (rowWidth - 2)
  }
}

function drawExtra(
  image: TmpImage,
  palette: Uint8Array,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!image.extraData) return
  const offsetX = Math.max(0, image.extraX - image.x)
  const targetLength = width * height
  let targetIndex = width * Math.max(0, image.extraY - image.y) + offsetX
  let sourceIndex = 0
  for (let row = 0; row < image.extraHeight; row++) {
    for (let column = 0; column < image.extraWidth; column++) {
      const colorIndex = image.extraData[sourceIndex++] ?? 0
      if (colorIndex !== 0 && targetIndex >= 0 && targetIndex < targetLength) {
        putColor(rgba, targetIndex, colorIndex, palette)
      }
      targetIndex++
    }
    targetIndex += width - image.extraWidth
  }
}

function putColor(rgba: Uint8ClampedArray, targetIndex: number, colorIndex: number, palette: Uint8Array): void {
  const offset = targetIndex * 4
  const pal = colorIndex * 3
  rgba[offset] = palette[pal] ?? 0
  rgba[offset + 1] = palette[pal + 1] ?? 0
  rgba[offset + 2] = palette[pal + 2] ?? 0
  rgba[offset + 3] = 255
}

/**
 * FA2 `RenderTile` 单格原点（未减包围盒）。
 * `sX/sY` 是 `XCC_GetTMPTileInfo` 的 extra 垫（与 `drawOffset` 相同），**不是** TMP 头的 x/y。
 */
export type TmpPreviewCell = {
  col: number
  row: number
  pixels: IndexedRgba
  sX?: number
  sY?: number
  zHeight?: number
}

/** XCC `Ctmp_ts_file::draw` / Studio TmpViewer：按 TMP 头 x/y 拼整块，extra 走同一套全局坐标。 */
export type TmpFilePreviewImage = {
  pixels: IndexedRgba
  x: number
  y: number
  zHeight: number
  drawOffsetX?: number
  drawOffsetY?: number
}

export function fa2TmpPreviewCellDest(
  col: number,
  row: number,
  cell: Pick<TmpPreviewCell, 'sX' | 'sY' | 'zHeight'> = {},
  fX = RA2_ISO_TILE_WIDTH,
  fY = RA2_ISO_TILE_HEIGHT,
): { x: number; y: number } {
  const halfX = fX / 2
  const halfY = fY / 2
  return {
    x: row * halfX - col * halfX + (cell.sX ?? 0),
    y: row * halfY + col * halfY + (cell.sY ?? 0) - (cell.zHeight ?? 0) * halfY,
  }
}

export function tmpFilePreviewDest(
  image: TmpFilePreviewImage,
  maxZHeight: number,
  blockHeight = RA2_ISO_TILE_HEIGHT,
): { x: number; y: number } {
  const elevation = maxZHeight - image.zHeight
  return {
    x: image.x + (image.drawOffsetX ?? 0),
    y: image.y + (image.drawOffsetY ?? 0) + elevation * (blockHeight / 2),
  }
}

function overlayPreview(
  items: Array<{ pixels: IndexedRgba; dest: { x: number; y: number } }>,
): IndexedRgba | null {
  if (items.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const item of items) {
    minX = Math.min(minX, item.dest.x)
    minY = Math.min(minY, item.dest.y)
    maxX = Math.max(maxX, item.dest.x + item.pixels.width)
    maxY = Math.max(maxY, item.dest.y + item.pixels.height)
  }
  const width = Math.max(1, Math.ceil(maxX - minX))
  const height = Math.max(1, Math.ceil(maxY - minY))
  let canvas = emptyRgba(width, height)
  for (const item of items) {
    canvas = overlayRgbaAt(
      canvas,
      item.pixels,
      Math.round(item.dest.x - minX),
      Math.round(item.dest.y - minY),
    )
  }
  return canvas
}

/**
 * FA2 `CTileSetBrowserView::RenderTile`：按 TILEDATA cx×cy 把子格拼成一张预览。
 * 1×1 且无偏移时结果就是子格 0。
 */
export function composeFa2TmpPreview(cells: TmpPreviewCell[]): IndexedRgba | null {
  if (cells.length === 0) return null
  if (cells.length === 1) {
    const only = cells[0]
    const dest = fa2TmpPreviewCellDest(only.col, only.row, only)
    if (only.col === 0 && only.row === 0 && dest.x === 0 && dest.y === 0) return only.pixels
  }
  return overlayPreview(cells.map((cell) => ({
    pixels: cell.pixels,
    dest: fa2TmpPreviewCellDest(cell.col, cell.row, cell),
  })))
}

/**
 * 地块浏览器预览：按 TMP 头 x/y 拼图（XCC `draw`），避免 extra 草地/标线按等距格子再贴一次而交错。
 * 1×1 且无垫偏移时结果就是子格 0。
 */
export function composeTmpFilePreview(
  images: TmpFilePreviewImage[],
  blockHeight = RA2_ISO_TILE_HEIGHT,
): IndexedRgba | null {
  if (images.length === 0) return null
  const maxZHeight = images.reduce((max, image) => Math.max(max, image.zHeight), 0)
  if (images.length === 1) {
    const only = images[0]
    const dest = tmpFilePreviewDest(only, maxZHeight, blockHeight)
    if (dest.x === 0 && dest.y === 0) return only.pixels
  }
  return overlayPreview(images.map((image) => ({
    pixels: image.pixels,
    dest: tmpFilePreviewDest(image, maxZHeight, blockHeight),
  })))
}
