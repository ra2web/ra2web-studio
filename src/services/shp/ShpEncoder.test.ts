import { describe, expect, it } from 'vitest'
import { ShpEncoder } from './ShpEncoder'
import { ShpFile } from '../../data/ShpFile'
import { VirtualFile } from '../../data/vfs/VirtualFile'

describe('ShpEncoder.encodeType0', () => {
  it('encodes a single 60x48 cameo-style frame and ShpFile parses it back identically', () => {
    const w = 60
    const h = 48
    const pixels = new Uint8Array(w * h)
    // 用一个简单图案：每个像素索引 = (x + y * 7) % 256，方便比较
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        pixels[y * w + x] = (x + y * 7) & 0xff
      }
    }

    const bytes = ShpEncoder.encodeType0({
      canvasWidth: w,
      canvasHeight: h,
      frames: [{ width: w, height: h, x: 0, y: 0, indexedPixels: pixels }],
    })

    // 文件总大小：8 字节文件头 + 1 帧 * 24 字节帧头 + w*h 字节像素 = 8 + 24 + 2880 = 2912
    expect(bytes.length).toBe(8 + 24 + w * h)

    // 头部字段
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getInt16(0, true)).toBe(0)
    expect(view.getInt16(2, true)).toBe(w)
    expect(view.getInt16(4, true)).toBe(h)
    expect(view.getInt16(6, true)).toBe(1)

    // 帧头偏移 + zero2 校验
    const base = 8
    expect(view.getInt16(base + 0, true)).toBe(0) // x
    expect(view.getInt16(base + 2, true)).toBe(0) // y
    expect(view.getInt16(base + 4, true)).toBe(w) // width
    expect(view.getInt16(base + 6, true)).toBe(h) // height
    expect(view.getInt32(base + 8, true)).toBe(0) // compression(int32) === 0 → (compression & 2)===0
    expect(view.getInt32(base + 16, true)).toBe(0) // zero2 (XCC 校验位)
    expect(view.getInt32(base + 20, true)).toBe(8 + 24) // dataOffset = 32

    // round-trip：现有 ShpFile 应当能解析
    const vf = VirtualFile.fromBytes(bytes, 'cameo.shp')
    const shp = ShpFile.fromVirtualFile(vf)
    expect(shp.numImages).toBe(1)
    const img = shp.getImage(0)
    expect(img.width).toBe(w)
    expect(img.height).toBe(h)
    expect(img.imageData.length).toBe(w * h)
    for (let i = 0; i < pixels.length; i++) {
      if (img.imageData[i] !== pixels[i]) {
        throw new Error(`pixel mismatch at ${i}: got ${img.imageData[i]} expected ${pixels[i]}`)
      }
    }
  })

  it('rejects mismatched pixel buffer length', () => {
    expect(() =>
      ShpEncoder.encodeType0({
        canvasWidth: 60,
        canvasHeight: 48,
        frames: [{ width: 60, height: 48, indexedPixels: new Uint8Array(10) }],
      }),
    ).toThrow(/indexedPixels length/)
  })

  it('encodes multiple frames with monotonically increasing data offsets', () => {
    const w = 4
    const h = 2
    const f1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const f2 = new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16])
    const bytes = ShpEncoder.encodeType0({
      canvasWidth: w,
      canvasHeight: h,
      frames: [
        { width: w, height: h, indexedPixels: f1 },
        { width: w, height: h, indexedPixels: f2 },
      ],
    })
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const off1 = view.getInt32(8 + 20, true)
    const off2 = view.getInt32(8 + 24 + 20, true)
    expect(off1).toBe(8 + 24 * 2) // 56
    expect(off2).toBe(off1 + w * h) // 56 + 8 = 64

    const shp = ShpFile.fromVirtualFile(VirtualFile.fromBytes(bytes, 'multi.shp'))
    expect(shp.numImages).toBe(2)
    expect(Array.from(shp.getImage(0).imageData)).toEqual(Array.from(f1))
    expect(Array.from(shp.getImage(1).imageData)).toEqual(Array.from(f2))
  })
})
