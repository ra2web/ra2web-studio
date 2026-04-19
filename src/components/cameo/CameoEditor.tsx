import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, Loader2, Save, UploadCloud } from 'lucide-react'
import { CameoBuilder } from '../../services/cameo/CameoBuilder'
import type {
  ButtonizeOptions,
  TextBarOptions,
  TransparentCornersOptions,
  VeteranBadgeOptions,
} from '../../services/cameo/postprocess'
import type { CameoScaleMode } from '../../services/cameo/CameoBuilder'
import { isOsCameoFontFullyCoverable } from '../../services/cameo/osCameoFont'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import type { Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import SearchableSelect from '../common/SearchableSelect'
import type { MixFileData } from '../MixEditor'

const TARGET_W = 60
const TARGET_H = 48
const PREVIEW_SCALE = 8

interface CameoEditorProps {
  paletteHint: { mixFiles: MixFileData[]; resourceContext: ResourceContext | null }
  /** 文件名仅做命名规范提示；保存路径已由用户在"新建文件"时确定。 */
  filenameHint?: string
  onSave: (shpBytes: Uint8Array) => void | Promise<void>
  saving?: boolean
}

type PaletteState =
  | { status: 'loading' }
  | { status: 'ready'; palette: Rgb[]; path: string; auto: boolean }
  | { status: 'missing'; reason: string }

const CameoEditor: React.FC<CameoEditorProps> = ({
  paletteHint,
  filenameHint,
  onSave,
  saving = false,
}) => {
  const { t } = useLocale()

  // ---------- 调色板 ----------
  const [palettePath, setPalettePath] = useState<string>('')
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [paletteState, setPaletteState] = useState<PaletteState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setPaletteState({ status: 'loading' })

    ;(async () => {
      try {
        // 用 PaletteResolver 走一次 cameo 风格解析（filename 含 'icon' + 60x48 → 命中 cameo.pal 规则）
        const decision = PaletteResolver.resolve({
          assetPath: '__cameo_editor__/cameoicon.shp',
          assetKind: 'shp',
          mixFiles: paletteHint.mixFiles,
          resourceContext: paletteHint.resourceContext ?? null,
          manualPalettePath: palettePath || null,
          assetWidth: TARGET_W,
          assetHeight: TARGET_H,
        })
        if (cancelled) return
        setPaletteList(decision.availablePalettePaths)
        const isAuto = !palettePath
        if (decision.resolvedPalettePath) {
          const loaded = await loadPaletteByPath(
            decision.resolvedPalettePath,
            paletteHint.resourceContext ?? paletteHint.mixFiles,
          )
          if (cancelled) return
          if (loaded) {
            const ensured = PaletteParser.ensurePalette256(loaded)
            setPaletteState({
              status: 'ready',
              palette: ensured,
              path: decision.resolvedPalettePath,
              auto: isAuto,
            })
            return
          }
          setPaletteState({
            status: 'missing',
            reason: t('cameo.editor.paletteFallback'),
          })
          return
        }
        setPaletteState({ status: 'missing', reason: t('cameo.editor.paletteMissing') })
      } catch (err: any) {
        if (cancelled) return
        setPaletteState({
          status: 'missing',
          reason: err?.message ?? t('cameo.editor.paletteMissing'),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [palettePath, paletteHint.mixFiles, paletteHint.resourceContext, t])

  const paletteOptions = useMemo(() => {
    const opts = [{ value: '', label: t('cameo.editor.paletteAuto') }]
    for (const p of paletteList) {
      opts.push({ value: p, label: p })
    }
    return opts
  }, [paletteList, t])

  // ---------- 输入图片 ----------
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!imageFile) {
      setImageObj(null)
      setImageError(null)
      return
    }
    let url: string | null = null
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setImageObj(img)
      setImageError(null)
    }
    img.onerror = () => {
      if (cancelled) return
      setImageObj(null)
      setImageError(t('cameo.editor.imageDecodeFailed'))
    }
    url = URL.createObjectURL(imageFile)
    img.src = url
    return () => {
      cancelled = true
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 0)
    }
  }, [imageFile, t])

  const handlePickImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setImageFile(file)
    // 允许重选同一个文件
    event.target.value = ''
  }, [])

  // ---------- 后处理参数 ----------
  const [scaleMode, setScaleMode] = useState<CameoScaleMode>('fit')
  const [textBar, setTextBar] = useState<TextBarOptions>({
    enabled: false,
    text: '',
    text2: '',
    osStrict: true,
    barHeight: 8,
    darkness: 160,
    fadeRows: 3,
    fontSize: 8,
    textShadow: true,
  })
  const [buttonize, setButtonize] = useState<ButtonizeOptions>({
    enabled: false,
    lightness: 80,
    darkness: 80,
  })
  const [veteran, setVeteran] = useState<VeteranBadgeOptions>({
    enabled: false,
    position: 'top-left',
    margin: 2,
  })
  const [transparentCorners, setTransparentCorners] = useState<TransparentCornersOptions>({
    enabled: true,
  })

  // ---------- 预览（debounced 重算） ----------
  // 1:1 实际游戏尺寸 + 8x 放大检视，两个 canvas 共享同一份 previewRgba 数据
  const previewCanvas1xRef = useRef<HTMLCanvasElement | null>(null)
  const previewCanvas8xRef = useRef<HTMLCanvasElement | null>(null)
  const [lastResult, setLastResult] = useState<{ shpBytes: Uint8Array; previewRgba: Uint8ClampedArray } | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

  const palette = paletteState.status === 'ready' ? paletteState.palette : null

  useEffect(() => {
    if (!palette || !imageObj) {
      setLastResult(null)
      return
    }
    let cancelled = false
    setBuilding(true)
    setBuildError(null)
    const handle = window.setTimeout(async () => {
      try {
        const result = await CameoBuilder.buildShp({
          source: imageObj,
          palette,
          width: TARGET_W,
          height: TARGET_H,
          scaleMode,
          textBar,
          buttonize,
          veteranBadge: veteran,
          transparentCorners,
        })
        if (cancelled) return
        setLastResult({ shpBytes: result.shpBytes, previewRgba: result.previewRgba })
      } catch (err: any) {
        if (cancelled) return
        setBuildError(err?.message ?? String(err))
      } finally {
        if (!cancelled) setBuilding(false)
      }
    }, 100)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [palette, imageObj, scaleMode, textBar, buttonize, veteran, transparentCorners])

  // 把预览结果画到两个 canvas（1:1 实际尺寸 + 8x 放大检视），都带 cameo 蓝背景
  useEffect(() => {
    if (!lastResult || !palette) return

    // 背景：cameo 蓝（palette index 0 实际颜色）；如果接近黑则改为标准 cameo 蓝 0x0040FF
    const bg = palette[0]
    const isNearBlack = bg.r + bg.g + bg.b < 24
    const bgColor = isNearBlack ? 'rgb(0, 64, 255)' : `rgb(${bg.r}, ${bg.g}, ${bg.b})`

    // 1) 用一个临时 1x 画布画原始量化结果，作为两个预览的源
    const tmp = document.createElement('canvas')
    tmp.width = TARGET_W
    tmp.height = TARGET_H
    const tmpCtx = tmp.getContext('2d')
    if (!tmpCtx) return
    // 复制一份得到 buffer 类型为 ArrayBuffer 的纯净 Uint8ClampedArray，避免 TS 收紧后的不兼容
    const previewCopy = new Uint8ClampedArray(lastResult.previewRgba.length)
    previewCopy.set(lastResult.previewRgba)
    tmpCtx.putImageData(new ImageData(previewCopy, TARGET_W, TARGET_H), 0, 0)

    const renderTo = (canvas: HTMLCanvasElement | null, scale: number) => {
      if (!canvas) return
      canvas.width = TARGET_W * scale
      canvas.height = TARGET_H * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height)
    }

    renderTo(previewCanvas1xRef.current, 1)
    renderTo(previewCanvas8xRef.current, PREVIEW_SCALE)
  }, [lastResult, palette])

  // ---------- 命名约定提示 ----------
  const namingHint = useMemo(() => {
    if (!filenameHint) return null
    const upper = filenameHint.toUpperCase()
    if (veteran.enabled && !upper.endsWith('UICO.SHP')) {
      return t('cameo.editor.veteranSuffixHint')
    }
    if (!veteran.enabled && !upper.endsWith('ICON.SHP') && !upper.endsWith('UICO.SHP')) {
      return t('cameo.editor.normalSuffixHint')
    }
    return null
  }, [filenameHint, veteran.enabled, t])

  // ---------- 保存 ----------
  const canSave = !!lastResult && !!palette && !!imageObj && !saving && !building
  const handleSave = useCallback(async () => {
    if (!lastResult) return
    await onSave(lastResult.shpBytes)
  }, [lastResult, onSave])

  return (
    <div className="h-full w-full flex flex-col bg-gray-900 text-gray-100">
      {/* 顶部条 */}
      <div className="flex items-center gap-3 border-b border-gray-700 px-4 py-2">
        <ImageIcon size={16} className="flex-shrink-0 text-blue-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t('cameo.editor.title')}</div>
          <div className="truncate text-[11px] text-gray-400">{t('cameo.editor.intro')}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 text-[11px]">
          <span className="text-gray-400">{t('cameo.editor.paletteLabel')}</span>
          {paletteState.status === 'loading' && (
            <span className="inline-flex items-center gap-1 text-blue-300">
              <Loader2 size={12} className="animate-spin" />
              {t('cameo.editor.paletteLoading')}
            </span>
          )}
          {paletteState.status === 'ready' && (
            <span className="text-emerald-300" title={paletteState.path}>
              {paletteState.auto ? t('cameo.editor.paletteAutoTag') : t('cameo.editor.paletteManualTag')}
              <span className="ml-1 text-gray-400">{paletteState.path}</span>
            </span>
          )}
          {paletteState.status === 'missing' && (
            <span className="text-amber-300">{paletteState.reason}</span>
          )}
        </div>
      </div>

      {/* 主体：左控件 + 右预览 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左侧控件区 */}
        <div className="w-[24rem] flex-shrink-0 border-r border-gray-700 overflow-y-auto px-4 py-4 space-y-4 text-xs">
          {/* 选图 */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handlePickImage}
              className="inline-flex items-center gap-2 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-gray-100 hover:bg-gray-700"
            >
              <UploadCloud size={14} />
              {t('cameo.editor.pickImage')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="text-[11px] text-gray-400 truncate" title={imageFile?.name}>
              {imageFile ? imageFile.name : t('cameo.editor.requireImage')}
            </div>
            {imageError && (
              <div className="text-[11px] text-red-300">{imageError}</div>
            )}
          </div>

          {/* 调色板手动选择（缺失或想换时） */}
          <div className="space-y-1.5">
            <div className="text-gray-400">{t('cameo.editor.paletteOverride')}</div>
            <SearchableSelect
              value={palettePath}
              options={paletteOptions}
              onChange={(next) => setPalettePath(next || '')}
              closeOnSelect
              pinnedValues={['']}
              searchPlaceholder={t('cameo.editor.searchPalette')}
              noResultsText={t('cameo.editor.noMatchPalette')}
              triggerClassName="w-full inline-flex items-center justify-between gap-2 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-left text-gray-100 hover:bg-gray-700"
            />
          </div>

          {/* 缩放 */}
          <div className="space-y-1.5">
            <div className="text-gray-400">{t('cameo.editor.scaleLabel')}</div>
            <div className="inline-flex rounded border border-gray-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setScaleMode('fit')}
                className={`px-3 py-1 ${scaleMode === 'fit' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
              >
                {t('cameo.editor.scaleFit')}
              </button>
              <button
                type="button"
                onClick={() => setScaleMode('stretch')}
                className={`px-3 py-1 ${scaleMode === 'stretch' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
              >
                {t('cameo.editor.scaleStretch')}
              </button>
            </div>
            <div className="text-[10px] text-gray-500">{t('cameo.editor.scaleNearestHint')}</div>
          </div>

          {/* 文字条 */}
          <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
            <legend className="px-1 text-gray-300">{t('cameo.editor.textBarTitle')}</legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={textBar.enabled}
                onChange={(e) => setTextBar({ ...textBar, enabled: e.target.checked })}
              />
              <span>{t('cameo.editor.textBarEnable')}</span>
            </label>
            <div className={textBar.enabled ? 'space-y-1.5' : 'space-y-1.5 opacity-50 pointer-events-none'}>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={textBar.osStrict !== false}
                  onChange={(e) =>
                    setTextBar({ ...textBar, osStrict: e.target.checked })
                  }
                />
                <span>{t('cameo.editor.textBarOsStrict')}</span>
              </label>
              {textBar.osStrict !== false && (
                <div className="text-[10px] text-gray-500">{t('cameo.editor.textBarOsStrictHint')}</div>
              )}
              {(() => {
                const usingBitmapFont =
                  textBar.osStrict !== false
                  && isOsCameoFontFullyCoverable(textBar.text ?? '')
                  && isOsCameoFontFullyCoverable(textBar.text2 ?? '')
                const hasFallbackChars =
                  textBar.osStrict !== false
                  && (!isOsCameoFontFullyCoverable(textBar.text ?? '')
                    || !isOsCameoFontFullyCoverable(textBar.text2 ?? ''))
                return (
                  <>
                    <label className="block">
                      <span className="text-gray-400">{t('cameo.editor.textBarText')}</span>
                      <input
                        type="text"
                        value={textBar.text ?? ''}
                        maxLength={32}
                        placeholder="坦克 / TANK"
                        onChange={(e) => setTextBar({ ...textBar, text: e.target.value })}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-400">{t('cameo.editor.textBarText2')}</span>
                      <input
                        type="text"
                        value={textBar.text2 ?? ''}
                        maxLength={32}
                        placeholder="V3"
                        disabled={!(textBar.text ?? '').trim()}
                        onChange={(e) => setTextBar({ ...textBar, text2: e.target.value })}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                    {usingBitmapFont && (
                      <div className="text-[10px] text-emerald-300">
                        {t('cameo.editor.textBarBitmapFontActive')}
                      </div>
                    )}
                    {hasFallbackChars && (
                      <div className="text-[10px] text-amber-300">
                        {t('cameo.editor.textBarFallbackToSystemFont')}
                      </div>
                    )}
                    {textBar.osStrict === false && (
                      <div className="text-[10px] text-gray-500">{t('cameo.editor.textBarTextHint')}</div>
                    )}
                  </>
                )
              })()}
              <label className="block">
                <span className="text-gray-400">
                  {t('cameo.editor.textBarHeight')}: {textBar.barHeight ?? 8}px
                </span>
                <input
                  type="range"
                  min={4}
                  max={24}
                  value={textBar.barHeight ?? 8}
                  onChange={(e) =>
                    setTextBar({ ...textBar, barHeight: Number(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="mt-0.5 text-[10px] text-gray-500">
                  {t('cameo.editor.textBarHeightHint')}
                </div>
              </label>
              <label className="block">
                <span className="text-gray-400">
                  {t('cameo.editor.textBarFontSize')}: {textBar.fontSize ?? 8}px
                </span>
                <input
                  type="range"
                  min={6}
                  max={16}
                  value={textBar.fontSize ?? 8}
                  onChange={(e) =>
                    setTextBar({ ...textBar, fontSize: Number(e.target.value) })
                  }
                  className="w-full"
                />
                {(textBar.fontSize ?? 8) > (textBar.barHeight ?? 8) && (
                  <div className="mt-0.5 text-[10px] text-amber-300">
                    {t('cameo.editor.textBarFontSizeOverflow')}
                  </div>
                )}
              </label>
              <label className="block">
                <span className="text-gray-400">
                  {t('cameo.editor.textBarDarkness')}: {textBar.darkness ?? 160}
                </span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={textBar.darkness ?? 160}
                  onChange={(e) =>
                    setTextBar({ ...textBar, darkness: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
              {textBar.osStrict === false && (
                <label className="block">
                  <span className="text-gray-400">
                    {t('cameo.editor.textBarFade')}: {textBar.fadeRows ?? 3}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(20, textBar.barHeight ?? 8)}
                    value={textBar.fadeRows ?? 3}
                    onChange={(e) =>
                      setTextBar({ ...textBar, fadeRows: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </label>
              )}
              {textBar.osStrict !== false && (
                <>
                  <label className="block">
                    <span className="text-gray-400">
                      {t('cameo.editor.textBarSharpenThreshold')}: {textBar.sharpenThreshold ?? 96}
                    </span>
                    <input
                      type="range"
                      min={16}
                      max={250}
                      value={textBar.sharpenThreshold ?? 96}
                      onChange={(e) =>
                        setTextBar({ ...textBar, sharpenThreshold: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      {t('cameo.editor.textBarSharpenHint')}
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-gray-400">
                      {t('cameo.editor.textBarCharAspect')}: {(textBar.charAspectRatio ?? 1.25).toFixed(2)}
                    </span>
                    <input
                      type="range"
                      min={1.0}
                      max={1.6}
                      step={0.05}
                      value={textBar.charAspectRatio ?? 1.25}
                      onChange={(e) =>
                        setTextBar({ ...textBar, charAspectRatio: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      {t('cameo.editor.textBarCharAspectHint')}
                    </div>
                  </label>
                </>
              )}
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={textBar.textShadow !== false}
                  onChange={(e) =>
                    setTextBar({ ...textBar, textShadow: e.target.checked })
                  }
                />
                <span>{t('cameo.editor.textBarShadow')}</span>
              </label>
            </div>
          </fieldset>

          {/* 立体感 */}
          <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
            <legend className="px-1 text-gray-300">{t('cameo.editor.buttonizeTitle')}</legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={buttonize.enabled}
                onChange={(e) => setButtonize({ ...buttonize, enabled: e.target.checked })}
              />
              <span>{t('cameo.editor.buttonizeEnable')}</span>
            </label>
            <div className={buttonize.enabled ? 'space-y-1.5' : 'space-y-1.5 opacity-50 pointer-events-none'}>
              <label className="block">
                <span className="text-gray-400">
                  {t('cameo.editor.buttonizeLightness')}: {buttonize.lightness ?? 80}
                </span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={buttonize.lightness ?? 80}
                  onChange={(e) =>
                    setButtonize({ ...buttonize, lightness: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="text-gray-400">
                  {t('cameo.editor.buttonizeDarkness')}: {buttonize.darkness ?? 80}
                </span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={buttonize.darkness ?? 80}
                  onChange={(e) =>
                    setButtonize({ ...buttonize, darkness: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
            </div>
          </fieldset>

          {/* 老兵勋章 */}
          <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
            <legend className="px-1 text-gray-300">{t('cameo.editor.veteranTitle')}</legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={veteran.enabled}
                onChange={(e) => setVeteran({ ...veteran, enabled: e.target.checked })}
              />
              <span>{t('cameo.editor.veteranEnable')}</span>
            </label>
            <div className={veteran.enabled ? 'space-y-1.5' : 'space-y-1.5 opacity-50 pointer-events-none'}>
              <div className="text-gray-400">{t('cameo.editor.veteranPosition')}</div>
              <div className="inline-flex rounded border border-gray-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setVeteran({ ...veteran, position: 'top-left' })}
                  className={`px-2 py-1 ${veteran.position !== 'top-right' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
                >
                  {t('cameo.editor.veteranPosTopLeftOs')}
                </button>
                <button
                  type="button"
                  onClick={() => setVeteran({ ...veteran, position: 'top-right' })}
                  className={`px-2 py-1 ${veteran.position === 'top-right' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
                >
                  {t('cameo.editor.veteranPosTopRightCustom')}
                </button>
              </div>
            </div>
          </fieldset>

          {/* RA2 透明角 */}
          <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
            <legend className="px-1 text-gray-300">{t('cameo.editor.transparentCornersTitle')}</legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={transparentCorners.enabled}
                onChange={(e) => setTransparentCorners({ enabled: e.target.checked })}
              />
              <span>{t('cameo.editor.transparentCornersEnable')}</span>
            </label>
            <div className="text-[10px] text-gray-500">{t('cameo.editor.transparentCornersHint')}</div>
          </fieldset>
        </div>

        {/* 右侧预览区 */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-4 px-4 py-4">
          <div className="text-xs text-gray-400">{t('cameo.editor.preview')}</div>

          {!imageObj || !palette ? (
            <div
              className="flex items-center justify-center text-gray-500 text-xs"
              style={{
                width: TARGET_W * PREVIEW_SCALE,
                height: TARGET_H * PREVIEW_SCALE,
                backgroundImage:
                  'repeating-linear-gradient(45deg, #2d2d2d 0, #2d2d2d 12px, #343434 12px, #343434 24px)',
              }}
            >
              {!palette
                ? t('cameo.editor.previewWaitPalette')
                : t('cameo.editor.previewWaitImage')}
            </div>
          ) : (
            <div className="flex items-start justify-center gap-6">
              {/* 1:1 实际游戏尺寸 */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[11px] text-gray-300">
                  {t('cameo.editor.preview1x')} ({TARGET_W} × {TARGET_H})
                </div>
                <div className="relative rounded border border-gray-700 p-1">
                  <canvas
                    ref={previewCanvas1xRef}
                    style={{
                      imageRendering: 'pixelated',
                      width: TARGET_W,
                      height: TARGET_H,
                      display: 'block',
                    }}
                  />
                  {(building || saving) && (
                    <div className="absolute inset-1 flex items-center justify-center bg-black/55 text-blue-200 text-[10px]">
                      <Loader2 size={10} className="animate-spin" />
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-gray-500">{t('cameo.editor.preview1xHint')}</div>
              </div>

              {/* 8x 放大检视 */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[11px] text-gray-300">
                  {t('cameo.editor.preview8x')} ({TARGET_W * PREVIEW_SCALE} × {TARGET_H * PREVIEW_SCALE})
                </div>
                <div className="relative rounded border border-gray-700 p-1">
                  <canvas
                    ref={previewCanvas8xRef}
                    style={{
                      imageRendering: 'pixelated',
                      width: TARGET_W * PREVIEW_SCALE,
                      height: TARGET_H * PREVIEW_SCALE,
                      display: 'block',
                    }}
                  />
                  {(building || saving) && (
                    <div className="absolute inset-1 flex items-center justify-center bg-black/35 text-blue-200 text-xs">
                      <Loader2 size={14} className="mr-1 animate-spin" />
                      {saving ? t('cameo.editor.saving') : t('cameo.editor.building')}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-gray-500">{t('cameo.editor.preview8xHint')}</div>
              </div>
            </div>
          )}
          {buildError && (
            <div className="rounded border border-red-500/40 bg-red-900/30 px-3 py-1 text-xs text-red-200">
              {buildError}
            </div>
          )}
          {namingHint && (
            <div className="rounded border border-amber-500/40 bg-amber-900/20 px-3 py-1 text-xs text-amber-200">
              {namingHint}
            </div>
          )}
        </div>
      </div>

      {/* 底部 */}
      <div className="flex items-center justify-end gap-2 border-t border-gray-700 px-4 py-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {t('cameo.editor.save')}
        </button>
      </div>
    </div>
  )
}

export default CameoEditor
