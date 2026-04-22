import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'
import type { HvaDraft } from '../../data/vxl/VxlDraft'

/**
 * HVA 时间轴：底部条 + 当前帧滑块 + 播放/暂停 + 当前节 4×3 矩阵编辑表。
 *
 * - HVA 中每个 section 都有一组帧矩阵（NumFrames × Matrix3x4）。
 * - 时间轴帧数 = 所有 section 中 max(matrices.length)。
 * - 4×3 矩阵以 row-major 显示：第 r 行第 c 列 = elements[c*4+r]，与 Section.transfMatrix 一致。
 */

export interface HvaTimelineProps {
  hva: HvaDraft
  currentFrame: number
  onFrameChange: (frame: number) => void
  /** 修改某节某帧的矩阵。父级用 onChange({hva}) 回写。 */
  onMatrixChange: (sectionIdx: number, frameIdx: number, matrix: THREE.Matrix4) => void
  /** 当前编辑器选中的 section，决定矩阵编辑表显示哪一节 */
  focusSectionIndex: number
}

const HvaTimeline: React.FC<HvaTimelineProps> = ({
  hva,
  currentFrame,
  onFrameChange,
  onMatrixChange,
  focusSectionIndex,
}) => {
  const { t } = useLocale()
  const [playing, setPlaying] = useState(false)
  const playRef = useRef<number | null>(null)

  const frameCount = useMemo(() => {
    let mx = 0
    for (const s of hva.sections) mx = Math.max(mx, s.matrices.length)
    return mx
  }, [hva])

  // 自动播放
  useEffect(() => {
    if (!playing || frameCount <= 1) return
    let last = performance.now()
    const tick = (now: number) => {
      if (now - last > 100) {
        last = now
        onFrameChange((currentFrame + 1) % frameCount)
      }
      playRef.current = requestAnimationFrame(tick)
    }
    playRef.current = requestAnimationFrame(tick)
    return () => { if (playRef.current) cancelAnimationFrame(playRef.current) }
  }, [playing, frameCount, currentFrame, onFrameChange])

  const focusSection = hva.sections[focusSectionIndex] ?? null
  const focusMatrix: THREE.Matrix4 | null = useMemo(() => {
    if (!focusSection) return null
    return focusSection.matrices[Math.min(currentFrame, focusSection.matrices.length - 1)] ?? null
  }, [focusSection, currentFrame])

  const updateCell = (r: number, c: number, value: number) => {
    if (!focusSection || !focusMatrix) return
    const next = focusMatrix.clone()
    next.elements[c * 4 + r] = Number.isFinite(value) ? value : 0
    onMatrixChange(focusSectionIndex, currentFrame, next)
  }

  if (frameCount === 0) {
    return (
      <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-2 text-[11px] text-gray-500">
        {t('vxl.editor.hvaEmpty')}
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-2 space-y-2">
      {/* 时间轴条 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onFrameChange(Math.max(0, currentFrame - 1))}
          className="rounded p-1 text-gray-300 hover:bg-gray-800"
          title={t('vxl.editor.hvaPrevFrame')}
        >
          <SkipBack size={12} />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded p-1 text-gray-300 hover:bg-gray-800"
          title={playing ? t('vxl.editor.hvaPause') : t('vxl.editor.hvaPlay')}
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button
          type="button"
          onClick={() => onFrameChange(Math.min(frameCount - 1, currentFrame + 1))}
          className="rounded p-1 text-gray-300 hover:bg-gray-800"
          title={t('vxl.editor.hvaNextFrame')}
        >
          <SkipForward size={12} />
        </button>
        <span className="text-[11px] text-gray-300 w-20 flex-shrink-0 font-mono">
          {currentFrame + 1} / {frameCount}
        </span>
        <input
          type="range"
          min={0}
          max={frameCount - 1}
          value={currentFrame}
          onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
          className="flex-1"
        />
      </div>
      {/* 矩阵编辑表 */}
      {focusSection && focusMatrix && (
        <div className="flex items-start gap-2">
          <div className="text-[10px] text-gray-400 w-20 flex-shrink-0">
            {t('vxl.editor.hvaMatrixOf', { name: focusSection.name })}
          </div>
          <div className="grid grid-cols-4 gap-0.5 text-[10px] flex-1">
            {[0, 1, 2].map((r) =>
              [0, 1, 2, 3].map((c) => (
                <input
                  key={`${r}-${c}`}
                  type="number"
                  step={0.01}
                  value={focusMatrix.elements[c * 4 + r]}
                  onChange={(e) => updateCell(r, c, parseFloat(e.target.value))}
                  className="rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-gray-100 outline-none focus:border-blue-400 font-mono"
                  title={`row ${r} col ${c}`}
                />
              )),
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default HvaTimeline
