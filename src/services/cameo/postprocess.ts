import {
  VETERAN_BADGE_HEIGHT,
  VETERAN_BADGE_RGBA,
  VETERAN_BADGE_WIDTH,
} from './veteranSpriteData'
import {
  drawOsCameoText,
  isOsCameoFontFullyCoverable,
} from './osCameoFont'

/**
 * Cameo 后处理算子集合，全部接收一个 2D canvas context 并就地修改像素。
 * 顺序：applyTextBar → applyButtonize（OS Blade）→ applyVeteranBadge → applyTransparentCorners
 * 之后再交给 PaletteQuantizer 一次性量化到 cameo.pal。
 *
 * 几何细节严格对齐 OS SHP Builder 的 SHP_Cameo.pas / FormCameoGenerator.pas：
 * - 文字栏 osStrict：暗条单行 7px / 双行 13px，文字 baseline y=h-1（单/双底）+ y=h-7（双顶），
 *   对应 OS DrawCameoBar_TextBar / TextBar2 与 DrawCameoText / DrawCameoText2 的 y=42..47 / y=h-12..h-7
 * - 老兵徽标位置 (2, 2) 起的 20×12 区域，对应 OS DrawEliteIconRA2
 * - 透明角抹掉 4 角各 3 像素，对应 OS DrawCameo_Transparent
 */

export interface TextBarOptions {
  enabled: boolean
  /** 第一行（视觉顶行）。 */
  text?: string
  /** 第二行（视觉底行）。空字符串等价于单行模式。 */
  text2?: string
  /**
   * OS 严格几何模式，默认 true。
   * - true：暗条 + 文字硬边；ASCII 字符走 OS 内嵌位图字体；
   *   非 ASCII 走 fillText 后做 alpha 二值化保持 1-bit 像素感
   * - false：暗条 height + fadeRows 自由可调；文字走普通 fillText（带灰度过渡）
   */
  osStrict?: boolean
  /**
   * 暗条高度（像素），用户可调。default 8。
   * 单行模式：暗条占 [h-barHeight, h)。
   * 双行模式：暗条占 [h-barHeight, h)；如果 < 13，文字会溢出，建议 ≥ 13。
   */
  barHeight?: number
  /** osStrict=false 时生效：上沿渐变行数。默认 3。 */
  fadeRows?: number
  /** 暗条最深处的不透明度 0..255。默认 160。 */
  darkness?: number
  /** 字号 (px)。默认 8。 */
  fontSize?: number
  /** 字体族（CSS font-family）。默认包含 CJK 回退栈。 */
  fontFamily?: string
  /** 字重，默认 'bold'。 */
  fontWeight?: 'normal' | 'bold'
  /** 文字主色。默认白色。 */
  textColor?: string
  /** 是否在文字下叠 1px 黑阴影。默认 true。 */
  textShadow?: boolean
  /** osStrict + 非 ASCII 时的 alpha 二值化阈值 (0..255)。默认 96。 */
  sharpenThreshold?: number
  /**
   * 字符宽高比修正：横向拉伸倍数。默认 1.25。
   * 系统中文字体在小字号下普遍是"瘦高型"（如 fontSize=10 → 8w x 9h），
   * 而 RA2 原版/手画 cameo 字符是"宽矮型"（约 9w x 8h）。
   * 默认 1.25 把字符横向拉伸 25%，让 8x9 → 10x9，接近原版宽高比。
   * 1.0 = 关闭拉伸；1.5 = 更宽。仅作用于 Chinese / fallback 路径。
   */
  charAspectRatio?: number
}

export interface ButtonizeOptions {
  enabled: boolean
  /**
   * Light 边强度（OS Blade 风格）。每个像素 R/G/B += lightness（饱和裁剪 0..255）。
   * 作用区域：右内缩 1px 列 (W-2) + 顶部 2 行 light bar（列 4..34）+ 左上角"亮柱" patch。
   * 范围 1..255；默认 20（与 OS DFM Buttonize_Lightness 默认一致）。
   */
  lightness?: number
  /**
   * Dark 边强度（OS Blade 风格）。每个像素 R/G/B -= darkness（饱和裁剪 0..255）。
   * 作用区域：左 1 列 (x=0)，纵向 y=2..H-3。
   * 范围 1..255；默认 40（与 OS DFM Buttonize_Darkness 默认一致）。
   */
  darkness?: number
}

export interface VeteranBadgeOptions {
  enabled: boolean
  /** 默认 'top-left' 对应 OS DrawEliteIconRA2 的 (2, 2) 起始位置；'top-right' 仅作为非 OS 选项。 */
  position?: 'top-left' | 'top-right'
  /** 默认 2，对齐 OS 的 (2, 2) 起始。 */
  margin?: number
}

export interface TransparentCornersOptions {
  enabled: boolean
}

const DEFAULT_TEXT_BAR_HEIGHT = 8
const DEFAULT_TEXT_BAR_DARKNESS = 160
const DEFAULT_TEXT_BAR_FADE = 3
const DEFAULT_TEXT_FONT_SIZE = 8
const DEFAULT_TEXT_FONT_WEIGHT: 'bold' = 'bold'
const DEFAULT_SHARPEN_THRESHOLD = 96
const DEFAULT_CHAR_ASPECT_RATIO = 1.25

/**
 * 默认字体栈：先用各平台的中文界面字体，再回退到等宽 / sans-serif。
 * 这样英文 / 中文 / 标点 / Emoji 都能拿到能命中的字形，避免出现豆腐块。
 */
const DEFAULT_TEXT_FONT_FAMILY =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", "WenQuanYi Micro Hei", system-ui, sans-serif'
const DEFAULT_TEXT_COLOR = '#ffffff'

// OS SHP Builder Blade 默认值（FormCameoGenerator.dfm: Buttonize_Lightness.Value=20, Buttonize_Darkness.Value=40）
const DEFAULT_BUTTONIZE_LIGHTNESS = 20
const DEFAULT_BUTTONIZE_DARKNESS = 40

let warnedFontSizeOverflow = false

/**
 * 在 canvas 底部画暗条 + 居中渲染文字。
 *
 * 几何由用户控制的 `barHeight`（默认 8）决定：
 *   暗条占 [h - barHeight, h)，单行模式文字 baseline = h - 1，
 *   双行模式 text2 baseline = h - 1，text baseline = h - 1 - lineHeight (默认 6)。
 *
 * osStrict 模式：硬边暗条（一次性 fillRect）+ ASCII 走 OS 内嵌位图字体；
 *               非 ASCII 走 fillText 后做 alpha 二值化保 1-bit 像素感。
 * osStrict=false：暗条逐行加深 + fadeRows 上沿渐变；文字走普通 fillText。
 */
export function applyTextBar(ctx: CanvasRenderingContext2D, options: TextBarOptions): void {
  if (!options.enabled) return
  const canvas = ctx.canvas
  const w = canvas.width
  const h = canvas.height

  const text = stripControlChars(options.text ?? '')
  const text2 = stripControlChars(options.text2 ?? '')
  const twoLine = text2.length > 0
  const osStrict = options.osStrict !== false
  const darkness = clamp(options.darkness ?? DEFAULT_TEXT_BAR_DARKNESS, 0, 255)
  const barH = clampPositiveInt(options.barHeight ?? DEFAULT_TEXT_BAR_HEIGHT, 1, h)
  // 一行文字像素高度（OS 字体是 6 px；自由 fillText 也按 6 估算 line-spacing）
  const LINE_PX = 6

  ctx.save()

  // ---------- 暗条 ----------
  if (darkness > 0) {
    if (osStrict) {
      // 硬边一次性 fillRect
      ctx.fillStyle = `rgba(0, 0, 0, ${(darkness / 255).toFixed(3)})`
      ctx.fillRect(0, h - barH, w, barH)
    } else {
      // 自由模式：逐行画半透明黑色，上沿 fadeRows 范围内 ease 过渡
      const fadeRows = clamp(options.fadeRows ?? DEFAULT_TEXT_BAR_FADE, 0, barH)
      for (let row = 0; row < barH; row++) {
        const y = h - barH + row
        let alpha255: number
        if (row < fadeRows && fadeRows > 0) {
          const t = row / fadeRows
          const eased = 1 - (1 - t) * (1 - t) // easeOutQuad
          alpha255 = Math.round(darkness * eased)
        } else {
          alpha255 = darkness
        }
        if (alpha255 <= 0) continue
        ctx.fillStyle = `rgba(0, 0, 0, ${(alpha255 / 255).toFixed(3)})`
        ctx.fillRect(0, y, w, 1)
      }
    }
  }

  // ---------- 文字 ----------
  if (text || text2) {
    const textColor = options.textColor ?? DEFAULT_TEXT_COLOR
    const useShadow = options.textShadow !== false

    // OS 字符集只覆盖 0-9 A-Z . 空格；任何不在此集的字符 → 回退到系统字体
    const canUseBitmapFont =
      osStrict && isOsCameoFontFullyCoverable(text) && isOsCameoFontFullyCoverable(text2)

    if (canUseBitmapFont) {
      // ---- OS 位图字体路径 ----
      // 文字像素高度固定 6 行：单行 top = h - LINE_PX；双行 text2 top = h - LINE_PX, text top = h - 2*LINE_PX
      if (twoLine) {
        drawOsCameoText(ctx, text, h - 2 * LINE_PX, w, 'line1', { color: textColor, shadow: useShadow })
        drawOsCameoText(ctx, text2, h - LINE_PX, w, 'line2', { color: textColor, shadow: useShadow })
      } else {
        drawOsCameoText(ctx, text, h - LINE_PX, w, 'line1', { color: textColor, shadow: useShadow })
      }
    } else {
      // ---- 回退：canvas fillText（中文 / 全角符号 / 自由模式） ----
      const fontSize = clampPositiveInt(options.fontSize ?? DEFAULT_TEXT_FONT_SIZE, 4, 64)
      const fontFamily = options.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY
      const fontWeight = options.fontWeight ?? DEFAULT_TEXT_FONT_WEIGHT
      const sharpenThreshold = clamp(options.sharpenThreshold ?? DEFAULT_SHARPEN_THRESHOLD, 0, 255)
      const charAspectRatio = clamp(options.charAspectRatio ?? DEFAULT_CHAR_ASPECT_RATIO, 0.5, 2.0)
      if (osStrict && fontSize > 12 && !warnedFontSizeOverflow) {
        console.warn(
          '[applyTextBar] fontSize > 12 时建议增大 barHeight 以避免文字溢出暗条',
        )
        warnedFontSizeOverflow = true
      }

      const font = `${fontWeight} ${fontSize}px ${fontFamily}`
      // osStrict 下用 alpha 二值化把 fillText 的灰度反走样硬化成像素硬边
      const sharpen = osStrict

      const drawTextLine = (str: string, baselineY: number) => {
        if (!str) return
        if (sharpen) {
          drawSharpenedText(
            ctx,
            str,
            w / 2,
            baselineY,
            font,
            textColor,
            useShadow,
            sharpenThreshold,
            true,            // verticalGradient (default white)
            charAspectRatio,
          )
        } else {
          ctx.save()
          ctx.font = font
          ctx.textAlign = 'center'
          ctx.textBaseline = 'alphabetic'
          if (useShadow) {
            ctx.fillStyle = '#000000'
            ctx.fillText(str, w / 2 + 1, baselineY + 1)
          }
          ctx.fillStyle = textColor
          ctx.fillText(str, w / 2, baselineY)
          ctx.restore()
        }
      }

      // baseline：底行 = h - 1，顶行 = h - 1 - lineHeight；
      // 自由模式 fontSize 大时 lineHeight 应该跟字号走（用 fontSize + 2 留间距）
      const lineHeight = osStrict ? LINE_PX : Math.max(LINE_PX, fontSize + 1)
      if (twoLine) {
        drawTextLine(text, h - 1 - lineHeight)
        drawTextLine(text2, h - 1)
      } else {
        drawTextLine(text, h - 1)
      }
    }
  }

  ctx.restore()
}

/**
 * 把 fillText 输出做 alpha 二值化，输出硬边像素图。
 *
 * 浏览器对 fillText 强制启用 anti-aliasing，没有 API 关闭。要想得到 OS Shp Builder
 * 那种 1-bit 像素硬边效果（"喷气炮"那种用 PS 手画的字），唯一办法是把 fillText
 * 渲染到临时画布，然后逐像素：alpha > 阈值 → 完全不透明 + 目标色，否则完全透明。
 *
 * 阈值越小，笔画越粗（捕获更多浅灰像素）；阈值越大，笔画越细。128 是中间值。
 */
function drawSharpenedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  font: string,
  color: string,
  shadow: boolean,
  threshold = DEFAULT_SHARPEN_THRESHOLD,
  /** 是否叠加 OS 风格纵向白→灰渐变（顶 ~240、底 ~140）。仅在 color 是默认白色时启用。 */
  verticalGradient = true,
  /**
   * 字符宽高比修正：横向拉伸倍数。默认 1.25。
   * 系统中文字体在 8-12px 下普遍是"瘦高"，原版 cameo 字符是"宽矮"。
   * 在 fillText 之前对临时画布做 ctx.scale(charAspectRatio, 1)，让字符横向变宽，
   * 高度保持不变 → 输出 ~9w x 8h 的方矮字符，与原版宽高比对齐。
   */
  charAspectRatio = DEFAULT_CHAR_ASPECT_RATIO,
): void {
  // 用一份 measure-only context 量字宽（避免污染主 ctx 的 font）
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')
  if (!measureCtx) return
  measureCtx.font = font
  const metrics = measureCtx.measureText(text)
  // 计算横向拉伸后的实际渲染宽度
  const stretchedTextW = Math.max(1, Math.ceil(metrics.width * charAspectRatio))

  // 估算字号 px
  const fontSizeMatch = font.match(/(\d+)px/)
  const fontSize = fontSizeMatch ? parseInt(fontSizeMatch[1], 10) : 8

  // 临时画布按拉伸后宽度分配；高度仍按字号估
  const pad = 2
  const tw = stretchedTextW + pad * 2
  const th = fontSize + pad * 2 + 4 // 多留几行给 descender / 中文笔画

  const tmp = document.createElement('canvas')
  tmp.width = tw
  tmp.height = th
  const tctx = tmp.getContext('2d')
  if (!tctx) return

  tctx.font = font
  tctx.textAlign = 'left'
  tctx.textBaseline = 'alphabetic'
  tctx.fillStyle = '#ffffff'
  // 在临时画布里：x = pad，baseline 距底部 pad+1 像素
  const tmpBaselineY = th - pad - 1

  // 横向拉伸：字符宽 × charAspectRatio，高度不变。
  // scale 之后 x 坐标会被 *charAspectRatio，所以传 pad/charAspectRatio 让最终落在 x=pad
  if (charAspectRatio !== 1.0) {
    tctx.save()
    tctx.scale(charAspectRatio, 1)
    tctx.fillText(text, pad / charAspectRatio, tmpBaselineY)
    tctx.restore()
  } else {
    tctx.fillText(text, pad, tmpBaselineY)
  }

  // 二值化：alpha > 阈值 → 全不透明；否则全透明
  const imageData = tctx.getImageData(0, 0, tw, th)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > threshold) {
      d[i + 3] = 255
    } else {
      d[i] = 0
      d[i + 1] = 0
      d[i + 2] = 0
      d[i + 3] = 0
    }
  }
  tctx.putImageData(imageData, 0, 0)

  // 找出文字像素的实际竖直范围（上下边界），让纵向渐变只覆盖文字本身、不被 padding 拉宽
  let firstFilledRow = th
  let lastFilledRow = -1
  for (let y = 0; y < th; y++) {
    let hasOpaque = false
    for (let x = 0; x < tw; x++) {
      if (d[(y * tw + x) * 4 + 3] > 0) {
        hasOpaque = true
        break
      }
    }
    if (hasOpaque) {
      if (firstFilledRow === th) firstFilledRow = y
      lastFilledRow = y
    }
  }

  // 用纵向渐变 fillRect + source-in 一次性着色：
  // - 默认白色 + verticalGradient → OS 风格 240→140 渐变（与 sprite 抠出的实际 RGB 一致）
  // - 其它 color：纯色平涂（自定义品牌色场景）
  tctx.save()
  tctx.globalCompositeOperation = 'source-in'
  if (verticalGradient && isDefaultWhite(color) && lastFilledRow >= firstFilledRow) {
    const grad = tctx.createLinearGradient(0, firstFilledRow, 0, lastFilledRow + 1)
    grad.addColorStop(0, 'rgb(240, 240, 240)')
    grad.addColorStop(0.4, 'rgb(223, 223, 223)')
    grad.addColorStop(0.7, 'rgb(175, 175, 175)')
    grad.addColorStop(1, 'rgb(140, 140, 140)')
    tctx.fillStyle = grad
  } else {
    tctx.fillStyle = color
  }
  tctx.fillRect(0, 0, tw, th)
  tctx.restore()

  // 计算到主画布的位置：水平居中、baseline 对齐
  const drawX = Math.round(centerX - tw / 2)
  const drawY = Math.round(baselineY - tmpBaselineY)

  // 阴影：先画一份纯黑剪影，偏移 +1, +1
  if (shadow) {
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = tw
    shadowCanvas.height = th
    const sctx = shadowCanvas.getContext('2d')
    if (sctx) {
      sctx.imageSmoothingEnabled = false
      sctx.drawImage(tmp, 0, 0)
      sctx.globalCompositeOperation = 'source-in'
      sctx.fillStyle = '#000000'
      sctx.fillRect(0, 0, tw, th)
      ctx.save()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(shadowCanvas, drawX + 1, drawY + 1)
      ctx.restore()
    }
  }

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp, drawX, drawY)
  ctx.restore()
}

/**
 * 立体感（Buttonize）—— OS SHP Builder Blade 版本（移植自 FormCameoGenerator.pas + SHP_Cameo.pas）。
 *
 * 与原先 1px alpha 覆盖的本质区别：
 * - 直接对 RGB 通道做加 / 减（饱和裁剪 0..255），而不是把白 / 黑半透明铺一层；
 * - 几何不对称：左 1 列 dark / 右内缩 1px 列 light / 顶 2 行 light bar（列 4..34）+ 左上角"亮柱" patch；
 * - alpha 通道保持不变（透明像素仍透明，不会被"染上"边色）。
 *
 * 对应 OS 调用：
 *   DrawCameoBar_DarkSide_Blade  → 左 (0, 0, y=2..H-3) dark
 *   DrawCameoBar_LightSide_Blade → 右 (W-2, W-2, y=1..H-2) light
 *   DrawCameoBar_LightTop_Blade  → 顶 (4..33, y=1..2) light + (34, 2) light + 角 patch
 *
 * 与 s1/s2 不同：Blade 三个调用都用同一个 Value（不存在外圈 *2 / 内圈 *1 的渐变），
 * 只有左上角 patch 用 lightness*2 形成局部高光。
 *
 * 边界保护：宽度 < 36 / 高度 < 6 时直接 no-op（OS 几何硬编码到列 33/34，
 * 太窄就不再具备物理意义）。常规 60×48 cameo 不会触发。
 */
export function applyButtonize(ctx: CanvasRenderingContext2D, options: ButtonizeOptions): void {
  if (!options.enabled) return
  const canvas = ctx.canvas
  const w = canvas.width
  const h = canvas.height
  if (w < 36 || h < 6) return // 太小，OS Blade 几何无意义

  const lightness = clamp(options.lightness ?? DEFAULT_BUTTONIZE_LIGHTNESS, 0, 255)
  const darkness = clamp(options.darkness ?? DEFAULT_BUTTONIZE_DARKNESS, 0, 255)
  if (lightness === 0 && darkness === 0) return

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // (1) 左 1 列 dark：x=0, y=2..H-3
  if (darkness > 0) {
    shadeRect(data, w, h, 0, 0, 2, h - 3, darkness, 'dark')
  }

  // (2) 右内缩 1px 列 light：x=W-2, y=1..H-2
  if (lightness > 0) {
    shadeRect(data, w, h, w - 2, w - 2, 1, h - 2, lightness, 'light')

    // (3) 顶 light bar：列 4..33，行 1..2
    shadeRect(data, w, h, 4, 33, 1, 2, lightness, 'light')

    // (4) 单点过渡：(34, 2) light
    shadeRect(data, w, h, 34, 34, 2, 2, lightness, 'light')

    // (5) 左上角"亮柱" patch：取已亮过的 (34, 2) RGB，再 + lightness*2，
    //     写到 (1..3, 1..2)，跳过 (1, 1)。这与 OS LightTop_Blade 末尾的循环一致。
    const sampleIdx = (2 * w + 34) * 4
    if (data[sampleIdx + 3] > 0) {
      const baseR = data[sampleIdx]
      const baseG = data[sampleIdx + 1]
      const baseB = data[sampleIdx + 2]
      const lr = saturate(baseR + lightness * 2)
      const lg = saturate(baseG + lightness * 2)
      const lb = saturate(baseB + lightness * 2)
      for (let y = 1; y <= 2; y++) {
        for (let x = 1; x <= 3; x++) {
          if (x === 1 && y === 1) continue // OS 显式跳过 (1, 1)
          const off = (y * w + x) * 4
          if (data[off + 3] === 0) continue // 透明像素不触碰
          data[off] = lr
          data[off + 1] = lg
          data[off + 2] = lb
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

/**
 * 对矩形 (x1..x2, y1..y2)（含端点）的每个像素 R/G/B 加 / 减 value（饱和裁剪 0..255）。
 * alpha 通道与 alpha=0 的透明像素都不动。
 */
function shadeRect(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  value: number,
  direction: 'dark' | 'light',
): void {
  const xStart = Math.max(0, x1)
  const xEnd = Math.min(w - 1, x2)
  const yStart = Math.max(0, y1)
  const yEnd = Math.min(h - 1, y2)
  if (xStart > xEnd || yStart > yEnd) return

  const sign = direction === 'dark' ? -1 : 1
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const off = (y * w + x) * 4
      if (data[off + 3] === 0) continue // 透明像素不触碰
      data[off] = saturate(data[off] + sign * value)
      data[off + 1] = saturate(data[off + 1] + sign * value)
      data[off + 2] = saturate(data[off + 2] + sign * value)
    }
  }
}

function saturate(v: number): number {
  if (v < 0) return 0
  if (v > 255) return 255
  return v
}

/**
 * 把老兵 V 形勋章 sprite 画到 cameo 指定位置（默认 OS 标准的左上 (2, 2)）。
 * 像素来源：veteranSpriteData.ts 由 scripts/extract-veteran-sprite.mjs 从 OS .dfm
 * ImageList1[37] 提取，与 OS SHP Builder 完全一致。
 */
export function applyVeteranBadge(
  ctx: CanvasRenderingContext2D,
  options: VeteranBadgeOptions,
): void {
  if (!options.enabled) return
  const canvas = ctx.canvas
  const margin = Math.max(0, options.margin ?? 2)
  const position = options.position ?? 'top-left'
  const badge = getVeteranBadgeImageData()
  const drawX = position === 'top-right' ? canvas.width - badge.width - margin : margin
  const drawY = margin

  // 用临时 canvas 把 ImageData 当 sprite，避免 putImageData 不支持透明合成
  const tmp = document.createElement('canvas')
  tmp.width = badge.width
  tmp.height = badge.height
  const tmpCtx = tmp.getContext('2d')
  if (!tmpCtx) return
  tmpCtx.putImageData(badge, 0, 0)

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp, drawX, drawY)
  ctx.restore()
}

/**
 * RA2 透明角：把 cameo 四角各 3 个像素抹成透明，对应 OS DrawCameo_Transparent
 * (SHP_Cameo.pas:135-157)。透明像素后续被量化器映射到 transparentIndex（默认 0），
 * 让 cameo 在游戏侧边栏的圆角按钮里更贴合。
 *
 * 12 个像素位置：
 *   左上：[0,0] [0,1] [1,0]
 *   右下：[W-1,H-1] [W-2,H-1] [W-1,H-2]
 *   右上：[W-1,0] [W-1,1] [W-2,0]
 *   左下：[0,H-1] [1,H-1] [0,H-2]
 */
export function applyTransparentCorners(
  ctx: CanvasRenderingContext2D,
  options: TransparentCornersOptions,
): void {
  if (!options.enabled) return
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  if (w < 2 || h < 2) return

  ctx.save()
  // destination-out + 任意非透明 fillStyle：把目标 alpha 抹到 0
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  const cleared: Array<[number, number]> = [
    [0, 0], [0, 1], [1, 0],
    [w - 1, h - 1], [w - 2, h - 1], [w - 1, h - 2],
    [w - 1, 0], [w - 1, 1], [w - 2, 0],
    [0, h - 1], [1, h - 1], [0, h - 2],
  ]
  for (const [x, y] of cleared) {
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.restore()
}

// ---------- helpers ----------

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function clampPositiveInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function stripControlChars(text: string): string {
  if (!text) return ''
  // 去掉 ASCII 控制字符 (0x00-0x1F) 与 DEL (0x7F)，避免渲染出豆腐块；
  // 保留可见 ASCII、中文、全角符号、Emoji 等所有可见字形。
  return text.replace(/[\x00-\x1F\x7F]/g, '')
}

/**
 * 判断颜色是否是 "默认白色" 的几种写法（用来决定要不要叠 OS 风格的纵向白→灰渐变）。
 * 任何其它色（用户自定义）一律按纯色平涂。
 */
function isDefaultWhite(color: string): boolean {
  if (!color) return false
  const c = color.trim().toLowerCase().replace(/\s+/g, '')
  return (
    c === '#fff'
    || c === '#ffffff'
    || c === '#ffffffff'
    || c === 'white'
    || c === 'rgb(255,255,255)'
    || c === 'rgba(255,255,255,1)'
  )
}

// ---------- veteran badge sprite cache ----------

let cachedBadgeImageData: ImageData | null = null

function getVeteranBadgeImageData(): ImageData {
  if (cachedBadgeImageData) return cachedBadgeImageData
  // 复制一份保证 buffer 是 ArrayBuffer（而非 ArrayBufferLike），TS 5+ 严格模式下需要
  const copy = new Uint8ClampedArray(VETERAN_BADGE_RGBA.length)
  copy.set(VETERAN_BADGE_RGBA)
  cachedBadgeImageData = new ImageData(copy, VETERAN_BADGE_WIDTH, VETERAN_BADGE_HEIGHT)
  return cachedBadgeImageData
}
