/**
 * OS SHP Builder 的 cameo 文字渲染等价实现。
 *
 * 与 SHP_Cameo.pas 的 AddCharToBMP / AddCharToBMP2 / WorkOutCharLength 对齐：
 *   - 字符集：0-9, A-Z, '.', 空格（其它字符跳过 / 用作"非法字符回退"）
 *   - 字符大小写不敏感（OS 用 AnsiUpperCase 转大写）
 *   - 字宽是变宽：通过扫描 sprite 第 2..5 列是否有非透明像素决定
 *   - 空格固定 3px 宽
 *   - 第二行字体 (line2) sprite 索引 = 第一行索引 + 38
 */

import {
  OS_CAMEO_SPRITE_WIDTH,
  OS_CAMEO_SPRITES,
} from './osCameoFontData'

export type OsCameoFontVariant = 'line1' | 'line2'

/**
 * 把单字符映射到 line1 的 ImageList 索引（0..36）。空格返回 -2 (固定 3px 宽)；
 * 非法字符返回 -1（OS 行为：跳过该字符）。
 */
export function osCharToLine1Index(ch: string): number {
  if (!ch) return -1
  // 大小写不敏感
  const c = ch.toUpperCase()
  const code = c.charCodeAt(0)
  // '0'..'9'
  if (code >= 0x30 && code <= 0x39) return code - 0x30
  // 'A'..'Z'
  if (code >= 0x41 && code <= 0x5a) return 10 + (code - 0x41)
  if (c === '.') return 36
  if (c === ' ') return -2
  return -1
}

/**
 * 把单字符映射到对应 variant 的实际 sprite 索引。
 * line1: 0..36；line2: line1 索引 + 38（38..74）。空格返回 -2，非法返回 -1。
 */
export function osCharToSpriteIndex(ch: string, variant: OsCameoFontVariant): number {
  const i = osCharToLine1Index(ch)
  if (i < 0) return i
  if (variant === 'line2') return i + 38
  return i
}

/**
 * 对应 OS WorkOutCharLength：
 * 把 sprite 看作 6 行高（y=0..5），从左到右扫列：
 *   - 默认宽 2
 *   - 第 2 列有非透明像素 → 宽 3
 *   - 第 3 列有非透明像素 → 宽 4
 *   - 第 4 列有非透明像素 → 宽 5
 *   - 第 5 列有非透明像素 → 宽 6
 * （OS 代码继续到列 5，源码截断在第 4 列后；这里我们扩到 5 列保险，因为 sprite 是 20x12，
 *  字符部分一般在 6x6 内）
 */
export function osCharSpriteWidth(spriteIndex: number): number {
  const sprite = OS_CAMEO_SPRITES[spriteIndex]
  if (!sprite) return 0
  let w = 2
  for (let col = 2; col <= 5; col++) {
    let hasOpaque = false
    for (let y = 0; y < 6; y++) {
      const off = (y * OS_CAMEO_SPRITE_WIDTH + col) * 4
      if (sprite[off + 3] !== 0) {
        hasOpaque = true
        break
      }
    }
    if (hasOpaque) w = col + 1
  }
  return w
}

/** 一个字符的渲染信息：对应 sprite 索引 + 字符在拼接位图中占多少像素宽。 */
export interface OsCameoCharLayout {
  /** 字符位置在文本中的索引 */
  index: number
  /** 字符 sprite 索引；-2 表示空格；-1 表示非法（不渲染、不占宽） */
  spriteIndex: number
  /** 占据的像素宽度 */
  width: number
}

/** 计算一段文字的 layout，决定整行宽度与每个字符的水平偏移。 */
export function layoutOsCameoText(
  text: string,
  variant: OsCameoFontVariant,
): { totalWidth: number; chars: OsCameoCharLayout[] } {
  const chars: OsCameoCharLayout[] = []
  let totalWidth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const spriteIndex = osCharToSpriteIndex(ch, variant)
    if (spriteIndex === -1) {
      // 非法字符：OS 直接跳过
      continue
    }
    let width = 0
    if (spriteIndex === -2) {
      width = 3 // 空格固定 3px
    } else {
      width = osCharSpriteWidth(spriteIndex)
    }
    chars.push({ index: i, spriteIndex, width })
    totalWidth += width
  }
  return { totalWidth, chars }
}

/**
 * 判定一段文字是否可被 OS 位图字体完全覆盖（不含任何非法字符）。
 * 包含中文 / 全角符号 / Emoji 等 → false（应该回退到系统字体）。
 */
export function isOsCameoFontFullyCoverable(text: string): boolean {
  if (!text) return true
  for (let i = 0; i < text.length; i++) {
    if (osCharToLine1Index(text[i]) === -1) return false
  }
  return true
}

/**
 * 把一行 OS 风格文字绘到 canvas。
 *
 * - 文字水平居中到 cameoWidth
 * - 顶端 y 坐标 = topY，字符高度永远是 6 行
 * - 默认保留 OS sprite 自带的纵向白→灰渐变（顶 ~240、底 ~160），与 OS Shp Builder 视觉一致。
 *   只有显式传入 `recolor: true` + `color` 时才一律重涂为单色（用于自定义品牌色等罕见场景）
 *
 * @returns 实际绘制的宽度（像素）
 */
export function drawOsCameoText(
  ctx: CanvasRenderingContext2D,
  text: string,
  topY: number,
  cameoWidth: number,
  variant: OsCameoFontVariant,
  options: {
    /** 重涂为指定色（破坏原渐变）。默认保留 sprite 自带渐变。 */
    recolor?: boolean
    color?: string
    shadow?: boolean
    shadowColor?: string
  } = {},
): number {
  const { totalWidth, chars } = layoutOsCameoText(text, variant)
  if (chars.length === 0 || totalWidth === 0) return 0

  // 把每个字符 sprite 拼到一张临时 canvas（宽 = totalWidth + 1，高 6），完成后再着色 + 阴影 + 居中
  const tmp = document.createElement('canvas')
  tmp.width = totalWidth
  tmp.height = 6
  const tmpCtx = tmp.getContext('2d')
  if (!tmpCtx) return 0
  tmpCtx.imageSmoothingEnabled = false

  let cursor = 0
  for (const charLayout of chars) {
    if (charLayout.spriteIndex >= 0) {
      const sprite = OS_CAMEO_SPRITES[charLayout.spriteIndex]
      if (sprite) {
        // sprite 是 20x12 RGBA，我们只需要左上 charLayout.width x 6 区域
        // 复制到临时 ImageData 然后 putImageData
        const sliced = new Uint8ClampedArray(charLayout.width * 6 * 4)
        for (let y = 0; y < 6; y++) {
          for (let x = 0; x < charLayout.width; x++) {
            const srcOff = (y * OS_CAMEO_SPRITE_WIDTH + x) * 4
            const dstOff = (y * charLayout.width + x) * 4
            sliced[dstOff] = sprite[srcOff]
            sliced[dstOff + 1] = sprite[srcOff + 1]
            sliced[dstOff + 2] = sprite[srcOff + 2]
            sliced[dstOff + 3] = sprite[srcOff + 3]
          }
        }
        tmpCtx.putImageData(new ImageData(sliced, charLayout.width, 6), cursor, 0)
      }
    }
    // spriteIndex === -2 的空格：直接前进 width 像素
    cursor += charLayout.width
  }

  // 仅在用户显式 recolor=true + 提供 color 时才覆盖 sprite 自带的渐变
  // （默认保留 OS sprite 的纵向白→灰渐变，与 OS Shp Builder 视觉完全一致）
  if (options.recolor && options.color) {
    tmpCtx.save()
    tmpCtx.globalCompositeOperation = 'source-in'
    tmpCtx.fillStyle = options.color
    tmpCtx.fillRect(0, 0, tmp.width, tmp.height)
    tmpCtx.restore()
  }

  // 居中绘制
  const drawX = Math.floor((cameoWidth - totalWidth) / 2)

  // 阴影：先在 (drawX+1, topY+1) 绘制一份纯黑剪影
  if (options.shadow) {
    const shadowCtx = document.createElement('canvas')
    shadowCtx.width = tmp.width
    shadowCtx.height = tmp.height
    const sCtx = shadowCtx.getContext('2d')
    if (sCtx) {
      sCtx.imageSmoothingEnabled = false
      sCtx.drawImage(tmp, 0, 0)
      sCtx.globalCompositeOperation = 'source-in'
      sCtx.fillStyle = options.shadowColor ?? '#000000'
      sCtx.fillRect(0, 0, shadowCtx.width, shadowCtx.height)
      ctx.drawImage(shadowCtx, drawX + 1, topY + 1)
    }
  }

  ctx.drawImage(tmp, drawX, topY)
  return totalWidth
}
