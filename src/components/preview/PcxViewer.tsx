import React, { useEffect, useRef, useState } from 'react'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type ParsedImage = { width: number; height: number; rgba: Uint8ClampedArray }

function le16(b: Uint8Array, off: number): number {
  return b[off] | (b[off + 1] << 8)
}

function decodePCX(bytes: Uint8Array): ParsedImage {
  console.log('[PcxViewer] decodePCX: bytes.length =', bytes.length)
  if (bytes.length < 128) throw new Error('PCX header too small')
  const manufacturer = bytes[0]
  const encoding = bytes[2]
  const bitsPerPixel = bytes[3]
  const xmin = le16(bytes, 4)
  const ymin = le16(bytes, 6)
  const xmax = le16(bytes, 8)
  const ymax = le16(bytes, 10)
  const width = xmax - xmin + 1
  const height = ymax - ymin + 1
  const nPlanes = bytes[65]
  const bytesPerLine = le16(bytes, 66)
  console.log('[PcxViewer] header', { manufacturer, encoding, bitsPerPixel, xmin, ymin, xmax, ymax, width, height, nPlanes, bytesPerLine })
  if (manufacturer !== 0x0A || encoding !== 1) throw new Error('Unsupported PCX (manufacturer/encoding)')
  if (width <= 0 || height <= 0) throw new Error('Invalid PCX dimensions')

  // Decode entire image planes in one pass (matches xcc's pcx_decode behavior)
  // Total decoded bytes = bytesPerLine * height * nPlanes
  let pos = 128
  const totalBytes = bytesPerLine * height * nPlanes
  const decoded = new Uint8Array(totalBytes)
  let out = 0
  while (out < totalBytes && pos < bytes.length) {
    const code = bytes[pos++]
    if ((code & 0xC0) === 0xC0) {
      const count = code & 0x3F
      const value = bytes[pos++]
      const toWrite = Math.min(count, totalBytes - out)
      decoded.fill(value, out, out + toWrite)
      out += toWrite
    } else {
      decoded[out++] = code
    }
  }
  console.log('[PcxViewer] RLE decoded', { requested: totalBytes, produced: out, remainingSrc: bytes.length - pos })

  const rgba = new Uint8ClampedArray(width * height * 4)

  if (bitsPerPixel === 8 && nPlanes === 1) {
    // 8-bit paletted, try palette at end (0x0C + 768)
    let palette: Uint8Array | null = null
    if (bytes.length >= 769) {
      const palStart = bytes.length - 769
      if (bytes[palStart] === 0x0C) {
        const raw = bytes.subarray(palStart + 1, palStart + 1 + 768)
        const parsed = PaletteParser.fromBytes(raw)
        if (parsed) {
          palette = PaletteParser.toBytePalette(parsed.colors)
        }
      }
    }
    // Fallback: 16-color header palette (48 bytes, often 6-bit -> scale to 8-bit)
    if (!palette) {
      const pal16 = bytes.subarray(16, 64)
      const parsed = PaletteParser.fromBytes(pal16)
      if (!parsed) throw new Error('Invalid PCX header palette')
      const scaled = new Uint8Array(parsed.colors.length * 3)
      for (let i = 0; i < parsed.colors.length; i++) {
        const c = parsed.colors[i]
        scaled[i * 3] = c.r
        scaled[i * 3 + 1] = c.g
        scaled[i * 3 + 2] = c.b
      }
      palette = scaled
    }
    console.log('[PcxViewer] palette', { type: palette.length === 768 ? 'VGA256' : 'Header16', length: palette.length })

    for (let y = 0; y < height; y++) {
      const rowStart = y * bytesPerLine
      for (let x = 0; x < width; x++) {
        const idx = decoded[rowStart + x]
        let r: number, g: number, b: number
        if (palette.length === 768) {
          r = palette[idx * 3]
          g = palette[idx * 3 + 1]
          b = palette[idx * 3 + 2]
        } else {
          const i16 = idx & 0x0F
          r = palette[i16 * 3]
          g = palette[i16 * 3 + 1]
          b = palette[i16 * 3 + 2]
        }
        const p = (y * width + x) * 4
        rgba[p] = r
        rgba[p + 1] = g
        rgba[p + 2] = b
        rgba[p + 3] = 255
      }
    }
    console.log('[PcxViewer] decodePCX result (8bpp indexed)', { width, height })
    return { width, height, rgba }
  }

  if (bitsPerPixel === 8 && nPlanes === 3) {
    // 24-bit: 3 planes per row, each plane bytesPerLine long
    for (let y = 0; y < height; y++) {
      const base = y * (bytesPerLine * 3)
      const rStart = base
      const gStart = base + bytesPerLine
      const bStart = base + 2 * bytesPerLine
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4
        rgba[p] = decoded[rStart + x]
        rgba[p + 1] = decoded[gStart + x]
        rgba[p + 2] = decoded[bStart + x]
        rgba[p + 3] = 255
      }
    }
    console.log('[PcxViewer] decodePCX result (24bpp planes)', { width, height })
    return { width, height, rgba }
  }

  throw new Error(`Unsupported PCX format (bpp=${bitsPerPixel}, planes=${nPlanes})`)
}

const PcxViewer: React.FC<{
  selectedFile?: string
  mixFiles?: Array<{ file: File; info: any }>
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles, target }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<{ w: number; h: number } | null>(null)
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setInfo(null)
      try {
        console.log('[PcxViewer] load selectedFile =', source.resolved?.displayPath)
        if (!source.resolved) return
        const bytes = await source.resolved.readBytes()
        console.log('[PcxViewer] VirtualFile size', bytes.length)
        if (bytes.length >= 16) {
          const head = Array.from(bytes.slice(0, 16)).map(v => v.toString(16).padStart(2, '0')).join(' ')
          console.log('[PcxViewer] head(16):', head)
        }
        const parsed = decodePCX(bytes)
        const tryDraw = () => {
          if (cancelled) {
            console.warn('[PcxViewer] cancelled before draw, skip')
            return
          }
          const canvas = canvasRef.current
          if (!canvas) {
            console.warn('[PcxViewer] canvasRef.current is null, retry next frame')
            requestAnimationFrame(tryDraw)
            return
          }
          canvas.width = parsed.width
          canvas.height = parsed.height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            console.error('[PcxViewer] getContext(\'2d\') returned null')
            return
          }
          const imageData = new ImageData(parsed.rgba as any, parsed.width, parsed.height)
          ctx.putImageData(imageData, 0, 0)
          console.log('[PcxViewer] drew image on canvas', { width: parsed.width, height: parsed.height })
          setInfo({ w: parsed.width, h: parsed.height })
        }
        tryDraw()
      } catch (e: any) {
        console.error('[PcxViewer] Failed to render PCX', e)
        if (!cancelled) setError(e?.message || 'Failed to render PCX')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (source.resolved) {
      void load()
    }
    return () => { cancelled = true }
  }, [source.resolved])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">
        {info ? (
          <>尺寸: {info.w} × {info.h}</>
        ) : (
          <>PCX 预览</>
        )}
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center relative" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #2d2d2d 0, #2d2d2d 12px, #343434 12px, #343434 24px)' }}>
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%' }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">加载中...</div>
        )}
        {error && !loading && (
          <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>
        )}
      </div>
    </div>
  )
}

export default PcxViewer
