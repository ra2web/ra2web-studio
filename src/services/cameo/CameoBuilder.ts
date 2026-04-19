import type { Rgb } from '../palette/PaletteTypes'
import { PaletteQuantizer } from '../palette/PaletteQuantizer'
import { ShpEncoder } from '../shp/ShpEncoder'
import {
  applyButtonize,
  applyTextBar,
  applyTransparentCorners,
  applyVeteranBadge,
  type ButtonizeOptions,
  type TextBarOptions,
  type TransparentCornersOptions,
  type VeteranBadgeOptions,
} from './postprocess'

export type CameoScaleMode = 'fit' | 'stretch'

export interface BuildCameoArgs {
  /** 输入图片来源：File / Blob / 已加载好的 HTMLImageElement */
  source: File | Blob | HTMLImageElement
  /** 256 色调色板（cameo.pal 解析结果） */
  palette: Rgb[]
  /** 输出宽度，默认 60 */
  width?: number
  /** 输出高度，默认 48 */
  height?: number
  /** 缩放方式，默认 'fit' (居中等比 + 透明留边) */
  scaleMode?: CameoScaleMode
  textBar?: TextBarOptions
  buttonize?: ButtonizeOptions
  veteranBadge?: VeteranBadgeOptions
  /**
   * RA2 透明角：把 cameo 四角各 3 个像素抹透明，对应 OS DrawCameo_Transparent。
   * 默认 enabled=true；如不需要可显式传 { enabled: false }。
   */
  transparentCorners?: TransparentCornersOptions
  /**
   * 透明像素映射的调色板索引，默认 0。同时透明阈值 0..255 默认 128。
   * 与 PaletteQuantizer.quantize 同语义。
   */
  transparentIndex?: number
  alphaThreshold?: number
}

export interface BuildCameoResult {
  shpBytes: Uint8Array
  /** 量化后的 60x48 RGBA，用于编辑器右侧预览（不含 cameo 蓝背景） */
  previewRgba: Uint8ClampedArray
  width: number
  height: number
  /** 量化得到的索引数据，便于做单元测试或二次复用 */
  indexedPixels: Uint8Array
}

export class CameoBuilder {
  static async buildShp(args: BuildCameoArgs): Promise<BuildCameoResult> {
    const width = args.width ?? 60
    const height = args.height ?? 48
    const scaleMode = args.scaleMode ?? 'fit'
    const transparentIndex = args.transparentIndex ?? 0
    const alphaThreshold = args.alphaThreshold ?? 128

    const image = await loadImage(args.source)

    // 1) 解码 + 缩放到目标尺寸
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('CameoBuilder: failed to get 2d context')
    // Blocky 最近邻缩放，对齐 OS Resize_Bitmap_Blocky；保留像素硬边，符合 cameo 美学
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)

    if (scaleMode === 'stretch') {
      ctx.drawImage(image, 0, 0, width, height)
    } else {
      // fit: 居中等比 + 透明留边
      const srcW = image.naturalWidth || image.width
      const srcH = image.naturalHeight || image.height
      if (srcW > 0 && srcH > 0) {
        const ratio = Math.min(width / srcW, height / srcH)
        const dstW = Math.max(1, Math.round(srcW * ratio))
        const dstH = Math.max(1, Math.round(srcH * ratio))
        const dstX = Math.floor((width - dstW) / 2)
        const dstY = Math.floor((height - dstH) / 2)
        ctx.drawImage(image, 0, 0, srcW, srcH, dstX, dstY, dstW, dstH)
      }
    }

    // 2) 后处理：暗条 → 立体感 → 老兵勋章 → RA2 透明角（与 OS GenerateCameo 一致顺序）
    if (args.textBar?.enabled) applyTextBar(ctx, args.textBar)
    if (args.buttonize?.enabled) applyButtonize(ctx, args.buttonize)
    if (args.veteranBadge?.enabled) applyVeteranBadge(ctx, args.veteranBadge)
    // 透明角：默认启用（RA2 cameo 标准）；只有显式 { enabled: false } 才跳过
    const cornersEnabled = args.transparentCorners?.enabled !== false
    if (cornersEnabled) applyTransparentCorners(ctx, { enabled: true })

    // 3) 取像素 + 量化
    const imageData = ctx.getImageData(0, 0, width, height)
    const indexedPixels = PaletteQuantizer.quantize(
      imageData.data,
      width,
      height,
      args.palette,
      { transparentIndex, alphaThreshold },
    )

    // 4) 编码为 SHP type 0
    const shpBytes = ShpEncoder.encodeType0({
      canvasWidth: width,
      canvasHeight: height,
      frames: [
        {
          width,
          height,
          x: 0,
          y: 0,
          indexedPixels,
        },
      ],
    })

    // 5) 把量化结果反映回 RGBA 给 UI 预览（透明色保持透明）
    const previewRgba = indexedToRgba(indexedPixels, width, height, args.palette, transparentIndex)

    return { shpBytes, previewRgba, width, height, indexedPixels }
  }
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

async function loadImage(source: File | Blob | HTMLImageElement): Promise<HTMLImageElement> {
  if (source instanceof HTMLImageElement) {
    if (source.complete && source.naturalWidth > 0) return source
    return new Promise<HTMLImageElement>((resolve, reject) => {
      source.addEventListener('load', () => resolve(source), { once: true })
      source.addEventListener(
        'error',
        () => reject(new Error('CameoBuilder: failed to load image')),
        { once: true },
      )
    })
  }
  const url = URL.createObjectURL(source)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('CameoBuilder: failed to decode image'))
      img.src = url
    })
  } finally {
    // 浏览器解码完成后释放（注意：onload 是同步的，下一次事件循环 GC 不会用到此 url）
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
