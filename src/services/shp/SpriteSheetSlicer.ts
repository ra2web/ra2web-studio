/**
 * 把一张大图按等距网格切成 N 张同尺寸 canvas。
 * 用于多帧 SHP：用户输入一张 sprite sheet（例如 8x4 网格 = 32 帧），
 * 自动逐格切成独立 canvas，再交给 GenericShpBuilder 打包成多帧 SHP。
 *
 * 网格布局（top-down，row-major）：
 *
 *   col0       col1       col2 ...
 *   ┌────────┐ ┌────────┐
 *   │ frame0 │ │ frame1 │ ...
 *   ├────────┤ ├────────┤
 *   │ frameN │ │ ...    │ ...
 *
 *   起始位置 = (offsetX, offsetY)
 *   每格尺寸 = (frameWidth, frameHeight)
 *   每格之间间距 = (gapX, gapY)
 *   读取顺序：row-major，左→右，上→下
 */

export interface SliceArgs {
  source: HTMLImageElement
  /** 列数 */
  cols: number
  /** 行数 */
  rows: number
  /** 单帧宽度（像素） */
  frameWidth: number
  /** 单帧高度（像素） */
  frameHeight: number
  /** 第一帧在 sprite sheet 上的 X 偏移，默认 0 */
  offsetX?: number
  /** 第一帧在 sprite sheet 上的 Y 偏移，默认 0 */
  offsetY?: number
  /** 帧之间的水平间距，默认 0 */
  gapX?: number
  /** 帧之间的垂直间距，默认 0 */
  gapY?: number
  /**
   * 限制最多取多少帧。当 maxFrames < cols*rows 时只取前 N 帧（按 row-major 顺序）。
   * 不传等价 cols*rows。
   */
  maxFrames?: number
}

export class SpriteSheetSlicer {
  static slice(args: SliceArgs): HTMLCanvasElement[] {
    const {
      source,
      cols,
      rows,
      frameWidth,
      frameHeight,
      offsetX = 0,
      offsetY = 0,
      gapX = 0,
      gapY = 0,
    } = args

    if (!Number.isInteger(cols) || cols <= 0) {
      throw new Error(`SpriteSheetSlicer: invalid cols ${cols}`)
    }
    if (!Number.isInteger(rows) || rows <= 0) {
      throw new Error(`SpriteSheetSlicer: invalid rows ${rows}`)
    }
    if (!Number.isInteger(frameWidth) || frameWidth <= 0) {
      throw new Error(`SpriteSheetSlicer: invalid frameWidth ${frameWidth}`)
    }
    if (!Number.isInteger(frameHeight) || frameHeight <= 0) {
      throw new Error(`SpriteSheetSlicer: invalid frameHeight ${frameHeight}`)
    }

    const totalSlots = cols * rows
    const limit = args.maxFrames != null
      ? Math.max(0, Math.min(args.maxFrames, totalSlots))
      : totalSlots

    const result: HTMLCanvasElement[] = []
    for (let i = 0; i < limit; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const sx = offsetX + col * (frameWidth + gapX)
      const sy = offsetY + row * (frameHeight + gapY)

      const canvas = document.createElement('canvas')
      canvas.width = frameWidth
      canvas.height = frameHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error(`SpriteSheetSlicer: failed to get 2d context for frame #${i}`)
      }
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, frameWidth, frameHeight)
      // 即便源图越界，drawImage 也只会绘制有效区域，超出部分自然透明
      ctx.drawImage(source, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)
      result.push(canvas)
    }
    return result
  }
}
