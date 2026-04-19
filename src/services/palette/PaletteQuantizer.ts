import type { Rgb } from './PaletteTypes'

export interface QuantizeOptions {
  /**
   * 透明像素映射到的调色板索引；同时该索引会被排除在不透明像素的最近邻搜索之外，
   * 避免不透明的近黑被错误地映射到透明色。
   * 默认 0（cameo.pal 等 Westwood 调色板的约定透明位置）。
   */
  transparentIndex?: number
  /** 阈值以下视为透明，0..255。默认 128。 */
  alphaThreshold?: number
}

/**
 * 把 RGBA 数据映射到一个 256 色调色板，输出索引数组（每像素 1 字节）。
 * 实现：欧式距离最近邻 + Map 缓存。
 *
 * 性能：60x48=2880 像素、典型 cameo 源图唯一色 ~300-1000，1ms 内可完成。
 */
export class PaletteQuantizer {
  static quantize(
    rgba: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    palette: Rgb[],
    options: QuantizeOptions = {},
  ): Uint8Array {
    const transparentIndex = options.transparentIndex ?? 0
    const alphaThreshold = options.alphaThreshold ?? 128

    if (rgba.length < width * height * 4) {
      throw new Error(
        `PaletteQuantizer: rgba length ${rgba.length} too small for ${width}x${height}`,
      )
    }
    if (palette.length === 0) {
      throw new Error('PaletteQuantizer: empty palette')
    }
    if (transparentIndex < 0 || transparentIndex >= palette.length) {
      throw new Error(
        `PaletteQuantizer: transparentIndex ${transparentIndex} out of palette range`,
      )
    }

    const pixelCount = width * height
    const out = new Uint8Array(pixelCount)
    const cache = new Map<number, number>()

    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4
      const a = rgba[off + 3]
      if (a < alphaThreshold) {
        out[i] = transparentIndex
        continue
      }
      const r = rgba[off]
      const g = rgba[off + 1]
      const b = rgba[off + 2]
      // 三通道打包成 24 位 key 复用 Map（无负数风险）
      const key = (r << 16) | (g << 8) | b
      const cached = cache.get(key)
      if (cached !== undefined) {
        out[i] = cached
        continue
      }
      out[i] = nearestPaletteIndex(r, g, b, palette, transparentIndex)
      cache.set(key, out[i])
    }

    return out
  }

  /**
   * 单点最近邻查询，便于其它代码 (例如生成 cameo 蓝背景预览) 复用。
   * @param skipIndex 不参与搜索的索引（一般传 transparentIndex）；< 0 表示不跳过。
   */
  static nearestIndex(
    r: number,
    g: number,
    b: number,
    palette: Rgb[],
    skipIndex = -1,
  ): number {
    return nearestPaletteIndex(r, g, b, palette, skipIndex)
  }
}

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: Rgb[],
  skipIndex: number,
): number {
  let bestIdx = -1
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    if (i === skipIndex) continue
    const p = palette[i]
    const dr = p.r - r
    const dg = p.g - g
    const db = p.b - b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
      if (dist === 0) return i
    }
  }
  if (bestIdx < 0) {
    // 所有 index 都被 skip 了（极端情况，例如 palette 长度 1 + skip 该 index）。
    // 回退到第 0 项。
    return 0
  }
  return bestIdx
}
