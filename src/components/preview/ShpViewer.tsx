import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { MixFileInfo } from '../../services/MixParser'
import { ShpFile } from '../../data/ShpFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import { IndexedColorRenderer } from '../../services/palette/IndexedColorRenderer'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import SearchableSelect from '../common/SearchableSelect'
import { usePaletteHotkeys } from './usePaletteHotkeys'
import type { PaletteSelectionInfo, Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type MixFileData = { file: File; info: MixFileInfo }

const ShpViewer: React.FC<{
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
  /**
   * 进入 SHP 编辑器的入口。仅当 PreviewPanel 判断当前文件可被编辑（项目模式 + project-file）时下传。
   * 不传则不渲染"编辑 SHP"按钮，保持纯只读查看。
   */
  onEdit?: () => void
}> = ({
  selectedFile,
  mixFiles,
  target,
  resourceContext,
  onEdit,
}) => {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<{ w: number; h: number; frames: number } | null>(null)
  const [frame, setFrame] = useState(0)
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

  // 重置帧为0，当切换文件时
  useEffect(() => {
    if (assetPath) {
      console.log('[ShpViewer] selected file changed to:', assetPath, 'frame will be reset to 0')
      setFrame(0)
    }
  }, [assetPath])

  // 存储SHP和调色板数据，用于帧变化时重新渲染
  const [shpData, setShpData] = useState<{ shp: ShpFile; palette: Rgb[] } | null>(null)
  const [canvasSize, setCanvasSize] = useState<{ w: number, h: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setInfo(null)
      try {
        if (!source.resolved) throw new Error('File not found')
        const bytes = await source.resolved.readBytes()
        const vf = VirtualFile.fromBytes(bytes, source.resolved.name)
        const shp = ShpFile.fromVirtualFile(vf)
        if (!shp || shp.numImages <= 0) throw new Error('Failed to parse SHP')

        const decision = PaletteResolver.resolve({
          assetPath,
          assetKind: 'shp',
          mixFiles: mixFiles ?? [],
          resourceContext,
          manualPalettePath: palettePath || null,
          assetWidth: shp.width,
          assetHeight: shp.height,
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
        setPaletteInfo(selection)

        const clampedPalette = PaletteParser.ensurePalette256(palette)

        // Calculate canvas size based on the maximum extent of all frames
        let maxW = shp.width
        let maxH = shp.height
        for (let i = 0; i < shp.numImages; i++) {
          const img = shp.images[i]
          if (img) {
            maxW = Math.max(maxW, img.x + img.width)
            maxH = Math.max(maxH, img.y + img.height)
          }
        }
        const safeW = Math.max(1, maxW | 0)
        const safeH = Math.max(1, maxH | 0)

        if (cancelled) return

        // 存储SHP和调色板数据，用于后续帧变化时使用
        setShpData({ shp, palette: clampedPalette })
        setCanvasSize({ w: safeW, h: safeH })
        setInfo({ w: safeW, h: safeH, frames: shp.numImages })
      } catch (e: any) {
        setError(e?.message || source.error || 'Failed to render SHP')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [assetPath, mixFiles, palettePath, resourceContext, source.error, source.resolved, t])

  // 当帧或SHP数据改变时重新渲染
  useEffect(() => {
    if (!shpData || !canvasSize || !info) return

    try {
      const canvas = canvasRef.current
      if (!canvas) {
        console.warn('[ShpViewer] canvasRef.current is null')
        return
      }

      // 设置canvas的实际尺寸
      canvas.width = canvasSize.w
      canvas.height = canvasSize.h

      const { shp, palette } = shpData
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        console.error('[ShpViewer] Failed to get 2D context')
        return
      }

      // 渲染当前帧
      const renderIndex = Math.min(frame, shp.numImages - 1)
      const img = shp.getImage(renderIndex)
      const rgba = IndexedColorRenderer.indexedToRgba(img.imageData, img.width, img.height, palette, 0)
      if (img.width <= 0 || img.height <= 0) {
        setError(t('viewer.invalidFrameSize'))
        return
      }
      const imageData = new ImageData(Uint8ClampedArray.from(rgba), img.width, img.height)

      // 计算图像在canvas中的居中位置
      const offsetX = Math.max(0, (canvasSize.w - img.width) / 2)
      const offsetY = Math.max(0, (canvasSize.h - img.height) / 2)

      // 清除画布
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 居中绘制图像
      ctx.putImageData(imageData, offsetX, offsetY)
    } catch (e: any) {
      setError(e?.message || 'SHP 渲染失败')
    }
  }, [frame, shpData, canvasSize, info, t])

  const paletteOptions = useMemo(
    () => [{ value: '', label: t('viewer.paletteAutoRule') }, ...paletteList.map(p => ({ value: p, label: p.split('/').pop() || p }))],
    [paletteList, t],
  )
  usePaletteHotkeys(paletteOptions, palettePath, setPalettePath, true)

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-3">
        <div>{t('viewer.frameLabel')} 
          <input
            type="number"
            min={0}
            value={frame}
            onChange={e => setFrame(Math.max(0, parseInt(e.target.value || '0', 10) | 0))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-0.5"
          />
          {info ? <span className="ml-2">/ {info.frames - 1}</span> : null}
        </div>
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
          <div className="ml-auto">{t('viewer.size')}: {info.w} × {info.h}，{t('viewer.frameCount')}: {info.frames}</div>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className={`${info ? '' : 'ml-auto'} inline-flex items-center gap-1 rounded bg-blue-700 px-2 py-1 text-[11px] text-white hover:bg-blue-600`}
            title={t('shpEditor.editButton')}
          >
            <Pencil size={12} />
            {t('shpEditor.editButton')}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center relative" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #2d2d2d 0, #2d2d2d 12px, #343434 12px, #343434 24px)' }}>
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

export default ShpViewer
