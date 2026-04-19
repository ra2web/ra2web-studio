import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ShpEncoder } from '../shp/ShpEncoder'
import { installCanvasStubs } from '../../test/mocks/canvasStub'
import type { ExportContext, ShpStaticExportOptions } from './types'

// 测试范围内可调控的字节：每个测试调 `setMockBytes(bytes)` 来切换 ProjectService 返回的 SHP 内容。
// 这里用 vi.hoisted 把 setter 提到所有 vi.mock 调用之前，避免 hoist 顺序问题。
const { setMockBytes, getMockBytes } = vi.hoisted(() => {
  let current = new Uint8Array(0)
  return {
    setMockBytes: (b: Uint8Array) => { current = b },
    getMockBytes: () => current,
  }
})

// 模块级 mock：resolvePreviewFile 用到的 ProjectService.readProjectFile 一律返回 mock 字节。
// 避免每个测试 vi.doMock + 动态 re-import 引发的模块缓存问题。
vi.mock('../projects/ProjectService', () => ({
  ProjectService: {
    readProjectFile: vi.fn(async () => {
      const bytes = getMockBytes()
      const file = new File([bytes], 'test.shp', { type: 'application/octet-stream' })
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => {
          const buf = new ArrayBuffer(bytes.byteLength)
          new Uint8Array(buf).set(bytes)
          return buf
        },
      })
      return file
    }),
  },
}))

// import 必须放在 vi.mock 之后才能拿到 mocked 版本
import { ShpExportRenderer } from './ShpExportRenderer'

beforeAll(() => {
  installCanvasStubs()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------- helpers ----------

function readMockPixels(blob: Blob): Uint8ClampedArray {
  const px = (blob as any).__mockPixels as Uint8ClampedArray | undefined
  if (!px) throw new Error('Test setup error: blob.__mockPixels missing (canvasStub.toBlob polyfill broken)')
  return px
}
function readMockSize(blob: Blob): { w: number; h: number } {
  return {
    w: (blob as any).__mockWidth as number,
    h: (blob as any).__mockHeight as number,
  }
}

function buildShpBytes(frameCount: number, w = 1, h = 1): Uint8Array {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    width: w,
    height: h,
    indexedPixels: new Uint8Array(w * h).fill((i + 1) & 0xff),
  }))
  return ShpEncoder.encodeType0({ canvasWidth: w, canvasHeight: h, frames })
}

/**
 * 构造混合 SHP：第 0 帧实心 1×1，第 1 帧"占位空帧"（width=0, height=0）。
 * 模拟 RA2 单位动画里常见的部分空帧场景，验证导出不会崩。
 *
 * ShpEncoder 不接受 width=0，所以这里手工拼字节：8 字节文件头 + 2 帧 24 字节帧头 + 1 字节像素。
 * 字节布局对齐 ShpFile.ts 的解析期望（小端序）。
 */
function buildShpWithEmptyFrame(): Uint8Array {
  const HEADER = 8
  const FRAME_HEADER = 24
  const totalSize = HEADER + FRAME_HEADER * 2 + 1 // 仅第 0 帧 1 字节像素
  const bytes = new Uint8Array(totalSize)
  const view = new DataView(bytes.buffer)

  // 文件头：zero(0) | cx | cy | cImages
  view.setInt16(0, 0, true)
  view.setInt16(2, 1, true) // cx
  view.setInt16(4, 1, true) // cy
  view.setInt16(6, 2, true) // 2 帧

  // 帧 0：x=0 y=0 w=1 h=1 comp=0 ref=0 zero2=0 dataOffset=8+24*2=56
  let off = HEADER
  view.setInt16(off + 0, 0, true)
  view.setInt16(off + 2, 0, true)
  view.setInt16(off + 4, 1, true)
  view.setInt16(off + 6, 1, true)
  view.setInt32(off + 8, 0, true) // compression+reserved
  view.setInt32(off + 12, 0, true) // ref
  view.setInt32(off + 16, 0, true) // zero2
  view.setInt32(off + 20, HEADER + FRAME_HEADER * 2, true) // dataOffset = 56

  // 帧 1：占位空帧 x=0 y=0 w=0 h=0；dataOffset 指向同一位置（无数据）
  off = HEADER + FRAME_HEADER
  view.setInt16(off + 0, 0, true)
  view.setInt16(off + 2, 0, true)
  view.setInt16(off + 4, 0, true) // w=0
  view.setInt16(off + 6, 0, true) // h=0
  view.setInt32(off + 8, 0, true)
  view.setInt32(off + 12, 0, true)
  view.setInt32(off + 16, 0, true)
  view.setInt32(off + 20, totalSize, true) // dataOffset 指文件尾，无数据

  // 帧 0 的 1 字节像素数据（索引 1 = 红）
  bytes[HEADER + FRAME_HEADER * 2] = 1

  return bytes
}

function projectFileContext(): ExportContext {
  return {
    selectedFile: 'art/icons/test.shp',
    mixFiles: [],
    resourceContext: null,
    previewTarget: {
      kind: 'project-file',
      projectName: 'demo',
      relativePath: 'art/icons/test.shp',
      displayPath: 'art/icons/test.shp',
      extension: 'shp',
      isMixFile: false,
    } as any,
  }
}

// ---------- composeSheet 全表铺背景色 ----------

describe('ShpExportRenderer.exportStatic - composeSheet 背景色覆盖整张 sheet', () => {
  it('opaque 模式：4 帧 grid 2 列 2x2 sheet 全部 alpha=255（无透明缝隙）', async () => {
    setMockBytes(buildShpBytes(4))
    const options: ShpStaticExportOptions = {
      format: 'png',
      frameRange: { mode: 'range', frameIndex: 0, startFrame: 0, endFrame: 3 },
      layout: 'grid',
      gridColumns: 2,
      palette: { mode: 'manual', manualPalettePath: '' },
      transparency: { mode: 'opaque', transparentIndex: 0, backgroundColor: '#00FF00' },
      jpegQuality: 0.92,
    }
    const result = await ShpExportRenderer.exportStatic(projectFileContext(), options)
    const px = readMockPixels(result.blob)
    const { w, h } = readMockSize(result.blob)
    expect(w).toBe(2)
    expect(h).toBe(2)
    // 关键：所有像素 alpha=255
    for (let i = 3; i < px.length; i += 4) {
      expect(px[i]).toBe(255)
    }
  })

  it('opaque 模式：3 帧 grid 2 列 2x2 sheet 中第 4 个空 cell 是 magenta 不透明', async () => {
    setMockBytes(buildShpBytes(3))
    const options: ShpStaticExportOptions = {
      format: 'png',
      frameRange: { mode: 'range', frameIndex: 0, startFrame: 0, endFrame: 2 },
      layout: 'grid',
      gridColumns: 2,
      palette: { mode: 'manual', manualPalettePath: '' },
      transparency: { mode: 'opaque', transparentIndex: 0, backgroundColor: '#FF00FF' },
      jpegQuality: 0.92,
    }
    const result = await ShpExportRenderer.exportStatic(projectFileContext(), options)
    const px = readMockPixels(result.blob)
    const { w } = readMockSize(result.blob)
    const off = (1 * w + 1) * 4 // 第 4 个 cell (col=1, row=1)
    expect([px[off], px[off + 1], px[off + 2], px[off + 3]]).toEqual([255, 0, 255, 255])
  })

  it('SHP 含 width=0 占位空帧：不抛 ImageData 异常，空帧 cell 在 opaque 模式下渲染为背景色', async () => {
    setMockBytes(buildShpWithEmptyFrame())
    const options: ShpStaticExportOptions = {
      format: 'png',
      frameRange: { mode: 'range', frameIndex: 0, startFrame: 0, endFrame: 1 },
      layout: 'grid',
      gridColumns: 2,
      palette: { mode: 'manual', manualPalettePath: '' },
      transparency: { mode: 'opaque', transparentIndex: 0, backgroundColor: '#FF00FF' },
      jpegQuality: 0.92,
    }
    // 关键：之前会抛 "Failed to construct 'ImageData': The source width is zero or not a number"
    const result = await ShpExportRenderer.exportStatic(projectFileContext(), options)
    const px = readMockPixels(result.blob)
    const { w } = readMockSize(result.blob)
    // cell (col=1, row=0) 对应空帧 → 应是 magenta 不透明（背景色，未被空帧覆盖）
    const off = (0 * w + 1) * 4
    expect([px[off], px[off + 1], px[off + 2], px[off + 3]]).toEqual([255, 0, 255, 255])
  })

  it('index 模式：3 帧 grid 2 列，第 4 个空 cell 仍 alpha=0（保留透明）', async () => {
    setMockBytes(buildShpBytes(3))
    const options: ShpStaticExportOptions = {
      format: 'png',
      frameRange: { mode: 'range', frameIndex: 0, startFrame: 0, endFrame: 2 },
      layout: 'grid',
      gridColumns: 2,
      palette: { mode: 'manual', manualPalettePath: '' },
      transparency: { mode: 'index', transparentIndex: 0, backgroundColor: '#000000' },
      jpegQuality: 0.92,
    }
    const result = await ShpExportRenderer.exportStatic(projectFileContext(), options)
    const px = readMockPixels(result.blob)
    const { w } = readMockSize(result.blob)
    const off = (1 * w + 1) * 4
    expect(px[off + 3]).toBe(0)
  })
})

// ---------- previewTarget 路径覆盖 ----------

describe('ShpExportRenderer.inspect - previewTarget 路径', () => {
  it('使用 previewTarget 时通过 resolvePreviewFile 拿字节，不走 splitSelectedFilePath', async () => {
    // 1 帧 4x3：路径里没有合法 mixName，splitSelectedFilePath 必然失败；
    // 如果 inspect 仍能正常返回 frames=1，说明走的是 previewTarget 路径。
    setMockBytes(buildShpBytes(1, 4, 3))
    const ctx = projectFileContext()
    const result = await ShpExportRenderer.inspect(ctx)
    expect(result).not.toBeNull()
    expect(result!.frames).toBe(1)
    expect(result!.width).toBe(4)
    expect(result!.height).toBe(3)
  })

  it('未传 previewTarget + 非法 mixName 路径 → fallback 失败 → inspect 返回 null', async () => {
    const ctx: ExportContext = {
      selectedFile: 'art/foo.shp', // splitSelectedFilePath 找不到名为 'art' 的 mix
      mixFiles: [],
      resourceContext: null,
    }
    const result = await ShpExportRenderer.inspect(ctx)
    expect(result).toBeNull()
  })
})
