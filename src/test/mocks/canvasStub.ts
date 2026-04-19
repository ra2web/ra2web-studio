/**
 * 极简 jsdom canvas mock，用于 SpriteSheetSlicer / GenericShpBuilder 测试。
 *
 * jsdom 默认 HTMLCanvasElement.getContext('2d') 返回 null。这里安装一个内存版 2D context，
 * 实现这些方法（足够我们的 SHP 流水线用）：
 *
 *  - getContext('2d')  → 返回单例 mock context（每个 canvas 各持一份）
 *  - clearRect / fillRect (no-op for fillRect; clear 整体清零简化版)
 *  - putImageData(imgData, dx, dy)
 *  - getImageData(sx, sy, sw, sh)
 *  - drawImage(src, ...)  支持 3-arg / 5-arg / 9-arg 三种重载
 *      src 可以是 (a) 用 makeMockImage 创建的 mock 图（.__pixels）
 *               (b) 另一个 canvas（取出它的 mock ctx 缓冲）
 *  - imageSmoothingEnabled / fillStyle / globalCompositeOperation 仅记录值
 *
 * 不实现矢量绘制 / fillText / 滤镜 / pattern。SHP 编码器只需要 putImageData + getImageData + drawImage。
 *
 * 注意：现实 drawImage 当 imageSmoothingEnabled=false 时是最近邻；这里默认就用最近邻（避免双线性插值）
 *      这与 GenericShpBuilder/CameoBuilder 关掉 smoothing 时的行为是一致的，对测试足够。
 */

interface MockImageLike {
  width: number
  height: number
  __pixels: Uint8ClampedArray
}

// jsdom 不提供 ImageData 全局，给一个最小 polyfill。生产代码只用 .data/.width/.height。
class ImageDataPolyfill {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

function ensureImageDataGlobal() {
  if (typeof (globalThis as any).ImageData === 'undefined') {
    ;(globalThis as any).ImageData = ImageDataPolyfill
  }
}

/**
 * 解析 fillStyle 字符串。仅识别真实代码会用到的几种格式：
 *  - '#RRGGBB' / '#RGB'
 *  - 'rgb(r, g, b)' / 'rgba(r, g, b, a)'
 * 其他兜底为黑色。
 */
function parseFillStyle(style: any): { r: number; g: number; b: number } {
  if (typeof style !== 'string') return { r: 0, g: 0, b: 0 }
  const hex = style.trim()
  if (hex.startsWith('#')) {
    let body = hex.slice(1)
    if (body.length === 3) body = body.split('').map((c) => c + c).join('')
    if (body.length === 6) {
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
      }
    }
  }
  const rgbMatch = hex.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgbMatch) {
    return {
      r: Math.round(Number(rgbMatch[1])) | 0,
      g: Math.round(Number(rgbMatch[2])) | 0,
      b: Math.round(Number(rgbMatch[3])) | 0,
    }
  }
  return { r: 0, g: 0, b: 0 }
}

class CanvasContextStub {
  canvas: { width: number; height: number }
  width: number
  height: number
  buf: Uint8ClampedArray
  imageSmoothingEnabled = true
  fillStyle: any = '#000'
  globalCompositeOperation = 'source-over'

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.width = canvas.width
    this.height = canvas.height
    this.buf = new Uint8ClampedArray(this.width * this.height * 4)
  }

  save() {}
  restore() {}
  scale() {}

  /**
   * 用当前 fillStyle 填充矩形。仅识别 'rgb(r, g, b)' / 'rgba(r, g, b, a)' / '#RRGGBB' 三种格式；
   * 其他值兜底为黑色。alpha 通道写 255。覆盖已有像素。
   */
  fillRect(x: number, y: number, w: number, h: number) {
    const color = parseFillStyle(this.fillStyle)
    const xStart = Math.max(0, x | 0)
    const yStart = Math.max(0, y | 0)
    const xEnd = Math.min(this.width, (x | 0) + (w | 0))
    const yEnd = Math.min(this.height, (y | 0) + (h | 0))
    for (let yy = yStart; yy < yEnd; yy++) {
      for (let xx = xStart; xx < xEnd; xx++) {
        const off = (yy * this.width + xx) * 4
        this.buf[off] = color.r
        this.buf[off + 1] = color.g
        this.buf[off + 2] = color.b
        this.buf[off + 3] = 255
      }
    }
  }

  clearRect(_x: number, _y: number, _w: number, _h: number) {
    for (let i = 0; i < this.buf.length; i++) this.buf[i] = 0
  }

  putImageData(imgData: ImageData, dx: number, dy: number) {
    const w = imgData.width
    const h = imgData.height
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dstX = dx + x
        const dstY = dy + y
        if (dstX < 0 || dstX >= this.width || dstY < 0 || dstY >= this.height) continue
        const src = (y * w + x) * 4
        const dst = (dstY * this.width + dstX) * 4
        this.buf[dst] = imgData.data[src]
        this.buf[dst + 1] = imgData.data[src + 1]
        this.buf[dst + 2] = imgData.data[src + 2]
        this.buf[dst + 3] = imgData.data[src + 3]
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number) {
    const data = new Uint8ClampedArray(sw * sh * 4)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const srcX = sx + x
        const srcY = sy + y
        const dstOff = (y * sw + x) * 4
        if (srcX < 0 || srcX >= this.width || srcY < 0 || srcY >= this.height) continue
        const srcOff = (srcY * this.width + srcX) * 4
        data[dstOff] = this.buf[srcOff]
        data[dstOff + 1] = this.buf[srcOff + 1]
        data[dstOff + 2] = this.buf[srcOff + 2]
        data[dstOff + 3] = this.buf[srcOff + 3]
      }
    }
    return new ImageData(data, sw, sh)
  }

  drawImage(...args: any[]) {
    const src = args[0]
    let sx = 0
    let sy = 0
    let sw = src?.width ?? 0
    let sh = src?.height ?? 0
    let dx = 0
    let dy = 0
    let dw = sw
    let dh = sh
    if (args.length === 9) {
      ;[, sx, sy, sw, sh, dx, dy, dw, dh] = args
    } else if (args.length === 5) {
      ;[, dx, dy, dw, dh] = args
    } else if (args.length === 3) {
      ;[, dx, dy] = args
    }

    let srcW = 0
    let srcH = 0
    let srcPixels: Uint8ClampedArray | null = null
    if (src && (src as any).__pixels instanceof Uint8ClampedArray) {
      const mock = src as MockImageLike
      srcPixels = mock.__pixels
      srcW = mock.width
      srcH = mock.height
    } else if (src && typeof (src as any).getContext === 'function') {
      // canvas → 取它的 mock ctx
      const cctx = (src as HTMLCanvasElement).getContext('2d') as any
      if (cctx && cctx.buf instanceof Uint8ClampedArray) {
        srcPixels = cctx.buf as Uint8ClampedArray
        srcW = cctx.width as number
        srcH = cctx.height as number
      }
    }
    if (!srcPixels) return

    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        // 最近邻采样
        const srcXX = sx + Math.floor((x / dw) * sw)
        const srcYY = sy + Math.floor((y / dh) * sh)
        const dstX = dx + x
        const dstY = dy + y
        if (dstX < 0 || dstX >= this.width || dstY < 0 || dstY >= this.height) continue
        if (srcXX < 0 || srcXX >= srcW || srcYY < 0 || srcYY >= srcH) continue
        const srcOff = (srcYY * srcW + srcXX) * 4
        const dstOff = (dstY * this.width + dstX) * 4
        this.buf[dstOff] = srcPixels[srcOff]
        this.buf[dstOff + 1] = srcPixels[srcOff + 1]
        this.buf[dstOff + 2] = srcPixels[srcOff + 2]
        this.buf[dstOff + 3] = srcPixels[srcOff + 3]
      }
    }
  }
}

let installed = false
export function installCanvasStubs() {
  if (installed) return
  installed = true
  ensureImageDataGlobal()
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return null
    if (!(this as any)._mockCtx) {
      ;(this as any)._mockCtx = new CanvasContextStub(this)
    }
    // 同步 buf 大小（如果 canvas.width/height 后改）
    const ctx = (this as any)._mockCtx as CanvasContextStub
    if (ctx.width !== this.width || ctx.height !== this.height) {
      ctx.width = this.width
      ctx.height = this.height
      ctx.buf = new Uint8ClampedArray(this.width * this.height * 4)
    }
    return ctx as any
  }
  // 最简 toBlob polyfill：jsdom 不实现真正的 PNG 编码；这里把 mock buf 原样
  // 打包成一个 Blob（带 __mockPixels 字段，单测可读出来验证 RGBA 内容）。
  proto.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback /* , type, quality */) {
    const ctx = (this as any)._mockCtx as CanvasContextStub | undefined
    const data = ctx ? new Uint8ClampedArray(ctx.buf) : new Uint8ClampedArray(this.width * this.height * 4)
    const blob = new Blob([data], { type: 'image/png' }) as Blob & {
      __mockPixels?: Uint8ClampedArray
      __mockWidth?: number
      __mockHeight?: number
    }
    blob.__mockPixels = data
    blob.__mockWidth = this.width
    blob.__mockHeight = this.height
    queueMicrotask(() => callback(blob))
  }
}

/**
 * 创建一个 mock 图像对象（可作为 drawImage 的源）。
 * @param fill 可选回调，根据 (x, y) 返回 RGBA。默认全白不透明。
 */
export function makeMockImage(
  width: number,
  height: number,
  fill?: (x: number, y: number) => [number, number, number, number],
): MockImageLike & { naturalWidth: number; naturalHeight: number } {
  const data = new Uint8ClampedArray(width * height * 4)
  if (fill) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b, a] = fill(x, y)
        const off = (y * width + x) * 4
        data[off] = r
        data[off + 1] = g
        data[off + 2] = b
        data[off + 3] = a
      }
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
    }
  }
  return {
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    __pixels: data,
  }
}

/** 把 mock 图像数据直接写到一个 canvas（绕过 drawImage 缩放，1:1 复制）。 */
export function makeCanvasFromMockImage(img: MockImageLike): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d') as any
  if (!ctx) throw new Error('canvasStub not installed')
  // 直接灌 buf
  ctx.buf.set(img.__pixels)
  return canvas
}
