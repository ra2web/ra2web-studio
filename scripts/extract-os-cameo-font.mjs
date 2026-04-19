#!/usr/bin/env node
/**
 * 一次性脚本：从 OS SHP Builder 的 FormCameoGenerator.dfm 抠出 ImageList1[0..74]
 * 也就是 cameo 文字所用的全部位图字体 sprite + 老兵徽标，输出成
 * src/services/cameo/osCameoFontData.ts。
 *
 * ImageList 索引约定（来自 SHP_Cameo.pas 的 AddCharToBMP / AddCharToBMP2）：
 *   0..9   = 数字 '0'..'9'（第一行字体）
 *   10..35 = 字母 'A'..'Z'（第一行字体）
 *   36     = '.'  （第一行字体）
 *   37     = veteran V 形徽标
 *   38..47 = 数字 '0'..'9'（第二行字体）
 *   48..73 = 字母 'A'..'Z'（第二行字体）
 *   74     = '.'  （第二行字体）
 *
 * 第二行字体在源代码里 `I := I + 38` 偏移，所以第一行 index N 对应第二行 N + 38。
 *
 * 每个 sprite 在 ImageList 中是 20x12 RGBA（实际字符像素只在左上 ~6x6 区域），
 * 透明色键 = clblue (B=255 G=0 R=0)。BMP 是 80x240 32bpp BGRA bottom-up，
 * 4 列 × 20 行布局：sprite #i 在 row=floor(i/4), col=i%4。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DFM_PATH = path.resolve(
  __dirname,
  '../../OS-SHP-Builder/OS SHP Builder 3.3x/FormCameoGenerator.dfm',
)
const OUT_PATH = path.resolve(
  __dirname,
  '../src/services/cameo/osCameoFontData.ts',
)

const SPRITE_WIDTH = 20
const SPRITE_HEIGHT = 12
const COLUMNS = 4
const SPRITE_COUNT = 75

function readBitmapBlob() {
  const dfmText = fs.readFileSync(DFM_PATH, 'utf8')
  const lines = dfmText.split('\n')

  const imageListIdx = lines.findIndex((l) => /object\s+ImageList1\s*:\s*TImageList/.test(l))
  if (imageListIdx < 0) throw new Error('ImageList1 not found in dfm')

  let bitmapStart = -1
  for (let i = imageListIdx; i < lines.length; i++) {
    if (/Bitmap\s*=\s*\{/.test(lines[i])) {
      bitmapStart = i + 1
      break
    }
  }
  if (bitmapStart < 0) throw new Error('Bitmap = { ... } not found after ImageList1')

  let bitmapEnd = -1
  for (let i = bitmapStart; i < lines.length; i++) {
    if (lines[i].includes('}')) {
      bitmapEnd = i
      break
    }
  }
  if (bitmapEnd < 0) throw new Error('Bitmap closing } not found')

  let hex = ''
  for (let i = bitmapStart; i <= bitmapEnd; i++) {
    hex += lines[i].replace(/[^0-9A-Fa-f]/g, '')
  }
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex length is odd: ${hex.length}`)
  }
  return Buffer.from(hex, 'hex')
}

function locateBmp(blob) {
  if (blob[0] !== 0x49 || blob[1] !== 0x4c || blob[2] !== 0x01 || blob[3] !== 0x01) {
    throw new Error('IL magic mismatch')
  }
  const ilWidth = blob.readUInt16LE(10)
  const ilHeight = blob.readUInt16LE(12)
  if (ilWidth !== SPRITE_WIDTH || ilHeight !== SPRITE_HEIGHT) {
    throw new Error(`IL dims mismatch: ${ilWidth}x${ilHeight}`)
  }
  for (let i = 14; i < Math.min(blob.length - 1, 64); i++) {
    if (blob[i] === 0x42 && blob[i + 1] === 0x4d) {
      return blob.subarray(i)
    }
  }
  throw new Error('BMP magic not found')
}

function extractSprite(bmp, dataOffset, bmpWidth, bmpHeight, spriteIndex) {
  const spriteRow = Math.floor(spriteIndex / COLUMNS)
  const spriteCol = spriteIndex % COLUMNS
  const spriteX0 = spriteCol * SPRITE_WIDTH
  const spriteY0 = spriteRow * SPRITE_HEIGHT

  if (spriteX0 + SPRITE_WIDTH > bmpWidth || spriteY0 + SPRITE_HEIGHT > bmpHeight) {
    throw new Error(`Sprite #${spriteIndex} out of BMP bounds`)
  }

  const rgba = new Uint8Array(SPRITE_WIDTH * SPRITE_HEIGHT * 4)
  let opaque = 0
  for (let y = 0; y < SPRITE_HEIGHT; y++) {
    const topDownY = spriteY0 + y
    const bmpRow = bmpHeight - 1 - topDownY
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const bmpX = spriteX0 + x
      const bmpOff = dataOffset + (bmpRow * bmpWidth + bmpX) * 4
      const b = bmp[bmpOff]
      const g = bmp[bmpOff + 1]
      const r = bmp[bmpOff + 2]
      const isClBlue = b === 0xff && g === 0x00 && r === 0x00
      const outOff = (y * SPRITE_WIDTH + x) * 4
      if (isClBlue) {
        rgba[outOff] = 0
        rgba[outOff + 1] = 0
        rgba[outOff + 2] = 0
        rgba[outOff + 3] = 0
      } else {
        rgba[outOff] = r
        rgba[outOff + 1] = g
        rgba[outOff + 2] = b
        rgba[outOff + 3] = 0xff
        opaque++
      }
    }
  }
  return { rgba, opaque }
}

function main() {
  if (!fs.existsSync(DFM_PATH)) {
    console.error(`[extract-os-cameo-font] DFM not found: ${DFM_PATH}`)
    process.exit(1)
  }

  const blob = readBitmapBlob()
  const bmp = locateBmp(blob)
  const dataOffset = bmp.readUInt32LE(10)
  const bmpWidth = bmp.readInt32LE(18)
  const bmpHeight = bmp.readInt32LE(22)
  const bpp = bmp.readUInt16LE(28)
  console.log(`[extract-os-cameo-font] BMP: ${bmpWidth}x${bmpHeight} ${bpp}bpp dataOffset=${dataOffset}`)

  if (bmpWidth !== SPRITE_WIDTH * COLUMNS || bmpHeight <= 0 || bpp !== 32) {
    throw new Error('Unexpected BMP geometry')
  }

  const sprites = []
  for (let i = 0; i < SPRITE_COUNT; i++) {
    const s = extractSprite(bmp, dataOffset, bmpWidth, bmpHeight, i)
    sprites.push(s)
  }
  const totalOpaque = sprites.reduce((a, s) => a + s.opaque, 0)
  console.log(`[extract-os-cameo-font] Extracted ${sprites.length} sprites, total opaque pixels: ${totalOpaque}`)

  // 输出 TS 文件
  const lines = []
  lines.push('// 自动生成：来自 OS-SHP-Builder/OS SHP Builder 3.3x/FormCameoGenerator.dfm')
  lines.push('// 的 ImageList1[0..' + (SPRITE_COUNT - 1) + ']，与 OS SHP Builder 完全一致。')
  lines.push('// 索引约定：0..9 = 数字 (line1)，10..35 = A..Z (line1)，36 = "." (line1)，')
  lines.push('//           37 = veteran badge，38..47 = 数字 (line2)，48..73 = A..Z (line2)，74 = "." (line2)')
  lines.push('// 请勿手工编辑；要重新生成请运行：')
  lines.push('//   node scripts/extract-os-cameo-font.mjs')
  lines.push('')
  lines.push(`export const OS_CAMEO_SPRITE_WIDTH = ${SPRITE_WIDTH}`)
  lines.push(`export const OS_CAMEO_SPRITE_HEIGHT = ${SPRITE_HEIGHT}`)
  lines.push(`export const OS_CAMEO_SPRITE_COUNT = ${SPRITE_COUNT}`)
  lines.push('')
  lines.push('/**')
  lines.push(' * 全部 75 个 sprite 的 RGBA 数据，每个 20*12*4 = 960 字节。')
  lines.push(' * 索引 i 的 sprite 数据 = OS_CAMEO_SPRITES[i]。')
  lines.push(' */')
  lines.push('export const OS_CAMEO_SPRITES: ReadonlyArray<Uint8ClampedArray> = [')
  for (let i = 0; i < sprites.length; i++) {
    const arr = Array.from(sprites[i].rgba)
    const chunks = []
    for (let k = 0; k < arr.length; k += 32) {
      chunks.push('    ' + arr.slice(k, k + 32).join(', '))
    }
    lines.push(`  /* #${String(i).padStart(2, '0')} */ new Uint8ClampedArray([`)
    lines.push(chunks.join(',\n'))
    lines.push('  ])' + (i < sprites.length - 1 ? ',' : ''))
  }
  lines.push(']')
  lines.push('')

  const ts = lines.join('\n')
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, ts, 'utf8')
  console.log(`[extract-os-cameo-font] Wrote ${OUT_PATH} (${ts.length} bytes)`)
}

main()
