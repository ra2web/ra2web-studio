import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Section } from '../../data/vxl/Section'
import { floodFill2D, getVoxelAt, removeVoxelAt, setVoxelAt } from '../../services/vxl/VxlOps'
import { StrokeCollector, type VxlCommand } from '../../services/vxl/VxlCommandStack'

/**
 * 2D 切片画布。把 section 的某个 axis 平面（XY / XZ / YZ）按 cell 网格画出来，
 * 支持鼠标点击 / 拖拽 / 工具切换执行体素编辑，并把整个 stroke 打包成一个 VxlCommand
 * 通过 onCommand 回调上抛给父级（push 进 commandStack）。
 *
 * 数据流：
 * - 父级 owner（VxlEditor）持有 sections + commandStack
 * - 工具切换 / colorIndex 也在父级
 * - 编辑过程中本组件**直接修改** sections[sectionIndex] 的 spans（in-place），
 *   并 onMutated 通知父级"draft 已变"，父级重新打包 VxlDraft 触发渲染
 * - mouseup 时本组件 finish stroke，onCommand 回传可 push 的 command
 */

export type SliceAxis = 'z' | 'y' | 'x'
/**
 * 工具枚举：
 *   orbit / pencil / eraser / bucket / eyedropper 都是"针对单个体素"的工具。
 *   shape  = 形状拼接模式：右栏 ShapePanel + 3D 视图渲染 wireframe ghost。
 *   split  = 形状拆分模式：右栏 SplitPanel + 3D 视图渲染半透明矩形切面。
 *   shape / split 模式下，2D 切片画布与 3D 视图的体素点击全部禁用。
 */
export type SliceTool = 'orbit' | 'pencil' | 'eraser' | 'bucket' | 'eyedropper' | 'shape' | 'split'

export interface VxlSliceCanvasProps {
  /** 当前编辑的 sections 引用（in-place 编辑） */
  sections: Section[]
  /** 当前激活 section 的下标 */
  sectionIndex: number
  /** 切片轴：z = 俯视 (X-Y), y = 正视 (X-Z), x = 侧视 (Y-Z) */
  axis: SliceAxis
  /** 切片层下标（0-based，沿 axis 方向） */
  sliceIndex: number
  /** 调色板（768 字节 RGB），用于渲染色块 */
  paletteBytes: Uint8Array
  /** 当前工具 */
  tool: SliceTool
  /** 当前 colorIndex（pencil / bucket 用） */
  colorIndex: number
  /** 当前 normalIndex（pencil / bucket 用） */
  normalIndex: number
  /** stroke 完成时（mouseup）回调；父组件接收后 push 进 commandStack */
  onCommand?: (cmd: VxlCommand) => void
  /** 编辑发生时（每次 touch）回调；父级用来标 dirty + 触发 React 重绘 */
  onMutated?: () => void
  /** eyedropper 拾取颜色时回调 */
  onEyedropper?: (colorIndex: number, normalIndex: number) => void
}

// 把 (a, b, fixed) → (x, y, z)
function toVoxelXYZ(axis: SliceAxis, fixed: number, a: number, b: number): [number, number, number] {
  if (axis === 'z') return [a, b, fixed]
  if (axis === 'y') return [a, fixed, b]
  return [fixed, a, b]
}

// 给定 section 与 axis，得平面尺寸 (aMax, bMax)
function planeSize(section: Section, axis: SliceAxis): { aMax: number; bMax: number; axisMax: number } {
  if (axis === 'z') return { aMax: section.sizeX, bMax: section.sizeY, axisMax: section.sizeZ }
  if (axis === 'y') return { aMax: section.sizeX, bMax: section.sizeZ, axisMax: section.sizeY }
  return { aMax: section.sizeY, bMax: section.sizeZ, axisMax: section.sizeX }
}

const CELL = 16 // 每 cell 像素大小（CSS）

const VxlSliceCanvas: React.FC<VxlSliceCanvasProps> = ({
  sections,
  sectionIndex,
  axis,
  sliceIndex,
  paletteBytes,
  tool,
  colorIndex,
  normalIndex,
  onCommand,
  onMutated,
  onEyedropper,
}) => {
  const section = sections[sectionIndex]
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokeRef = useRef<StrokeCollector | null>(null)
  const lastCellRef = useRef<{ a: number; b: number } | null>(null)
  const [hover, setHover] = useState<{ a: number; b: number } | null>(null)

  const dims = useMemo(() => {
    if (!section) return { aMax: 0, bMax: 0, axisMax: 0 }
    return planeSize(section, axis)
  }, [section, axis])

  // 重绘 canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !section) return
    const { aMax, bMax } = dims
    const dpr = window.devicePixelRatio || 1
    canvas.width = aMax * CELL * dpr
    canvas.height = bMax * CELL * dpr
    canvas.style.width = `${aMax * CELL}px`
    canvas.style.height = `${bMax * CELL}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 棋盘背景（透明感）
    for (let b = 0; b < bMax; b++) {
      for (let a = 0; a < aMax; a++) {
        const dark = (a + b) % 2 === 0
        ctx.fillStyle = dark ? '#222' : '#2a2a2a'
        ctx.fillRect(a * CELL, b * CELL, CELL, CELL)
      }
    }
    // 体素
    for (let b = 0; b < bMax; b++) {
      for (let a = 0; a < aMax; a++) {
        const [vx, vy, vz] = toVoxelXYZ(axis, sliceIndex, a, b)
        const v = getVoxelAt(section, vx, vy, vz)
        if (!v) continue
        const i = v.colorIndex * 3
        ctx.fillStyle = `rgb(${paletteBytes[i] ?? 0}, ${paletteBytes[i + 1] ?? 0}, ${paletteBytes[i + 2] ?? 0})`
        ctx.fillRect(a * CELL + 1, b * CELL + 1, CELL - 2, CELL - 2)
      }
    }
    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let a = 0; a <= aMax; a++) {
      ctx.beginPath()
      ctx.moveTo(a * CELL + 0.5, 0)
      ctx.lineTo(a * CELL + 0.5, bMax * CELL)
      ctx.stroke()
    }
    for (let b = 0; b <= bMax; b++) {
      ctx.beginPath()
      ctx.moveTo(0, b * CELL + 0.5)
      ctx.lineTo(aMax * CELL, b * CELL + 0.5)
      ctx.stroke()
    }
    // hover 高亮
    if (hover) {
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.strokeRect(hover.a * CELL + 1, hover.b * CELL + 1, CELL - 2, CELL - 2)
    }
  }, [section, dims, paletteBytes, axis, sliceIndex, hover])

  useEffect(() => { render() }, [render])

  const cellFromEvent = useCallback((event: React.MouseEvent<HTMLCanvasElement>): { a: number; b: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const a = Math.floor((event.clientX - rect.left) / CELL)
    const b = Math.floor((event.clientY - rect.top) / CELL)
    if (a < 0 || a >= dims.aMax || b < 0 || b >= dims.bMax) return null
    return { a, b }
  }, [dims])

  const applyTool = useCallback((a: number, b: number) => {
    if (!section) return
    const [vx, vy, vz] = toVoxelXYZ(axis, sliceIndex, a, b)
    if (tool === 'eyedropper') {
      const v = getVoxelAt(section, vx, vy, vz)
      if (v && onEyedropper) onEyedropper(v.colorIndex, v.normalIndex)
      return
    }
    if (tool === 'bucket') {
      // bucket 一次完成；strokeRef 已开 → 我们直接 collect
      const stroke = strokeRef.current!
      // 先扫一遍本平面所有同色点，记录 patches，再 setVoxel
      // 简化：先 floodFill 后扫描差异不易；改为直接 walk + touch 收集
      // 这里复用 floodFill 的逻辑但用 stroke 收集
      collectFloodFill(stroke, sections, sectionIndex, axis, sliceIndex, a, b, colorIndex, normalIndex)
      onMutated?.()
      return
    }
    const stroke = strokeRef.current!
    if (tool === 'pencil') {
      // 记录 before、设置新 voxel
      stroke.touch(sections, sectionIndex, vx, vy, vz, { colorIndex, normalIndex })
      setVoxelAt(section, vx, vy, vz, colorIndex, normalIndex)
    } else if (tool === 'eraser') {
      stroke.touch(sections, sectionIndex, vx, vy, vz, null)
      removeVoxelAt(section, vx, vy, vz)
    }
    onMutated?.()
  }, [axis, colorIndex, normalIndex, onEyedropper, onMutated, section, sectionIndex, sections, sliceIndex, tool])

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    // orbit / shape / split 模式：2D 切片画布完全不响应（与 3D 视图保持一致语义）
    if (tool === 'orbit' || tool === 'shape' || tool === 'split') return
    const cell = cellFromEvent(event)
    if (!cell) return
    if (tool === 'eyedropper') {
      // eyedropper 不开 stroke，单次拾取
      applyTool(cell.a, cell.b)
      return
    }
    strokeRef.current = new StrokeCollector(`${tool}@${axis}=${sliceIndex}`)
    lastCellRef.current = cell
    applyTool(cell.a, cell.b)
  }, [applyTool, axis, cellFromEvent, sliceIndex, tool])

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'orbit' || tool === 'shape' || tool === 'split') return
    const cell = cellFromEvent(event)
    if (!cell) {
      setHover(null)
      return
    }
    setHover((prev) => (prev?.a === cell.a && prev?.b === cell.b ? prev : cell))

    // pencil/eraser 拖拽：插值前一格到当前格之间填入
    if (!strokeRef.current) return
    if (tool !== 'pencil' && tool !== 'eraser') return
    const prev = lastCellRef.current
    if (!prev) {
      lastCellRef.current = cell
      applyTool(cell.a, cell.b)
      return
    }
    if (prev.a === cell.a && prev.b === cell.b) return
    // 简易 Bresenham 线段
    const points = lineCells(prev.a, prev.b, cell.a, cell.b)
    for (let i = 1; i < points.length; i++) {
      applyTool(points[i].a, points[i].b)
    }
    lastCellRef.current = cell
  }, [applyTool, cellFromEvent, tool])

  const finishStroke = useCallback(() => {
    const stroke = strokeRef.current
    strokeRef.current = null
    lastCellRef.current = null
    if (!stroke || !onCommand) return
    const cmd = stroke.finish()
    if (cmd) onCommand(cmd)
  }, [onCommand])

  const handleMouseUp = finishStroke
  const handleMouseLeave = useCallback(() => {
    setHover(null)
    finishStroke()
  }, [finishStroke])

  if (!section) {
    return <div className="text-gray-500 text-xs p-3">No section selected</div>
  }

  return (
    <div className="flex flex-col items-center gap-2 p-3">
      <div className="text-[11px] text-gray-400">
        {axis.toUpperCase()} 平面 · 切片 {sliceIndex + 1}/{dims.axisMax} · {dims.aMax} × {dims.bMax}
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className={`border border-gray-700 ${
          tool === 'orbit' || tool === 'shape' || tool === 'split' ? 'cursor-default' : 'cursor-crosshair'
        }`}
        style={{ imageRendering: 'pixelated' }}
      />
      {hover && (
        <div className="text-[10px] text-gray-500">
          {axis === 'z' && `(x=${hover.a}, y=${hover.b}, z=${sliceIndex})`}
          {axis === 'y' && `(x=${hover.a}, y=${sliceIndex}, z=${hover.b})`}
          {axis === 'x' && `(x=${sliceIndex}, y=${hover.a}, z=${hover.b})`}
        </div>
      )}
    </div>
  )
}

/** Bresenham 直线（含两端点） */
function lineCells(x0: number, y0: number, x1: number, y1: number): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  while (true) {
    out.push({ a: x, b: y })
    if (x === x1 && y === y1) break
    const e2 = err * 2
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
  return out
}

/**
 * 把 floodFill2D 操作"边收集 patch 边修改"——用于 bucket 工具，让 stroke 一次性
 * 包含所有变化以便 undo。
 */
function collectFloodFill(
  stroke: StrokeCollector,
  sections: Section[],
  sectionIndex: number,
  axis: SliceAxis,
  fixed: number,
  seedX: number, seedY: number,
  newColor: number,
  newNormal: number,
): number {
  const section = sections[sectionIndex]
  if (!section) return 0
  const before = section.spans.map((sp) => ({
    x: sp.x, y: sp.y,
    voxels: sp.voxels.map((v) => ({ ...v })),
  }))
  const filled = floodFill2D(section, axis, fixed, seedX, seedY, newColor, newNormal)
  if (filled === 0) return 0
  // 比较 before vs after：把修改后的体素 touch 进 stroke
  const beforeMap = new Map<string, { c: number; n: number }>()
  for (const sp of before) {
    for (const v of sp.voxels) beforeMap.set(`${v.x},${v.y},${v.z}`, { c: v.colorIndex, n: v.normalIndex })
  }
  for (const sp of section.spans) {
    for (const v of sp.voxels) {
      const key = `${v.x},${v.y},${v.z}`
      const oldVal = beforeMap.get(key)
      if (!oldVal || oldVal.c !== v.colorIndex || oldVal.n !== v.normalIndex) {
        // 直接 push 到 stroke 内部 patches
        const beforeRec = oldVal ? { colorIndex: oldVal.c, normalIndex: oldVal.n } : null
        ;(stroke as unknown as { patches: any[]; touched: Set<string> })
          .patches.push({
            sectionIndex, x: v.x, y: v.y, z: v.z,
            before: beforeRec,
            after: { colorIndex: v.colorIndex, normalIndex: v.normalIndex },
          })
      }
    }
  }
  return filled
}

export default VxlSliceCanvas
