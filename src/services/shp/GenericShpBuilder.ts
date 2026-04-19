import { PaletteQuantizer } from '../palette/PaletteQuantizer'
import type { Rgb } from '../palette/PaletteTypes'
import { ShpEncoder } from './ShpEncoder'

/**
 * 通用 SHP 构建器：接收一组 canvas（每个 canvas 是一帧）+ 调色板，
 * 把每帧量化到 256 色索引，统一打包成 SHP type 0（未压缩）字节。
 *
 * 与 CameoBuilder 的区别：
 * - CameoBuilder 是 cameo 专属（含 textBar/buttonize/veteran/transparentCorners 装饰流水线，
 *   只支持单帧 60×48）
 * - GenericShpBuilder 不带任何装饰，专注"图片像素 → SHP 帧"的纯转换；
 *   支持单帧或多帧；适用于 loadscreen / 自定义尺寸 / sprite sheet 多帧动画等场景
 */

export type GenericShpScaleMode = 'fit' | 'stretch'

export interface BuildShpArgs {
  /** 一张或多张 canvas。若 canvas 尺寸 ≠ width/height，会按 scaleMode 重采样 */
  frames: HTMLCanvasElement[]
  /** 256 色调色板 */
  palette: Rgb[]
  /** 输出 SHP 的画布宽度 */
  width: number
  /** 输出 SHP 的画布高度 */
  height: number
  /** 重采样方式，默认 'fit'（居中等比 + 透明留边） */
  scaleMode?: GenericShpScaleMode
  /** 透明像素映射的调色板索引，默认 0 */
  transparentIndex?: number
  /** alpha 阈值 (0..255)，默认 128。低于阈值视为透明 */
  alphaThreshold?: number
}

export interface BuildShpResult {
  /** 最终 SHP 字节，可直接 writeProjectFile */
  shpBytes: Uint8Array
  /** 每帧量化后的 RGBA 预览数据，便于 UI 渲染缩略图 */
  previewRgbaPerFrame: Uint8ClampedArray[]
  width: number
  height: number
  numFrames: number
}

export class GenericShpBuilder {
  static buildShp(args: BuildShpArgs): BuildShpResult {
    const {
      frames,
      palette,
      width,
      height,
      scaleMode = 'fit',
      transparentIndex = 0,
      alphaThreshold = 128,
    } = args

    if (!frames.length) {
      throw new Error('GenericShpBuilder: at least one frame is required')
    }
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`GenericShpBuilder: invalid width ${width}`)
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error(`GenericShpBuilder: invalid height ${height}`)
    }
    if (palette.length === 0) {
      throw new Error('GenericShpBuilder: empty palette')
    }

    const indexedFrames: Uint8Array[] = []
    const previewRgbaPerFrame: Uint8ClampedArray[] = []

    for (let i = 0; i < frames.length; i++) {
      const srcCanvas = frames[i]
      // 每帧先归一化到目标 width × height（如果尺寸不匹配则按 fit/stretch 重采样）
      const targetCanvas = normalizeFrameSize(srcCanvas, width, height, scaleMode, i)
      const ctx = targetCanvas.getContext('2d')
      if (!ctx) {
        throw new Error(`GenericShpBuilder: failed to get 2d context for frame #${i}`)
      }
      const imageData = ctx.getImageData(0, 0, width, height)
      const indexed = PaletteQuantizer.quantize(imageData.data, width, height, palette, {
        transparentIndex,
        alphaThreshold,
      })
      indexedFrames.push(indexed)
      previewRgbaPerFrame.push(indexedToRgba(indexed, width, height, palette, transparentIndex))
    }

    const shpBytes = ShpEncoder.encodeType0({
      canvasWidth: width,
      canvasHeight: height,
      frames: indexedFrames.map((indexedPixels) => ({
        width,
        height,
        x: 0,
        y: 0,
        indexedPixels,
      })),
    })

    return {
      shpBytes,
      previewRgbaPerFrame,
      width,
      height,
      numFrames: frames.length,
    }
  }
}

function normalizeFrameSize(
  src: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  scaleMode: GenericShpScaleMode,
  frameIndex: number,
): HTMLCanvasElement {
  if (src.width === targetW && src.height === targetH) {
    return src
  }
  const dst = document.createElement('canvas')
  dst.width = targetW
  dst.height = targetH
  const ctx = dst.getContext('2d')
  if (!ctx) {
    throw new Error(`GenericShpBuilder: failed to allocate normalize canvas for frame #${frameIndex}`)
  }
  ctx.imageSmoothingEnabled = false // 与 CameoBuilder 一致：blocky 最近邻
  ctx.clearRect(0, 0, targetW, targetH)

  if (scaleMode === 'stretch') {
    ctx.drawImage(src, 0, 0, targetW, targetH)
  } else {
    // fit: 居中等比 + 透明留边
    const srcW = src.width
    const srcH = src.height
    if (srcW > 0 && srcH > 0) {
      const ratio = Math.min(targetW / srcW, targetH / srcH)
      const dw = Math.max(1, Math.round(srcW * ratio))
      const dh = Math.max(1, Math.round(srcH * ratio))
      const dx = Math.floor((targetW - dw) / 2)
      const dy = Math.floor((targetH - dh) / 2)
      ctx.drawImage(src, 0, 0, srcW, srcH, dx, dy, dw, dh)
    }
  }
  return dst
}

function indexedToRgba(
  indexed: Uint8Array,
  width: number,
  height: number,
  palette: Rgb[],
  transparentIndex: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < indexed.length; i++) {
    const idx = indexed[i]
    const off = i * 4
    if (idx === transparentIndex) {
      out[off] = 0
      out[off + 1] = 0
      out[off + 2] = 0
      out[off + 3] = 0
      continue
    }
    const color = palette[idx] ?? { r: 0, g: 0, b: 0 }
    out[off] = color.r
    out[off + 1] = color.g
    out[off + 2] = color.b
    out[off + 3] = 255
  }
  return out
}
