import React, { useMemo } from 'react'
import { CheckCircle2, Scissors, X as XIcon, AlertCircle } from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'
import type { Section } from '../../data/vxl/Section'
import { planSplit, type SplitPlane } from '../../services/vxl/VxlSplit'

/**
 * 切面参数 + 拒绝判定 + 执行按钮。受控组件，所有 SplitPlane state 都由父级持有；
 * 本组件实时预览 A/B/untouched voxel 数 + 选中侧的连通分量数 + 是否通过校验。
 */

export interface SplitPanelProps {
  section: Section
  plane: SplitPlane
  side: 'A' | 'B'
  newSectionName: string
  onPlaneChange: (next: SplitPlane) => void
  onSideChange: (next: 'A' | 'B') => void
  onNewNameChange: (next: string) => void
  onExecute: () => void
  onCancel: () => void
}

const SplitPanel: React.FC<SplitPanelProps> = ({
  section, plane, side, newSectionName,
  onPlaneChange, onSideChange, onNewNameChange,
  onExecute, onCancel,
}) => {
  const { t } = useLocale()

  const sectionSize = useMemo(() => ({ x: section.sizeX, y: section.sizeY, z: section.sizeZ }), [section])
  // 另两轴的最大坐标（用于 range max clamp）
  const otherAxes = useMemo(() => {
    if (plane.axis === 'x') return { aMax: sectionSize.y - 1, bMax: sectionSize.z - 1, aLabel: 'Y', bLabel: 'Z' }
    if (plane.axis === 'y') return { aMax: sectionSize.x - 1, bMax: sectionSize.z - 1, aLabel: 'X', bLabel: 'Z' }
    return { aMax: sectionSize.x - 1, bMax: sectionSize.y - 1, aLabel: 'X', bLabel: 'Y' }
  }, [plane.axis, sectionSize])
  const mainMax = useMemo(() => {
    if (plane.axis === 'x') return sectionSize.x
    if (plane.axis === 'y') return sectionSize.y
    return sectionSize.z
  }, [plane.axis, sectionSize])

  const result = useMemo(() => planSplit(section, plane, side), [section, plane, side])

  const updateInt = (key: 'k'|'rangeAMin'|'rangeAMax'|'rangeBMin'|'rangeBMax', v: number, min: number, max: number) => {
    onPlaneChange({ ...plane, [key]: Math.max(min, Math.min(max, v | 0)) })
  }

  const onAxisChange = (axis: 'x'|'y'|'z') => {
    // 切轴时，把 range 重置为该轴定义下的全范围
    let rangeAMax: number, rangeBMax: number
    if (axis === 'x') { rangeAMax = sectionSize.y - 1; rangeBMax = sectionSize.z - 1 }
    else if (axis === 'y') { rangeAMax = sectionSize.x - 1; rangeBMax = sectionSize.z - 1 }
    else { rangeAMax = sectionSize.x - 1; rangeBMax = sectionSize.y - 1 }
    onPlaneChange({
      axis, k: Math.max(0, Math.min(plane.k, (axis === 'x' ? sectionSize.x : axis === 'y' ? sectionSize.y : sectionSize.z) - 1)),
      rangeAMin: 0, rangeAMax,
      rangeBMin: 0, rangeBMax,
    })
  }

  return (
    <div className="rounded border border-amber-500/40 bg-amber-950/20 p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2 text-amber-200 font-semibold">
        <Scissors size={14} />
        <span>{t('vxl.editor.split.title')}</span>
      </div>

      <div>
        <span className="text-gray-400">{t('vxl.editor.split.axis')}</span>
        <div className="flex gap-1 mt-1">
          {(['x','y','z'] as const).map((ax) => (
            <button
              key={ax}
              type="button"
              onClick={() => onAxisChange(ax)}
              className={`flex-1 rounded px-2 py-1 text-[11px] ${
                plane.axis === ax ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >{ax.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-gray-400">{t('vxl.editor.split.position')}: {plane.k}</span>
        <input
          type="range" min={0} max={Math.max(0, mainMax - 1)}
          value={plane.k}
          onChange={(e) => updateInt('k', parseInt(e.target.value, 10), 0, mainMax - 1)}
          className="w-full mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-gray-400">{otherAxes.aLabel} min</span>
          <input
            type="number" min={0} max={otherAxes.aMax}
            value={plane.rangeAMin}
            onChange={(e) => updateInt('rangeAMin', parseInt(e.target.value, 10) || 0, 0, otherAxes.aMax)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-amber-400 font-mono text-[11px]"
          />
        </div>
        <div>
          <span className="text-gray-400">{otherAxes.aLabel} max</span>
          <input
            type="number" min={0} max={otherAxes.aMax}
            value={plane.rangeAMax}
            onChange={(e) => updateInt('rangeAMax', parseInt(e.target.value, 10) || 0, 0, otherAxes.aMax)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-amber-400 font-mono text-[11px]"
          />
        </div>
        <div>
          <span className="text-gray-400">{otherAxes.bLabel} min</span>
          <input
            type="number" min={0} max={otherAxes.bMax}
            value={plane.rangeBMin}
            onChange={(e) => updateInt('rangeBMin', parseInt(e.target.value, 10) || 0, 0, otherAxes.bMax)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-amber-400 font-mono text-[11px]"
          />
        </div>
        <div>
          <span className="text-gray-400">{otherAxes.bLabel} max</span>
          <input
            type="number" min={0} max={otherAxes.bMax}
            value={plane.rangeBMax}
            onChange={(e) => updateInt('rangeBMax', parseInt(e.target.value, 10) || 0, 0, otherAxes.bMax)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-amber-400 font-mono text-[11px]"
          />
        </div>
      </div>

      <div>
        <span className="text-gray-400">{t('vxl.editor.split.chosenSide')}</span>
        <div className="flex gap-1 mt-1">
          {(['A','B'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSideChange(s)}
              className={`flex-1 rounded px-2 py-1 text-[11px] ${
                side === s ? (s === 'A' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white') : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >
              {t(s === 'A' ? 'vxl.editor.split.sideA' : 'vxl.editor.split.sideB')}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-gray-500">{t('vxl.editor.split.sideHint')}</div>
      </div>

      <div className="rounded bg-gray-950/60 border border-gray-700 p-2 text-[11px] space-y-0.5">
        <div className="flex justify-between"><span className="text-gray-400">{t('vxl.editor.split.previewMoved')}</span><span className="font-mono text-gray-100">{result.moved.length}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">{t('vxl.editor.split.previewRemain')}</span><span className="font-mono text-gray-100">{result.remain.length}</span></div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400">{t('vxl.editor.split.previewComponents')}</span>
          <span className={`font-mono ${result.movedComponents === 1 ? 'text-emerald-300' : 'text-red-400'}`}>{result.movedComponents}</span>
        </div>
        {result.ok ? (
          <div className="flex items-center gap-1 text-emerald-300 mt-1"><CheckCircle2 size={11} /><span>{t('vxl.editor.split.statusOk')}</span></div>
        ) : (
          <div className="flex items-center gap-1 text-red-400 mt-1"><AlertCircle size={11} /><span>{
            result.moved.length === 0
              ? t('vxl.editor.split.statusEmpty')
              : t('vxl.editor.split.statusNotConnected', { n: result.movedComponents })
          }</span></div>
        )}
      </div>

      <label className="block">
        <span className="text-gray-400">{t('vxl.editor.split.newName')}</span>
        <input
          type="text"
          value={newSectionName}
          onChange={(e) => onNewNameChange(e.target.value)}
          maxLength={15}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-amber-400 font-mono text-[11px]"
        />
        <span className="text-[10px] text-gray-500">{t('vxl.editor.split.newNameHint')}</span>
      </label>

      <div className="flex gap-1 pt-1">
        <button
          type="button"
          onClick={onExecute}
          disabled={!result.ok || newSectionName.trim() === ''}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-amber-600 px-2 py-1.5 text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Scissors size={12} />
          {t('vxl.editor.split.execute')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-1 rounded bg-gray-700 px-2 py-1.5 text-gray-100 hover:bg-gray-600"
        >
          <XIcon size={12} />
          {t('vxl.editor.split.cancel')}
        </button>
      </div>
    </div>
  )
}

export default SplitPanel
