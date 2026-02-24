import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { HvaFile } from '../../data/HvaFile'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'

type MixFileData = { file: File; info: MixFileInfo }

const HvaViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }> = ({ selectedFile, mixFiles }) => {
  const { t } = useLocale()
  const mountRef = useRef<HTMLDivElement>(null)
  const applyFrameRef = useRef<(frame: number) => void>(() => {})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frame, setFrame] = useState(0)
  const [maxFrame, setMaxFrame] = useState(0)

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let controls: OrbitControls | null = null
    let animationId = 0
    let groups: THREE.Object3D[] = []
    let onResize: (() => void) | null = null

    applyFrameRef.current = () => {}

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')

        const hva = new HvaFile(vf)
        if (!hva.sections.length) throw new Error('No sections in HVA')
        const frames = hva.sections[0].matrices.length
        setMaxFrame(Math.max(0, frames - 1))
        // 重置帧为0，确保切换文件时帧归零
        setFrame(0)

        // Init three
        const mount = mountRef.current
        if (!mount) throw new Error('Mount not ready')
        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        renderer.setPixelRatio(devicePixelRatio)
        mount.innerHTML = ''
        mount.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        scene.background = new THREE.Color(0x2e2e2e)
        camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 2000)
        camera.position.set(60, 60, 60)
        camera.lookAt(0, 0, 0)

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        const dir = new THREE.DirectionalLight(0xffffff, 0.6)
        dir.position.set(1, 2, 1)
        scene.add(dir)

        // Helpers
        scene.add(new THREE.GridHelper(100, 20, 0x444444, 0x333333))
        const worldAxes = new THREE.AxesHelper(10)
        scene.add(worldAxes)

        // Create a node per section (axes helper inside)
        const root = new THREE.Group()
        for (const _sec of hva.sections) {
          const g = new THREE.Group()
          const axes = new THREE.AxesHelper(5)
          g.add(axes)
          root.add(g)
          groups.push(g)
        }
        scene.add(root)

        // Apply initial frame transforms
        const applyFrame = (fi: number) => {
          for (let i = 0; i < groups.length; i++) {
            const m = hva.sections[i]?.getMatrix(fi)
            if (m) groups[i].matrix.copy(m)
            groups[i].matrixAutoUpdate = false
          }
          // Center root by its bounding box
          const box = new THREE.Box3().setFromObject(root)
          const center = new THREE.Vector3()
          box.getCenter(center)
          root.position.sub(center)
        }
        applyFrame(Math.min(frame, frames - 1))

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

        applyFrameRef.current = (fi: number) => applyFrame(fi)
      } catch (e: any) {
        setError(e?.message || 'Failed to render HVA')
      } finally {
        setLoading(false)
      }
    }
    load()

    return () => {
      cancelAnimationFrame(animationId)
      if (onResize) {
        window.removeEventListener('resize', onResize)
      }
      controls?.dispose()
      renderer?.dispose()
      if (renderer?.domElement?.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement)
      scene = null
      camera = null
      renderer = null
      controls = null
      groups = []
      applyFrameRef.current = () => {}
    }
  }, [selectedFile, mixFiles, applyFrameRef])

  useEffect(() => {
    applyFrameRef.current(Math.min(frame, maxFrame))
  }, [frame, maxFrame, applyFrameRef])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-3">
        <span>{t('viewer.hvaPreview')}</span>
        <div className="flex items-center gap-2">
          <span>{t('viewer.frame')}</span>
          <input
            type="number"
            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-0.5"
            min={0}
            max={maxFrame}
            value={frame}
            onChange={e => setFrame(Math.max(0, Math.min(maxFrame, parseInt(e.target.value || '0', 10) | 0)))}
          />
          <span>/ {maxFrame}</span>
        </div>
      </div>
      <div ref={mountRef} className="flex-1" />
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">{t('bik.loading')}</div>}
      {error && !loading && <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>}
    </div>
  )
}

export default HvaViewer

