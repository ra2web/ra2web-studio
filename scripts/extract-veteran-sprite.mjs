#!/usr/bin/env node
/**
 * 一次性脚本：从 OS SHP Builder 的 FormCameoGenerator.dfm 抠出 ImageList1[37]
 * 也就是老兵 V 形徽标的真实像素，输出成 src/services/cameo/veteranSpriteData.ts
 *
 * .dfm 是 Delphi VCL 文本格式：
 *   object ImageList1: TImageList
 *     Width  = 20
 *     Height = 12
 *     Bitmap = {
 *       494C01014A004F00040014000C00FFFFFFFFFF10FFFFFFFFFFFFFFFF424D3600
 *       ...
 *     }
 *
 * 字节布局：
 *   [0..3]   IL magic 'IL\x01\x01'  (494C0101)
 *   [4..5]   count                  (uint16 LE)
 *   [6..7]   allocated              (uint16 LE)
 *   [8..9]   ?                      (uint16 LE)
 *   [10..11] width                  (uint16 LE) = 20
 *   [12..13] height                 (uint16 LE) = 12
 *   [14..25] mask bytes            (12 bytes) = FFFFFFFFFF10FFFFFFFFFFFFFFFF
 *   [26..]   BMP file (BM magic)
 *
 * BMP 内部：80x240 32bpp BGRA bottom-up，total = 80*240*4 = 76800 bytes
 * ImageList sprite 排列：4 列 x 20 行（80/20=4 列，240/12=20 行）
 * Sprite #37 = row 9, col 1 → cameo (x=20..39, y=108..119)
 *
 * BMP 是 bottom-up，所以 top-down y 对应的 BMP 行号 = 240 - 1 - y
 *
 * 透明色 key：clblue (B=255 G=0 R=0)，匹配则输出 alpha=0；其它输出 alpha=255。
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
  '../src/services/cameo/veteranSpriteData.ts',
)

const SPRITE_INDEX = 37
const SPRITE_WIDTH = 20
const SPRITE_HEIGHT = 12
const COLUMNS = 4

function main() {
  if (!fs.existsSync(DFM_PATH)) {
    console.error(`[extract-veteran-sprite] DFM not found: ${DFM_PATH}`)
    process.exit(1)
  }

  const dfmText = fs.readFileSync(DFM_PATH, 'utf8')
  const lines = dfmText.split('\n')

  // 找 ImageList1 后面紧跟的 Bitmap = { ... } hex 段
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

  // 拼成单行 hex
  let hex = ''
  for (let i = bitmapStart; i <= bitmapEnd; i++) {
    hex += lines[i].replace(/[^0-9A-Fa-f]/g, '')
  }
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex length is odd: ${hex.length}`)
  }
  console.log(`[extract-veteran-sprite] Hex length: ${hex.length} chars (${hex.length / 2} bytes)`)

  // 转 Buffer
  const blob = Buffer.from(hex, 'hex')

  // 校验 IL 头
  if (blob[0] !== 0x49 || blob[1] !== 0x4c || blob[2] !== 0x01 || blob[3] !== 0x01) {
    throw new Error(`IL magic mismatch at start: ${[...blob.slice(0, 4)].map((b) => b.toString(16))}`)
  }
  const ilWidth = blob.readUInt16LE(10)
  const ilHeight = blob.readUInt16LE(12)
  if (ilWidth !== SPRITE_WIDTH || ilHeight !== SPRITE_HEIGHT) {
    throw new Error(`IL dimensions mismatch: got ${ilWidth}x${ilHeight}, expected ${SPRITE_WIDTH}x${SPRITE_HEIGHT}`)
  }

  // BMP 起点：动态找 'BM' magic（IL header 在不同 Delphi 版本下长度可能不同）
  let bmpStart = -1
  for (let i = 14; i < Math.min(blob.length - 1, 64); i++) {
    if (blob[i] === 0x42 && blob[i + 1] === 0x4d) {
      bmpStart = i
      break
    }
  }
  if (bmpStart < 0) {
    throw new Error(`BMP magic 'BM' not found in first 64 bytes of IL blob`)
  }
  console.log(`[extract-veteran-sprite] BMP starts at offset ${bmpStart} (IL header = ${bmpStart} bytes)`)

  const bmp = blob.subarray(bmpStart)
  const dataOffset = bmp.readUInt32LE(10)
  const dibHeaderSize = bmp.readUInt32LE(14)
  const bmpWidth = bmp.readInt32LE(18)
  const bmpHeight = bmp.readInt32LE(22)
  const bpp = bmp.readUInt16LE(28)
  console.log(`[extract-veteran-sprite] BMP: ${bmpWidth}x${bmpHeight} ${bpp}bpp, dataOffset=${dataOffset}, dibHeader=${dibHeaderSize}`)
  if (bmpWidth !== SPRITE_WIDTH * COLUMNS || bmpHeight <= 0 || bpp !== 32) {
    throw new Error(`Unexpected BMP geometry`)
  }

  // sprite 37 → row 9, col 1
  const spriteRow = Math.floor(SPRITE_INDEX / COLUMNS) // 9
  const spriteCol = SPRITE_INDEX % COLUMNS              // 1
  const spriteX0 = spriteCol * SPRITE_WIDTH             // 20
  const spriteY0 = spriteRow * SPRITE_HEIGHT            // 108
  console.log(`[extract-veteran-sprite] Sprite #${SPRITE_INDEX} at row=${spriteRow} col=${spriteCol} → x=[${spriteX0},${spriteX0 + SPRITE_WIDTH}) y=[${spriteY0},${spriteY0 + SPRITE_HEIGHT})`)

  // 抽取 RGBA
  const rgba = new Uint8Array(SPRITE_WIDTH * SPRITE_HEIGHT * 4)
  let opaqueCount = 0
  for (let y = 0; y < SPRITE_HEIGHT; y++) {
    const topDownY = spriteY0 + y
    // BMP bottom-up 行号
    const bmpRow = bmpHeight - 1 - topDownY
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const bmpX = spriteX0 + x
      const bmpOff = dataOffset + (bmpRow * bmpWidth + bmpX) * 4
      // BMP 32bpp 字节顺序：B G R A
      const b = bmp[bmpOff]
      const g = bmp[bmpOff + 1]
      const r = bmp[bmpOff + 2]
      // alpha 字节通常无意义；用 clblue 透明 key
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
        opaqueCount++
      }
    }
  }
  console.log(`[extract-veteran-sprite] Opaque pixels: ${opaqueCount} / ${SPRITE_WIDTH * SPRITE_HEIGHT}`)
  if (opaqueCount === 0) {
    throw new Error('Extracted sprite is fully transparent — wrong sprite index or wrong color key?')
  }

  // 输出 TS 文件
  const arr = Array.from(rgba)
  const lines4 = []
  for (let i = 0; i < arr.length; i += 16) {
    lines4.push('  ' + arr.slice(i, i + 16).join(', ') + (i + 16 < arr.length ? ',' : ''))
  }

  const ts = `// 自动生成：来自 OS-SHP-Builder/OS SHP Builder 3.3x/FormCameoGenerator.dfm
// 的 ImageList1[${SPRITE_INDEX}] —— 老兵 V 形徽标，与 OS SHP Builder 完全一致。
// 请勿手工编辑；要重新生成请运行：
//   node scripts/extract-veteran-sprite.mjs

export const VETERAN_BADGE_WIDTH = ${SPRITE_WIDTH}
export const VETERAN_BADGE_HEIGHT = ${SPRITE_HEIGHT}

/** RGBA 字节数组，长度 = ${SPRITE_WIDTH} * ${SPRITE_HEIGHT} * 4 = ${SPRITE_WIDTH * SPRITE_HEIGHT * 4} */
export const VETERAN_BADGE_RGBA: Uint8ClampedArray = new Uint8ClampedArray([
${lines4.join('\n')}
])
`

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, ts, 'utf8')
  console.log(`[extract-veteran-sprite] Wrote ${OUT_PATH} (${ts.length} bytes)`)
}

main()
