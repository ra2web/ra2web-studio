import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ImageIcon, Loader2, Save, UploadCloud, X } from 'lucide-react'
import CameoOptionsFieldset from './CameoOptionsFieldset'
import { CameoBuilder, type CameoScaleMode } from '../../services/cameo/CameoBuilder'
import { renderShpFrameToBlob } from '../../services/cameo/shpToImage'
import {
  GenericShpBuilder,
  type GenericShpScaleMode,
} from '../../services/shp/GenericShpBuilder'
import { SpriteSheetSlicer } from '../../services/shp/SpriteSheetSlicer'
import type {
  ButtonizeOptions,
  TextBarOptions,
  TransparentCornersOptions,
  VeteranBadgeOptions,
} from '../../services/cameo/postprocess'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import type { Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import SearchableSelect from '../common/SearchableSelect'
import type { MixFileData } from '../MixEditor'

/** SHP 编辑器的几个标准 preset。custom 表示完全自定义尺寸；sprite-sheet 表示多帧切分。 */
export type ShpEditorPreset = 'cameo' | 'loadscreen-640' | 'loadscreen-800' | 'custom' | 'sprite-sheet'

export interface ShpEditorProps {
  paletteHint: { mixFiles: MixFileData[]; resourceContext: ResourceContext | null }
  /** 仅用于命名提示：例如 cameo 推断 ICON.SHP / UICO.SHP。 */
  filenameHint?: string
  /** 进入编辑器时的初始 preset；不传则按文件名推断（含 'load' → loadscreen，否则 cameo）。 */
  initialPreset?: ShpEditorPreset
  onSave: (shpBytes: Uint8Array) => void | Promise<void>
  /** 仅在编辑已有 SHP 时挂出"取消"按钮。空 SHP 创建场景下不挂。 */
  onExit?: () => void
  saving?: boolean
  /**
   * 编辑已有 SHP 时由父组件传入字节。ShpEditor 解析 frame 0 渲染成 PNG Blob 后
   * 灌进 imageFile / imageObj，复用现有图片管线。这样用户进编辑器立即看到原图，
   * 可叠加 cameo 装饰再保存覆盖原文件。
   *
   * 不传 = 新建模式，用户需要手动 pickImage。
   */
  existingShpSource?: { bytes: Uint8Array; filename: string }
}

/** 已有 SHP 的元信息（解码后给横幅 / 警告横幅用） */
interface ExistingShpInfo {
  filename: string
  width: number
  height: number
  numFrames: number
}

type PaletteState =
  | { status: 'loading' }
  | { status: 'ready'; palette: Rgb[]; path: string; auto: boolean }
  | { status: 'missing'; reason: string }

interface PresetDef {
  id: ShpEditorPreset
  labelKey: string
  width: number
  height: number
  /** sprite-sheet 默认列数（仅 sprite-sheet preset 用） */
  defaultCols?: number
  defaultRows?: number
}

const PRESETS: PresetDef[] = [
  { id: 'cameo', labelKey: 'shpEditor.presetCameo', width: 60, height: 48 },
  { id: 'loadscreen-640', labelKey: 'shpEditor.presetLoadscreen640', width: 640, height: 480 },
  { id: 'loadscreen-800', labelKey: 'shpEditor.presetLoadscreen800', width: 800, height: 600 },
  { id: 'sprite-sheet', labelKey: 'shpEditor.presetSpriteSheet', width: 64, height: 64, defaultCols: 8, defaultRows: 4 },
  { id: 'custom', labelKey: 'shpEditor.presetCustom', width: 60, height: 48 },
]

function inferPresetFromFilename(name?: string): ShpEditorPreset {
  if (!name) return 'cameo'
  const upper = name.toUpperCase()
  if (upper.includes('LOAD')) return 'loadscreen-640'
  if (upper.endsWith('ICON.SHP') || upper.endsWith('UICO.SHP')) return 'cameo'
  return 'cameo'
}

const ShpEditor: React.FC<ShpEditorProps> = ({
  paletteHint,
  filenameHint,
  initialPreset,
  onSave,
  onExit,
  saving = false,
  existingShpSource,
}) => {
  const { t } = useLocale()

  // ---------- preset ----------
  const [preset, setPreset] = useState<ShpEditorPreset>(
    () => initialPreset ?? inferPresetFromFilename(filenameHint),
  )
  const presetDef = useMemo(() => PRESETS.find((p) => p.id === preset) ?? PRESETS[0], [preset])

  // 自定义/sprite-sheet 的尺寸 & 切片参数
  const [customWidth, setCustomWidth] = useState<number>(presetDef.width)
  const [customHeight, setCustomHeight] = useState<number>(presetDef.height)
  const [sheetCols, setSheetCols] = useState<number>(presetDef.defaultCols ?? 8)
  const [sheetRows, setSheetRows] = useState<number>(presetDef.defaultRows ?? 4)
  const [sheetFrameW, setSheetFrameW] = useState<number>(presetDef.width)
  const [sheetFrameH, setSheetFrameH] = useState<number>(presetDef.height)
  const [sheetMaxFrames, setSheetMaxFrames] = useState<number>(0) // 0 = 不限制 = cols * rows

  useEffect(() => {
    if (preset === 'custom' || preset === 'sprite-sheet') {
      setCustomWidth(presetDef.width)
      setCustomHeight(presetDef.height)
      setSheetFrameW(presetDef.width)
      setSheetFrameH(presetDef.height)
    }
    if (preset === 'sprite-sheet') {
      setSheetCols(presetDef.defaultCols ?? 8)
      setSheetRows(presetDef.defaultRows ?? 4)
      setSheetMaxFrames(0)
    }
  }, [preset, presetDef])

  // 实际输出尺寸：cameo / loadscreen 走 preset 自身；custom / sprite-sheet 走输入值
  const outWidth = preset === 'custom' || preset === 'sprite-sheet' ? customWidth : presetDef.width
  const outHeight = preset === 'custom' || preset === 'sprite-sheet' ? customHeight : presetDef.height

  // ---------- 调色板 ----------
  const [palettePath, setPalettePath] = useState<string>('')
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [paletteState, setPaletteState] = useState<PaletteState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setPaletteState({ status: 'loading' })

    ;(async () => {
      try {
        // 用一个能命中 cameo.pal 规则的 stub 路径；其它 preset 也合用这套规则（结果一般也是 cameo.pal）
        const decision = PaletteResolver.resolve({
          assetPath: '__shp_editor__/cameoicon.shp',
          assetKind: 'shp',
          mixFiles: paletteHint.mixFiles,
          resourceContext: paletteHint.resourceContext ?? null,
          manualPalettePath: palettePath || null,
          assetWidth: outWidth,
          assetHeight: outHeight,
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
          setPaletteState({ status: 'missing', reason: t('cameo.editor.paletteFallback') })
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
  }, [
    palettePath,
    paletteHint.mixFiles,
    paletteHint.resourceContext,
    outWidth,
    outHeight,
    t,
  ])

  const paletteOptions = useMemo(() => {
    const opts = [{ value: '', label: t('cameo.editor.paletteAuto') }]
    for (const p of paletteList) opts.push({ value: p, label: p })
    return opts
  }, [paletteList, t])

  // ---------- 输入图片 ----------
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 已有 SHP 元信息：仅 existingShpSource 解码成功后赋值，用于顶部横幅展示
  const [existingShpInfo, setExistingShpInfo] = useState<ExistingShpInfo | null>(null)
  // 区分"用户手动换过图"vs"我还在用 existingShpSource 自动加载的图"。
  // 用户一旦点过 pickImage 后，自动加载就不再重复（避免覆盖用户的新图）。
  const userReplacedImageRef = useRef(false)
  // 已自动加载过的 source 标记，防止 useEffect 重复执行（依赖里 palette 切换时也要避免重做）
  const loadedExistingKeyRef = useRef<string | null>(null)

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
    // 用户手动换图：标记一下，避免后续 palette 变化触发 existingShpSource 自动加载覆盖
    userReplacedImageRef.current = true
    event.target.value = ''
  }, [])

  // 自动加载已有 SHP：当父组件传了 existingShpSource 且 palette 已 ready 时，
  // 解码 frame 0 → PNG Blob → new File → setImageFile，复用现有 [imageFile] 管线。
  // 用户一旦点过 pickImage 替换图片，本副作用就不再触发（userReplacedImageRef 守卫）。
  useEffect(() => {
    if (!existingShpSource) {
      setExistingShpInfo(null)
      loadedExistingKeyRef.current = null
      userReplacedImageRef.current = false
      return
    }
    if (paletteState.status !== 'ready') return
    if (userReplacedImageRef.current) return
    // 同一份字节 + 同一个 palette path 只加载一次（避免 palette 切换时重做）
    const key = `${existingShpSource.filename}#${existingShpSource.bytes.byteLength}#${paletteState.path}`
    if (loadedExistingKeyRef.current === key) return
    loadedExistingKeyRef.current = key

    let cancelled = false
    ;(async () => {
      try {
        const result = await renderShpFrameToBlob(
          existingShpSource.bytes,
          existingShpSource.filename,
          paletteState.palette,
          0,
        )
        if (cancelled) return
        const file = new File([result.blob], existingShpSource.filename, { type: 'image/png' })
        setImageFile(file)
        setExistingShpInfo({
          filename: existingShpSource.filename,
          width: result.width,
          height: result.height,
          numFrames: result.numFrames,
        })
      } catch (err: any) {
        if (cancelled) return
        setImageError(t('cameo.editor.existingLoadFailed', { error: err?.message ?? String(err) }))
        setExistingShpInfo(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [existingShpSource, paletteState, t])

  // ---------- 通用控件状态 ----------
  const [scaleMode, setScaleMode] = useState<CameoScaleMode>('fit')

  // ---------- cameo 装饰参数（仅 cameo preset 下有效） ----------
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
  // OS Blade 默认值（FormCameoGenerator.dfm: lightness=20, darkness=40）
  const [buttonize, setButtonize] = useState<ButtonizeOptions>({
    enabled: false,
    lightness: 20,
    darkness: 40,
  })
  const [veteran, setVeteran] = useState<VeteranBadgeOptions>({
    enabled: false,
    position: 'top-left',
    margin: 2,
  })
  const [transparentCorners, setTransparentCorners] = useState<TransparentCornersOptions>({
    enabled: true,
  })

  // ---------- 构建结果 ----------
  // cameo 单帧用 1x + 8x 双预览；其它 preset 走单 1x + 网格预览（多帧）
  const previewCanvas1xRef = useRef<HTMLCanvasElement | null>(null)
  const previewCanvas8xRef = useRef<HTMLCanvasElement | null>(null)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  type BuildResult = {
    shpBytes: Uint8Array
    framesPreviewRgba: Uint8ClampedArray[]
    width: number
    height: number
    numFrames: number
  }
  const [lastResult, setLastResult] = useState<BuildResult | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

  const palette = paletteState.status === 'ready' ? paletteState.palette : null

  // ---------- debounced 构建 ----------
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
        if (preset === 'cameo') {
          const result = await CameoBuilder.buildShp({
            source: imageObj,
            palette,
            width: outWidth,
            height: outHeight,
            scaleMode,
            textBar,
            buttonize,
            veteranBadge: veteran,
            transparentCorners,
          })
          if (cancelled) return
          setLastResult({
            shpBytes: result.shpBytes,
            framesPreviewRgba: [result.previewRgba],
            width: result.width,
            height: result.height,
            numFrames: 1,
          })
          return
        }

        // 通用 preset：先把源图分帧（sprite-sheet 多帧 / 否则单帧），再走 GenericShpBuilder
        let frameCanvases: HTMLCanvasElement[]
        let outW = outWidth
        let outH = outHeight

        if (preset === 'sprite-sheet') {
          const limit = sheetMaxFrames > 0 ? sheetMaxFrames : sheetCols * sheetRows
          frameCanvases = SpriteSheetSlicer.slice({
            source: imageObj,
            cols: sheetCols,
            rows: sheetRows,
            frameWidth: sheetFrameW,
            frameHeight: sheetFrameH,
            maxFrames: limit,
          })
          outW = sheetFrameW
          outH = sheetFrameH
        } else {
          // loadscreen-640 / loadscreen-800 / custom：单帧，源图作为唯一帧
          const single = document.createElement('canvas')
          single.width = imageObj.naturalWidth || imageObj.width
          single.height = imageObj.naturalHeight || imageObj.height
          const sctx = single.getContext('2d')
          if (!sctx) throw new Error('ShpEditor: failed to allocate single-frame canvas')
          sctx.imageSmoothingEnabled = false
          sctx.drawImage(imageObj, 0, 0)
          frameCanvases = [single]
        }

        if (!frameCanvases.length) {
          throw new Error(t('shpEditor.errorNoFrames'))
        }

        const result = GenericShpBuilder.buildShp({
          frames: frameCanvases,
          palette,
          width: outW,
          height: outH,
          scaleMode: scaleMode as GenericShpScaleMode,
        })
        if (cancelled) return
        setLastResult({
          shpBytes: result.shpBytes,
          framesPreviewRgba: result.previewRgbaPerFrame,
          width: result.width,
          height: result.height,
          numFrames: result.numFrames,
        })
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
  }, [
    palette,
    imageObj,
    preset,
    outWidth,
    outHeight,
    scaleMode,
    textBar,
    buttonize,
    veteran,
    transparentCorners,
    sheetCols,
    sheetRows,
    sheetFrameW,
    sheetFrameH,
    sheetMaxFrames,
    t,
  ])

  // ---------- 预览渲染 ----------
  // cameo: 单帧 1x + 8x；其它 preset: 网格（每帧 1x + 透明背景）
  useEffect(() => {
    if (!lastResult || !palette) return

    const bg = palette[0]
    const isNearBlack = bg.r + bg.g + bg.b < 24
    const bgColor = isNearBlack ? 'rgb(0, 64, 255)' : `rgb(${bg.r}, ${bg.g}, ${bg.b})`
    const useBlueBg = preset === 'cameo'

    if (preset === 'cameo') {
      const w = lastResult.width
      const h = lastResult.height
      const previewRgba = lastResult.framesPreviewRgba[0]
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      const tmpCtx = tmp.getContext('2d')
      if (!tmpCtx) return
      const previewCopy = new Uint8ClampedArray(previewRgba.length)
      previewCopy.set(previewRgba)
      tmpCtx.putImageData(new ImageData(previewCopy, w, h), 0, 0)

      const renderTo = (canvas: HTMLCanvasElement | null, scale: number) => {
        if (!canvas) return
        canvas.width = w * scale
        canvas.height = h * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        if (useBlueBg) {
          ctx.fillStyle = bgColor
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height)
      }
      renderTo(previewCanvas1xRef.current, 1)
      renderTo(previewCanvas8xRef.current, 8)
      return
    }

    // 多帧网格预览
    const container = gridContainerRef.current
    if (!container) return
    container.innerHTML = ''
    const w = lastResult.width
    const h = lastResult.height
    for (let i = 0; i < lastResult.framesPreviewRgba.length; i++) {
      const rgba = lastResult.framesPreviewRgba[i]
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      const tctx = tmp.getContext('2d')
      if (!tctx) continue
      const copy = new Uint8ClampedArray(rgba.length)
      copy.set(rgba)
      tctx.putImageData(new ImageData(copy, w, h), 0, 0)

      const cell = document.createElement('div')
      cell.className = 'inline-flex flex-col items-center gap-1 rounded border border-gray-700 p-1'
      const label = document.createElement('div')
      label.className = 'text-[10px] text-gray-400'
      label.textContent = `#${i}`
      cell.appendChild(label)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.style.imageRendering = 'pixelated'
      // 缩略尺寸：cameo 等小帧放大 2x；大尺寸 (loadscreen) 缩到 max-w 200
      const maxW = 200
      const displayScale = w > maxW ? maxW / w : Math.max(1, Math.floor(maxW / w))
      canvas.style.width = `${Math.round(w * displayScale)}px`
      canvas.style.height = `${Math.round(h * displayScale)}px`
      canvas.style.background = '#222'
      const cctx = canvas.getContext('2d')
      if (cctx) {
        cctx.imageSmoothingEnabled = false
        cctx.drawImage(tmp, 0, 0)
      }
      cell.appendChild(canvas)
      container.appendChild(cell)
    }
  }, [lastResult, palette, preset])

  // ---------- 命名约定提示 ----------
  const namingHint = useMemo(() => {
    if (!filenameHint) return null
    const upper = filenameHint.toUpperCase()
    if (preset === 'cameo') {
      if (veteran.enabled && !upper.endsWith('UICO.SHP')) {
        return t('cameo.editor.veteranSuffixHint')
      }
      if (!veteran.enabled && !upper.endsWith('ICON.SHP') && !upper.endsWith('UICO.SHP')) {
        return t('cameo.editor.normalSuffixHint')
      }
    }
    return null
  }, [filenameHint, veteran.enabled, preset, t])

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
          <div className="text-sm font-semibold">{t('shpEditor.title')}</div>
          <div className="truncate text-[11px] text-gray-400">{t('shpEditor.intro')}</div>
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
        {onExit && (
          <button
            type="button"
            onClick={() => onExit()}
            className="inline-flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600"
          >
            <X size={12} />
            {t('shpEditor.exit')}
          </button>
        )}
      </div>

      {/* 已加载已有 SHP 的横幅 / 警告（仅在 existingShpInfo 解码完成后渲染） */}
      {existingShpInfo && (() => {
        const isCameoSize = existingShpInfo.width === 60 && existingShpInfo.height === 48
        const isMultiFrame = existingShpInfo.numFrames > 1
        const variant = isCameoSize && !isMultiFrame ? 'ok' : 'warn'
        return (
          <div
            className={`flex flex-col gap-1 border-b px-4 py-1.5 text-[11px] ${
              variant === 'ok'
                ? 'border-emerald-700/40 bg-emerald-900/15 text-emerald-200'
                : 'border-amber-700/40 bg-amber-900/15 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {variant === 'ok'
                ? <CheckCircle2 size={12} className="text-emerald-300" />
                : <AlertTriangle size={12} className="text-amber-300" />}
              <span>
                {t('cameo.editor.existingLoaded', {
                  name: existingShpInfo.filename,
                  w: existingShpInfo.width,
                  h: existingShpInfo.height,
                  n: existingShpInfo.numFrames,
                })}
              </span>
            </div>
            {isMultiFrame && (
              <div className="pl-4 text-amber-200">
                {t('cameo.editor.existingMultiFrameWarn', {
                  n: existingShpInfo.numFrames,
                })}
              </div>
            )}
            {!isCameoSize && (
              <div className="pl-4 text-amber-200">
                {t('cameo.editor.existingNonCameoWarn', {
                  w: existingShpInfo.width,
                  h: existingShpInfo.height,
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* 主体 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左侧控件区 */}
        <div className="w-[24rem] flex-shrink-0 border-r border-gray-700 overflow-y-auto px-4 py-4 space-y-4 text-xs">
          {/* preset */}
          <div className="space-y-1.5">
            <div className="text-gray-400">{t('shpEditor.presetLabel')}</div>
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`rounded px-2 py-1 text-left ${
                    preset === p.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <div>{t(p.labelKey as any)}</div>
                  <div className="text-[10px] opacity-70">
                    {p.id === 'sprite-sheet'
                      ? t('shpEditor.presetSpriteSheetHint')
                      : `${p.width}×${p.height}`}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 自定义 / sprite-sheet 尺寸输入 */}
          {(preset === 'custom' || preset === 'sprite-sheet') && (
            <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
              <legend className="px-1 text-gray-300">
                {preset === 'custom'
                  ? t('shpEditor.customSizeTitle')
                  : t('shpEditor.spriteSheetTitle')}
              </legend>

              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-gray-400">{t('shpEditor.width')}</span>
                    <input
                      type="number"
                      min={1}
                      max={4096}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Math.max(1, Number(e.target.value) | 0))}
                      className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-gray-400">{t('shpEditor.height')}</span>
                    <input
                      type="number"
                      min={1}
                      max={4096}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Math.max(1, Number(e.target.value) | 0))}
                      className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                    />
                  </label>
                </div>
              )}

              {preset === 'sprite-sheet' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-gray-400">{t('shpEditor.spriteCols')}</span>
                      <input
                        type="number"
                        min={1}
                        max={64}
                        value={sheetCols}
                        onChange={(e) => setSheetCols(Math.max(1, Number(e.target.value) | 0))}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-400">{t('shpEditor.spriteRows')}</span>
                      <input
                        type="number"
                        min={1}
                        max={64}
                        value={sheetRows}
                        onChange={(e) => setSheetRows(Math.max(1, Number(e.target.value) | 0))}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-gray-400">{t('shpEditor.spriteFrameWidth')}</span>
                      <input
                        type="number"
                        min={1}
                        max={4096}
                        value={sheetFrameW}
                        onChange={(e) => {
                          const v = Math.max(1, Number(e.target.value) | 0)
                          setSheetFrameW(v)
                          setCustomWidth(v)
                        }}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-400">{t('shpEditor.spriteFrameHeight')}</span>
                      <input
                        type="number"
                        min={1}
                        max={4096}
                        value={sheetFrameH}
                        onChange={(e) => {
                          const v = Math.max(1, Number(e.target.value) | 0)
                          setSheetFrameH(v)
                          setCustomHeight(v)
                        }}
                        className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-gray-400">{t('shpEditor.spriteMaxFrames')}</span>
                    <input
                      type="number"
                      min={0}
                      max={4096}
                      value={sheetMaxFrames}
                      onChange={(e) => setSheetMaxFrames(Math.max(0, Number(e.target.value) | 0))}
                      className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                    />
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      {t('shpEditor.spriteMaxFramesHint')}
                    </div>
                  </label>
                </>
              )}
            </fieldset>
          )}

          {/* 选图（已加载已有 SHP 时按钮文案改成"替换图片..."） */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handlePickImage}
              className="inline-flex items-center gap-2 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-gray-100 hover:bg-gray-700"
            >
              <UploadCloud size={14} />
              {existingShpSource
                ? t('cameo.editor.pickImageReplace')
                : t('cameo.editor.pickImage')}
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
            {imageError && <div className="text-[11px] text-red-300">{imageError}</div>}
          </div>

          {/* 调色板手动选择 */}
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

          {/* 缩放方式（cameo / loadscreen / custom 单帧时有效；sprite-sheet 用每帧自己的尺寸，无需 fit/stretch） */}
          {preset !== 'sprite-sheet' && (
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
          )}

          {/* cameo 装饰：仅 cameo preset 出现 */}
          {preset === 'cameo' && (
            <CameoOptionsFieldset
              textBar={textBar}
              setTextBar={setTextBar}
              buttonize={buttonize}
              setButtonize={setButtonize}
              veteran={veteran}
              setVeteran={setVeteran}
              transparentCorners={transparentCorners}
              setTransparentCorners={setTransparentCorners}
            />
          )}
        </div>

        {/* 右侧预览 */}
        <div className="flex-1 min-w-0 flex flex-col items-center gap-3 px-4 py-4 overflow-auto">
          <div className="text-xs text-gray-400">
            {t('cameo.editor.preview')}
            {lastResult && (
              <span className="ml-2 text-gray-500">
                {lastResult.width}×{lastResult.height} · {lastResult.numFrames}
                {' '}
                {t('shpEditor.framesUnit')}
              </span>
            )}
          </div>

          {!imageObj || !palette ? (
            <div
              className="flex items-center justify-center text-gray-500 text-xs"
              style={{
                width: 480,
                height: 384,
                backgroundImage:
                  'repeating-linear-gradient(45deg, #2d2d2d 0, #2d2d2d 12px, #343434 12px, #343434 24px)',
              }}
            >
              {!palette ? t('cameo.editor.previewWaitPalette') : t('cameo.editor.previewWaitImage')}
            </div>
          ) : preset === 'cameo' ? (
            <div className="flex items-start justify-center gap-6">
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[11px] text-gray-300">
                  {t('cameo.editor.preview1x')} ({outWidth} × {outHeight})
                </div>
                <div className="relative rounded border border-gray-700 p-1">
                  <canvas
                    ref={previewCanvas1xRef}
                    style={{
                      imageRendering: 'pixelated',
                      width: outWidth,
                      height: outHeight,
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

              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[11px] text-gray-300">
                  {t('cameo.editor.preview8x')} ({outWidth * 8} × {outHeight * 8})
                </div>
                <div className="relative rounded border border-gray-700 p-1">
                  <canvas
                    ref={previewCanvas8xRef}
                    style={{
                      imageRendering: 'pixelated',
                      width: outWidth * 8,
                      height: outHeight * 8,
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
          ) : (
            <div className="w-full">
              <div className="text-[11px] text-gray-400 mb-2">
                {t('shpEditor.gridPreviewHint')}
              </div>
              <div
                ref={gridContainerRef}
                className="flex flex-wrap gap-2 justify-start"
              />
              {(building || saving) && (
                <div className="mt-2 inline-flex items-center gap-1 text-blue-200 text-xs">
                  <Loader2 size={12} className="animate-spin" />
                  {saving ? t('cameo.editor.saving') : t('cameo.editor.building')}
                </div>
              )}
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

export default ShpEditor
