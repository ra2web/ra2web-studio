import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Section } from '../../data/vxl/Section'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { Rgb } from '../../services/palette/PaletteTypes'
import type { HvaDraft } from '../../data/vxl/VxlDraft'
import type { ShapeKind } from '../../services/vxl/VxlShapeBuilder'
import type { SplitPlane } from '../../services/vxl/VxlSplit'
import type { RotorConfig } from '../../data/vxl/AnimMetadata'

/**
 * 纯 three.js 渲染组件。父组件负责把 sections + palette（+ 可选 hva）准备好之后丢进来；
 * 本组件只负责挂载 WebGL canvas、构建场景、动画循环、相机控制。
 *
 * 既被只读 [src/components/preview/VxlViewer3D.tsx](src/components/preview/VxlViewer3D.tsx) 复用，
 * 也被全屏 [src/components/vxl/VxlEditor.tsx](src/components/vxl/VxlEditor.tsx) 复用。
 *
 * P3 增强：renderMode（color/normals/wireframe）+ onVoxelPick（点击 → (sectionIndex,x,y,z)）。
 */

export type VxlRenderMode = 'color' | 'normals' | 'wireframe'
/**
 * 交互模式：
 * - 'orbit'  → 启用 OrbitControls（鼠标旋转 / 缩放 / 平移），不响应体素点击 pick
 * - 'paint'  → 禁用 OrbitControls（相机锁死），鼠标 click 触发 raycaster pick → onVoxelPick
 */
export type VxlInteractionMode = 'orbit' | 'paint'

export interface VxlPickPayload {
  sectionIndex: number
  x: number
  y: number
  z: number
  colorIndex: number
  normalIndex: number
}

/**
 * 形状 ghost 预览：渲染半透明 wireframe + 6 个面 handle。
 * sectionIndex 决定 ghost 跟随哪一个 section group 的矩阵（与该 section 的体素同坐标空间）。
 */
export interface ShapeGhost {
  kind: ShapeKind
  sectionIndex: number
  bounds: { x0: number; y0: number; z0: number; sx: number; sy: number; sz: number }
  cylinderAxis: 'x' | 'y' | 'z'
  /** ghost 颜色 = 当前画笔色（仅用于视觉提示） */
  colorCss?: string
}

/**
 * 切面 ghost 预览：在指定 section 的局部坐标系中渲染一个半透明矩形片，
 * 矩形面位置 = (axis, k)，矩形大小 = (rangeAMin..rangeAMax, rangeBMin..rangeBMax)。
 * highlightSide 决定哪一侧的 voxels 用高亮色辅助显示（暂不实际着色，只作为信息）。
 */
export interface SplitPlaneGhost {
  sectionIndex: number
  plane: SplitPlane
  highlightSide: 'A' | 'B'
}

export interface VxlSceneProps {
  sections: Section[]
  /** 调色板（已解析 Rgb[]，>= 256 项；不足会自动 ensure256） */
  palette: Rgb[]
  /** 可选 HVA：按 hvaFrame 索引驱动每节 group 矩阵 */
  hva?: HvaDraft | null
  hvaFrame?: number
  /** 当前激活的 section（用于编辑器高亮）；仅传 index 时把对应组 emissive 调亮 */
  highlightSectionIndex?: number
  /** token 变化 → 重置相机到默认位置（用于 editor 切换 section 后聚焦） */
  cameraResetToken?: number
  /** 整体背景色，默认 0x2e2e2e */
  backgroundColor?: number
  /** 渲染模式 */
  renderMode?: VxlRenderMode
  /** 交互模式（默认 'orbit'） */
  interactionMode?: VxlInteractionMode
  /** 体素点击回调（仅 interactionMode === 'paint' 时触发） */
  onVoxelPick?: (payload: VxlPickPayload, event: MouseEvent) => void
  /** 形状 ghost；存在时在对应 section 的坐标空间渲染一个 wireframe 预览体 */
  ghost?: ShapeGhost | null
  /** 拖拽 ghost 6 面 handle 时回调（已 snap 到整数）。默认无 → handle 不响应拖拽。 */
  onGhostBoundsChange?: (next: ShapeGhost['bounds']) => void
  /** 切面 ghost；存在时在对应 section 的坐标空间渲染半透明矩形片 */
  splitPlane?: SplitPlaneGhost | null
  /**
   * Rotor 配置：每个 enabled 的 rotor 在动画循环里持续旋转其 sectionName 对应的 wrapper group。
   * 与 redalert2 的 Aircraft.updateVxlRotation 等同——HVA 只用 frame 0 作为 bind pose，旋转动画
   * 由代码驱动而非 HVA 多帧。
   */
  rotorConfigs?: RotorConfig[] | null
  /**
   * 游戏化预览模式：
   * - true  → HVA 锁 frame 0；rotorConfigs 启动持续旋转
   * - false → HVA 按 hvaFrame scrub；rotor 不转
   */
  gameAnimMode?: boolean
}

function colorFromPalette(palette: Uint8Array, index: number, out: THREE.Color): void {
  const i = Math.max(0, Math.min(255, index | 0)) * 3
  out.setRGB(palette[i] / 255, palette[i + 1] / 255, palette[i + 2] / 255)
}

function colorFromNormalIndex(idx: number, out: THREE.Color): void {
  // 简易"法线索引→伪色"映射：把 0..255 映射到 hue
  const hue = (idx & 0xff) / 256
  out.setHSL(hue, 0.7, 0.55)
}

function normalizeSectionKey(name: string): string {
  return name.trim().toLowerCase()
}

const VxlSceneRenderer: React.FC<VxlSceneProps> = ({
  sections,
  palette,
  hva,
  hvaFrame = 0,
  highlightSectionIndex,
  cameraResetToken,
  backgroundColor = 0x2e2e2e,
  renderMode = 'color',
  interactionMode = 'orbit',
  onVoxelPick,
  ghost = null,
  onGhostBoundsChange,
  splitPlane = null,
  rotorConfigs = null,
  gameAnimMode = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  // pick 回调用 ref 存，避免每次回调变化都重建场景
  const pickHandlerRef = useRef(onVoxelPick)
  useEffect(() => { pickHandlerRef.current = onVoxelPick }, [onVoxelPick])
  // ghost handle 拖拽回调也用 ref 同步
  const ghostHandlerRef = useRef(onGhostBoundsChange)
  useEffect(() => { ghostHandlerRef.current = onGhostBoundsChange }, [onGhostBoundsChange])
  // rotor 配置 / gameAnimMode 用 ref：动画循环每帧读取，避免改配置就重建场景
  const rotorConfigsRef = useRef<RotorConfig[] | null>(rotorConfigs)
  const gameAnimModeRef = useRef<boolean>(gameAnimMode)
  useEffect(() => { rotorConfigsRef.current = rotorConfigs }, [rotorConfigs])
  useEffect(() => { gameAnimModeRef.current = gameAnimMode }, [gameAnimMode])
  // rotor wrapper groups（key = normalizeSectionKey(name)），动画循环用它们旋转
  const rotorWrappersRef = useRef<Map<string, THREE.Group>>(new Map())
  // 交互模式也用 ref 同步：场景常驻，模式切换不重建场景，只切 controls.enabled + click 行为
  const interactionModeRef = useRef<VxlInteractionMode>(interactionMode)
  // 当前活跃的 OrbitControls 引用，便于在模式变化时即时 enable/disable
  const controlsRef = useRef<OrbitControls | null>(null)
  useEffect(() => {
    interactionModeRef.current = interactionMode
    if (controlsRef.current) {
      controlsRef.current.enabled = interactionMode === 'orbit'
    }
  }, [interactionMode])
  // 持久化相机位姿：场景重建（sections / palette / 渲染模式变化）后用上次的 position+target 复位
  // 仅当 cameraResetToken 变化时强制 auto-fit 并清空 stash
  const cameraStateRef = useRef<{ pos: THREE.Vector3, target: THREE.Vector3 } | null>(null)
  const lastResetTokenRef = useRef<number | undefined>(undefined)
  // 当前活跃 scene / camera / renderer / sectionGroups（供 ghost / splitPlane effect 使用）
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sectionGroupsRef = useRef<THREE.Group[]>([])
  // 记录有体素的 section 数量+空 section 占位 → 让 ghost effect 知道找哪个 group
  const sceneVersionRef = useRef(0)

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let controls: OrbitControls | null = null
    let animationId = 0
    let onResize: (() => void) | null = null
    let onClick: ((e: MouseEvent) => void) | null = null
    let disposed = false

    const mount = mountRef.current
    if (!mount) return

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(mount.clientWidth || 800, mount.clientHeight || 600)
      renderer.setPixelRatio(devicePixelRatio)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
      mount.innerHTML = ''
      mount.appendChild(renderer.domElement)

      scene = new THREE.Scene()
      scene.background = new THREE.Color(backgroundColor)
      camera = new THREE.PerspectiveCamera(
        50,
        (mount.clientWidth || 800) / (mount.clientHeight || 600),
        0.1,
        5000,
      )
      camera.position.set(80, 80, 80)
      camera.lookAt(0, 0, 0)

      const light = new THREE.DirectionalLight(0xffffff, 1.2)
      light.position.set(2, 3, 4)
      scene.add(light)
      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5))

      const pal = PaletteParser.toBytePalette(PaletteParser.ensurePalette256(palette))

      const boxGeo = new THREE.BoxGeometry(1, 1, 1)
      const vertCount = boxGeo.attributes.position?.count || 0
      if (vertCount > 0) {
        const white = new Float32Array(vertCount * 3)
        for (let i = 0; i < white.length; i++) white[i] = 1
        boxGeo.setAttribute('color', new THREE.BufferAttribute(white, 3))
      }
      const baseMat = renderMode === 'wireframe'
        ? new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true })
        : new THREE.MeshLambertMaterial({
          vertexColors: true,
          emissive: new THREE.Color(0x222222),
        })
      ;(baseMat as THREE.MeshLambertMaterial).side = THREE.DoubleSide
      const highlightMat = renderMode === 'wireframe'
        ? new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true })
        : new THREE.MeshLambertMaterial({
          vertexColors: true,
          emissive: new THREE.Color(0x553300),
        })
      ;(highlightMat as THREE.MeshLambertMaterial).side = THREE.DoubleSide

      const centerRoot = new THREE.Group()
      const root = new THREE.Group()
      centerRoot.add(root)
      scene.add(centerRoot)
      const sectionGroupMap = new Map<string, THREE.Group>()
      const sectionGroupArr: THREE.Group[] = []
      // 每个 section 内嵌一个 rotor wrapper：sectionGroup.matrix = base transform；
      // wrapper.rotation 由动画循环每帧累加（仅 enabled rotor）。
      const rotorWrapperMap = new Map<string, THREE.Group>()
      // pick 反查表：instancedMesh.uuid → { sectionIndex, voxels[] }
      type PickEntry = {
        sectionIndex: number
        voxels: Array<{ x: number; y: number; z: number; colorIndex: number; normalIndex: number }>
      }
      const pickByMesh = new Map<string, PickEntry>()

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const section = sections[sIdx]
        const sectionGroup = new THREE.Group()
        sectionGroup.name = section.name
        sectionGroup.matrixAutoUpdate = false
        sectionGroup.matrix.identity()
        root.add(sectionGroup)
        sectionGroupMap.set(normalizeSectionKey(section.name), sectionGroup)
        sectionGroupArr[sIdx] = sectionGroup
        // rotor wrapper（每个 section 都有，便于零成本切换 enable）
        const rotorWrapper = new THREE.Group()
        rotorWrapper.name = `${section.name}__rotor`
        rotorWrapper.matrixAutoUpdate = true
        sectionGroup.add(rotorWrapper)
        rotorWrapperMap.set(normalizeSectionKey(section.name), rotorWrapper)

        const { voxels } = section.getAllVoxels()
        if (voxels.length === 0) continue
        // 计算 voxel 在 three.js 局部空间的 bbox 中心（dummy.set(v.x, v.z, v.y) 后）。
        // rotorWrapper.position 设为该中心 + voxel 实例位置去中心化 → rotation 绕 bbox 中心
        // 而非局部原点，避免 rotor 转起来桨叶被甩到大圆周。rotation=0 时与原渲染等价。
        let cx = 0, cy = 0, cz = 0
        {
          let minX = Infinity, minY = Infinity, minZ = Infinity
          let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
          for (const v of voxels) {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
            if (v.z < minY) minY = v.z; if (v.z > maxY) maxY = v.z
            if (v.y < minZ) minZ = v.y; if (v.y > maxZ) maxZ = v.y
          }
          cx = (minX + maxX) / 2
          cy = (minY + maxY) / 2
          cz = (minZ + maxZ) / 2
        }
        rotorWrapper.position.set(cx, cy, cz)
        const useMat = sIdx === highlightSectionIndex ? highlightMat : baseMat
        const inst = new THREE.InstancedMesh(boxGeo, useMat, voxels.length)
        const color = new THREE.Color()
        const dummy = new THREE.Object3D()
        let idx = 0
        for (const v of voxels) {
          dummy.position.set(v.x - cx, v.z - cy, v.y - cz)
          dummy.updateMatrix()
          inst.setMatrixAt(idx, dummy.matrix)
          if (renderMode === 'normals') {
            colorFromNormalIndex(v.normalIndex, color)
          } else {
            colorFromPalette(pal, v.colorIndex, color)
          }
          inst.setColorAt(idx, color)
          idx++
        }
        inst.instanceMatrix.needsUpdate = true
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true
        rotorWrapper.add(inst)
        pickByMesh.set(inst.uuid, {
          sectionIndex: sIdx,
          voxels: voxels.map((v) => ({
            x: v.x, y: v.y, z: v.z,
            colorIndex: v.colorIndex, normalIndex: v.normalIndex,
          })),
        })
      }
      // 暴露给动画循环 + ghost effect
      rotorWrappersRef.current = rotorWrapperMap

      /**
       * 应用每个 section 的 base transform：
       * - 优先 HVA frame（gameAnimMode 强制 frame 0；否则用 hvaFrame）
       *   matrix = scaleHvaMatrix(hvaMatrix, hvaMultiplier)
       * - 否则 fallback 到 section.transfMatrix
       *
       * HVA section 与 VXL section 的匹配：**index 优先 + name 兜底**，与 redalert2 对齐。
       */
      const applyBaseTransforms = () => {
        const useFrame = gameAnimModeRef.current ? 0 : hvaFrame
        const hvaSections = hva?.sections ?? []
        const hvaByName = new Map<string, typeof hvaSections[number]>()
        for (const hs of hvaSections) hvaByName.set(normalizeSectionKey(hs.name), hs)
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx]
          const sectionGroup = sectionGroupArr[sIdx]
          if (!sectionGroup) continue
          // index 优先；同一 index 的 HVA 节即使名字与 vxl 不同，仍用 index（与游戏一致）。
          // 没 index 才兜底按 name。
          let hvaSection: typeof hvaSections[number] | undefined = hvaSections[sIdx]
          if (!hvaSection) hvaSection = hvaByName.get(normalizeSectionKey(section.name))
          let matrix: THREE.Matrix4
          if (hvaSection) {
            const frameIdx = Math.max(0, Math.min(useFrame, hvaSection.matrices.length - 1))
            const m = hvaSection.matrices[frameIdx]
            matrix = m
              ? scaleHvaMatrix(m, section.hvaMultiplier ?? 1)
              : section.transfMatrix.clone()
          } else {
            matrix = section.transfMatrix.clone()
          }
          sectionGroup.matrix.copy(matrix)
          sectionGroup.matrixAutoUpdate = false
          sectionGroup.matrixWorldNeedsUpdate = true
        }
        centerRoot.position.set(0, 0, 0)
        centerRoot.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(root)
        if (!box.isEmpty()) {
          const center = new THREE.Vector3()
          box.getCenter(center)
          centerRoot.position.copy(center).multiplyScalar(-1)
          centerRoot.updateMatrixWorld(true)
        }
      }
      applyBaseTransforms()

      const box3 = new THREE.Box3().setFromObject(root)
      const size = new THREE.Vector3()
      if (!box3.isEmpty()) box3.getSize(size)
      const radius = Math.max(10, size.length() * 0.6)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.enabled = interactionModeRef.current === 'orbit'
      controlsRef.current = controls
      // 暴露给 ghost / splitPlane effect
      sceneRef.current = scene
      cameraRef.current = camera
      rendererRef.current = renderer
      sectionGroupsRef.current = sectionGroupArr
      sceneVersionRef.current++

      // 决定使用上次相机位姿（场景重建复用）还是 auto-fit（reset token 变化或首次挂载）
      const tokenChanged = lastResetTokenRef.current !== cameraResetToken
      if (tokenChanged) {
        cameraStateRef.current = null
        lastResetTokenRef.current = cameraResetToken
      }
      const stashed = cameraStateRef.current
      if (stashed) {
        camera.position.copy(stashed.pos)
        controls.target.copy(stashed.target)
        controls.update()
      } else {
        const dir = new THREE.Vector3(1, 1, 1).normalize()
        camera.position.copy(dir.multiplyScalar(radius * 1.6))
        controls.target.set(0, 0, 0)
        camera.lookAt(0, 0, 0)
        controls.update()
      }

      onResize = () => {
        if (!renderer || !camera || !mount) return
        const w = mount.clientWidth, h = mount.clientHeight
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
      window.addEventListener('resize', onResize)

      // -------- raycaster onClick --------
      const raycaster = new THREE.Raycaster()
      const ndc = new THREE.Vector2()
      // 用于按住 → 拖拽相机时不触发 pick；记录 mousedown 位置
      let downX = 0, downY = 0, downAt = 0
      const onPointerDown = (e: PointerEvent) => {
        downX = e.clientX
        downY = e.clientY
        downAt = performance.now()
      }
      onClick = (e: MouseEvent) => {
        // 仅 paint 模式响应 pick；orbit 模式下完全无视 click
        if (interactionModeRef.current !== 'paint') return
        if (!pickHandlerRef.current || !renderer || !camera || !scene) return
        // 拖拽相机时（鼠标移动距离 > 4px 或时间 > 300ms）不视为 pick
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4) return
        if (performance.now() - downAt > 600) return
        const rect = renderer.domElement.getBoundingClientRect()
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(ndc, camera)
        const hits = raycaster.intersectObjects(scene.children, true)
        for (const hit of hits) {
          const obj = hit.object as THREE.InstancedMesh
          const entry = pickByMesh.get(obj.uuid)
          if (!entry) continue
          if (typeof hit.instanceId !== 'number') continue
          const v = entry.voxels[hit.instanceId]
          if (!v) continue
          pickHandlerRef.current({
            sectionIndex: entry.sectionIndex,
            x: v.x, y: v.y, z: v.z,
            colorIndex: v.colorIndex, normalIndex: v.normalIndex,
          }, e)
          break
        }
      }
      renderer.domElement.addEventListener('pointerdown', onPointerDown)
      renderer.domElement.addEventListener('click', onClick)

      // Rotor 动画时钟
      const animClock = new THREE.Clock()
      const loop = () => {
        if (disposed) return
        const dt = animClock.getDelta()
        // gameAnimMode 时驱动 enabled rotor；非 gameAnimMode 不动（保留之前累积的 rotation 也不会刷新）
        if (gameAnimModeRef.current) {
          const cfgs = rotorConfigsRef.current
          if (cfgs && cfgs.length > 0) {
            for (const cfg of cfgs) {
              if (!cfg.enabled) continue
              const wrapper = rotorWrappersRef.current.get(normalizeSectionKey(cfg.sectionName))
              if (!wrapper) continue
              // axis 映射：voxel x/y/z → three.js x/z/y（与体素位置 dummy.set(v.x, v.z, v.y) 一致）
              const threeAxis: 'x' | 'y' | 'z' = cfg.axis === 'x' ? 'x' : cfg.axis === 'y' ? 'z' : 'y'
              wrapper.rotation[threeAxis] += cfg.speedDegPerSec * dt * Math.PI / 180
            }
          }
        } else {
          // 非游戏化预览：把所有 rotor wrapper rotation 清零，避免残留
          for (const wrapper of rotorWrappersRef.current.values()) {
            if (wrapper.rotation.x || wrapper.rotation.y || wrapper.rotation.z) {
              wrapper.rotation.set(0, 0, 0)
            }
          }
        }
        controls?.update()
        renderer?.render(scene!, camera!)
        animationId = requestAnimationFrame(loop)
      }
      loop()

      // 在 cleanup 时移除 listener
      return () => {
        disposed = true
        cancelAnimationFrame(animationId)
        if (onResize) window.removeEventListener('resize', onResize)
        if (renderer && onClick) {
          renderer.domElement.removeEventListener('click', onClick)
          renderer.domElement.removeEventListener('pointerdown', onPointerDown)
        }
        // stash 当前相机位姿，下次场景重建时复用（避免每次编辑相机自动归位）
        if (camera && controls) {
          cameraStateRef.current = {
            pos: camera.position.clone(),
            target: controls.target.clone(),
          }
        }
        if (controlsRef.current === controls) controlsRef.current = null
        if (sceneRef.current === scene) sceneRef.current = null
        if (cameraRef.current === camera) cameraRef.current = null
        if (rendererRef.current === renderer) rendererRef.current = null
        sectionGroupsRef.current = []
        controls?.dispose()
        renderer?.dispose()
        if (renderer?.domElement?.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement)
        }
      }
    } catch (e) {
      console.error('[VxlSceneRenderer] init failed:', e)
    }

    return () => {
      disposed = true
      cancelAnimationFrame(animationId)
      if (onResize) window.removeEventListener('resize', onResize)
      if (controlsRef.current === controls) controlsRef.current = null
      controls?.dispose()
      renderer?.dispose()
      if (renderer?.domElement?.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement)
      }
    }
  }, [sections, palette, hva, hvaFrame, highlightSectionIndex, cameraResetToken, backgroundColor, renderMode, gameAnimMode])

  // ---------- 形状 ghost：独立 effect，不重建场景 ----------
  // ghost 改变时（包括拖拽 handle 时的高频更新），仅更新本 group。
  // sceneVersionRef 跟随主 scene 重建递增，确保切换 section / 重新生成场景后 ghost 也能重新挂上。
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const sectionGroup = ghost ? sectionGroupsRef.current[ghost.sectionIndex] : null
    const previous = scene.getObjectByName('__shape_ghost__')
    if (previous) {
      previous.parent?.remove(previous)
      disposeObject(previous)
    }
    if (!ghost || !sectionGroup) return
    const group = buildGhostGroup(ghost)
    group.name = '__shape_ghost__'
    sectionGroup.add(group)
    return () => {
      const live = scene.getObjectByName('__shape_ghost__')
      if (live) {
        live.parent?.remove(live)
        disposeObject(live)
      }
    }
  }, [ghost, sceneVersionRef.current])

  // ---------- ghost 6 面 handle 拖拽 ----------
  // 仅在 ghost 存在 + onGhostBoundsChange 提供时挂监听；按下 handle → 锁住 OrbitControls，
  // 沿 handle 朝向轴投影鼠标位移 → snap 到整数 → emit。
  useEffect(() => {
    if (!ghost || !ghostHandlerRef.current) return
    const renderer = rendererRef.current
    const camera = cameraRef.current
    const scene = sceneRef.current
    const controls = controlsRef.current
    if (!renderer || !camera || !scene) return
    const dom = renderer.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let dragging: { axis: 'x' | 'y' | 'z'; sign: 1 | -1; startNdc: THREE.Vector2; startBounds: ShapeGhost['bounds'] } | null = null

    const screenToWorldDelta = (e: PointerEvent): THREE.Vector3 => {
      // 把屏幕位移映射到世界空间的轴向位移（粗略估算）
      const rect = dom.getBoundingClientRect()
      const dxScreen = (e.clientX - rect.left) / rect.width * 2 - 1 - dragging!.startNdc.x
      const dyScreen = -((e.clientY - rect.top) / rect.height * 2 - 1) + dragging!.startNdc.y
      // 在世界空间用相机前向距离作为缩放
      const distance = camera.position.length()
      const fovY = (camera.fov * Math.PI) / 180
      const worldH = 2 * Math.tan(fovY / 2) * distance
      const worldW = worldH * camera.aspect
      return new THREE.Vector3(dxScreen * worldW * 0.5, dyScreen * worldH * 0.5, 0)
    }

    const onDown = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const ghostGroup = scene.getObjectByName('__shape_ghost__')
      if (!ghostGroup) return
      const handles = ghostGroup.children.filter((c) => c.userData?.isGhostHandle)
      const hits = raycaster.intersectObjects(handles, false)
      if (hits.length === 0) return
      const handle = hits[0].object
      e.preventDefault()
      e.stopPropagation()
      if (controls) controls.enabled = false
      dragging = {
        axis: handle.userData.axis,
        sign: handle.userData.sign,
        startNdc: new THREE.Vector2(ndc.x, ndc.y),
        startBounds: { ...ghost.bounds },
      }
      dom.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const worldDelta = screenToWorldDelta(e)
      // 把世界位移投影到该轴
      const axisVec = dragging.axis === 'x' ? new THREE.Vector3(1, 0, 0)
        : dragging.axis === 'y' ? new THREE.Vector3(0, 0, 1) // y 在 voxel 空间 = three.js 的 z
        : new THREE.Vector3(0, 1, 0) // z 在 voxel 空间 = three.js 的 y
      // 屏幕到世界的 z 轴在相机本地 → 用 unproject 简化
      const proj = worldDelta.dot(axisVec)
      const delta = Math.round(proj) * dragging.sign
      if (delta === 0) return
      const b = { ...dragging.startBounds }
      const sizeKey = dragging.axis === 'x' ? 'sx' : dragging.axis === 'y' ? 'sy' : 'sz'
      const originKey = dragging.axis === 'x' ? 'x0' : dragging.axis === 'y' ? 'y0' : 'z0'
      if (dragging.sign === 1) {
        // 推 + 面：尺寸增减 delta
        b[sizeKey] = Math.max(1, b[sizeKey] + delta)
      } else {
        // 推 - 面：origin 减 delta、尺寸加 delta
        b[originKey] = b[originKey] - delta
        b[sizeKey] = Math.max(1, b[sizeKey] + delta)
      }
      ghostHandlerRef.current?.(b)
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = null
      if (controls) controls.enabled = interactionModeRef.current === 'orbit'
      try { dom.releasePointerCapture(e.pointerId) } catch {}
    }
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerup', onUp)
    dom.addEventListener('pointercancel', onUp)
    return () => {
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
    }
  }, [ghost, sceneVersionRef.current])

  // ---------- 切面 ghost：独立 effect ----------
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const sectionGroup = splitPlane ? sectionGroupsRef.current[splitPlane.sectionIndex] : null
    const previous = scene.getObjectByName('__split_plane__')
    if (previous) {
      previous.parent?.remove(previous)
      disposeObject(previous)
    }
    if (!splitPlane || !sectionGroup) return
    const mesh = buildSplitPlaneMesh(splitPlane)
    mesh.name = '__split_plane__'
    sectionGroup.add(mesh)
    return () => {
      const live = scene.getObjectByName('__split_plane__')
      if (live) {
        live.parent?.remove(live)
        disposeObject(live)
      }
    }
  }, [splitPlane, sceneVersionRef.current])

  return <div ref={mountRef} className="w-full h-full" />
}

// ---------- 形状 ghost 几何 ----------

function buildGhostGroup(ghost: ShapeGhost): THREE.Group {
  const group = new THREE.Group()
  const { x0, y0, z0, sx, sy, sz } = ghost.bounds
  // VxlSceneRenderer 体素坐标 (vx, vy, vz) → three.js (x, z, y)，所以 ghost 也走同样转换
  const cssColor = ghost.colorCss ?? '#3b82f6'
  const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(cssColor), transparent: true, opacity: 0.9 })
  let outline: THREE.LineSegments
  if (ghost.kind === 'sphere') {
    outline = sphereWireframe(sx, sy, sz, lineMat)
  } else if (ghost.kind === 'cylinder') {
    outline = cylinderWireframe(sx, sy, sz, ghost.cylinderAxis, lineMat)
  } else {
    outline = boxWireframe(sx, sy, sz, lineMat)
  }
  // 包围盒中心 (vx + sx/2 - 0.5, vy + sy/2 - 0.5, vz + sz/2 - 0.5)
  const cx = x0 + sx / 2 - 0.5
  const cy = y0 + sy / 2 - 0.5
  const cz = z0 + sz / 2 - 0.5
  outline.position.set(cx, cz, cy) // (x, three-y=vz, three-z=vy)
  group.add(outline)
  // 6 个 handle 球，挂 userData 表明是哪个面
  const handleGeo = new THREE.SphereGeometry(0.6, 12, 8)
  const handleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cssColor) })
  const halfX = sx / 2, halfY = sy / 2, halfZ = sz / 2
  const handleSpecs: Array<{ axis: 'x' | 'y' | 'z'; sign: 1 | -1; offset: [number, number, number] }> = [
    { axis: 'x', sign:  1, offset: [+halfX, 0, 0] },
    { axis: 'x', sign: -1, offset: [-halfX, 0, 0] },
    { axis: 'y', sign:  1, offset: [0, 0, +halfY] }, // voxel y = three.js z
    { axis: 'y', sign: -1, offset: [0, 0, -halfY] },
    { axis: 'z', sign:  1, offset: [0, +halfZ, 0] }, // voxel z = three.js y
    { axis: 'z', sign: -1, offset: [0, -halfZ, 0] },
  ]
  for (const spec of handleSpecs) {
    const m = new THREE.Mesh(handleGeo, handleMat)
    m.position.set(cx + spec.offset[0], cz + spec.offset[1], cy + spec.offset[2])
    m.userData = { isGhostHandle: true, axis: spec.axis, sign: spec.sign }
    group.add(m)
  }
  return group
}

function boxWireframe(sx: number, sy: number, sz: number, mat: THREE.LineBasicMaterial): THREE.LineSegments {
  const geo = new THREE.BoxGeometry(sx, sz, sy) // three (x, y=vz, z=vy)
  const edges = new THREE.EdgesGeometry(geo)
  geo.dispose()
  return new THREE.LineSegments(edges, mat)
}

function sphereWireframe(sx: number, sy: number, sz: number, mat: THREE.LineBasicMaterial): THREE.LineSegments {
  const geo = new THREE.SphereGeometry(0.5, 16, 12)
  geo.scale(sx, sz, sy) // 半径 0.5 → diameter = sx (voxel x)
  const edges = new THREE.EdgesGeometry(geo)
  geo.dispose()
  return new THREE.LineSegments(edges, mat)
}

function cylinderWireframe(sx: number, sy: number, sz: number, axis: 'x' | 'y' | 'z', mat: THREE.LineBasicMaterial): THREE.LineSegments {
  // CylinderGeometry 主轴是 Y；voxel 主轴 = axis → 通过 rotation 对齐到 three 坐标
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
  if (axis === 'x') {
    geo.rotateZ(Math.PI / 2)
    geo.scale(sx, sy, sz) // x 方向高度 = sx，截面 = (sy 圆周, sz 圆周)
  } else if (axis === 'y') {
    // voxel y = three z → 让圆柱主轴朝 three z
    geo.rotateX(Math.PI / 2)
    geo.scale(sx, sz, sy)
  } else {
    // axis = z；voxel z = three y → 默认就是 Y 主轴
    geo.scale(sx, sz, sy)
  }
  const edges = new THREE.EdgesGeometry(geo)
  geo.dispose()
  return new THREE.LineSegments(edges, mat)
}

// ---------- 切面 mesh ----------

function buildSplitPlaneMesh(g: SplitPlaneGhost): THREE.Mesh {
  const { axis, k, rangeAMin, rangeAMax, rangeBMin, rangeBMax } = g.plane
  // axis=x → 矩形位于 x=k 平面，宽 = (rangeAMax-rangeAMin+1)（y 方向），高 = (rangeBMax-rangeBMin+1)（z 方向）
  // axis=y → 矩形位于 y=k，宽 = x 方向（rangeA），高 = z 方向（rangeB）
  // axis=z → 矩形位于 z=k，宽 = x 方向（rangeA），高 = y 方向（rangeB）
  const sideColor = g.highlightSide === 'A' ? 0x60a5fa : 0xfbbf24
  const mat = new THREE.MeshBasicMaterial({
    color: sideColor,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const w = rangeAMax - rangeAMin + 1
  const h = rangeBMax - rangeBMin + 1
  const planeGeo = new THREE.PlaneGeometry(Math.max(0.5, w), Math.max(0.5, h))
  const mesh = new THREE.Mesh(planeGeo, mat)
  // 计算中心：(axis 主轴=k, 另两轴的中心)
  const mid = (lo: number, hi: number) => (lo + hi) / 2
  if (axis === 'x') {
    const cx = k
    const cyV = mid(rangeAMin, rangeAMax) // y
    const czV = mid(rangeBMin, rangeBMax) // z
    mesh.position.set(cx, czV, cyV) // three (vx, vz, vy)
    mesh.rotation.y = Math.PI / 2
  } else if (axis === 'y') {
    const cyV = k
    const cxV = mid(rangeAMin, rangeAMax) // x
    const czV = mid(rangeBMin, rangeBMax) // z
    mesh.position.set(cxV, czV, cyV) // three (vx, vz=midZ, vy=k)
    // axis=y → 切面在 voxel 空间法向量 (0,1,0)，three.js 中 = (0,0,1)
    // 这正是 PlaneGeometry 的默认朝向（XY 平面，法向量 +Z）→ 不旋转。
    // 此时 width（默认沿 three X = voxel X）= rangeA (X 范围) ✅
    //     height（默认沿 three Y = voxel Z）= rangeB (Z 范围) ✅
  } else {
    const czV = k
    const cxV = mid(rangeAMin, rangeAMax) // x
    const cyV = mid(rangeBMin, rangeBMax) // y
    mesh.position.set(cxV, czV, cyV)
    // 默认 PlaneGeometry 朝 +z (three z)，在 voxel 空间是朝 +y → 旋转
    mesh.rotation.x = -Math.PI / 2
    // 重置宽高映射：axis=z 时矩形的 PlaneGeometry width = x 方向（vx），height = y 方向（vy=three z）
    // PlaneGeometry 默认 width=X, height=Y；旋转 x = -90 → 原来的 +Y 变成 +Z（three z = voxel y）→ height 对应 voxel y。OK
  }
  // 边框 outline 让切面更清楚
  const edges = new THREE.EdgesGeometry(planeGeo)
  const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: sideColor, transparent: true, opacity: 0.8,
  }))
  mesh.add(outline)
  return mesh
}

/**
 * 把 HVA 矩阵的平移分量乘以 hvaMultiplier。
 * 对应 redalert2 的 [data/vxl/Section.ts] scaleHvaMatrix —— elements[12..14] = (tx, ty, tz)。
 */
function scaleHvaMatrix(m: THREE.Matrix4, multiplier: number): THREE.Matrix4 {
  const out = m.clone()
  if (out.elements.length >= 15 && multiplier !== 1) {
    out.elements[12] *= multiplier
    out.elements[13] *= multiplier
    out.elements[14] *= multiplier
  }
  return out
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else if (mat) mat.dispose()
  })
}

export default VxlSceneRenderer
