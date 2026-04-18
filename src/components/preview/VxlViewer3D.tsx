import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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

type MixFileData = { file: File; info: MixFileInfo }
type HvaSelectionInfo = {
  source: 'auto' | 'manual' | 'none'
  reason: string
  resolvedPath: string | null
}

const HVA_AUTO_VALUE = ''

function toBytePalette(palette: Rgb[]): Uint8Array {
  return PaletteParser.toBytePalette(PaletteParser.ensurePalette256(palette))
}

function colorFromPalette(palette: Uint8Array, index: number): THREE.Color {
  const i = Math.max(0, Math.min(255, index | 0)) * 3
  const r = palette[i] / 255
  const g = palette[i + 1] / 255
  const b = palette[i + 2] / 255
  return new THREE.Color(r, g, b)
}

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

function normalizeSectionKey(name: string): string {
  return name.trim().toLowerCase()
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
}> = ({
  selectedFile,
  mixFiles,
  target,
  resourceContext,
}) => {
  const { t } = useLocale()
  const mountRef = useRef<HTMLDivElement>(null)
  const applyHvaFrameRef = useRef<(frame: number) => void>(() => {})
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

  useEffect(() => {
    const clamped = Math.max(0, Math.min(hvaMaxFrame, hvaFrame | 0))
    if (clamped !== hvaFrame) {
      setHvaFrame(clamped)
      return
    }
    applyHvaFrameRef.current(clamped)
  }, [hvaFrame, hvaMaxFrame])

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let controls: OrbitControls | null = null
    let animationId = 0
    let onResize: (() => void) | null = null
    let disposed = false

    applyHvaFrameRef.current = () => {}

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
        setPaletteInfo(selectedInfo)
        const pal = toBytePalette(finalPalette)

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
        }

        // 构建体素网格（低开销：实例化网格）
        const mount = mountRef.current
        if (!mount) throw new Error('Mount not ready')
        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        renderer.setPixelRatio(devicePixelRatio)
        // 使用 sRGB 输出，避免整体过暗；保持无色调映射
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.NoToneMapping
        mount.innerHTML = ''
        mount.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        scene.background = new THREE.Color(0x2e2e2e)
        camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 5000)
        camera.position.set(80, 80, 80)
        camera.lookAt(0, 0, 0)

        const light = new THREE.DirectionalLight(0xffffff, 1.2)
        light.position.set(2, 3, 4)
        scene.add(light)
        scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        // 额外补光，避免材料受光不均导致发黑
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5))

        // 使用 InstancedMesh 渲染体素小立方体
        const boxGeo = new THREE.BoxGeometry(1, 1, 1)
        // 为顶点写入全白颜色，确保 vertexColors 有有效输入（避免被当作全黑）
        const vertCount = (boxGeo.attributes.position?.count || 0)
        if (vertCount > 0) {
          const white = new Float32Array(vertCount * 3)
          for (let i = 0; i < white.length; i++) white[i] = 1
          boxGeo.setAttribute('color', new THREE.BufferAttribute(white, 3))
        }
        // 材质：支持 instanceColor。若依然发黑，可通过 URL 加上 ?material=basic 切换无光照材质
        const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : undefined
        const materialType = (search?.get('material') || '').toLowerCase()
        const useBasic = materialType === 'basic'
        const mat = useBasic
          ? new THREE.MeshBasicMaterial({ vertexColors: true })
          : new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0x222222) })
        mat.side = THREE.DoubleSide

        // 构建单个彩色立方体的几何（用 per-instance color 需要扩展，这里简单复制不同色）
        // 为了性能，这里按 section 分批构建合并网格
        // 将几何加入独立分组，便于计算包围盒与相机对齐
        const centerRoot = new THREE.Group()
        const root = new THREE.Group()
        centerRoot.add(root)
        scene.add(centerRoot)
        const sectionGroupMap = new Map<string, THREE.Group>()

        for (const section of vxl.sections) {
          const sectionGroup = new THREE.Group()
          sectionGroup.name = section.name
          sectionGroup.matrixAutoUpdate = false
          sectionGroup.matrix.identity()
          root.add(sectionGroup)
          sectionGroupMap.set(normalizeSectionKey(section.name), sectionGroup)

          const { voxels } = section.getAllVoxels()
          if (voxels.length === 0) continue
          const inst = new THREE.InstancedMesh(boxGeo, mat, voxels.length)
          const color = new THREE.Color()
          const dummy = new THREE.Object3D()
          let idx = 0
          for (const v of voxels) {
            dummy.position.set(v.x, v.z, v.y)
            dummy.updateMatrix()
            inst.setMatrixAt(idx, dummy.matrix)
            color.copy(colorFromPalette(pal, v.colorIndex))
            inst.setColorAt(idx, color)
            idx++
          }
          inst.instanceMatrix.needsUpdate = true
          // @ts-ignore THREE r150+
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true
          sectionGroup.add(inst)
        }

        const recenterRoot = () => {
          centerRoot.position.set(0, 0, 0)
          centerRoot.updateMatrixWorld(true)
          const box = new THREE.Box3().setFromObject(root)
          if (box.isEmpty()) return
          const center = new THREE.Vector3()
          box.getCenter(center)
          centerRoot.position.copy(center).multiplyScalar(-1)
          centerRoot.updateMatrixWorld(true)
        }

        const applyHvaFrame = (rawFrame: number) => {
          for (const group of sectionGroupMap.values()) {
            group.matrix.identity()
            group.matrixAutoUpdate = false
            group.matrixWorldNeedsUpdate = true
          }
          if (loadedHva && loadedHvaFrameCount > 0) {
            const frame = Math.max(0, Math.min(rawFrame, loadedHvaFrameCount - 1))
            for (const hvaSection of loadedHva.sections) {
              const matrix = hvaSection.getMatrix(frame)
              if (!matrix) continue
              const targetGroup = sectionGroupMap.get(normalizeSectionKey(hvaSection.name))
              if (!targetGroup) continue
              targetGroup.matrix.copy(matrix)
              targetGroup.matrixAutoUpdate = false
              targetGroup.matrixWorldNeedsUpdate = true
            }
          }
          recenterRoot()
        }
        applyHvaFrameRef.current = applyHvaFrame
        applyHvaFrame(hvaFrame)

        // 自动适配相机距离
        const box3 = new THREE.Box3().setFromObject(root)
        const size = new THREE.Vector3()
        if (!box3.isEmpty()) box3.getSize(size)
        const radius = Math.max(10, size.length() * 0.6)
        const dir = new THREE.Vector3(1, 1, 1).normalize()
        camera.position.copy(dir.multiplyScalar(radius * 1.6))
        camera.lookAt(0, 0, 0)

        // Debug: 辅助观察包围盒
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') {
          const helper = new THREE.Box3Helper(new THREE.Box3().setFromObject(root), 0x00ff00)
          scene.add(helper)
        }

        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true

        onResize = () => {
          if (!renderer || !camera || !mount) return
          const w = mount.clientWidth, h = mount.clientHeight
          renderer.setSize(w, h)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', onResize)

        const loop = () => {
          controls?.update()
          renderer?.render(scene!, camera!)
          animationId = requestAnimationFrame(loop)
        }
        loop()
      } catch (e: any) {
        if (!disposed) setError(e?.message || source.error || 'Failed to render VXL 3D')
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    load()

    return () => {
      disposed = true
      cancelAnimationFrame(animationId)
      if (onResize) window.removeEventListener('resize', onResize)
      controls?.dispose()
      renderer?.dispose()
      if (renderer?.domElement?.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement)
      applyHvaFrameRef.current = () => {}
      scene = null
      camera = null
      renderer = null
      controls = null
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
      </div>
      <div ref={mountRef} className="flex-1" />
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">{t('bik.loading')}</div>}
      {error && !loading && <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>}
    </div>
  )
}

export default VxlViewer3D
