import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import {
  Box, Boxes, ChevronDown, ChevronRight, Droplet, Eraser, Image as ImageIcon, Layers,
  Loader2, MousePointer, Move3d, Paintbrush, PaintBucket, Pipette, Plane, Plus, RefreshCw, Redo2, Save,
  Scissors, Sparkles, Trash2, Undo2, X,
} from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'
import { useAppDialog } from '../common/AppDialogProvider'
import { Section } from '../../data/vxl/Section'
import { HvaSection } from '../../data/HvaFile'
import {
  cloneVxlDraft,
  hvaDraftEquals,
  vxlDraftEquals,
  type HvaDraft,
  type VxlDraft,
} from '../../data/vxl/VxlDraft'
import {
  cloneAnimMetadata,
  emptyAnimMetadata,
  animMetadataEquals,
  type AnimMetadata,
} from '../../data/vxl/AnimMetadata'
import { PaletteParser } from '../../services/palette/PaletteParser'
import VxlSceneRenderer, { type VxlRenderMode, type ShapeGhost, type SplitPlaneGhost } from './VxlSceneRenderer'
import VxlSliceCanvas, { type SliceAxis, type SliceTool } from './VxlSliceCanvas'
import HvaTimeline from './HvaTimeline'
import ShapePanel from './ShapePanel'
import SplitPanel from './SplitPanel'
import RotorsPanel from './RotorsPanel'
import { VxlCommandStack, buildReplaceColorCommand, type VxlCommand, type VxlVoxelPatch } from '../../services/vxl/VxlCommandStack'
import { computeAutoNormals } from '../../services/vxl/VxlAutoNormals'
import { getVoxelAt, resizeSectionNearest, setVoxelAt } from '../../services/vxl/VxlOps'
import { shapeToVoxels, type ShapeParams } from '../../services/vxl/VxlShapeBuilder'
import { planSplit, type SplitPlane } from '../../services/vxl/VxlSplit'

/**
 * VXL 全屏编辑器（Phase 1 walking skeleton）。
 *
 * 由 MixEditor 通过 EditableVxlSession 注入：当前 vxl draft + original + 可选 hva draft + original。
 * 内部维护 cameraResetToken（切 section 触发场景重建以聚焦），其它所有 draft 编辑通过
 * onChange 回写到父级 session（让父级单点持有真理 + 计算 dirty）。
 *
 * P2-P5 已加：体素笔刷 / 3D 拾取（onVoxelPick）/ undo-redo 命令栈 /
 * replace colour / import section / 替换调色板 / 重选尺寸 / HVA 时间轴 / 多渲染模式。
 */

type CenterTab = '3d' | 'slice'

export interface VxlEditorSession {
  filePath: string
  hvaFilePath: string | null
  vxlOriginal: VxlDraft
  vxl: VxlDraft
  hvaOriginal: HvaDraft | null
  hva: HvaDraft | null
  /** 游戏化预览动画 metadata；磁盘上没有 .anim.json 时 animOriginal=null，但 anim 仍是 emptyAnimMetadata() */
  animOriginal: AnimMetadata | null
  anim: AnimMetadata
  loading: boolean
  error: string | null
}

export interface VxlEditorChangePayload {
  vxl?: VxlDraft
  hva?: HvaDraft | null
  anim?: AnimMetadata
}

export interface VxlEditorProps {
  session: VxlEditorSession
  onChange: (next: VxlEditorChangePayload) => void
  onSave: () => void | Promise<void>
  onExit: () => void
  saving?: boolean
  /**
   * 弹出文件选择器的回调；返回选中的 File。父级（MixEditor）注入。
   * 没有提供 → "导入 section" 按钮隐藏。
   */
  onPickFile?: (accept: string) => Promise<File | null>
  /**
   * 替换调色板：父级（MixEditor）弹出 PalettePickerDialog 让用户从「项目内」或
   * 「基座 MIX」选 .pal，并把 768 字节原始 RGB（已做 6→8bit 缩放）回传。
   * 返回 null = 用户取消。
   */
  onPickPalette?: () => Promise<Uint8Array | null>
}

const NORMALS_MODES = [
  { value: 1, label: 'TS (1)' },
  { value: 2, label: 'RA2 (2)' },
  { value: 3, label: 'Other (3)' },
  { value: 4, label: 'Other (4)' },
]

/** 颜色块小工具：从 768 字节 palette 中读取第 idx 项 → "rgb(r,g,b)" */
function paletteRgbCss(palette: Uint8Array, idx: number): string {
  const i = (idx & 0xff) * 3
  return `rgb(${palette[i] ?? 0}, ${palette[i + 1] ?? 0}, ${palette[i + 2] ?? 0})`
}

const VxlEditor: React.FC<VxlEditorProps> = ({
  session,
  onChange,
  onSave,
  onExit,
  saving = false,
  onPickFile,
  onPickPalette,
}) => {
  const { t } = useLocale()
  const dialog = useAppDialog()

  const filename = useMemo(() => session.filePath.split('/').pop() ?? session.filePath, [session.filePath])

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [cameraResetToken, setCameraResetToken] = useState(0)

  // ---------- P2 工具/Tab/命令栈 state ----------
  const [centerTab, setCenterTab] = useState<CenterTab>('3d')
  const [renderMode, setRenderMode] = useState<VxlRenderMode>('color')
  const [sliceAxis, setSliceAxis] = useState<SliceAxis>('z')
  const [sliceIndex, setSliceIndex] = useState(0)
  const [tool, setTool] = useState<SliceTool>('orbit')
  const [colorIndex, setColorIndex] = useState(1)
  const [normalIndex, setNormalIndex] = useState(0)
  // 形状拼接 state（仅 tool === 'shape' 时有效）
  const [shapeParams, setShapeParams] = useState<ShapeParams>({
    kind: 'box', x0: 0, y0: 0, z0: 0, sx: 8, sy: 8, sz: 8,
    hollow: false, wallThickness: 1, cylinderAxis: 'z',
  })
  // 形状拆分 state（仅 tool === 'split' 时有效）
  const [splitPlane, setSplitPlane] = useState<SplitPlane>({
    axis: 'x', k: 0,
    rangeAMin: 0, rangeAMax: 0,
    rangeBMin: 0, rangeBMax: 0,
  })
  const [splitSide, setSplitSide] = useState<'A' | 'B'>('A')
  const [splitNewName, setSplitNewName] = useState('')
  // commandStack 是 ref 而非 state（其内部状态改变时我们用 stackVersion 强制 React 重渲染）
  const commandStackRef = useRef<VxlCommandStack>(new VxlCommandStack(200))
  const [stackVersion, setStackVersion] = useState(0)
  const bumpStack = useCallback(() => setStackVersion((v) => v + 1), [])
  // 把 stackVersion 引用进一个 derived value，强制依赖（保证 React rerender 后按钮 disabled 也刷新）
  const undoState = useMemo(() => ({
    canUndo: commandStackRef.current.canUndo(),
    canRedo: commandStackRef.current.canRedo(),
    size: commandStackRef.current.size(),
  }), [stackVersion])

  // P4 HVA 当前帧
  const [hvaFrame, setHvaFrame] = useState(0)
  // 游戏化预览模式：true → HVA 锁 frame 0 + rotor 持续旋转；false → HVA timeline scrub
  const [gameAnimMode, setGameAnimMode] = useState(false)

  // 切换文件 → 重置 commandStack（避免跨文件 undo）
  const filePathRef = useRef(session.filePath)
  useEffect(() => {
    if (filePathRef.current !== session.filePath) {
      filePathRef.current = session.filePath
      commandStackRef.current.clear()
      bumpStack()
      setHvaFrame(0)
    }
  }, [session.filePath, bumpStack])

  // 切 section 时同步重置切片下标。相机不再自动 reset：
  // 仅在用户在左栏显式点 section / 按下"重置视角"按钮 / 编辑器初次挂载时才重置相机，
  // 这样在 paint 模式下连续编辑（哪怕跨 section 拾取触发 currentSectionIndex 变化）相机都保持。
  useEffect(() => {
    setSliceIndex(0)
  }, [currentSectionIndex])
  const handleResetCamera = useCallback(() => {
    setCameraResetToken((t) => t + 1)
  }, [])

  // 切到不存在的 index 时（删除 section 后）回退
  useEffect(() => {
    if (currentSectionIndex >= session.vxl.sections.length) {
      setCurrentSectionIndex(Math.max(0, session.vxl.sections.length - 1))
    }
  }, [session.vxl.sections.length, currentSectionIndex])

  const currentSection: Section | null = session.vxl.sections[currentSectionIndex] ?? null

  // dirty 状态
  const isDirty = useMemo(() => {
    if (!vxlDraftEquals(session.vxlOriginal, session.vxl)) return true
    if (session.hva && session.hvaOriginal) {
      if (!hvaDraftEquals(session.hvaOriginal, session.hva)) return true
    }
    const animOrigOrEmpty = session.animOriginal ?? emptyAnimMetadata()
    if (!animMetadataEquals(animOrigOrEmpty, session.anim)) return true
    return false
  }, [session])

  // 调色板渲染（768 字节 raw）：embedded palette 也是 RGB 字节流
  const paletteBytes = session.vxl.embeddedPalette
  // 解析为 Rgb[] 给 VxlSceneRenderer
  const scenePalette = useMemo(() => {
    const result = PaletteParser.fromBytes(paletteBytes)
    if (result?.colors?.length) return result.colors
    return PaletteParser.buildGrayscalePalette()
  }, [paletteBytes])

  // ---------- helpers：把单 section 改动写回 draft ----------
  const updateCurrentSection = useCallback(
    (mutate: (s: Section) => void) => {
      if (!currentSection) return
      const nextSections = session.vxl.sections.map((s, i) => {
        if (i !== currentSectionIndex) return s
        // Section 是有方法的类，浅 copy 后突变 + 用类原型重建以保持类型
        const copy = Object.create(Object.getPrototypeOf(s)) as Section
        Object.assign(copy, s)
        copy.minBounds = s.minBounds.clone()
        copy.maxBounds = s.maxBounds.clone()
        copy.transfMatrix = s.transfMatrix.clone()
        copy.spans = s.spans.map((sp) => ({ x: sp.x, y: sp.y, voxels: sp.voxels.map((v) => ({ ...v })) }))
        mutate(copy)
        return copy
      })
      onChange({ vxl: { ...session.vxl, sections: nextSections } })
    },
    [currentSection, currentSectionIndex, onChange, session.vxl],
  )

  // ---------- section 列表操作 ----------
  const handleAddSection = useCallback(() => {
    const newSection = new Section()
    newSection.name = `NEW_${session.vxl.sections.length}`
    newSection.normalsMode = 2
    newSection.sizeX = 8
    newSection.sizeY = 8
    newSection.sizeZ = 8
    newSection.hvaMultiplier = 1
    newSection.transfMatrix = new THREE.Matrix4().identity()
    newSection.minBounds = new THREE.Vector3(-4, -4, -4)
    newSection.maxBounds = new THREE.Vector3(4, 4, 4)
    newSection.spans = []
    onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections, newSection] } })
    setCurrentSectionIndex(session.vxl.sections.length)
  }, [onChange, session.vxl])

  const handleDeleteSection = useCallback(async () => {
    if (!currentSection) return
    const ok = await dialog.confirmDanger({
      title: t('vxl.editor.deleteSection'),
      message: t('vxl.editor.confirmDeleteSection', { name: currentSection.name }),
      confirmText: t('vxl.editor.deleteSection'),
    })
    if (!ok) return
    const next = session.vxl.sections.filter((_, i) => i !== currentSectionIndex)
    onChange({ vxl: { ...session.vxl, sections: next } })
    setCurrentSectionIndex(Math.max(0, currentSectionIndex - 1))
  }, [currentSection, currentSectionIndex, dialog, onChange, session.vxl, t])

  // ---------- transform 矩阵编辑 ----------
  // 显示 row-major 4x3：第 r 行第 c 列 = elements[c*4+r]
  const transformValue = useCallback(
    (r: number, c: number) => {
      if (!currentSection) return 0
      return currentSection.transfMatrix.elements[c * 4 + r]
    },
    [currentSection],
  )
  const updateTransformCell = useCallback(
    (r: number, c: number, value: number) => {
      updateCurrentSection((s) => {
        s.transfMatrix.elements[c * 4 + r] = Number.isFinite(value) ? value : 0
      })
    },
    [updateCurrentSection],
  )
  const handleResetTransform = useCallback(() => {
    updateCurrentSection((s) => {
      s.transfMatrix = new THREE.Matrix4().identity()
    })
  }, [updateCurrentSection])

  // ---------- 调色板色块点击 → 设当前 colorIndex ----------
  const handlePaletteClick = useCallback((idx: number) => {
    setColorIndex(idx & 0xff)
  }, [])

  // ---------- Slice 编辑：mutated（笔刷过程中）→ 重组 vxl draft 触发渲染 ----------
  const handleSliceMutated = useCallback(() => {
    onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
  }, [onChange, session.vxl])

  // ---------- Slice / 3D 拾取 stroke 完成 → push 进 commandStack ----------
  const handleSliceCommand = useCallback((cmd: VxlCommand) => {
    commandStackRef.current.push(cmd)
    bumpStack()
  }, [bumpStack])

  // ---------- Eyedropper 拾取 ----------
  const handleEyedropper = useCallback((c: number, n: number) => {
    setColorIndex(c)
    setNormalIndex(n)
  }, [])

  // ---------- Undo / Redo ----------
  const handleUndo = useCallback(() => {
    const cmd = commandStackRef.current.undo(session.vxl.sections)
    if (cmd) {
      bumpStack()
      onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
    }
  }, [bumpStack, onChange, session.vxl])
  const handleRedo = useCallback(() => {
    const cmd = commandStackRef.current.redo(session.vxl.sections)
    if (cmd) {
      bumpStack()
      onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
    }
  }, [bumpStack, onChange, session.vxl])

  // ---------- Replace colour（dialog 输入两个 index） ----------
  const handleReplaceColour = useCallback(async () => {
    if (!currentSection) return
    const fromStr = await dialog.prompt({
      title: t('vxl.editor.replaceColour'),
      message: t('vxl.editor.replaceColourFrom', { current: colorIndex }),
      defaultValue: '0',
      validate: (v) => {
        const n = parseInt(v, 10)
        return Number.isInteger(n) && n >= 0 && n <= 255 ? null : t('vxl.editor.colourRangeError')
      },
    })
    if (fromStr == null) return
    const toStr = await dialog.prompt({
      title: t('vxl.editor.replaceColour'),
      message: t('vxl.editor.replaceColourTo'),
      defaultValue: String(colorIndex),
      validate: (v) => {
        const n = parseInt(v, 10)
        return Number.isInteger(n) && n >= 0 && n <= 255 ? null : t('vxl.editor.colourRangeError')
      },
    })
    if (toStr == null) return
    const fromIdx = parseInt(fromStr, 10) & 0xff
    const toIdx = parseInt(toStr, 10) & 0xff
    const cmd = buildReplaceColorCommand(currentSectionIndex, currentSection, fromIdx, toIdx)
    if (!cmd) {
      await dialog.info(t('vxl.editor.replaceColourNoMatch'))
      return
    }
    // 应用
    for (const p of cmd.patches) {
      if (p.after) {
        const sec = session.vxl.sections[p.sectionIndex]
        const span = sec.spans.find((sp) => sp.x === p.x && sp.y === p.y)
        if (span) {
          const v = span.voxels.find((vv) => vv.z === p.z)
          if (v) v.colorIndex = p.after.colorIndex
        }
      }
    }
    commandStackRef.current.push(cmd)
    bumpStack()
    onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
  }, [bumpStack, colorIndex, currentSection, currentSectionIndex, dialog, onChange, session.vxl, t])

  // ---------- AutoNormals（应用到当前 section） ----------
  const handleApplyAutoNormals = useCallback(() => {
    if (!currentSection) return
    const before: VxlCommand['patches'] = []
    for (const span of currentSection.spans) {
      for (const v of span.voxels) {
        before.push({
          sectionIndex: currentSectionIndex,
          x: v.x, y: v.y, z: v.z,
          before: { colorIndex: v.colorIndex, normalIndex: v.normalIndex },
          after: { colorIndex: v.colorIndex, normalIndex: v.normalIndex },
        })
      }
    }
    computeAutoNormals(currentSection)
    // 重新扫描，把 after 填上
    let i = 0
    for (const span of currentSection.spans) {
      for (const v of span.voxels) {
        if (i < before.length) {
          before[i].after = { colorIndex: v.colorIndex, normalIndex: v.normalIndex }
        }
        i++
      }
    }
    const meaningful = before.filter((p) =>
      p.before === null || p.after === null
      || p.before.normalIndex !== p.after.normalIndex
      || p.before.colorIndex !== p.after.colorIndex,
    )
    if (meaningful.length > 0) {
      commandStackRef.current.push({ label: 'Auto-normals', patches: meaningful })
      bumpStack()
    }
    onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
  }, [bumpStack, currentSection, currentSectionIndex, onChange, session.vxl])

  // ---------- 重选尺寸 ----------
  const handleResize = useCallback(async () => {
    if (!currentSection) return
    const input = await dialog.prompt({
      title: t('vxl.editor.resizeTitle'),
      message: t('vxl.editor.resizeMsg', { x: currentSection.sizeX, y: currentSection.sizeY, z: currentSection.sizeZ }),
      defaultValue: `${currentSection.sizeX},${currentSection.sizeY},${currentSection.sizeZ}`,
      validate: (v) => {
        const parts = v.split(',').map((p) => parseInt(p.trim(), 10))
        if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 1 || n > 255)) {
          return t('vxl.editor.resizeFormatError')
        }
        return null
      },
    })
    if (input == null) return
    const [nx, ny, nz] = input.split(',').map((p) => parseInt(p.trim(), 10))
    updateCurrentSection((s) => {
      resizeSectionNearest(s, nx, ny, nz)
    })
  }, [currentSection, dialog, t, updateCurrentSection])

  // ---------- 形状拼接：commit ----------
  /**
   * 把 ShapePanel 当前参数生成的 voxel 列表打包成 VxlCommand：
   * 每个 (x,y,z) 对应一个 patch，before = 现有体素或 null；after = (currentColor, currentNormal)。
   * 一次 commit 进 commandStack，可被一次 Ctrl+Z 整体撤销。
   */
  const handleCommitShape = useCallback(() => {
    if (!currentSection) return
    const sectionSize = { x: currentSection.sizeX, y: currentSection.sizeY, z: currentSection.sizeZ }
    const voxels = shapeToVoxels(shapeParams, sectionSize)
    if (voxels.length === 0) return
    const patches: VxlVoxelPatch[] = []
    for (const [x, y, z] of voxels) {
      const before = getVoxelAt(currentSection, x, y, z)
      const after = { colorIndex: colorIndex & 0xff, normalIndex: normalIndex & 0xff }
      // 跳过 before === after 的 patch（避免无意义记录）
      if (before && before.colorIndex === after.colorIndex && before.normalIndex === after.normalIndex) continue
      patches.push({
        sectionIndex: currentSectionIndex,
        x, y, z,
        before: before ? { colorIndex: before.colorIndex, normalIndex: before.normalIndex } : null,
        after,
      })
    }
    if (patches.length === 0) return
    // 直接在 currentSection 上 in-place 修改
    for (const p of patches) {
      if (p.after) setVoxelAt(currentSection, p.x, p.y, p.z, p.after.colorIndex, p.after.normalIndex)
    }
    commandStackRef.current.push({ label: `Shape ${shapeParams.kind}`, patches })
    bumpStack()
    onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
    // 退出形状模式
    setTool('orbit')
  }, [bumpStack, colorIndex, currentSection, currentSectionIndex, normalIndex, onChange, session.vxl, shapeParams])

  // ---------- 形状拆分：execute ----------
  /**
   * 用 planSplit 算两边后：
   * 1. 弹 confirm 让用户确认（V1 不入 undo 栈，提示用户）
   * 2. 在 vxl draft 中：原 section 的 spans 被替换成 remain；新 section 包含 moved
   * 3. 自动选中新 section
   */
  const handleExecuteSplit = useCallback(async () => {
    if (!currentSection) return
    const result = planSplit(currentSection, splitPlane, splitSide)
    if (!result.ok) return
    const trimmedName = splitNewName.trim() || `${currentSection.name || 'sec'}_split`
    const proceed = await dialog.confirmDanger({
      title: t('vxl.editor.split.confirmTitle'),
      message: t('vxl.editor.split.confirmMsg', {
        moved: result.moved.length, remain: result.remain.length, name: trimmedName,
      }),
      confirmText: t('vxl.editor.split.execute'),
    })
    if (!proceed) return

    // 1) 原 section copy + spans = remain
    const origCopy = Object.create(Object.getPrototypeOf(currentSection)) as Section
    Object.assign(origCopy, currentSection)
    origCopy.minBounds = currentSection.minBounds.clone()
    origCopy.maxBounds = currentSection.maxBounds.clone()
    origCopy.transfMatrix = currentSection.transfMatrix.clone()
    origCopy.spans = []
    for (const v of result.remain) {
      setVoxelAt(origCopy, v.x, v.y, v.z, v.colorIndex, v.normalIndex)
    }
    // 2) 新 section：copy 元数据（同 size / 同 transform），spans = moved
    const newSection = Object.create(Object.getPrototypeOf(currentSection)) as Section
    Object.assign(newSection, currentSection)
    newSection.name = trimmedName.slice(0, 15)
    newSection.minBounds = currentSection.minBounds.clone()
    newSection.maxBounds = currentSection.maxBounds.clone()
    newSection.transfMatrix = currentSection.transfMatrix.clone()
    newSection.spans = []
    for (const v of result.moved) {
      setVoxelAt(newSection, v.x, v.y, v.z, v.colorIndex, v.normalIndex)
    }
    const nextSections = session.vxl.sections.map((s, i) => i === currentSectionIndex ? origCopy : s)
    nextSections.push(newSection)
    onChange({ vxl: { ...session.vxl, sections: nextSections } })
    // V1：清空 undo 栈（因为我们做了无法用 patch 表达的 section 增加）
    commandStackRef.current.clear()
    bumpStack()
    // 自动选中新 section
    setCurrentSectionIndex(nextSections.length - 1)
    setTool('orbit')
  }, [bumpStack, currentSection, currentSectionIndex, dialog, onChange, session.vxl, splitNewName, splitPlane, splitSide, t])

  // ---------- 切工具时初始化 / 清理 shape & split state ----------
  useEffect(() => {
    if (tool === 'shape' && currentSection) {
      // 切到 shape：把 ghost 默认放在 section 中心，尺寸 ~ 1/3
      const sx = Math.max(2, Math.floor(currentSection.sizeX / 3))
      const sy = Math.max(2, Math.floor(currentSection.sizeY / 3))
      const sz = Math.max(2, Math.floor(currentSection.sizeZ / 3))
      setShapeParams((prev) => ({
        ...prev,
        x0: Math.floor((currentSection.sizeX - sx) / 2),
        y0: Math.floor((currentSection.sizeY - sy) / 2),
        z0: Math.floor((currentSection.sizeZ - sz) / 2),
        sx, sy, sz,
      }))
    }
    if (tool === 'split' && currentSection) {
      // 切到 split：默认 X 轴中位 + 全范围 + 名字 = currentSection.name + '_split'
      setSplitPlane({
        axis: 'x',
        k: Math.max(0, Math.floor(currentSection.sizeX / 2)),
        rangeAMin: 0, rangeAMax: currentSection.sizeY - 1,
        rangeBMin: 0, rangeBMax: currentSection.sizeZ - 1,
      })
      setSplitSide('A')
      setSplitNewName(`${currentSection.name || 'sec'}_split`.slice(0, 15))
    }
  }, [tool, currentSection])

  // ghost / splitPlane 实时构造（传给 VxlSceneRenderer）
  const sceneGhost: ShapeGhost | null = useMemo(() => {
    if (tool !== 'shape' || !currentSection) return null
    return {
      kind: shapeParams.kind,
      sectionIndex: currentSectionIndex,
      bounds: { x0: shapeParams.x0, y0: shapeParams.y0, z0: shapeParams.z0,
        sx: shapeParams.sx, sy: shapeParams.sy, sz: shapeParams.sz },
      cylinderAxis: shapeParams.cylinderAxis,
      colorCss: paletteRgbCss(paletteBytes, colorIndex),
    }
  }, [tool, currentSection, currentSectionIndex, shapeParams, paletteBytes, colorIndex])
  const sceneSplitPlane: SplitPlaneGhost | null = useMemo(() => {
    if (tool !== 'split' || !currentSection) return null
    return { sectionIndex: currentSectionIndex, plane: splitPlane, highlightSide: splitSide }
  }, [tool, currentSection, currentSectionIndex, splitPlane, splitSide])

  // ---------- 3D 视图体素拾取（按当前工具语义） ----------
  const handleVoxel3DPick = useCallback((payload: { sectionIndex: number; x: number; y: number; z: number; colorIndex: number; normalIndex: number }) => {
    // shape / split 模式下不响应 voxel pick（避免与 ghost / plane 拖拽冲突）
    if (tool === 'shape' || tool === 'split') return
    if (tool === 'eyedropper') {
      setColorIndex(payload.colorIndex)
      setNormalIndex(payload.normalIndex)
      return
    }
    // pencil/eraser/bucket 都按"单点编辑"处理
    if (payload.sectionIndex !== currentSectionIndex) {
      setCurrentSectionIndex(payload.sectionIndex)
      return
    }
    const sec = session.vxl.sections[payload.sectionIndex]
    if (!sec) return
    if (tool === 'pencil' || tool === 'bucket') {
      const cmd: VxlCommand = {
        label: '3D paint',
        patches: [{
          sectionIndex: payload.sectionIndex,
          x: payload.x, y: payload.y, z: payload.z,
          before: { colorIndex: payload.colorIndex, normalIndex: payload.normalIndex },
          after: { colorIndex, normalIndex },
        }],
      }
      // apply
      const span = sec.spans.find((sp) => sp.x === payload.x && sp.y === payload.y)
      if (span) {
        const v = span.voxels.find((vv) => vv.z === payload.z)
        if (v) { v.colorIndex = colorIndex & 0xff; v.normalIndex = normalIndex & 0xff }
      }
      commandStackRef.current.push(cmd)
      bumpStack()
      onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
    } else if (tool === 'eraser') {
      const cmd: VxlCommand = {
        label: '3D erase',
        patches: [{
          sectionIndex: payload.sectionIndex,
          x: payload.x, y: payload.y, z: payload.z,
          before: { colorIndex: payload.colorIndex, normalIndex: payload.normalIndex },
          after: null,
        }],
      }
      const spanIdx = sec.spans.findIndex((sp) => sp.x === payload.x && sp.y === payload.y)
      if (spanIdx >= 0) {
        const span = sec.spans[spanIdx]
        const vIdx = span.voxels.findIndex((vv) => vv.z === payload.z)
        if (vIdx >= 0) span.voxels.splice(vIdx, 1)
      }
      commandStackRef.current.push(cmd)
      bumpStack()
      onChange({ vxl: { ...session.vxl, sections: [...session.vxl.sections] } })
    }
  }, [bumpStack, colorIndex, currentSectionIndex, normalIndex, onChange, session.vxl, tool])

  // ---------- 导入 section（从另一份 .vxl 拷一节过来） ----------
  const handleImportSection = useCallback(async () => {
    if (!onPickFile) return
    const file = await onPickFile('.vxl')
    if (!file) return
    try {
      const { VxlFile } = await import('../../data/VxlFile')
      const { VirtualFile } = await import('../../data/vfs/VirtualFile')
      const buf = new Uint8Array(await file.arrayBuffer())
      const vxl = new VxlFile(VirtualFile.fromBytes(buf, file.name))
      if (vxl.sections.length === 0) {
        await dialog.info(t('vxl.editor.importNoSections'))
        return
      }
      const list = vxl.sections.map((s, i) => `${i}: ${s.name} (${s.sizeX}×${s.sizeY}×${s.sizeZ})`).join('\n')
      const idxStr = await dialog.prompt({
        title: t('vxl.editor.importSection'),
        message: t('vxl.editor.importSectionPick', { list }),
        defaultValue: '0',
        validate: (v) => {
          const n = parseInt(v, 10)
          return Number.isInteger(n) && n >= 0 && n < vxl.sections.length ? null : t('vxl.editor.importSectionRangeError', { max: vxl.sections.length - 1 })
        },
      })
      if (idxStr == null) return
      const idx = parseInt(idxStr, 10)
      const { cloneSection } = await import('../../services/vxl/VxlOps')
      const importedRaw = vxl.sections[idx]
      // 把 lib parser 出来的 Section 转成可写 Section 实例
      const cloned = cloneSection(importedRaw, importedRaw.name)
      const nextSections = [...session.vxl.sections, cloned]
      onChange({ vxl: { ...session.vxl, sections: nextSections } })
      setCurrentSectionIndex(nextSections.length - 1)
    } catch (e) {
      await dialog.alert({ title: t('vxl.editor.importFailedTitle'), message: String(e) })
    }
  }, [dialog, onChange, onPickFile, session.vxl, t])

  // ---------- 替换调色板（必须从项目 / 基座 MIX 中选取） ----------
  const handleReplacePalette = useCallback(async () => {
    if (!onPickPalette) return
    try {
      const next = await onPickPalette()
      if (!next) return // 用户取消
      if (next.byteLength < 768) {
        await dialog.alert({ title: t('vxl.editor.replacePaletteFailedTitle'), message: t('vxl.editor.paletteParseFailed') })
        return
      }
      onChange({ vxl: { ...session.vxl, embeddedPalette: next } })
    } catch (e) {
      await dialog.alert({ title: t('vxl.editor.replacePaletteFailedTitle'), message: String(e) })
    }
  }, [dialog, onChange, onPickPalette, session.vxl, t])

  // ---------- HVA 矩阵编辑 ----------
  const handleHvaMatrixChange = useCallback((sectionIdx: number, frameIdx: number, nextMatrix: THREE.Matrix4) => {
    if (!session.hva) return
    const nextSections = session.hva.sections.map((s, i) => {
      if (i !== sectionIdx) return s
      const next = new HvaSection()
      next.name = s.name
      next.matrices = s.matrices.map((m, fi) => fi === frameIdx ? nextMatrix : m.clone())
      return next
    })
    onChange({ hva: { sections: nextSections } })
  }, [onChange, session.hva])

  // ---------- Anim metadata（rotor 配置）变更 ----------
  const handleAnimChange = useCallback((next: AnimMetadata) => {
    onChange({ anim: next })
  }, [onChange])
  // 当前 vxl 所有 section 名（给 RotorsPanel 下拉用）
  const sectionNames = useMemo(() => session.vxl.sections.map((s) => s.name), [session.vxl.sections])

  // ---------- 退出守卫 ----------
  const handleRequestExit = useCallback(async () => {
    if (saving) return
    if (isDirty) {
      const ok = await dialog.confirmDanger({
        title: t('vxl.editor.confirmDiscardTitle'),
        message: t('vxl.editor.confirmDiscardMsg'),
        confirmText: t('vxl.editor.discard'),
      })
      if (!ok) return
    }
    onExit()
  }, [dialog, isDirty, onExit, saving, t])

  const handleDiscard = useCallback(() => {
    if (!isDirty) return
    onChange({
      vxl: cloneVxlDraft(session.vxlOriginal),
      hva: session.hvaOriginal ? { sections: session.hvaOriginal.sections.map((s) => {
        const c = new HvaSection()
        c.name = s.name
        c.matrices = s.matrices.map((m) => m.clone())
        return c
      }) } : null,
      anim: session.animOriginal ? cloneAnimMetadata(session.animOriginal) : emptyAnimMetadata(),
    })
  }, [isDirty, onChange, session.animOriginal, session.hvaOriginal, session.vxlOriginal])

  // ---------- 键盘快捷键 ----------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc 退出
      if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault()
        void handleRequestExit()
        return
      }
      // Ctrl/Cmd + S 保存
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (isDirty && !saving) void onSave()
        return
      }
      // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y → redo
      if ((e.ctrlKey || e.metaKey) && (
        (e.key.toLowerCase() === 'z' && e.shiftKey)
        || e.key.toLowerCase() === 'y'
      )) {
        e.preventDefault()
        if (commandStackRef.current.canRedo()) handleRedo()
        return
      }
      // Ctrl/Cmd + Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (commandStackRef.current.canUndo()) handleUndo()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRequestExit, isDirty, onSave, saving, handleUndo, handleRedo])

  // ---------- HVA multiplier 编辑 ----------
  const updateHvaMultiplier = useCallback(
    (sectionIdx: number, value: number) => {
      updateCurrentSection((s) => {
        if (sectionIdx === currentSectionIndex) s.hvaMultiplier = Number.isFinite(value) ? value : 1
      })
    },
    [currentSectionIndex, updateCurrentSection],
  )

  // ---------- Render ----------
  const ui = (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gray-950 text-gray-100">
      {/* 顶部条 */}
      <div className="flex items-center gap-3 border-b border-gray-700 bg-gray-900 px-4 py-2">
        <Box size={16} className="flex-shrink-0 text-blue-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {t('vxl.editor.title')}
            <span className="ml-2 text-gray-400">{filename}</span>
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {session.filePath}
            {session.hvaFilePath && (
              <span className="ml-2 text-gray-400">+ {session.hvaFilePath.split('/').pop()}</span>
            )}
          </div>
        </div>
        <div className="text-[11px]">
          {isDirty ? (
            <span className="text-amber-300">{t('vxl.editor.unsavedTag')}</span>
          ) : (
            <span className="text-emerald-300">{t('vxl.editor.savedTag')}</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!isDirty || saving}
          className="inline-flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('vxl.editor.discard')}
        >
          <Undo2 size={12} />
          {t('vxl.editor.discard')}
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!isDirty || saving}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-[11px] text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('vxl.editor.save')}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {t('vxl.editor.save')}
        </button>
        <button
          type="button"
          onClick={() => void handleRequestExit()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600 disabled:opacity-40"
          title={t('vxl.editor.close')}
        >
          <X size={12} />
          {t('vxl.editor.close')}
        </button>
      </div>

      {/* 主体三栏 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左栏：section 列表 */}
        <div className="w-[200px] flex-shrink-0 border-r border-gray-700 flex flex-col bg-gray-900">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-800">
            {t('vxl.editor.sectionList')} ({session.vxl.sections.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {session.vxl.sections.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-gray-500">{t('vxl.editor.sectionEmpty')}</div>
            ) : (
              session.vxl.sections.map((s, i) => {
                const active = i === currentSectionIndex
                return (
                  <button
                    type="button"
                    key={`${s.name}-${i}`}
                    onClick={() => {
                      setCurrentSectionIndex(i)
                      // 用户在左栏显式选 section → 重置相机自动 fit 新 section
                      handleResetCamera()
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs ${
                      active ? 'bg-blue-700 text-white' : 'text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-gray-600'}`} />
                      <span className="truncate">{s.name || '(unnamed)'}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 ml-3">
                      {s.sizeX} × {s.sizeY} × {s.sizeZ}
                    </div>
                  </button>
                )
              })
            )}
          </div>
          <div className="border-t border-gray-800 p-2 flex gap-1">
            <button
              type="button"
              onClick={handleAddSection}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600"
              title={t('vxl.editor.addSection')}
            >
              <Plus size={12} />
              {t('vxl.editor.addSection')}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteSection()}
              disabled={!currentSection}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-red-700 px-2 py-1 text-[11px] text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title={t('vxl.editor.deleteSection')}
            >
              <Trash2 size={12} />
              {t('vxl.editor.deleteSection')}
            </button>
          </div>
        </div>

        {/* 中央：3D 预览 / 2D 切片 + 顶部 tab + 工具栏 */}
        <div className="flex-1 min-w-0 flex flex-col bg-gray-800">
          {/* Tab 条 + 工具栏 */}
          <div className="flex items-stretch gap-1 border-b border-gray-700 bg-gray-900 px-2 py-1">
            <button
              type="button"
              onClick={() => setCenterTab('3d')}
              className={`inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap ${
                centerTab === '3d' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
              title={t('vxl.editor.tab3d')}
            >
              <Box size={14} />
              <span>{t('vxl.editor.tab3d')}</span>
            </button>
            <button
              type="button"
              onClick={() => setCenterTab('slice')}
              className={`inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap ${
                centerTab === 'slice' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
              title={t('vxl.editor.tabSlice')}
            >
              <Layers size={14} />
              <span>{t('vxl.editor.tabSlice')}</span>
            </button>

            <div className="mx-1 my-1 w-px bg-gray-700" />

            {/* 工具栏：视角 / 笔刷 / 橡皮 / 油漆桶 / 吸管 */}
            <ToolButton active={tool === 'orbit'} onClick={() => setTool('orbit')} icon={<Move3d size={14} />} label={t('vxl.editor.toolOrbit')} />
            <div className="mx-1 h-8 w-px bg-gray-700" />
            <ToolButton active={tool === 'pencil'} onClick={() => setTool('pencil')} icon={<Paintbrush size={14} />} label={t('vxl.editor.toolPencil')} />
            <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<Eraser size={14} />} label={t('vxl.editor.toolEraser')} />
            <ToolButton active={tool === 'bucket'} onClick={() => setTool('bucket')} icon={<PaintBucket size={14} />} label={t('vxl.editor.toolBucket')} />
            <ToolButton active={tool === 'eyedropper'} onClick={() => setTool('eyedropper')} icon={<Pipette size={14} />} label={t('vxl.editor.toolEyedropper')} />

            <div className="mx-1 my-1 w-px bg-gray-700" />

            {/* 形状 / 切分 */}
            <ToolButton active={tool === 'shape'} onClick={() => setTool('shape')} icon={<Boxes size={14} />} label={t('vxl.editor.toolShape')} />
            <ToolButton active={tool === 'split'} onClick={() => setTool('split')} icon={<Scissors size={14} />} label={t('vxl.editor.toolSplit')} />

            <div className="mx-1 my-1 w-px bg-gray-700" />

            {/* Undo / Redo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={!undoState.canUndo}
              className="relative inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              title={t('vxl.editor.undo')}
            >
              <Undo2 size={14} />
              <span>{t('vxl.editor.undo')}</span>
              {undoState.size > 0 && (
                <span className="absolute top-0 right-0.5 text-[9px] text-gray-500 leading-none">{undoState.size}</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!undoState.canRedo}
              className="inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              title={t('vxl.editor.redo')}
            >
              <Redo2 size={14} />
              <span>{t('vxl.editor.redo')}</span>
            </button>

            <div className="mx-1 my-1 w-px bg-gray-700" />

            {/* Replace colour / AutoNormals */}
            <button
              type="button"
              onClick={() => void handleReplaceColour()}
              disabled={!currentSection}
              className="inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              title={t('vxl.editor.replaceColour')}
            >
              <Droplet size={14} />
              <span>{t('vxl.editor.replaceColour')}</span>
            </button>
            <button
              type="button"
              onClick={handleApplyAutoNormals}
              disabled={!currentSection}
              className="inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              title={t('vxl.editor.autoNormals')}
            >
              <Sparkles size={14} />
              <span>{t('vxl.editor.autoNormals')}</span>
            </button>

            <div className="ml-auto flex items-stretch gap-1">
              {/* 游戏化预览开关（仅 3D） */}
              {centerTab === '3d' && (
                <button
                  type="button"
                  onClick={() => setGameAnimMode((v) => !v)}
                  className={`inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap ${
                    gameAnimMode ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                  title={t('vxl.editor.gameAnimMode')}
                >
                  <Plane size={14} />
                  <span>{t('vxl.editor.gameAnimMode')}</span>
                </button>
              )}
              {/* 重置视角（仅 3D） */}
              {centerTab === '3d' && (
                <button
                  type="button"
                  onClick={handleResetCamera}
                  className="inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap text-gray-300 hover:bg-gray-800"
                  title={t('vxl.editor.resetCamera')}
                >
                  <RefreshCw size={14} />
                  <span>{t('vxl.editor.resetCamera')}</span>
                </button>
              )}
              {/* 渲染模式（仅 3D） */}
              {centerTab === '3d' && (
                <select
                  value={renderMode}
                  onChange={(e) => setRenderMode(e.target.value as VxlRenderMode)}
                  className="self-center rounded border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 outline-none"
                  title={t('vxl.editor.renderMode')}
                >
                  <option value="color">{t('vxl.editor.renderModeColor')}</option>
                  <option value="normals">{t('vxl.editor.renderModeNormals')}</option>
                  <option value="wireframe">{t('vxl.editor.renderModeWireframe')}</option>
                </select>
              )}
            </div>
          </div>

          {/* 子工具栏：仅 slice tab，axis + slice 滑块 */}
          {centerTab === 'slice' && currentSection && (
            <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/60 px-2 py-1 text-[11px]">
              <span className="text-gray-400">{t('vxl.editor.sliceAxis')}</span>
              {(['z', 'y', 'x'] as const).map((ax) => (
                <button
                  key={ax}
                  type="button"
                  onClick={() => { setSliceAxis(ax); setSliceIndex(0) }}
                  className={`rounded px-2 py-0.5 ${sliceAxis === ax ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
                >{ax.toUpperCase()}</button>
              ))}
              <span className="text-gray-400 ml-3">
                {t('vxl.editor.sliceIndex')}: {sliceIndex}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, sliceAxisMax(currentSection, sliceAxis) - 1)}
                value={sliceIndex}
                onChange={(e) => setSliceIndex(parseInt(e.target.value, 10))}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setSliceIndex((i) => Math.max(0, i - 1))}
                className="rounded px-2 py-0.5 text-gray-300 hover:bg-gray-800"
              >−</button>
              <button
                type="button"
                onClick={() => setSliceIndex((i) => Math.min(sliceAxisMax(currentSection, sliceAxis) - 1, i + 1))}
                className="rounded px-2 py-0.5 text-gray-300 hover:bg-gray-800"
              >+</button>
            </div>
          )}

          {/* 中央内容 */}
          <div className="relative flex-1 min-h-0 overflow-auto bg-gray-800">
            {session.vxl.sections.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-gray-500 text-sm">
                {t('vxl.editor.sectionEmpty')}
              </div>
            ) : centerTab === '3d' ? (
              <VxlSceneRenderer
                sections={session.vxl.sections}
                palette={scenePalette}
                hva={session.hva}
                hvaFrame={hvaFrame}
                highlightSectionIndex={currentSectionIndex}
                cameraResetToken={cameraResetToken}
                renderMode={renderMode}
                interactionMode={tool === 'orbit' ? 'orbit' : 'paint'}
                onVoxelPick={handleVoxel3DPick}
                ghost={sceneGhost}
                onGhostBoundsChange={(b) => setShapeParams((p) => ({ ...p, ...b }))}
                splitPlane={sceneSplitPlane}
                rotorConfigs={session.anim.rotors}
                gameAnimMode={gameAnimMode}
              />
            ) : (
              <VxlSliceCanvas
                sections={session.vxl.sections}
                sectionIndex={currentSectionIndex}
                axis={sliceAxis}
                sliceIndex={sliceIndex}
                paletteBytes={paletteBytes}
                tool={tool}
                colorIndex={colorIndex}
                normalIndex={normalIndex}
                onMutated={handleSliceMutated}
                onCommand={handleSliceCommand}
                onEyedropper={handleEyedropper}
              />
            )}
          </div>

          {/* HVA 时间轴（有 hva 时；游戏化预览模式下隐藏，frame 锁 0） */}
          {session.hva && !gameAnimMode && (
            <HvaTimeline
              hva={session.hva}
              currentFrame={hvaFrame}
              onFrameChange={setHvaFrame}
              onMatrixChange={handleHvaMatrixChange}
              focusSectionIndex={currentSectionIndex}
            />
          )}
        </div>

        {/* 右栏：元数据/transform/bounds/size/palette/hva */}
        <div className="w-[340px] flex-shrink-0 border-l border-gray-700 overflow-y-auto px-3 py-3 space-y-3 text-xs bg-gray-900">
          {currentSection ? (
            <>
              {/* 形状拼接面板（仅 tool === 'shape'） */}
              {tool === 'shape' && (
                <ShapePanel
                  section={currentSection}
                  params={shapeParams}
                  brushColorIndex={colorIndex}
                  brushColorCss={paletteRgbCss(paletteBytes, colorIndex)}
                  onParamsChange={setShapeParams}
                  onCommit={handleCommitShape}
                  onCancel={() => setTool('orbit')}
                />
              )}
              {/* 形状拆分面板（仅 tool === 'split'） */}
              {tool === 'split' && (
                <SplitPanel
                  section={currentSection}
                  plane={splitPlane}
                  side={splitSide}
                  newSectionName={splitNewName}
                  onPlaneChange={setSplitPlane}
                  onSideChange={setSplitSide}
                  onNewNameChange={setSplitNewName}
                  onExecute={() => void handleExecuteSplit()}
                  onCancel={() => setTool('orbit')}
                />
              )}
              {/* Section 元数据 */}
              <Fieldset title={t('vxl.editor.metadata')}>
                <label className="block">
                  <span className="text-gray-400">Name</span>
                  <input
                    type="text"
                    value={currentSection.name}
                    onChange={(e) => updateCurrentSection((s) => { s.name = e.target.value })}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                  />
                </label>
                <label className="block">
                  <span className="text-gray-400">{t('vxl.editor.normalsMode')}</span>
                  <select
                    value={currentSection.normalsMode}
                    onChange={(e) => updateCurrentSection((s) => { s.normalsMode = parseInt(e.target.value, 10) })}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none"
                  >
                    {NORMALS_MODES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-gray-400">{t('vxl.editor.hvaMultiplier')}</span>
                  <input
                    type="number"
                    step={0.01}
                    value={currentSection.hvaMultiplier}
                    onChange={(e) => updateHvaMultiplier(currentSectionIndex, parseFloat(e.target.value))}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                  />
                </label>
              </Fieldset>

              {/* Rotors 面板（游戏化预览动画配置） */}
              <RotorsPanel
                sectionNames={sectionNames}
                anim={session.anim}
                onAnimChange={handleAnimChange}
              />

              {/* Transform 矩阵 4x3 */}
              <Fieldset title={t('vxl.editor.transform')}>
                <div className="grid grid-cols-4 gap-1">
                  {[0, 1, 2].map((r) =>
                    [0, 1, 2, 3].map((c) => (
                      <input
                        key={`${r}-${c}`}
                        type="number"
                        step={0.0001}
                        value={transformValue(r, c)}
                        onChange={(e) => updateTransformCell(r, c, parseFloat(e.target.value))}
                        className="rounded border border-gray-700 bg-gray-950 px-1 py-1 text-[10px] text-gray-100 outline-none focus:border-blue-400 font-mono"
                        title={`row ${r} col ${c}`}
                      />
                    )),
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleResetTransform}
                  className="mt-2 w-full rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600"
                >
                  {t('vxl.editor.resetTransform')}
                </button>
              </Fieldset>

              {/* Bounds */}
              <Fieldset title={t('vxl.editor.bounds')}>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <span className="text-gray-500 col-span-3">min</span>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <input
                      key={`min-${axis}`}
                      type="number"
                      step={0.01}
                      value={currentSection.minBounds[axis]}
                      onChange={(e) => updateCurrentSection((s) => { s.minBounds[axis] = parseFloat(e.target.value) || 0 })}
                      className="rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-blue-400 font-mono"
                    />
                  ))}
                  <span className="text-gray-500 col-span-3 mt-1">max</span>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <input
                      key={`max-${axis}`}
                      type="number"
                      step={0.01}
                      value={currentSection.maxBounds[axis]}
                      onChange={(e) => updateCurrentSection((s) => { s.maxBounds[axis] = parseFloat(e.target.value) || 0 })}
                      className="rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-blue-400 font-mono"
                    />
                  ))}
                </div>
              </Fieldset>

              {/* Size */}
              <Fieldset title={t('vxl.editor.size')}>
                <div className="grid grid-cols-3 gap-1">
                  {(['sizeX', 'sizeY', 'sizeZ'] as const).map((field) => (
                    <input
                      key={field}
                      type="number"
                      min={1}
                      max={255}
                      value={currentSection[field]}
                      onChange={(e) => updateCurrentSection((s) => {
                        const v = Math.max(1, Math.min(255, parseInt(e.target.value, 10) | 0))
                        s[field] = v
                      })}
                      className="rounded border border-gray-700 bg-gray-950 px-1 py-1 text-[11px] text-gray-100 outline-none focus:border-blue-400 font-mono"
                    />
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-gray-500">X / Y / Z</div>
              </Fieldset>

              {/* 当前画笔状态 */}
              <Fieldset title={t('vxl.editor.brush')}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 flex-shrink-0 rounded border-2 border-blue-400"
                    style={{ background: paletteRgbCss(paletteBytes, colorIndex) }}
                    title={`#${colorIndex}`}
                  />
                  <div className="flex-1 grid grid-cols-2 gap-1">
                    <label className="block text-[10px] text-gray-400">
                      colorIdx
                      <input
                        type="number"
                        min={0}
                        max={255}
                        value={colorIndex}
                        onChange={(e) => setColorIndex(Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0)))}
                        className="mt-0.5 w-full rounded border border-gray-600 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-blue-400 font-mono"
                      />
                    </label>
                    <label className="block text-[10px] text-gray-400">
                      normalIdx
                      <input
                        type="number"
                        min={0}
                        max={255}
                        value={normalIndex}
                        onChange={(e) => setNormalIndex(Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0)))}
                        className="mt-0.5 w-full rounded border border-gray-600 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-blue-400 font-mono"
                      />
                    </label>
                  </div>
                </div>
              </Fieldset>

              {/* 调色板 */}
              <Fieldset title={t('vxl.editor.palette')} defaultOpen={true}>
                <div className="grid gap-[1px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
                  {Array.from({ length: 256 }).map((_, idx) => {
                    const selected = idx === colorIndex
                    return (
                      <button
                        key={idx}
                        type="button"
                        title={`#${idx} ${paletteRgbCss(paletteBytes, idx)}`}
                        onClick={() => handlePaletteClick(idx)}
                        className={`aspect-square ${selected ? 'ring-2 ring-blue-400 z-10' : 'border border-gray-800'}`}
                        style={{ background: paletteRgbCss(paletteBytes, idx) }}
                      />
                    )
                  })}
                </div>
                <div className="mt-2 text-[10px] text-gray-500">{t('vxl.editor.paletteHint')}</div>
              </Fieldset>

              {/* 高级 ops */}
              <Fieldset title={t('vxl.editor.advancedOps')} defaultOpen={false}>
                <div className="flex flex-col gap-1">
                  {onPickFile && (
                    <button
                      type="button"
                      onClick={() => void handleImportSection()}
                      className="rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600 inline-flex items-center justify-center gap-1"
                    >
                      <Plus size={11} />
                      {t('vxl.editor.importSection')}
                    </button>
                  )}
                  {onPickPalette && (
                    <button
                      type="button"
                      onClick={() => void handleReplacePalette()}
                      className="rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600 inline-flex items-center justify-center gap-1"
                    >
                      <ImageIcon size={11} />
                      {t('vxl.editor.replacePalette')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleResize()}
                    className="rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-100 hover:bg-gray-600 inline-flex items-center justify-center gap-1"
                  >
                    <MousePointer size={11} />
                    {t('vxl.editor.resize')}
                  </button>
                </div>
              </Fieldset>
            </>
          ) : (
            <div className="text-gray-500 text-[11px]">{t('vxl.editor.noSelection')}</div>
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return ui
  return createPortal(ui, document.body)
}

interface FieldsetProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

const Fieldset: React.FC<FieldsetProps> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded border border-gray-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-left text-[11px] text-gray-300 hover:bg-gray-800"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{title}</span>
      </button>
      {open && <div className="border-t border-gray-700 px-2 py-2 space-y-1.5">{children}</div>}
    </div>
  )
}

interface ToolButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

const ToolButton: React.FC<ToolButtonProps> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 min-w-[48px] text-[11px] leading-tight whitespace-nowrap ${
      active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
    }`}
    title={label}
  >
    {icon}
    <span>{label}</span>
  </button>
)

function sliceAxisMax(section: Section, axis: SliceAxis): number {
  if (axis === 'z') return section.sizeZ
  if (axis === 'y') return section.sizeY
  return section.sizeX
}

export default VxlEditor
