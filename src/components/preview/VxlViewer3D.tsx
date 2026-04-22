import React, { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { VxlFile } from '../../data/VxlFile'
import { HvaFile } from '../../data/HvaFile'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import SearchableSelect from '../common/SearchableSelect'
import { usePaletteHotkeys } from './usePaletteHotkeys'
import type { PaletteSelectionInfo, Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'
import VxlSceneRenderer from '../vxl/VxlSceneRenderer'
import type { Section } from '../../data/vxl/Section'
import type { HvaDraft } from '../../data/vxl/VxlDraft'

type MixFileData = { file: File; info: MixFileInfo }
type HvaSelectionInfo = {
  source: 'auto' | 'manual' | 'none'
  reason: string
  resolvedPath: string | null
}

const HVA_AUTO_VALUE = ''

function splitMixPath(fullPath: string): { mixName: string; innerPath: string } | null {
  const slash = fullPath.indexOf('/')
  if (slash <= 0) return null
  return {
    mixName: fullPath.substring(0, slash),
    innerPath: fullPath.substring(slash + 1),
  }
}

function replaceExtension(path: string, extensionWithoutDot: string): string {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  if (dot <= slash) return `${path}.${extensionWithoutDot}`
  return `${path.substring(0, dot)}.${extensionWithoutDot}`
}

function buildHvaOptionPaths(
  mixFiles: MixFileData[] | undefined,
  resourceContext: ResourceContext | null | undefined,
  autoHvaPath: string | null,
): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  const add = (path: string | null | undefined) => {
    if (!path) return
    const trimmed = path.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(trimmed)
  }

  add(autoHvaPath)

  for (const mix of mixFiles ?? []) {
    for (const entry of mix.info.files) {
      if ((entry.extension || '').toLowerCase() !== 'hva') continue
      add(`${mix.info.name}/${entry.filename}`)
    }
  }

  if (resourceContext) {
    for (const archive of resourceContext.archives) {
      for (const entry of archive.info.files) {
        if ((entry.extension || '').toLowerCase() !== 'hva') continue
        add(`${archive.info.name}/${entry.filename}`)
      }
    }
  }

  return result
}

async function loadHvaByPath(
  path: string,
  mixFiles: MixFileData[] | undefined,
  resourceContext: ResourceContext | null | undefined,
): Promise<HvaFile | null> {
  const resolved = splitMixPath(path)
  if (!resolved) return null
  const mix = (mixFiles ?? []).find((m) => m.info.name === resolved.mixName)
  let vf: VirtualFile | null = null
  if (mix) {
    vf = await MixParser.extractFile(mix.file, resolved.innerPath)
  }
  if (!vf && resourceContext) {
    const archive = resourceContext.archives.find((item) => item.info.name === resolved.mixName)
    if (archive) {
      vf = await MixParser.extractFile(archive.file, resolved.innerPath)
    }
  }
  if (!vf) return null
  try {
    vf.stream.seek(0)
  } catch {
    // Ignore stream seek failure and still try to parse.
  }
  const hva = new HvaFile(vf)
  if (hva.sections.length === 0) return null
  const frameCount = hva.sections.reduce((max, section) => Math.max(max, section.matrices.length), 0)
  if (frameCount <= 0) return null
  return hva
}

const VxlViewer3D: React.FC<{
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
  /** 进入 VXL 编辑器入口；仅项目模式 project-file 下传，不传则不渲染编辑按钮 */
  onEdit?: () => void
}> = ({
  selectedFile,
  mixFiles,
  target,
  resourceContext,
  onEdit,
}) => {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [palettePath, setPalettePath] = useState<string>('')
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [paletteInfo, setPaletteInfo] = useState<PaletteSelectionInfo>({
    source: 'fallback-grayscale',
    reason: '未加载',
    resolvedPath: null,
  })
  const [hvaPath, setHvaPath] = useState<string>(HVA_AUTO_VALUE)
  const [hvaOptions, setHvaOptions] = useState<string[]>([])
  const [hvaFrame, setHvaFrame] = useState<number>(0)
  const [hvaMaxFrame, setHvaMaxFrame] = useState<number>(0)
  const [hvaSourceInfo, setHvaSourceInfo] = useState<HvaSelectionInfo>({
    source: 'none',
    reason: '未加载',
    resolvedPath: null,
  })
  // 解析后传给 SceneRenderer 的数据
  const [sceneSections, setSceneSections] = useState<Section[]>([])
  const [scenePalette, setScenePalette] = useState<Rgb[]>(() => PaletteParser.buildGrayscalePalette())
  const [sceneHva, setSceneHva] = useState<HvaDraft | null>(null)
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })
  const assetPath = source.resolved?.displayPath ?? selectedFile ?? ''

  useEffect(() => {
    setHvaPath(HVA_AUTO_VALUE)
    setHvaFrame(0)
  }, [assetPath])

  // 数据加载：解析 vxl + 解析调色板 + 试解析 hva → 喂给 VxlSceneRenderer
  useEffect(() => {
    let disposed = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (!source.resolved) throw new Error('File not found')
        const bytes = await source.resolved.readBytes()
        const inner = source.resolved.name
        const vf = VirtualFile.fromBytes(bytes, inner)

        const vxl = new VxlFile(vf)
        if (vxl.sections.length === 0) throw new Error('Failed to parse VXL')
        const hasEmbeddedPalette = vxl.embeddedPalette.length >= 48
        const decision = PaletteResolver.resolve({
          assetPath,
          assetKind: 'vxl',
          mixFiles: mixFiles ?? [],
          resourceContext,
          manualPalettePath: palettePath || null,
          hasEmbeddedPalette,
        })
        if (disposed) return
        setPaletteList(decision.availablePalettePaths)

        let selectedInfo: PaletteSelectionInfo = decision.selection
        let finalPalette: Rgb[] | null = null
        if (decision.resolvedPalettePath) {
          const loaded = await loadPaletteByPath(decision.resolvedPalettePath, resourceContext ?? mixFiles ?? [])
          if (loaded) {
            finalPalette = loaded
          } else {
            selectedInfo = {
              source: 'fallback-grayscale',
              reason: t('viewer.paletteLoadFailed', { path: decision.resolvedPalettePath }),
              resolvedPath: decision.resolvedPalettePath,
            }
          }
        } else if (hasEmbeddedPalette) {
          const embedded = PaletteParser.fromBytes(vxl.embeddedPalette)
          if (embedded) {
            finalPalette = embedded.colors
          } else {
            selectedInfo = {
              source: 'fallback-grayscale',
              reason: t('viewer.embeddedPaletteInvalid'),
              resolvedPath: null,
            }
          }
        }
        if (!finalPalette) finalPalette = PaletteParser.buildGrayscalePalette()
        if (disposed) return
        setPaletteInfo(selectedInfo)

        const autoHvaPath = replaceExtension(assetPath, 'hva')
        const hvaCandidatePaths = buildHvaOptionPaths(mixFiles, resourceContext, autoHvaPath)
        if (!disposed) setHvaOptions(hvaCandidatePaths)
        const targetHvaPath = hvaPath || autoHvaPath
        let loadedHva: HvaFile | null = null
        let loadedHvaFrameCount = 0
        let nextHvaInfo: HvaSelectionInfo = {
          source: 'none',
          reason: t('viewer.noHvaUseDefault'),
          resolvedPath: targetHvaPath || null,
        }
        if (targetHvaPath) {
          loadedHva = await loadHvaByPath(targetHvaPath, mixFiles, resourceContext)
          if (loadedHva) {
            loadedHvaFrameCount = loadedHva.sections.reduce(
              (max, section) => Math.max(max, section.matrices.length),
              0,
            )
            if (loadedHvaFrameCount > 0) {
              nextHvaInfo = {
                source: hvaPath ? 'manual' : 'auto',
                reason: hvaPath ? t('viewer.manualHvaLoaded') : t('viewer.sameNameHvaMatched'),
                resolvedPath: targetHvaPath,
              }
            } else {
              loadedHva = null
              nextHvaInfo = {
                source: 'none',
                reason: t('viewer.hvaNoValidFrames'),
                resolvedPath: targetHvaPath,
              }
            }
          } else {
            nextHvaInfo = {
              source: 'none',
              reason: hvaPath
                ? t('viewer.manualHvaLoadFailed', { path: targetHvaPath })
                : t('viewer.noSameNameHva'),
              resolvedPath: targetHvaPath,
            }
          }
        }
        if (!disposed) {
          const nextMaxFrame = Math.max(0, loadedHvaFrameCount - 1)
          setHvaSourceInfo(nextHvaInfo)
          setHvaMaxFrame(nextMaxFrame)
          setHvaFrame((prev) => Math.max(0, Math.min(prev, nextMaxFrame)))
          setSceneSections(vxl.sections)
          setScenePalette(finalPalette)
          setSceneHva(loadedHva ? { sections: loadedHva.sections } : null)
        }
      } catch (e: any) {
        if (!disposed) setError(e?.message || source.error || 'Failed to render VXL 3D')
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    load()
    return () => {
      disposed = true
    }
  }, [assetPath, mixFiles, palettePath, resourceContext, source.error, source.resolved, hvaPath, t])

  const paletteOptions = useMemo(
    () => [{ value: '', label: t('viewer.paletteAutoEmbedded') }, ...paletteList.map((p) => ({ value: p, label: p.split('/').pop() || p }))],
    [paletteList, t],
  )
  const hvaSelectOptions = useMemo(
    () => [
      { value: HVA_AUTO_VALUE, label: t('viewer.hvaAutoSameName'), searchText: 'auto hva' },
      ...hvaOptions.map((path) => ({
        value: path,
        label: path.split('/').pop() || path,
        searchText: path,
      })),
    ],
    [hvaOptions, t],
  )
  const hvaSourceLabel = useMemo(() => {
    if (hvaSourceInfo.source === 'auto') return t('viewer.hvaAuto')
    if (hvaSourceInfo.source === 'manual') return t('viewer.hvaManual')
    return t('viewer.hvaNone')
  }, [hvaSourceInfo.source, t])
  const hvaFrameEnabled = hvaSourceInfo.source !== 'none'

  usePaletteHotkeys(paletteOptions, palettePath, setPalettePath, true)

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-2 flex-wrap">
        <span>{t('viewer.vxlPreview3d')}</span>
        <label className="flex items-center gap-1">
          <span>{t('viewer.palette')}</span>
          <SearchableSelect
            value={palettePath}
            options={paletteOptions}
            onChange={(next) => setPalettePath(next || '')}
            closeOnSelect={false}
            pinnedValues={['']}
            searchPlaceholder={t('viewer.searchPalette')}
            noResultsText={t('viewer.noMatchPalette')}
            triggerClassName="min-w-[160px] max-w-[240px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-left flex items-center gap-2"
            menuClassName="z-50 w-[260px] max-w-[70vw] rounded border border-gray-700 bg-gray-800 shadow-xl"
          />
        </label>
        <span className="text-gray-500 truncate max-w-[320px]">{paletteInfo.source} - {paletteInfo.reason === 'Embedded palette' ? t('viewer.embeddedPalette') : paletteInfo.reason === 'Manually specified' ? t('viewer.manuallySpecified') : paletteInfo.reason}</span>
        <label className="flex items-center gap-1">
          <span>HVA</span>
          <SearchableSelect
            value={hvaPath}
            options={hvaSelectOptions}
            onChange={(next) => {
              setHvaPath(next || HVA_AUTO_VALUE)
              setHvaFrame(0)
            }}
            closeOnSelect={false}
            pinnedValues={[HVA_AUTO_VALUE]}
            searchPlaceholder={t('viewer.searchHva')}
            noResultsText={t('viewer.noMatchHva')}
            triggerClassName="min-w-[180px] max-w-[280px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-left flex items-center gap-2"
            menuClassName="z-50 w-[280px] max-w-[70vw] rounded border border-gray-700 bg-gray-800 shadow-xl"
          />
        </label>
        <label className="flex items-center gap-1">
          <span>{t('viewer.frame')}</span>
          <input
            type="number"
            className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 disabled:opacity-40"
            min={0}
            max={hvaMaxFrame}
            disabled={!hvaFrameEnabled}
            value={hvaFrame}
            onChange={(e) => {
              const next = parseInt(e.target.value || '0', 10) | 0
              setHvaFrame(Math.max(0, Math.min(hvaMaxFrame, next)))
            }}
          />
          <span>/ {hvaMaxFrame}</span>
        </label>
        <input
          type="range"
          min={0}
          max={Math.max(0, hvaMaxFrame)}
          disabled={!hvaFrameEnabled}
          className="w-28 disabled:opacity-40"
          value={Math.max(0, Math.min(hvaMaxFrame, hvaFrame))}
          onChange={(e) => {
            const next = parseInt(e.target.value || '0', 10) | 0
            setHvaFrame(Math.max(0, Math.min(hvaMaxFrame, next)))
          }}
        />
        <span className="text-gray-500 truncate max-w-[360px]">
          HVA({hvaSourceLabel}) - {hvaSourceInfo.reason}
        </span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto inline-flex items-center gap-1 rounded bg-blue-700 px-2 py-1 text-[11px] text-white hover:bg-blue-600"
            title={t('vxl.editor.editButton')}
          >
            <Pencil size={12} />
            {t('vxl.editor.editButton')}
          </button>
        )}
      </div>
      <div className="flex-1 relative">
        <VxlSceneRenderer
          sections={sceneSections}
          palette={scenePalette}
          hva={sceneHva}
          hvaFrame={hvaFrame}
        />
      </div>
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">{t('bik.loading')}</div>}
      {error && !loading && <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>}
    </div>
  )
}

export default VxlViewer3D
