import React, { useMemo } from 'react'
import { Plane, Plus, Trash2, Wand2 } from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'
import type { AnimMetadata, RotorAxis, RotorConfig } from '../../data/vxl/AnimMetadata'

/**
 * Rotors 面板：管理 AnimMetadata.rotors（直升机桨叶等持续旋转部件）。
 *
 * 受控组件：所有改动通过 onAnimChange 上抛，父级（VxlEditor）持有 anim state。
 * 当 gameAnimMode 关闭时配置仍可编辑，但 3D 视图不会展示旋转效果——切到 gameAnimMode 才看见。
 *
 * 启发式建议：扫所有 sections，名字含 BLADE/ROTOR/PROP 的预填一组默认 rotor（axis=z, speed=67）。
 */

export interface RotorsPanelProps {
  /** 当前 vxl 的所有 section name（用于下拉） */
  sectionNames: string[]
  anim: AnimMetadata
  onAnimChange: (next: AnimMetadata) => void
}

const HEURISTIC_PATTERN = /(BLADE|ROTOR|PROP)/i

const RotorsPanel: React.FC<RotorsPanelProps> = ({ sectionNames, anim, onAnimChange }) => {
  const { t } = useLocale()

  const usedNames = useMemo(() => new Set(anim.rotors.map((r) => r.sectionName)), [anim.rotors])

  const updateRow = (idx: number, patch: Partial<RotorConfig>) => {
    const next = anim.rotors.map((r, i) => i === idx ? { ...r, ...patch } : r)
    onAnimChange({ ...anim, rotors: next })
  }

  const addRow = () => {
    // 默认选第一个尚未占用的 section（或第一个 section 兜底）
    const candidate = sectionNames.find((n) => !usedNames.has(n)) ?? sectionNames[0] ?? ''
    const next: RotorConfig = {
      sectionName: candidate,
      axis: 'z',
      speedDegPerSec: 67,
      enabled: true,
    }
    onAnimChange({ ...anim, rotors: [...anim.rotors, next] })
  }

  const removeRow = (idx: number) => {
    onAnimChange({ ...anim, rotors: anim.rotors.filter((_, i) => i !== idx) })
  }

  const heuristicSuggest = () => {
    const suggested: RotorConfig[] = []
    const present = new Set(anim.rotors.map((r) => r.sectionName.toLowerCase()))
    for (const name of sectionNames) {
      if (!HEURISTIC_PATTERN.test(name)) continue
      if (present.has(name.toLowerCase())) continue
      suggested.push({
        sectionName: name,
        axis: 'z',
        speedDegPerSec: 67,
        enabled: true,
      })
    }
    if (suggested.length === 0) return
    onAnimChange({ ...anim, rotors: [...anim.rotors, ...suggested] })
  }

  return (
    <div className="rounded border border-cyan-500/40 bg-cyan-950/20 p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2 text-cyan-200 font-semibold">
        <Plane size={14} />
        <span>{t('vxl.editor.rotors.title')}</span>
        <button
          type="button"
          onClick={heuristicSuggest}
          className="ml-auto inline-flex items-center gap-1 rounded bg-cyan-700 px-2 py-0.5 text-[10px] text-white hover:bg-cyan-600"
          title={t('vxl.editor.rotors.heuristicHint')}
        >
          <Wand2 size={10} />
          {t('vxl.editor.rotors.heuristic')}
        </button>
      </div>

      <div className="text-[10px] text-gray-500">{t('vxl.editor.rotors.intro')}</div>

      {anim.rotors.length === 0 ? (
        <div className="rounded bg-gray-950/60 border border-gray-700 px-2 py-3 text-center text-[11px] text-gray-500">
          {t('vxl.editor.rotors.empty')}
        </div>
      ) : (
        <div className="space-y-1">
          {anim.rotors.map((row, idx) => (
            <div key={idx} className="rounded border border-gray-700 bg-gray-950/60 p-2 space-y-1">
              <div className="flex items-center gap-1">
                <select
                  value={row.sectionName}
                  onChange={(e) => updateRow(idx, { sectionName: e.target.value })}
                  className="flex-1 rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-cyan-400 font-mono"
                >
                  {sectionNames.includes(row.sectionName) ? null : (
                    <option value={row.sectionName}>{row.sectionName} ({t('vxl.editor.rotors.missing')})</option>
                  )}
                  {sectionNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-1 text-[10px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateRow(idx, { enabled: e.target.checked })}
                  />
                  {t('vxl.editor.rotors.enabled')}
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="rounded p-1 text-red-400 hover:bg-red-900/40"
                  title={t('vxl.editor.rotors.delete')}
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-gray-400 w-8">{t('vxl.editor.rotors.axis')}</span>
                {(['x', 'y', 'z'] as const).map((ax) => (
                  <button
                    key={ax}
                    type="button"
                    onClick={() => updateRow(idx, { axis: ax as RotorAxis })}
                    className={`rounded px-2 py-0.5 ${row.axis === ax ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >{ax.toUpperCase()}</button>
                ))}
                <span className="text-gray-400 ml-2 w-12">{t('vxl.editor.rotors.speed')}</span>
                <input
                  type="number"
                  step={1}
                  value={row.speedDegPerSec}
                  onChange={(e) => updateRow(idx, { speedDegPerSec: parseFloat(e.target.value) || 0 })}
                  className="flex-1 rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-[11px] text-gray-100 outline-none focus:border-cyan-400 font-mono"
                />
                <span className="text-[9px] text-gray-500">deg/s</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        disabled={sectionNames.length === 0}
        className="w-full inline-flex items-center justify-center gap-1 rounded bg-cyan-700 px-2 py-1.5 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={12} />
        {t('vxl.editor.rotors.add')}
      </button>
    </div>
  )
}

export default RotorsPanel
