import React, { useEffect, useRef, useState } from 'react'
import { MixFileInfo } from '../../services/MixParser'
import { useLocale } from '../../i18n/LocaleContext'
import {
  MapPreviewDecodeResult,
  MapRect,
  MapPreviewDecoder,
  projectStartingLocationToPreview,
} from '../../data/map/MapPreviewDecoder'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type MixFileData = { file: File; info: MixFileInfo }

function formatRect(rect: MapRect | null): string {
  if (!rect) return '-'
  return `${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}`
}

function drawPreviewToCanvas(canvas: HTMLCanvasElement, data: MapPreviewDecodeResult): void {
  const width = data.previewRect.width
  const height = data.previewRect.height
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const imageData = ctx.createImageData(width, height)
  const rgba = imageData.data
  const rgb = data.rgbData
  let sourceIndex = 0
  let destIndex = 0
  while (sourceIndex + 2 < rgb.length && destIndex + 3 < rgba.length) {
    rgba[destIndex] = rgb[sourceIndex]
    rgba[destIndex + 1] = rgb[sourceIndex + 1]
    rgba[destIndex + 2] = rgb[sourceIndex + 2]
    rgba[destIndex + 3] = 255
    sourceIndex += 3
    destIndex += 4
  }
  ctx.putImageData(imageData, 0, 0)

  if (data.startingLocations.length === 0) return

  const fontSize = Math.max(10, Math.round(Math.min(width, height) / 18))
  ctx.font = `700 ${fontSize}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#FFEB3B'
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = Math.max(2, Math.round(fontSize / 6))

  for (const location of data.startingLocations) {
    const projected = projectStartingLocationToPreview(
      location,
      data.fullSize,
      data.localSize,
      width,
      height,
    )
    if (!projected) continue
    if (
      projected.x < -fontSize
      || projected.x > width + fontSize
      || projected.y < -fontSize
      || projected.y > height + fontSize
    ) {
      continue
    }
    const label = String(location.slot + 1)
    ctx.strokeText(label, projected.x, projected.y)
    ctx.fillText(label, projected.x, projected.y)
  }
}

const MapViewer: React.FC<{
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles, target }) => {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noPreview, setNoPreview] = useState(false)
  const [previewData, setPreviewData] = useState<MapPreviewDecodeResult | null>(null)
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
      setNoPreview(false)
      setPreviewData(null)

      try {
        if (!source.resolved) throw new Error('File not found')
        const text = await source.resolved.readText()
        const decoded = MapPreviewDecoder.decode(text)
        if (cancelled) return
        if (!decoded) {
          setNoPreview(true)
          return
        }
        setPreviewData(decoded)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || source.error || t('map.readFailed'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [source.error, source.resolved, t])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !previewData) return
    drawPreviewToCanvas(canvas, previewData)
  }, [previewData])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center justify-between gap-3">
        <span>{t('map.title')}</span>
        <span className="text-gray-500 truncate">
          {source.resolved?.name || selectedFile}
          {previewData ? ` · ${previewData.previewRect.width} x ${previewData.previewRect.height}` : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0 p-4 overflow-auto">
        {loading && (
          <div className="text-sm text-gray-400">{t('map.loading')}</div>
        )}

        {!loading && error && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{error}</div>
            <div className="text-xs text-gray-500">
              {t('map.errorHint')}
            </div>
          </div>
        )}

        {!loading && !error && noPreview && (
          <div className="space-y-2">
            <div className="text-sm text-amber-300">{t('map.noPreview')}</div>
            <div className="text-xs text-gray-500">
              {t('map.noPreviewHint')}
            </div>
          </div>
        )}

        {!loading && !error && previewData && (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex-1 min-h-[220px] rounded border border-gray-700 bg-black/40 p-2 overflow-hidden">
              <div className="w-full h-full flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  className="h-full w-auto max-h-full max-w-full border border-gray-700 bg-black"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            <div className="text-xs text-gray-400 space-y-1">
              <div>{t('map.previewSize')}: {previewData.previewRect.width} x {previewData.previewRect.height}</div>
              <div>Map.Size: {formatRect(previewData.fullSize)}</div>
              <div>Map.LocalSize: {formatRect(previewData.localSize)}</div>
              <div>{t('map.startingLocations')}: {previewData.startingLocations.length}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MapViewer
