import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ExportController } from '../../services/export/ExportController'
import type { MixFileInfo } from '../../services/MixParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { RawAssociationExportMode } from '../../services/export/types'
import { clamp } from '../../services/export/utils'
import { useAppDialog } from '../common/AppDialogProvider'
import { useLocale } from '../../i18n/LocaleContext'

type MixFileData = { file: File; info: MixFileInfo }
type ExportTab = 'raw' | 'static' | 'gif'
type FrameMode = 'single' | 'range'
type LayoutMode = 'grid' | 'single-column'
type PaletteMode = 'auto' | 'manual'
type TransparencyMode = 'index' | 'opaque'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  selectedFile: string
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
  initialTab?: ExportTab
}

const DEFAULT_BACKGROUND_COLOR = '#000000'

const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  selectedFile,
  mixFiles,
  resourceContext,
  initialTab = 'raw',
}) => {
  const dialog = useAppDialog()
  const { t } = useLocale()
  const extension = useMemo(
    () => selectedFile.split('.').pop()?.toLowerCase() ?? '',
    [selectedFile],
  )
  const shpCapable = extension === 'shp'
  const [activeTab, setActiveTab] = useState<ExportTab>('raw')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  // Raw export options
  const [promptAssociations, setPromptAssociations] = useState(true)
  const [associationMode, setAssociationMode] = useState<RawAssociationExportMode>('separate')

  // SHP shared options
  const [frameCount, setFrameCount] = useState(0)
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [frameMode, setFrameMode] = useState<FrameMode>('single')
  const [frameIndex, setFrameIndex] = useState(0)
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('auto')
  const [manualPalettePath, setManualPalettePath] = useState('')
  const [transparencyMode, setTransparencyMode] = useState<TransparencyMode>('index')
  const [transparentIndex, setTransparentIndex] = useState(0)
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR)

  // Static image export options
  const [staticFormat, setStaticFormat] = useState<'png' | 'jpg'>('png')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid')
  const [gridColumns, setGridColumns] = useState(8)
  const [jpegQuality, setJpegQuality] = useState(0.92)

  // GIF export options
  const [gifDelayMs, setGifDelayMs] = useState(80)
  const [gifLoopCount, setGifLoopCount] = useState(0)

  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab)
    setError(null)
    setResult(null)
    if (!shpCapable) {
      setActiveTab('raw')
      setFrameCount(0)
      setPaletteList([])
      return
    }
    let disposed = false
    async function loadShpMeta() {
      try {
        const context = { selectedFile, mixFiles, resourceContext }
        const [inspection, palettePaths] = await Promise.all([
          ExportController.inspectShp(context),
          ExportController.listShpPaletteOptions(context),
        ])
        if (disposed) return
        const frames = inspection?.frames ?? 0
        setFrameCount(frames)
        setPaletteList(palettePaths)
        if (frames > 0) {
          const max = frames - 1
          setFrameIndex((prev) => clamp(prev, 0, max))
          setRangeStart((prev) => clamp(prev, 0, max))
          setRangeEnd((prev) => clamp(prev, 0, max))
        }
      } catch (e: any) {
        if (disposed) return
        setError(e?.message || t('export.readShpFailed'))
      }
    }
    void loadShpMeta()
    return () => {
      disposed = true
    }
  }, [open, initialTab, shpCapable, selectedFile, mixFiles, resourceContext])

  useEffect(() => {
    if (!open) return
    if (activeTab !== 'raw' && !shpCapable) {
      setActiveTab('raw')
    }
  }, [open, activeTab, shpCapable])

  const frameMax = Math.max(0, frameCount - 1)
  const context = useMemo(
    () => ({ selectedFile, mixFiles, resourceContext }),
    [selectedFile, mixFiles, resourceContext],
  )

  const runRawExport = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const resultData = await ExportController.exportRaw(context, {
        includeAssociations: promptAssociations,
        associationMode,
        confirmAssociationExport: async (associationCount) => {
          return dialog.confirm({
            title: t('export.confirmAssociation'),
            message: t('export.confirmAssociationMsg', { count: associationCount }),
            confirmText: t('export.continueExport'),
            cancelText: t('export.mainFileOnly'),
          })
        },
      })
      const associationCount = resultData.associationPaths.length
      const msg =
        associationCount > 0
          ? t('export.exportDoneWithAssoc', { count: associationCount })
          : t('export.exportDoneMain')
      setResult(msg)
    } catch (e: any) {
      setError(e?.message || t('export.rawExportFailed'))
    } finally {
      setLoading(false)
    }
  }

  const runStaticExport = async () => {
    if (!shpCapable) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const exportResult = await ExportController.exportShpStatic(context, {
        format: staticFormat,
        frameRange: {
          mode: frameMode,
          frameIndex: clamp(frameIndex | 0, 0, frameMax),
          startFrame: clamp(rangeStart | 0, 0, frameMax),
          endFrame: clamp(rangeEnd | 0, 0, frameMax),
        },
        layout: layoutMode,
        gridColumns: clamp(gridColumns | 0, 1, 99),
        palette: {
          mode: paletteMode,
          manualPalettePath: manualPalettePath.trim(),
        },
        transparency: {
          mode: transparencyMode,
          transparentIndex: clamp(transparentIndex | 0, 0, 255),
          backgroundColor,
        },
        jpegQuality: clamp(jpegQuality, 0, 1),
      })
      setResult(t('export.exportDone', { detail: exportResult.filename }))
    } catch (e: any) {
      setError(e?.message || t('export.staticExportFailed'))
    } finally {
      setLoading(false)
    }
  }

  const runGifExport = async () => {
    if (!shpCapable) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const exportResult = await ExportController.exportShpGif(context, {
        frameRange: {
          mode: frameMode,
          frameIndex: clamp(frameIndex | 0, 0, frameMax),
          startFrame: clamp(rangeStart | 0, 0, frameMax),
          endFrame: clamp(rangeEnd | 0, 0, frameMax),
        },
        palette: {
          mode: paletteMode,
          manualPalettePath: manualPalettePath.trim(),
        },
        transparency: {
          mode: transparencyMode,
          transparentIndex: clamp(transparentIndex | 0, 0, 255),
          backgroundColor,
        },
        frameDelayMs: Math.max(10, Math.round(gifDelayMs)),
        loopCount: clamp(gifLoopCount | 0, 0, 65535),
      })
      setResult(t('export.exportDone', { detail: exportResult.filename }))
    } catch (e: any) {
      setError(e?.message || t('export.gifExportFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm text-gray-400">{t('export.title')}</div>
            <div className="text-base font-semibold truncate">{selectedFile.split('/').pop()}</div>
          </div>
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-700 text-gray-300"
            onClick={onClose}
            disabled={loading}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm ${activeTab === 'raw' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
            onClick={() => setActiveTab('raw')}
            disabled={loading}
          >
            {t('export.rawExport')}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm ${activeTab === 'static' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'} ${!shpCapable ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => shpCapable && setActiveTab('static')}
            disabled={!shpCapable || loading}
          >
            {t('export.staticExport')}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm ${activeTab === 'gif' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'} ${!shpCapable ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => shpCapable && setActiveTab('gif')}
            disabled={!shpCapable || loading}
          >
            {t('export.gifExport')}
          </button>
          {!shpCapable && (
            <span className="ml-auto text-xs text-yellow-300">{t('export.shpOnlyHint')}</span>
          )}
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
          {activeTab === 'raw' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={promptAssociations}
                  onChange={(e) => setPromptAssociations(e.target.checked)}
                  disabled={loading}
                />
                {t('export.associationPrompt')}
              </label>
              {promptAssociations && (
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
                  <span>{t('export.associationMode')}</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="assoc-mode"
                      checked={associationMode === 'separate'}
                      onChange={() => setAssociationMode('separate')}
                      disabled={loading}
                    />
                    {t('export.associationSeparate')}
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="assoc-mode"
                      checked={associationMode === 'zip'}
                      onChange={() => setAssociationMode('zip')}
                      disabled={loading}
                    />
                    {t('export.associationZip')}
                  </label>
                </div>
              )}
              <button
                type="button"
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void runRawExport()}
                disabled={loading}
              >
                {loading ? t('export.exporting') : t('export.exportRaw')}
              </button>
            </div>
          )}

          {activeTab !== 'raw' && shpCapable && (
            <div className="space-y-3">
              <div className="text-sm text-gray-300">
                {t('export.shpFrames')} <span className="text-white">{frameCount || '-'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  {t('export.frameMode')}
                  <select
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                    value={frameMode}
                    onChange={(e) => setFrameMode(e.target.value as FrameMode)}
                    disabled={loading}
                  >
                    <option value="single">{t('export.singleFrame')}</option>
                    <option value="range">{t('export.rangeFrames')}</option>
                  </select>
                </label>

                {frameMode === 'single' ? (
                  <label className="text-sm">
                    {t('export.frameIndex')}
                    <input
                      type="number"
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      min={0}
                      max={frameMax}
                      value={frameIndex}
                      onChange={(e) => setFrameIndex(parseInt(e.target.value || '0', 10))}
                      disabled={loading}
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-sm">
                      {t('export.startFrame')}
                      <input
                        type="number"
                        className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        min={0}
                        max={frameMax}
                        value={rangeStart}
                        onChange={(e) => setRangeStart(parseInt(e.target.value || '0', 10))}
                        disabled={loading}
                      />
                    </label>
                    <label className="text-sm">
                      {t('export.endFrame')}
                      <input
                        type="number"
                        className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        min={0}
                        max={frameMax}
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(parseInt(e.target.value || '0', 10))}
                        disabled={loading}
                      />
                    </label>
                  </div>
                )}

                <label className="text-sm">
                  {t('export.paletteMode')}
                  <select
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                    value={paletteMode}
                    onChange={(e) => setPaletteMode(e.target.value as PaletteMode)}
                    disabled={loading}
                  >
                    <option value="auto">{t('export.paletteAuto')}</option>
                    <option value="manual">{t('export.paletteManual')}</option>
                  </select>
                </label>

                {paletteMode === 'manual' && (
                  <label className="text-sm">
                    {t('export.manualPalette')}
                    <select
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={manualPalettePath}
                      onChange={(e) => setManualPalettePath(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">{t('export.selectPalette')}</option>
                      {paletteList.map((path) => (
                        <option key={path} value={path}>
                          {path}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="text-sm">
                  {t('export.transparency')}
                  <select
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                    value={transparencyMode}
                    onChange={(e) => setTransparencyMode(e.target.value as TransparencyMode)}
                    disabled={loading}
                  >
                    <option value="index">{t('export.transparentIndex')}</option>
                    <option value="opaque">{t('export.opaqueBg')}</option>
                  </select>
                </label>

                {transparencyMode === 'index' ? (
                  <label className="text-sm">
                    {t('export.transparentIndexNum')}
                    <input
                      type="number"
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      min={0}
                      max={255}
                      value={transparentIndex}
                      onChange={(e) => setTransparentIndex(parseInt(e.target.value || '0', 10))}
                      disabled={loading}
                    />
                  </label>
                ) : (
                  <label className="text-sm">
                    {t('export.backgroundColor')}
                    <input
                      type="color"
                      className="mt-1 w-full h-9 bg-gray-800 border border-gray-700 rounded px-1"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      disabled={loading}
                    />
                  </label>
                )}
              </div>

              {activeTab === 'static' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-sm">
                    {t('export.exportFormat')}
                    <select
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={staticFormat}
                      onChange={(e) => setStaticFormat(e.target.value as 'png' | 'jpg')}
                      disabled={loading}
                    >
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    {t('export.layoutMode')}
                    <select
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={layoutMode}
                      onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
                      disabled={loading}
                    >
                      <option value="grid">{t('export.gridLayout')}</option>
                      <option value="single-column">{t('export.singleColumn')}</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    {t('export.gridColumns')}
                    <input
                      type="number"
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      min={1}
                      max={99}
                      value={gridColumns}
                      onChange={(e) => setGridColumns(parseInt(e.target.value || '1', 10))}
                      disabled={loading || layoutMode === 'single-column'}
                    />
                  </label>

                  {staticFormat === 'jpg' && (
                    <label className="text-sm md:col-span-3">
                      {t('export.jpegQuality')}
                      <input
                        type="number"
                        step={0.01}
                        min={0}
                        max={1}
                        className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        value={jpegQuality}
                        onChange={(e) => setJpegQuality(parseFloat(e.target.value || '0.92'))}
                        disabled={loading}
                      />
                    </label>
                  )}
                </div>
              )}

              {activeTab === 'gif' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm">
                    {t('export.frameDelay')}
                    <input
                      type="number"
                      min={10}
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={gifDelayMs}
                      onChange={(e) => setGifDelayMs(parseInt(e.target.value || '80', 10))}
                      disabled={loading}
                    />
                  </label>
                  <label className="text-sm">
                    {t('export.loopCount')}
                    <input
                      type="number"
                      min={0}
                      max={65535}
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={gifLoopCount}
                      onChange={(e) => setGifLoopCount(parseInt(e.target.value || '0', 10))}
                      disabled={loading}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void (activeTab === 'static' ? runStaticExport() : runGifExport())}
                disabled={loading || frameCount <= 0}
              >
                {loading ? t('export.exporting') : activeTab === 'static' ? t('export.exportStatic') : t('export.exportGif')}
              </button>
            </div>
          )}

          {error && <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded px-3 py-2">{error}</div>}
          {result && <div className="text-sm text-emerald-300 bg-emerald-950/30 border border-emerald-900 rounded px-3 py-2">{result}</div>}
        </div>
      </div>
    </div>
  )
}

export default ExportDialog

