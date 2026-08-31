import type { TmpImage } from '../TmpImage'

export type TmpRgba = {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

/** Port of engine TmpDrawable diamond unpack, writing RGBA via a 256-color palette. */
export function blitTmpToRgba(
  image: TmpImage,
  palette: Uint8Array,
  blockWidth: number,
  blockHeight: number,
): TmpRgba {
  let width = Math.max(blockWidth, 1)
  let height = Math.max(blockHeight, 1)
  let offsetX = 0
  let offsetY = 0
  if (image.hasExtraData) {
    offsetX += Math.max(0, image.x - image.extraX)
    offsetY += Math.max(0, image.y - image.extraY)
    width += Math.max(0, image.x - image.extraX)
    height += Math.max(0, image.y - image.extraY)
  }
  const rgba = new Uint8ClampedArray(width * height * 4)
  drawDiamond(image, palette, rgba, width, height, blockWidth, blockHeight, offsetX, offsetY)
  if (image.hasExtraData && image.extraData) {
    drawExtra(image, palette, rgba, width, height)
  }
  return { width, height, rgba }
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
