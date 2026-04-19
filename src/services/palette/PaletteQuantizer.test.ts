import { describe, expect, it } from 'vitest'
import { PaletteQuantizer } from './PaletteQuantizer'
import type { Rgb } from './PaletteTypes'

function makePalette(): Rgb[] {
  // 256 项：index 0 = 黑（透明色），index 1 = 红，index 2 = 绿，index 3 = 蓝，
  // index 4 = 白；其余填灰阶。
  const pal: Rgb[] = []
  pal.push({ r: 0, g: 0, b: 0 })       // 0 透明
  pal.push({ r: 255, g: 0, b: 0 })     // 1 红
  pal.push({ r: 0, g: 255, b: 0 })     // 2 绿
  pal.push({ r: 0, g: 0, b: 255 })     // 3 蓝
  pal.push({ r: 255, g: 255, b: 255 }) // 4 白
  for (let i = 5; i < 256; i++) {
    const v = Math.round(((i - 5) / 250) * 255)
    pal.push({ r: v, g: v, b: v })
  }
  return pal
}

function rgba(...pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  const arr = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach((p, i) => {
    arr[i * 4] = p[0]
    arr[i * 4 + 1] = p[1]
    arr[i * 4 + 2] = p[2]
    arr[i * 4 + 3] = p[3]
  })
  return arr
}

describe('PaletteQuantizer.quantize', () => {
  it('maps fully-transparent pixels to transparentIndex (default 0)', () => {
    const palette = makePalette()
    const data = rgba(
      [255, 0, 0, 0],     // alpha=0 → 透明 → index 0
      [0, 255, 0, 64],    // alpha<128 → 透明 → index 0
      [0, 0, 255, 200],   // alpha>=128 → 不透明 → index 3 (蓝)
    )
    const out = PaletteQuantizer.quantize(data, 3, 1, palette)
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(0)
    expect(out[2]).toBe(3)
  })

  it('skips transparentIndex when matching opaque pixels (avoid black-eats-everything)', () => {
    const palette = makePalette()
    // 不透明的极暗色 (5,5,5)：index 0 是 (0,0,0) 距离最近，但被跳过；
    // 应回退到下一个最近 —— 灰阶里第一项 index 5 = (0,0,0)（前几项接近黑）。
    // 关键是不能等于 transparentIndex(0)。
    const data = rgba([5, 5, 5, 255])
    const out = PaletteQuantizer.quantize(data, 1, 1, palette)
    expect(out[0]).not.toBe(0)
  })

  it('maps pure colors to their exact palette index', () => {
    const palette = makePalette()
    const data = rgba(
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 255, 255],
    )
    const out = PaletteQuantizer.quantize(data, 4, 1, palette)
    expect(out[0]).toBe(1)
    expect(out[1]).toBe(2)
    expect(out[2]).toBe(3)
    expect(out[3]).toBe(4)
  })

  it('respects custom alphaThreshold and transparentIndex', () => {
    const palette = makePalette()
    const data = rgba([255, 0, 0, 200])
    // alphaThreshold=255 → alpha=200 视为透明 → 映射到 transparentIndex=4 (白)
    const out = PaletteQuantizer.quantize(data, 1, 1, palette, {
      alphaThreshold: 255,
      transparentIndex: 4,
    })
    expect(out[0]).toBe(4)
  })

  it('output length equals width*height', () => {
    const palette = makePalette()
    const data = new Uint8ClampedArray(60 * 48 * 4)
    const out = PaletteQuantizer.quantize(data, 60, 48, palette)
    expect(out.length).toBe(60 * 48)
  })
})
