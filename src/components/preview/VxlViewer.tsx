import React, { useEffect, useMemo, useRef, useState } from 'react'
// 2D frame sampling view (no WebGL)
import { MixFileInfo } from '../../services/MixParser'
import { VxlFile } from '../../data/VxlFile'
import type { Section } from '../../data/vxl/Section'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import SearchableSelect from '../common/SearchableSelect'
import { usePaletteHotkeys } from './usePaletteHotkeys'
import type { PaletteSelectionInfo, Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type MixFileData = { file: File; info: MixFileInfo }

function toBytePalette(palette: Rgb[]): Uint8Array {
  return PaletteParser.toBytePalette(PaletteParser.ensurePalette256(palette))
}

function colorFromPalette(palette: Uint8Array, index: number): [number, number, number] {
  const i = Math.max(0, Math.min(255, index | 0)) * 3
  return [palette[i], palette[i + 1], palette[i + 2]]
}

type SectionRenderMode = 'per-section' | 'merged'

type Vec3 = { x: number; y: number; z: number }
type IndexedFrame = {
  width: number
  height: number
  colorIndices: Uint8Array
  filledMask: Uint8Array
}

const XCC_GRID_SIZE = 8
const XCC_FRAME_COUNT = XCC_GRID_SIZE * XCC_GRID_SIZE

function normalizeFrameIndex(frameIdx: number, frameCount: number): number {
  if (frameCount <= 0) return 0
  const idx = frameIdx % frameCount
  return idx < 0 ? idx + frameCount : idx
}

function frameToXccAngles(frameIdx: number): { xr: number; yr: number } {
  const normalized = normalizeFrameIndex(frameIdx, XCC_FRAME_COUNT)
  return {
    xr: normalized % XCC_GRID_SIZE,
    yr: Math.floor(normalized / XCC_GRID_SIZE),
  }
}

function rotateXLikeXcc(v: Vec3, angle: number): Vec3 {
  const l = Math.sqrt(v.y * v.y + v.z * v.z)
  const dA = Math.atan2(v.y, v.z) + angle
  return {
    x: v.x,
    y: l * Math.sin(dA),
    z: l * Math.cos(dA),
  }
}

function rotateYLikeXcc(v: Vec3, angle: number): Vec3 {
  const l = Math.sqrt(v.x * v.x + v.z * v.z)
  const dA = Math.atan2(v.x, v.z) + angle
  return {
    x: l * Math.sin(dA),
    y: v.y,
    z: l * Math.cos(dA),
  }
}

function resolveSectionDimensions(section: Section): { cx: number; cy: number; cz: number } {
  let cx = section.sizeX | 0
  let cy = section.sizeY | 0
  let cz = section.sizeZ | 0
  if (cx > 0 && cy > 0 && cz > 0) return { cx, cy, cz }

  let maxX = -1
  let maxY = -1
  let maxZ = -1
  for (const span of section.spans) {
    if (span.x > maxX) maxX = span.x
    if (span.y > maxY) maxY = span.y
    for (const voxel of span.voxels) {
      if (voxel.z > maxZ) maxZ = voxel.z
    }
  }
  cx = Math.max(cx, maxX + 1, 1)
  cy = Math.max(cy, maxY + 1, 1)
  cz = Math.max(cz, maxZ + 1, 1)
  return { cx, cy, cz }
}

function sampleSectionXcc(section: Section, xr: number, yr: number): IndexedFrame {
  const { cx, cy, cz } = resolveSectionDimensions(section)
  const l = Math.max(1, Math.ceil(Math.sqrt((cx * cx + cy * cy + cz * cz) / 4)))
  const cl = Math.max(1, l * 2)
  const centerX = cx / 2
  const centerY = cy / 2
  const centerZ = cz / 2
  const pixels = cl * cl
  const colorIndices = new Uint8Array(pixels)
  const filledMask = new Uint8Array(pixels)
  const imageZ = new Int8Array(pixels)
  imageZ.fill(-128)

  const angleX = xr * Math.PI / 4
  const angleY = yr * Math.PI / 4

  for (const span of section.spans) {
    const sx = span.x - centerX
    const sy = span.y - centerY
    for (const voxel of span.voxels) {
      const sPixel: Vec3 = {
        x: sx,
        y: sy,
        z: voxel.z - centerZ,
      }
      const dPixel = rotateYLikeXcc(rotateXLikeXcc(sPixel, angleX), angleY)
      const dx = dPixel.x + l
      const dy = dPixel.y + l
      const dz = dPixel.z + centerZ
      const px = Math.trunc(dx)
      const py = Math.trunc(dy)
      if (px < 0 || py < 0 || px >= cl || py >= cl) continue
      const idx = px + cl * py
      if (dz > imageZ[idx]) {
        imageZ[idx] = Math.trunc(dz)
        colorIndices[idx] = voxel.colorIndex & 0xff
        filledMask[idx] = 1
      }
    }
  }

  return {
    width: cl,
    height: cl,
    colorIndices,
    filledMask,
  }
}

type RawVoxelSample = {
  sx: number
  sy: number
  depth: number
  colorIndex: number
}

function sampleMergedXcc(sections: Section[], xr: number, yr: number): IndexedFrame | null {
  const samples: RawVoxelSample[] = []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const angleX = xr * Math.PI / 4
  const angleY = yr * Math.PI / 4

  for (const section of sections) {
    const { cx, cy, cz } = resolveSectionDimensions(section)
    const centerX = cx / 2
    const centerY = cy / 2
    const centerZ = cz / 2
    for (const span of section.spans) {
      const sx = span.x - centerX
      const sy = span.y - centerY
      for (const voxel of span.voxels) {
        const sPixel: Vec3 = {
          x: sx,
          y: sy,
          z: voxel.z - centerZ,
        }
        const dPixel = rotateYLikeXcc(rotateXLikeXcc(sPixel, angleX), angleY)
        const px = Math.trunc(dPixel.x)
        const py = Math.trunc(dPixel.y)
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        samples.push({
          sx: dPixel.x,
          sy: dPixel.y,
          depth: dPixel.z + centerZ,
          colorIndex: voxel.colorIndex & 0xff,
        })
      }
    }
  }

  if (!samples.length || !isFinite(minX) || !isFinite(minY)) return null

  const width = Math.max(1, maxX - minX + 1)
  const height = Math.max(1, maxY - minY + 1)
  const pixels = width * height
  const colorIndices = new Uint8Array(pixels)
  const filledMask = new Uint8Array(pixels)
  const depthBuf = new Float32Array(pixels)
  depthBuf.fill(-Infinity)

  for (const sample of samples) {
    const px = Math.trunc(sample.sx) - minX
    const py = Math.trunc(sample.sy) - minY
    if (px < 0 || py < 0 || px >= width || py >= height) continue
    const idx = px + width * py
    if (sample.depth > depthBuf[idx]) {
      depthBuf[idx] = sample.depth
      colorIndices[idx] = sample.colorIndex
      filledMask[idx] = 1
    }
  }

  return {
    width,
    height,
    colorIndices,
    filledMask,
  }
}

function indexedFrameToCanvas(frame: IndexedFrame, palette: Uint8Array, opaqueBackground: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = false
  const image = ctx.createImageData(frame.width, frame.height)
  const data = image.data
  const total = frame.width * frame.height

  for (let i = 0; i < total; i++) {
    if (!opaqueBackground && frame.filledMask[i] === 0) continue
    const colorIndex = frame.colorIndices[i]
    const [r, g, b] = colorFromPalette(palette, colorIndex)
    const o = i * 4
    data[o] = r
    data[o + 1] = g
    data[o + 2] = b
    data[o + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

function applyDisplayScale(canvas: HTMLCanvasElement, targetWidth: number, targetHeight: number, maxScale = 8): void {
  const scale = Math.max(
    1,
    Math.min(
      maxScale,
      Math.floor(Math.min(targetWidth / Math.max(1, canvas.width), targetHeight / Math.max(1, canvas.height))),
    ),
  )
  canvas.style.width = `${canvas.width * scale}px`
  canvas.style.height = `${canvas.height * scale}px`
  canvas.style.imageRendering = 'pixelated'
}

const VxlViewer: React.FC<{
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
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [frameIndex, setFrameIndex] = useState<number>(0)
  const [sectionRenderMode, setSectionRenderMode] = useState<SectionRenderMode>('per-section')
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

  function render2DFrame(
    mount: HTMLDivElement,
    vxl: VxlFile,
    palette: Uint8Array,
    frameIdx: number,
    renderMode: SectionRenderMode,
  ): void {
    mount.innerHTML = ''
    const pad = 8
    const targetW = Math.max(64, mount.clientWidth - pad * 2)
    const targetH = Math.max(64, mount.clientHeight - pad * 2)
    const { xr, yr } = frameToXccAngles(frameIdx)

    if (renderMode === 'merged') {
      const frame = sampleMergedXcc(vxl.sections, xr, yr)
      if (!frame) {
        mount.innerHTML = '<div class="p-2 text-xs text-gray-400">空 VXL</div>'
        return
      }
      const canvas = indexedFrameToCanvas(frame, palette, false)
      applyDisplayScale(canvas, targetW, targetH)
      mount.appendChild(canvas)
      return
    }

    if (!vxl.sections.length) {
      mount.innerHTML = '<div class="p-2 text-xs text-gray-400">空 VXL</div>'
      return
    }

    const wrapper = document.createElement('div')
    wrapper.style.width = '100%'
    wrapper.style.height = '100%'
    wrapper.style.overflow = 'auto'
    wrapper.style.display = 'flex'
    wrapper.style.alignItems = 'flex-start'
    wrapper.style.justifyContent = 'center'

    const grid = document.createElement('div')
    grid.style.display = 'flex'
    grid.style.flexWrap = 'wrap'
    grid.style.alignItems = 'flex-start'
    grid.style.justifyContent = 'center'
    grid.style.gap = '10px'
    grid.style.padding = '8px'

    const columns = Math.max(1, Math.ceil(Math.sqrt(vxl.sections.length)))
    const rows = Math.max(1, Math.ceil(vxl.sections.length / columns))
    const cellW = Math.max(72, Math.floor((targetW - Math.max(0, columns - 1) * 10) / columns))
    const cellH = Math.max(72, Math.floor((targetH - Math.max(0, rows - 1) * 10) / rows))

    for (const section of vxl.sections) {
      const frame = sampleSectionXcc(section, xr, yr)
      const card = document.createElement('div')
      card.style.width = `${cellW}px`
      card.style.display = 'flex'
      card.style.flexDirection = 'column'
      card.style.alignItems = 'center'
      card.style.gap = '4px'

      const label = document.createElement('div')
      const sectionName = section.name?.trim() || '(unnamed)'
      label.textContent = sectionName
      label.title = sectionName
      label.style.maxWidth = '100%'
      label.style.fontSize = '10px'
      label.style.lineHeight = '12px'
      label.style.color = '#9ca3af'
      label.style.whiteSpace = 'nowrap'
      label.style.overflow = 'hidden'
      label.style.textOverflow = 'ellipsis'

      const canvas = indexedFrameToCanvas(frame, palette, false)
      applyDisplayScale(canvas, cellW, Math.max(48, cellH - 16))

      card.appendChild(label)
      card.appendChild(canvas)
      grid.appendChild(card)
    }

    wrapper.appendChild(grid)
    mount.appendChild(wrapper)
  }

  // 重置帧索引为0，当切换文件时
  useEffect(() => {
    if (assetPath) {
      console.log('[VxlViewer] selected file changed to:', assetPath, 'frameIndex will be reset to 0')
      setFrameIndex(0)
    }
  }, [assetPath])

  useEffect(() => {
    setFrameIndex(prev => normalizeFrameIndex(prev, XCC_FRAME_COUNT))
  }, [])

  // 存储VXL和调色板数据，用于帧变化时重新渲染
  const [vxlData, setVxlData] = useState<{ vxl: VxlFile, palette: Uint8Array } | null>(null)

  useEffect(() => {
    let disposed = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (!source.resolved) throw new Error('File not found')
        const bytes = await source.resolved.readBytes()
        const vf = VirtualFile.fromBytes(bytes, source.resolved.name)
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

        if (!finalPalette) {
          finalPalette = PaletteParser.buildGrayscalePalette()
        }
        setPaletteInfo(selectedInfo)
        const pal = toBytePalette(finalPalette)

        if (disposed) return

        // 存储VXL和调色板数据，用于后续帧变化时使用
        setVxlData({ vxl, palette: pal })
      } catch (e: any) {
        if (!disposed) setError(e?.message || 'Failed to render VXL')
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    load()
    return () => { disposed = true }
  }, [assetPath, mixFiles, palettePath, resourceContext, source.resolved, t])

  // 当帧或VXL数据改变时重新渲染
  useEffect(() => {
    if (!vxlData) return

    const mount = mountRef.current
    if (!mount) return

    const { vxl, palette } = vxlData
    const normalized = normalizeFrameIndex(frameIndex, XCC_FRAME_COUNT)
    console.log(`[VxlViewer] Rendering frame ${normalized}/${XCC_FRAME_COUNT - 1}`)
    render2DFrame(mount, vxl, palette, normalized, sectionRenderMode)
  }, [frameIndex, vxlData, sectionRenderMode])

  const paletteOptions = useMemo(
    () => [{ value: '', label: t('viewer.paletteAutoEmbedded') }, ...paletteList.map((p) => ({ value: p, label: p.split('/').pop() || p }))],
    [paletteList, t],
  )
  const normalizedFrame = normalizeFrameIndex(frameIndex, XCC_FRAME_COUNT)
  const xccAngles = frameToXccAngles(normalizedFrame)
  usePaletteHotkeys(paletteOptions, palettePath, setPalettePath, true)

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-3 flex-wrap">
        <span>{t('viewer.vxlPreview2d')}</span>
        <label className="flex items-center gap-1">
          <span>Section</span>
          <select
            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs"
            value={sectionRenderMode}
            onChange={e => setSectionRenderMode((e.target.value as SectionRenderMode) || 'per-section')}
          >
            <option value="per-section">{t('viewer.perSection')}</option>
            <option value="merged">{t('viewer.merged')}</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span>{t('viewer.viewIndex')}</span>
          <input className="w-40" type="range" min={0} max={XCC_FRAME_COUNT - 1} value={normalizedFrame} onChange={e => setFrameIndex(parseInt(e.target.value || '0', 10) || 0)} />
          <span className="w-14 text-right">{normalizedFrame}</span>
        </label>
        <span className="text-gray-500">xr={xccAngles.xr}, yr={xccAngles.yr}</span>
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
        <span className="text-gray-500 truncate max-w-[300px]">
          {paletteInfo.source} - {paletteInfo.reason === 'Embedded palette' ? t('viewer.embeddedPalette') : paletteInfo.reason === 'Manually specified' ? t('viewer.manuallySpecified') : paletteInfo.reason}
        </span>
      </div>
      <div ref={mountRef} className="flex-1 flex items-center justify-center bg-gray-900" />
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">{t('bik.loading')}</div>}
      {error && !loading && <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>}
    </div>
  )
}

export default VxlViewer
