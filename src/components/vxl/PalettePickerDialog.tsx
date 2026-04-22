import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Database, FolderOpen, Loader2, Search, X } from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'

/**
 * 调色板选择器：从「当前项目文件」和「基座 MIX 调色板」中挑一个 .pal。
 * 由 MixEditor 注入两组路径 + 一个 loader，VxlEditor「替换调色板」按钮触发本对话框。
 *
 * 设计要点：
 * - 不再用任意磁盘文件作为来源，杜绝来历不明的调色板被引入。
 * - 项目文件优先于基座（前缀图标 + 分组标签），基座列表里 MIX 名作为前缀。
 * - 顶部搜索框做 fuzzy filter（按 path 子串匹配），支持上下键 / 回车 / Esc。
 */

export interface PaletteEntry {
  /** 'project' = 项目内 .pal；'mix' = 基座 MIX 内 .pal */
  source: 'project' | 'mix'
  /** 完整路径：项目模式下是 project-relative；mix 模式下是 "MIXNAME/inner/path.pal" */
  path: string
  /** 用于显示的简短文件名（去掉前缀路径） */
  basename: string
}

export interface PalettePickerDialogProps {
  open: boolean
  entries: PaletteEntry[]
  onCancel: () => void
  onPick: (entry: PaletteEntry) => void | Promise<void>
  loading?: boolean
}

const PalettePickerDialog: React.FC<PalettePickerDialogProps> = ({
  open,
  entries,
  onCancel,
  onPick,
  loading = false,
}) => {
  const { t } = useLocale()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      // 让对话框出场后再 focus，避免被外层 keydown 抢走第一帧
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.path.toLowerCase().includes(q) || e.basename.toLowerCase().includes(q))
  }, [entries, query])

  // 项目优先排序，组内按 path 字典序
  const sorted = useMemo(() => {
    const proj = filtered.filter((e) => e.source === 'project').sort((a, b) => a.path.localeCompare(b.path))
    const mix = filtered.filter((e) => e.source === 'mix').sort((a, b) => a.path.localeCompare(b.path))
    return [...proj, ...mix]
  }, [filtered])

  useEffect(() => {
    if (highlight >= sorted.length) setHighlight(Math.max(0, sorted.length - 1))
  }, [highlight, sorted.length])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(sorted.length - 1, h + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (sorted[highlight]) void onPick(sorted[highlight])
    }
  }

  if (!open) return null

  const ui = (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 px-4"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className="w-[640px] max-h-[80vh] flex flex-col rounded bg-gray-900 border border-gray-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
          <Database size={14} className="text-blue-300 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-gray-100 flex-1">{t('vxl.editor.palettePickerTitle')}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-gray-400 hover:bg-gray-800"
            aria-label="close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-800">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
              placeholder={t('vxl.editor.palettePickerSearch')}
              className="w-full rounded border border-gray-700 bg-gray-950 pl-7 pr-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-blue-400"
            />
          </div>
          <div className="mt-1 text-[10px] text-gray-500">
            {t('vxl.editor.palettePickerCount', { count: sorted.length })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-[12px] text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              {t('vxl.editor.palettePickerLoading')}
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-gray-500">
              {t('vxl.editor.palettePickerEmpty')}
            </div>
          ) : (
            <ul>
              {sorted.map((entry, idx) => {
                const isActive = idx === highlight
                return (
                  <li key={`${entry.source}:${entry.path}`}>
                    <button
                      type="button"
                      onClick={() => void onPick(entry)}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`w-full flex items-center gap-2 px-4 py-1.5 text-left text-[12px] ${
                        isActive ? 'bg-blue-600/40 text-white' : 'text-gray-200 hover:bg-gray-800'
                      }`}
                    >
                      {entry.source === 'project' ? (
                        <FolderOpen size={11} className="text-emerald-400 flex-shrink-0" />
                      ) : (
                        <Database size={11} className="text-blue-300 flex-shrink-0" />
                      )}
                      <span className="font-mono text-gray-100 truncate" title={entry.path}>{entry.basename}</span>
                      <span className="ml-auto text-[10px] text-gray-500 truncate" title={entry.path}>{entry.path}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-gray-700 text-[11px] text-gray-400">
          <span className="mr-auto">{t('vxl.editor.palettePickerHint')}</span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-gray-700 px-3 py-1 text-gray-100 hover:bg-gray-600"
          >
            {t('vxl.editor.palettePickerCancel')}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return ui
  return createPortal(ui, document.body)
}

export default PalettePickerDialog
