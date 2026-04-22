import React, { useMemo } from 'react'
import { Boxes, Check, X as XIcon } from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'
import type { ShapeKind, ShapeParams } from '../../services/vxl/VxlShapeBuilder'
import { countOverlaps, shapeToVoxels } from '../../services/vxl/VxlShapeBuilder'
import type { Section } from '../../data/vxl/Section'
import { getVoxelAt } from '../../services/vxl/VxlOps'

/**
 * 形状参数 + 实时预览 + 生成 / 取消按钮。
 *
 * 这个面板是「受控组件」：所有 ShapeParams 由父级（VxlEditor）持有，本组件只负责 UI 与
 * 预览统计；onParamsChange 把局部修改 emit 出去，父级把 ghost 同步给 VxlSceneRenderer。
 */

export interface ShapePanelProps {
  section: Section // 用来 clamp 起点 + 检测重叠
  params: ShapeParams
  brushColorIndex: number
  brushColorCss: string
  onParamsChange: (next: ShapeParams) => void
  onCommit: () => void
  onCancel: () => void
}

const KIND_OPTIONS = [
  { value: 'box' as ShapeKind, labelKey: 'vxl.editor.shape.kindBox' as const },
  { value: 'sphere' as ShapeKind, labelKey: 'vxl.editor.shape.kindSphere' as const },
  { value: 'cylinder' as ShapeKind, labelKey: 'vxl.editor.shape.kindCylinder' as const },
] as const

const ShapePanel: React.FC<ShapePanelProps> = ({
  section, params, brushColorIndex, brushColorCss, onParamsChange, onCommit, onCancel,
}) => {
  const { t } = useLocale()

  const sectionSize = useMemo(() => ({ x: section.sizeX, y: section.sizeY, z: section.sizeZ }), [section])

  const voxels = useMemo(() => shapeToVoxels(params, sectionSize), [params, sectionSize])
  const overlap = useMemo(() => countOverlaps(voxels, (x, y, z) => getVoxelAt(section, x, y, z) !== null), [voxels, section])
  const newCount = voxels.length - overlap

  const update = <K extends keyof ShapeParams>(key: K, value: ShapeParams[K]) => {
    onParamsChange({ ...params, [key]: value })
  }
  const updateNumber = (key: 'x0'|'y0'|'z0'|'sx'|'sy'|'sz'|'wallThickness', value: number, min: number, max: number) => {
    const v = Math.max(min, Math.min(max, value | 0))
    onParamsChange({ ...params, [key]: v })
  }

  return (
    <div className="rounded border border-blue-500/40 bg-blue-950/20 p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2 text-blue-200 font-semibold">
        <Boxes size={14} />
        <span>{t('vxl.editor.shape.title')}</span>
      </div>

      <label className="block">
        <span className="text-gray-400">{t('vxl.editor.shape.kind')}</span>
        <select
          value={params.kind}
          onChange={(e) => update('kind', e.target.value as ShapeKind)}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none"
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
      </label>

      <div>
        <span className="text-gray-400">{t('vxl.editor.shape.origin')}</span>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(['x0', 'y0', 'z0'] as const).map((k) => {
            const max = (k === 'x0' ? sectionSize.x : k === 'y0' ? sectionSize.y : sectionSize.z) - 1
            return (
              <input
                key={k} type="number" min={-50} max={max + 50}
                value={params[k]}
                onChange={(e) => updateNumber(k, parseInt(e.target.value, 10) || 0, -50, max + 50)}
                className="rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-blue-400 font-mono text-[11px]"
              />
            )
          })}
        </div>
        <div className="mt-0.5 text-[10px] text-gray-500">x0 / y0 / z0</div>
      </div>

      <div>
        <span className="text-gray-400">{t('vxl.editor.shape.size')}</span>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {(['sx', 'sy', 'sz'] as const).map((k) => (
            <input
              key={k} type="number" min={1} max={255}
              value={params[k]}
              onChange={(e) => updateNumber(k, parseInt(e.target.value, 10) || 1, 1, 255)}
              className="rounded border border-gray-700 bg-gray-950 px-1 py-1 text-gray-100 outline-none focus:border-blue-400 font-mono text-[11px]"
            />
          ))}
        </div>
        <div className="mt-0.5 text-[10px] text-gray-500">sx / sy / sz</div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={params.hollow}
          onChange={(e) => update('hollow', e.target.checked)}
        />
        <span>{t('vxl.editor.shape.hollow')}</span>
      </label>

      {params.hollow && (
        <label className="block">
          <span className="text-gray-400">{t('vxl.editor.shape.wallThickness')}</span>
          <input
            type="number" min={1} max={32}
            value={params.wallThickness}
            onChange={(e) => updateNumber('wallThickness', parseInt(e.target.value, 10) || 1, 1, 32)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400 font-mono text-[11px]"
          />
        </label>
      )}

      {params.kind === 'cylinder' && (
        <label className="block">
          <span className="text-gray-400">{t('vxl.editor.shape.cylinderAxis')}</span>
          <select
            value={params.cylinderAxis}
            onChange={(e) => update('cylinderAxis', e.target.value as 'x'|'y'|'z')}
            className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none"
          >
            <option value="x">X</option>
            <option value="y">Y</option>
            <option value="z">Z</option>
          </select>
        </label>
      )}

      <div className="flex items-center gap-2 text-[11px] text-gray-300">
        <div className="h-4 w-4 rounded border border-gray-600" style={{ background: brushColorCss }} title={`#${brushColorIndex}`} />
        <span className="text-gray-500">{t('vxl.editor.shape.colorFromBrush')}</span>
      </div>

      <div className="rounded bg-gray-950/60 border border-gray-700 p-2 text-[11px] space-y-0.5">
        <div className="flex justify-between"><span className="text-gray-400">{t('vxl.editor.shape.previewTotal')}</span><span className="font-mono text-gray-100">{voxels.length}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">{t('vxl.editor.shape.previewNew')}</span><span className="font-mono text-emerald-300">{newCount}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">{t('vxl.editor.shape.previewOverlap')}</span><span className="font-mono text-amber-300">{overlap}</span></div>
      </div>

      <div className="flex gap-1 pt-1">
        <button
          type="button"
          onClick={onCommit}
          disabled={voxels.length === 0}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={12} />
          {t('vxl.editor.shape.commit')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-1 rounded bg-gray-700 px-2 py-1.5 text-gray-100 hover:bg-gray-600"
        >
          <XIcon size={12} />
          {t('vxl.editor.shape.cancel')}
        </button>
      </div>
    </div>
  )
}

export default ShapePanel
