import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MixFileInfo } from '../../services/MixParser'
import { TmpFile } from '../../data/TmpFile'
import { ShpFile } from '../../data/ShpFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import { IndexedColorRenderer } from '../../services/palette/IndexedColorRenderer'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import HexViewer from './HexViewer'
import SearchableSelect from '../common/SearchableSelect'
import { usePaletteHotkeys } from './usePaletteHotkeys'
import type { PaletteSelectionInfo, Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type MixFileData = { file: File; info: MixFileInfo }

type TmpComposite = {
  width: number
  height: number
  indexed: Uint8Array
  totalTiles: number
  presentTiles: number
}

type CompositeBounds = {
  minX: number
  minY: number
  width: number
  height: number
  maxImageHeight: number
}

function computeBounds(tmp: TmpFile): CompositeBounds {
  const images = tmp.images.filter((image): image is NonNullable<typeof image> => image !== null)
  if (images.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: Math.max(1, tmp.blockWidth),
      height: Math.max(1, tmp.blockHeight),
      maxImageHeight: 0,
    }
  }

  const maxImageHeight = tmp.getMaxImageHeight()
  const halfBlockHeight = tmp.blockHeight / 2

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let biggestY = Number.NEGATIVE_INFINITY
  let biggestYValue = 0

  for (const image of images) {
    const elevation = maxImageHeight - image.height
    const tileX = image.x
    const tileY = image.y + elevation * halfBlockHeight
    const tileX2 = tileX + tmp.blockWidth
    const tileY2 = tileY + tmp.blockHeight

    minX = Math.min(minX, tileX)
    minY = Math.min(minY, tileY)
    maxX = Math.max(maxX, tileX2)
    maxY = Math.max(maxY, tileY2)

    if (image.hasExtraData && image.extraData && image.extraWidth > 0 && image.extraHeight > 0) {
      const extraX = image.extraX
      const extraY = image.extraY + elevation * halfBlockHeight
      const extraX2 = extraX + image.extraWidth
      const extraY2 = extraY + image.extraHeight
      minX = Math.min(minX, extraX)
      minY = Math.min(minY, extraY)
      maxX = Math.max(maxX, extraX2)
      maxY = Math.max(maxY, extraY2)
    }

    if (image.y > biggestY) {
      biggestY = image.y
      biggestYValue = image.y + tmp.blockHeight + image.height * halfBlockHeight
      if (image.hasExtraData) {
        biggestYValue -= image.extraY
      }
    }
  }

  const normalizedMinX = Math.floor(minX)
  const normalizedMinY = Math.floor(minY)
  const width = Math.max(1, Math.ceil(maxX - normalizedMinX))
  let height = Math.max(1, Math.ceil(maxY - normalizedMinY))
  const minimumHeightByBiggestY = Math.ceil(biggestYValue - normalizedMinY)
  if (height < minimumHeightByBiggestY) {
    height = Math.max(1, minimumHeightByBiggestY)
  }

  return {
    minX: normalizedMinX,
    minY: normalizedMinY,
    width,
    height,
    maxImageHeight,
  }
}

function drawDiamond(
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  source: Uint8Array,
  blockWidth: number,
  blockHeight: number,
  originX: number,
  originY: number,
) {
  const halfBlockHeight = Math.floor(blockHeight / 2)
  let sourceIndex = 0
  let rowWidth = 0
  let rowStartX = Math.floor(blockWidth / 2)

  for (let row = 0; row < halfBlockHeight; row++) {
    rowWidth += 4
    rowStartX -= 2
    const drawY = originY + row
    let drawX = originX + rowStartX
    for (let i = 0; i < rowWidth && sourceIndex < source.length; i++) {
      const value = source[sourceIndex++]
      if (drawX >= 0 && drawX < targetWidth && drawY >= 0 && drawY < targetHeight) {
        target[drawY * targetWidth + drawX] = value
      }
      drawX++
    }
  }

  for (let row = halfBlockHeight; row < blockHeight; row++) {
    rowWidth -= 4
    rowStartX += 2
    if (rowWidth <= 0) continue
    const drawY = originY + row
    let drawX = originX + rowStartX
    for (let i = 0; i < rowWidth && sourceIndex < source.length; i++) {
      const value = source[sourceIndex++]
      if (drawX >= 0 && drawX < targetWidth && drawY >= 0 && drawY < targetHeight) {
        target[drawY * targetWidth + drawX] = value
      }
      drawX++
    }
  }
}

function drawExtraData(
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  source: Uint8Array,
  width: number,
  height: number,
  originX: number,
  originY: number,
) {
  let sourceIndex = 0
  for (let y = 0; y < height; y++) {
    const drawY = originY + y
    for (let x = 0; x < width; x++) {
      const value = source[sourceIndex++] ?? 0
      if (value === 0) continue
      const drawX = originX + x
      if (drawX >= 0 && drawX < targetWidth && drawY >= 0 && drawY < targetHeight) {
        target[drawY * targetWidth + drawX] = value
      }
    }
  }
}

function composeTmpToIndexed(tmp: TmpFile): TmpComposite {
  const bounds = computeBounds(tmp)
  const indexed = new Uint8Array(bounds.width * bounds.height)
  const halfBlockHeight = tmp.blockHeight / 2
  let presentTiles = 0

  for (const image of tmp.images) {
    if (!image) continue
    presentTiles++

    const elevation = bounds.maxImageHeight - image.height
    const baseX = image.x - bounds.minX
    const baseY = image.y - bounds.minY + elevation * halfBlockHeight

    drawDiamond(indexed, bounds.width, bounds.height, image.tileData, tmp.blockWidth, tmp.blockHeight, baseX, baseY)

    if (image.hasExtraData && image.extraData && image.extraWidth > 0 && image.extraHeight > 0) {
      const extraX = image.extraX - bounds.minX
      const extraY = image.extraY - bounds.minY + elevation * halfBlockHeight
      drawExtraData(indexed, bounds.width, bounds.height, image.extraData, image.extraWidth, image.extraHeight, extraX, extraY)
    }
  }

  return {
    width: bounds.width,
    height: bounds.height,
    indexed,
    totalTiles: tmp.tileCount,
    presentTiles,
  }
}

const TmpViewer: React.FC<{
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({
  selectedFile,
  mixFiles,
  target,
  resourceContext,
}) => {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallbackToHex, setFallbackToHex] = useState(false)
  const [palettePath, setPalettePath] = useState<string>('')
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [paletteInfo, setPaletteInfo] = useState<PaletteSelectionInfo>({
    source: 'fallback-grayscale',
    reason: '未加载',
    resolvedPath: null,
  })
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })
  const assetPath = source.resolved?.displayPath ?? selectedFile ?? ''
  const [info, setInfo] = useState<{
    mode: 'tmp' | 'shp-fallback'
    width: number
    height: number
    blockWidth: number
    blockHeight: number
    totalTiles: number
    presentTiles: number
    frames?: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setFallbackToHex(false)
      setInfo(null)
      try {
        if (!source.resolved) throw new Error('File not found')
        const bytes = await source.resolved.readBytes()
        const vf = VirtualFile.fromBytes(bytes, source.resolved.name)

        const resolvePalette = async (
          assetKind: 'tmp' | 'shp',
          assetSize?: { width?: number; height?: number },
        ) => {
          const decision = PaletteResolver.resolve({
            assetPath,
            assetKind,
            mixFiles: mixFiles ?? [],
            resourceContext,
            manualPalettePath: palettePath || null,
            assetWidth: assetSize?.width ?? null,
            assetHeight: assetSize?.height ?? null,
          })
          setPaletteList(decision.availablePalettePaths)

          let palette: Rgb[] | null = null
          let selection: PaletteSelectionInfo = decision.selection
          if (decision.resolvedPalettePath) {
            const loaded = await loadPaletteByPath(decision.resolvedPalettePath, resourceContext ?? mixFiles ?? [])
            if (loaded) {
              palette = loaded
            } else {
              selection = {
                source: 'fallback-grayscale',
                reason: t('viewer.paletteLoadFailed', { path: decision.resolvedPalettePath }),
                resolvedPath: decision.resolvedPalettePath,
              }
            }
          }
          if (!palette) {
            palette = PaletteParser.buildGrayscalePalette()
          }
          return {
            palette: PaletteParser.ensurePalette256(palette),
            selection,
          }
        }

        try {
          const tmp = TmpFile.fromVirtualFile(vf)
          if (tmp.tileCount <= 0) throw new Error('TMP has no tile data')
          const paletteResolved = await resolvePalette('tmp', {
            width: tmp.blockWidth,
            height: tmp.blockHeight,
          })

          if (cancelled) return
          setPaletteInfo(paletteResolved.selection)

          const composed = composeTmpToIndexed(tmp)
          const rgba = IndexedColorRenderer.indexedToRgba(
            composed.indexed,
            composed.width,
            composed.height,
            paletteResolved.palette,
            0,
          )

          const canvas = canvasRef.current
          if (!canvas) throw new Error('Canvas not ready')
          canvas.width = composed.width
          canvas.height = composed.height
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Canvas context unavailable')
          const imageData = new ImageData(Uint8ClampedArray.from(rgba), composed.width, composed.height)
          ctx.putImageData(imageData, 0, 0)

          setInfo({
            mode: 'tmp',
            width: composed.width,
            height: composed.height,
            blockWidth: tmp.blockWidth,
            blockHeight: tmp.blockHeight,
            totalTiles: composed.totalTiles,
            presentTiles: composed.presentTiles,
          })
        } catch (tmpParseError: any) {
          const tmpParseErrorMessage = tmpParseError?.message || 'TMP parse failed'
          const shouldTryShpFallback = (
            tmpParseErrorMessage.includes('TMP tile count out of range')
            || tmpParseErrorMessage.includes('Unsupported TMP block geometry')
            || tmpParseErrorMessage.includes('TMP index table out of range')
            || tmpParseErrorMessage.includes('TMP has no tiles')
          )
          if (shouldTryShpFallback) {
            try {
              const shp = ShpFile.fromVirtualFile(vf)
              if (!shp || shp.numImages <= 0) {
                throw new Error('SHP fallback parse failed')
              }
              let fallbackFrameIndex = -1
              for (let i = 0; i < shp.images.length; i++) {
                const frame = shp.images[i]
                if (!frame) continue
                if (frame.width > 0 && frame.height > 0) {
                  fallbackFrameIndex = i
                  break
                }
              }
              if (fallbackFrameIndex < 0) {
                const canvas = canvasRef.current
                if (!canvas) throw new Error('Canvas not ready')
                const emptyWidth = Math.max(1, shp.width | 0)
                const emptyHeight = Math.max(1, shp.height | 0)
                canvas.width = emptyWidth
                canvas.height = emptyHeight
                const ctx = canvas.getContext('2d')
                if (!ctx) throw new Error('Canvas context unavailable')
                ctx.clearRect(0, 0, emptyWidth, emptyHeight)
                setPaletteInfo({
                  source: 'fallback-grayscale',
                  reason: t('viewer.shpCompatNoFrames'),
                  resolvedPath: null,
                })
                setInfo({
                  mode: 'shp-fallback',
                  width: emptyWidth,
                  height: emptyHeight,
                  blockWidth: 0,
                  blockHeight: 0,
                  totalTiles: shp.numImages,
                  presentTiles: 0,
                  frames: shp.numImages,
                })
                return
              }
              const firstFrame = shp.getImage(fallbackFrameIndex)
              const paletteResolved = await resolvePalette('shp', {
                width: firstFrame.width,
                height: firstFrame.height,
              })
              if (cancelled) return
              setPaletteInfo({
                ...paletteResolved.selection,
                reason: t('viewer.shpCompatMode', { reason: paletteResolved.selection.reason }),
              })
              const rgba = IndexedColorRenderer.indexedToRgba(
                firstFrame.imageData,
                firstFrame.width,
                firstFrame.height,
                paletteResolved.palette,
                0,
              )
              const canvas = canvasRef.current
              if (!canvas) throw new Error('Canvas not ready')
              canvas.width = firstFrame.width
              canvas.height = firstFrame.height
              const ctx = canvas.getContext('2d')
              if (!ctx) throw new Error('Canvas context unavailable')
              ctx.putImageData(new ImageData(Uint8ClampedArray.from(rgba), firstFrame.width, firstFrame.height), 0, 0)
              setInfo({
                mode: 'shp-fallback',
                width: firstFrame.width,
                height: firstFrame.height,
                blockWidth: 0,
                blockHeight: 0,
                totalTiles: shp.numImages,
                presentTiles: shp.numImages,
                frames: shp.numImages,
              })
              return
            } catch (shpFallbackError: any) {
            }
          }
          throw tmpParseError
        }
      } catch (e: any) {
        if (!cancelled) {
          const errorMessage = e?.message || source.error || 'Failed to render TMP'
          if (
            errorMessage.includes('TMP tile count out of range')
            || errorMessage.includes('Unsupported TMP block geometry')
            || errorMessage.includes('TMP index table out of range')
            || errorMessage.includes('TMP has no tiles')
          ) {
            setFallbackToHex(true)
            setError(t('viewer.tmpNotStandard'))
          } else {
            setError(errorMessage)
          }
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
  }, [assetPath, mixFiles, palettePath, resourceContext, source.error, source.resolved, t])

  const paletteOptions = useMemo(
    () => [{ value: '', label: t('viewer.paletteAutoRule') }, ...paletteList.map((p) => ({ value: p, label: p.split('/').pop() || p }))],
    [paletteList, t],
  )
  usePaletteHotkeys(paletteOptions, palettePath, setPalettePath, true)

  if (fallbackToHex) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="px-3 py-2 text-xs text-yellow-300 border-b border-gray-700 bg-yellow-900/10">
          {error || t('viewer.tmpNotStandard')}
        </div>
        <div className="flex-1 min-h-0">
          <HexViewer selectedFile={selectedFile} mixFiles={mixFiles} resourceContext={resourceContext} />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span>{t('viewer.paletteLabel')}</span>
          <SearchableSelect
            value={palettePath}
            options={paletteOptions}
            onChange={(next) => setPalettePath(next || '')}
            closeOnSelect={false}
            pinnedValues={['']}
            searchPlaceholder={t('viewer.searchPalette')}
            noResultsText={t('viewer.noMatchPalette')}
          />
        </div>
        <div className="text-gray-500 truncate max-w-[420px]">
          {t('viewer.source')}: {paletteInfo.source} - {paletteInfo.reason === 'Embedded palette' ? t('viewer.embeddedPalette') : paletteInfo.reason === 'Manually specified' ? t('viewer.manuallySpecified') : paletteInfo.reason}
        </div>
        {info && (
          <div className="ml-auto">
            {info.mode === 'tmp'
              ? t('viewer.tmpSizeInfo', { w: String(info.width), h: String(info.height), present: String(info.presentTiles), total: String(info.totalTiles), bw: String(info.blockWidth), bh: String(info.blockHeight) })
              : t('viewer.shpCompatRender', { w: String(info.width), h: String(info.height), frames: String(info.frames ?? info.totalTiles) })
            }
          </div>
        )}
      </div>
      <div
        className="flex-1 overflow-auto flex items-center justify-center relative"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, #2d2d2d 0, #2d2d2d 12px, #343434 12px, #343434 24px)' }}
      >
        <div className="flex items-center justify-center" style={{ width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', width: 'auto', height: 'auto' }} />
        </div>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">{t('bik.loading')}</div>
        )}
        {error && !loading && (
          <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>
        )}
      </div>
    </div>
  )
}

export default TmpViewer
