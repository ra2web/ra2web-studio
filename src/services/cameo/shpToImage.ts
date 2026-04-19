import { ShpFile } from '../../data/ShpFile'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import { IndexedColorRenderer } from '../palette/IndexedColorRenderer'
import type { Rgb } from '../palette/PaletteTypes'

/**
 * 把已有 SHP 字节解码 + 调色板反查渲染成 PNG Blob，便于在编辑器里
 * 当作"底图"喂给 ShpEditor（imageFile / imageObj 流程），从而支持：
 *   ShpViewer 点编辑 → ShpEditor 立即看到原图 → 叠加 cameo 装饰 → 保存
 *
 * 仅渲染指定一帧（默认第 0 帧）。多帧 SHP 在 UI 层另外做警告，本模块只老实出帧。
 */
export interface ShpFrameRender {
  /** 帧 N 渲染出的 PNG Blob，可直接 `new File([blob], filename)` 喂回上层。 */
  blob: Blob
  /** 该帧实际像素宽（取自帧头，不一定等于 SHP 全局 canvas） */
  width: number
  /** 该帧实际像素高 */
  height: number
  /** 整个 SHP 的总帧数；> 1 时调用方应在 UI 上挂"将丢失其他帧"警告 */
  numFrames: number
  /** 当前导出的帧索引 */
  frameIndex: number
}

export async function renderShpFrameToBlob(
  bytes: Uint8Array,
  filename: string,
  palette: Rgb[],
  frameIndex = 0,
): Promise<ShpFrameRender> {
  if (palette.length === 0) {
    throw new Error('renderShpFrameToBlob: empty palette')
  }
  const vf = VirtualFile.fromBytes(bytes, filename)
  const shp = ShpFile.fromVirtualFile(vf)
  if (shp.numImages <= 0) {
    throw new Error('renderShpFrameToBlob: SHP has no frames')
  }
  if (frameIndex < 0 || frameIndex >= shp.numImages) {
    throw new RangeError(
      `renderShpFrameToBlob: frameIndex ${frameIndex} out of range [0, ${shp.numImages})`,
    )
  }

  const img = shp.getImage(frameIndex)
  if (img.width <= 0 || img.height <= 0) {
    throw new Error(
      `renderShpFrameToBlob: frame #${frameIndex} has invalid dimensions ${img.width}x${img.height}`,
    )
  }

  // index 0 = 透明（与 ShpViewer / cameo.pal 约定一致）
  const rgba = IndexedColorRenderer.indexedToRgba(img.imageData, img.width, img.height, palette, 0)

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('renderShpFrameToBlob: failed to get 2d context')
  }
  // 复制一份让 buffer 类型为 ArrayBuffer，避开 TS 5+ 对 ArrayBufferLike 的收紧
  const rgbaCopy = new Uint8ClampedArray(rgba.length)
  rgbaCopy.set(rgba)
  ctx.putImageData(new ImageData(rgbaCopy, img.width, img.height), 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('renderShpFrameToBlob: canvas.toBlob returned null'))
    }, 'image/png')
  })

  return {
    blob,
    width: img.width,
    height: img.height,
    numFrames: shp.numImages,
    frameIndex,
  }
}
