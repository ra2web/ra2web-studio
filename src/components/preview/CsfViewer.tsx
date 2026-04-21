import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import {
  CsfEntry,
  CsfFile,
  CsfLanguage,
  csfLanguageName,
  type CsfDraft,
} from '../../data/CsfFile'
import { DataStream } from '../../data/DataStream'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

/**
 * CSF 字符串表查看器 / 编辑器。
 *
 * 兼容两种使用方式：
 * 1. 只读（外部不传 draft）：自己解析并展示，与原行为一致
 * 2. 可编辑（外部传 draft + onDraftChange + readOnly=false）：渲染可双击行内编辑的表格 +
 *    顶部工具栏（新增/删除/语言/版本），编辑期不重新解析（draft 由父组件维护）
 */

interface CsfViewerProps {
  selectedFile?: string
  mixFiles?: Array<{ file: File; info: any }>
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
  /** 外部维护的可写 draft；存在时优先使用，关掉本地 parse 路径 */
  draft?: CsfDraft | null
  /** draft 变更回调（增/删/改 entry、改语言/版本时调用） */
  onDraftChange?: (next: CsfDraft) => void
  /** 父组件强制 loading 显示（例如读 SHP 字节中） */
  loadingOverride?: boolean
  /** 父组件强制错误显示 */
  errorOverride?: string | null
  /** 只读模式（即便 draft 存在也不响应编辑） */
  readOnly?: boolean
}

// CsfLanguage 的可选项（按显示顺序）
const LANGUAGE_OPTIONS: CsfLanguage[] = [
  CsfLanguage.EnglishUS,
  CsfLanguage.EnglishUK,
  CsfLanguage.German,
  CsfLanguage.French,
  CsfLanguage.Spanish,
  CsfLanguage.Italian,
  CsfLanguage.Japanese,
  CsfLanguage.Jabberwockie,
  CsfLanguage.Korean,
  CsfLanguage.Unknown,
  CsfLanguage.ChineseCN,
  CsfLanguage.ChineseTW,
]

type EditingState =
  | null
  | { rowIndex: number; column: 'key'; draftValue: string }
  | { rowIndex: number; column: 'value'; draftValue: string }
  | { rowIndex: number; column: 'extra'; draftValue: string }

const CsfViewer: React.FC<CsfViewerProps> = ({
  selectedFile,
  mixFiles,
  target,
  draft,
  onDraftChange,
  loadingOverride,
  errorOverride,
  readOnly,
}) => {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [csfFile, setCsfFile] = useState<CsfFile | null>(null)

  const isEditable = !!draft && !!onDraftChange && !readOnly

  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  // 只读路径：自己解析。draft 模式下跳过这条路径，避免与父组件的 session 双源数据。
  useEffect(() => {
    if (draft) return // 父组件接管，不再自己 parse
    let cancelled = false
    async function loadCsf() {
      setLoading(true)
      setError(null)
      setCsfFile(null)
      try {
        if (!source.resolved) return
        const bytes = await source.resolved.readBytes()
        const buffer = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buffer).set(bytes)
        const vf = new VirtualFile(new DataStream(buffer), source.resolved.name)
        const parsed = CsfFile.fromVirtualFile(vf)
        if (!cancelled) setCsfFile(parsed)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to parse CSF')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (source.resolved) {
      void loadCsf()
    }
    return () => {
      cancelled = true
    }
  }, [draft, source.resolved])

  // ---------- 渲染要用的"统一视图"：draft 模式 vs 只读模式 ----------

  const entries: CsfEntry[] = draft ? draft.entries : (csfFile?.entries ?? [])
  const version = draft ? draft.version : (csfFile?.version ?? 0)
  const language = draft ? draft.language : (csfFile?.language ?? CsfLanguage.Unknown)
  const totalDeclared = draft ? draft.entries.length : (csfFile?.stats.declaredLabels ?? 0)
  const totalParsed = draft ? draft.entries.length : (csfFile?.stats.parsedLabels ?? 0)

  // ---------- 选中（只在编辑模式下用） ----------
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  // entries 引用变化时，selected 索引可能失效；简单做法：清空
  useEffect(() => {
    setSelected(new Set())
  }, [draft?.entries])

  // ---------- 行内编辑 ----------
  const [editing, setEditing] = useState<EditingState>(null)
  const editingInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const beginEdit = useCallback(
    (rowIndex: number, column: 'key' | 'value' | 'extra', initial: string) => {
      if (!isEditable) return
      setEditing({ rowIndex, column, draftValue: initial } as EditingState)
    },
    [isEditable],
  )

  // 仅在"开始编辑某一格"时 focus + select 一次。
  // 注意：依赖必须是"哪一格在编辑"的稳定 key（rowIndex + column），
  // 而不是整个 editing 对象——否则用户每输入一个字符 draftValue 变化触发对象引用更新，
  // useEffect 会重跑 select() 把已输入文字整段选中，下一个键就把它替换掉，造成"输完就被清空"的体感。
  const editingCellKey = editing ? `${editing.rowIndex}:${editing.column}` : null
  useEffect(() => {
    if (!editingCellKey) return
    const id = window.setTimeout(() => {
      editingInputRef.current?.focus()
      try {
        ;(editingInputRef.current as HTMLInputElement | null)?.select?.()
      } catch {
        /* select 不支持时忽略 */
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [editingCellKey])

  const cancelEdit = useCallback(() => setEditing(null), [])

  // 校验 key 重复（不区分大小写）
  const isDuplicateKey = useCallback(
    (keyUpper: string, exceptIndex: number): boolean => {
      for (let i = 0; i < entries.length; i++) {
        if (i === exceptIndex) continue
        if (entries[i].key.toUpperCase() === keyUpper) return true
      }
      return false
    },
    [entries],
  )

  // 提交编辑：写入 draft
  const commitEdit = useCallback(() => {
    if (!editing || !draft || !onDraftChange) return
    const { rowIndex, column, draftValue } = editing
    if (rowIndex < 0 || rowIndex >= entries.length) {
      setEditing(null)
      return
    }
    if (column === 'key') {
      const upper = draftValue.trim().toUpperCase()
      if (!upper) return // 空 key 阻止提交，input 红框已显示
      if (isDuplicateKey(upper, rowIndex)) return // 重复 key 阻止提交
      const nextEntries = entries.map((entry, i) =>
        i === rowIndex ? { ...entry, key: upper } : entry,
      )
      onDraftChange({ ...draft, entries: nextEntries })
    } else if (column === 'value') {
      const nextEntries = entries.map((entry, i) =>
        i === rowIndex ? { ...entry, value: draftValue } : entry,
      )
      onDraftChange({ ...draft, entries: nextEntries })
    } else {
      // extra
      const nextEntries = entries.map((entry, i) => {
        if (i !== rowIndex) return entry
        const trimmed = draftValue
        if (trimmed.length === 0) {
          // 空 → 移除 extraValue 字段
          const next = { ...entry }
          delete next.extraValue
          return next
        }
        return { ...entry, extraValue: trimmed }
      })
      onDraftChange({ ...draft, entries: nextEntries })
    }
    setEditing(null)
  }, [draft, editing, entries, isDuplicateKey, onDraftChange])

  // ---------- 工具栏：新增 / 删除 / 语言 / 版本 ----------

  const addEntry = useCallback(() => {
    if (!draft || !onDraftChange) return
    // 给新 entry 一个不重复的占位 key
    let baseKey = 'NEW_LABEL'
    let candidate = baseKey
    let counter = 1
    const existing = new Set(draft.entries.map((e) => e.key.toUpperCase()))
    while (existing.has(candidate)) {
      candidate = `${baseKey}_${counter++}`
    }
    const newEntry: CsfEntry = { key: candidate, value: '' }
    onDraftChange({ ...draft, entries: [...draft.entries, newEntry] })
    // 自动选中并进入新行 key 编辑
    const newIndex = draft.entries.length
    setEditing({ rowIndex: newIndex, column: 'key', draftValue: candidate })
  }, [draft, onDraftChange])

  const deleteSelected = useCallback(() => {
    if (!draft || !onDraftChange || selected.size === 0) return
    const nextEntries = draft.entries.filter((_, i) => !selected.has(i))
    onDraftChange({ ...draft, entries: nextEntries })
    setSelected(new Set())
  }, [draft, onDraftChange, selected])

  const changeLanguage = useCallback(
    (next: CsfLanguage) => {
      if (!draft || !onDraftChange) return
      onDraftChange({ ...draft, language: next })
    },
    [draft, onDraftChange],
  )

  const changeVersion = useCallback(
    (raw: string) => {
      if (!draft || !onDraftChange) return
      const parsed = parseInt(raw, 10)
      if (Number.isNaN(parsed)) return
      const clamped = Math.max(1, Math.min(9, parsed))
      onDraftChange({ ...draft, version: clamped })
    },
    [draft, onDraftChange],
  )

  // ---------- 过滤 ----------

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries.map((entry, originalIndex) => ({ entry, originalIndex }))
    return entries
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .filter(({ entry }) =>
        entry.key.toLowerCase().includes(q)
        || entry.value.toLowerCase().includes(q)
        || (entry.extraValue ?? '').toLowerCase().includes(q),
      )
  }, [entries, query])

  // ---------- 复制 ----------

  const copyEntries = async (entriesToCopy: CsfEntry[]) => {
    const text = entriesToCopy
      .map((entry) =>
        entry.extraValue
          ? `${entry.key}=${entry.value}\n  [extra] ${entry.extraValue}`
          : `${entry.key}=${entry.value}`,
      )
      .join('\n')
    await navigator.clipboard.writeText(text)
  }

  // ---------- IME 友好的 keydown ----------

  const handleEditKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // 拼音输入法转汉字时按 Enter 不应提交对话
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelEdit()
        return
      }
      if (event.key === 'Enter') {
        // textarea：单 Enter 换行，Ctrl/Cmd+Enter 提交
        if (event.currentTarget.tagName === 'TEXTAREA') {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            commitEdit()
          }
          return
        }
        // input：Enter 提交
        event.preventDefault()
        commitEdit()
      }
    },
    [cancelEdit, commitEdit],
  )

  // ---------- 早返回 ----------

  const effectiveLoading = loadingOverride ?? loading
  const effectiveError = errorOverride ?? error

  if (effectiveLoading) {
    return <div className="h-full w-full flex items-center justify-center text-gray-400">{t('csf.loading')}</div>
  }
  if (effectiveError) {
    return (
      <div className="p-3 text-sm text-red-400">
        <div>{t('csf.parseFailed')}{effectiveError}</div>
        <div className="mt-2 text-xs text-gray-400">{t('csf.hexViewHint')}</div>
      </div>
    )
  }
  if (!draft && !csfFile) {
    return <div className="h-full w-full flex items-center justify-center text-gray-500">{t('csf.noContent')}</div>
  }

  // ---------- 渲染 ----------

  const dirtyCount = isEditable && draft && csfFile ? draft.entries.length - csfFile.entries.length : 0

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* 顶部条：信息 + 搜索 + 复制 */}
      <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-300 flex items-center gap-2 flex-wrap">
        <span>{t('csf.csfStringTable')}</span>
        <span className="text-gray-500">
          v{version} · lang: {csfLanguageName(language)} · labels: {totalParsed}/{totalDeclared}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            className="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded outline-none"
            placeholder={t('csf.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            onClick={() => copyEntries(entries).catch(() => {})}
            type="button"
          >
            {t('csf.copyAll')}
          </button>
          <button
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            onClick={() => copyEntries(filteredEntries.map((f) => f.entry)).catch(() => {})}
            type="button"
          >
            {t('csf.copyFiltered')}
          </button>
        </div>
      </div>

      {/* 编辑工具栏（仅可编辑模式） */}
      {isEditable && draft && (
        <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-200 flex items-center gap-2 flex-wrap bg-gray-850">
          <button
            type="button"
            onClick={addEntry}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white"
            title={t('csf.editor.addRow')}
          >
            <Plus size={12} />
            {t('csf.editor.addRow')}
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('csf.editor.deleteRow')}
          >
            <Trash2 size={12} />
            {t('csf.editor.deleteRow')}
            {selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <span className="text-gray-500 mx-1">|</span>
          <label className="inline-flex items-center gap-1">
            <span className="text-gray-400">{t('csf.editor.language')}</span>
            <select
              className="bg-gray-700 text-gray-100 text-xs px-1.5 py-0.5 rounded outline-none"
              value={language}
              onChange={(e) => changeLanguage(parseInt(e.target.value, 10) as CsfLanguage)}
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>
                  {csfLanguageName(lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-1">
            <span className="text-gray-400">{t('csf.editor.version')}</span>
            <input
              type="number"
              min={1}
              max={9}
              value={version}
              onChange={(e) => changeVersion(e.target.value)}
              className="w-12 bg-gray-700 text-gray-100 text-xs px-1.5 py-0.5 rounded outline-none"
            />
          </label>
          <span className="ml-auto text-gray-500 text-[11px]">{t('csf.editor.editingHint')}</span>
        </div>
      )}

      {/* 计数 */}
      <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-800 flex items-center gap-2">
        <span>{t('csf.showingCount', { count: String(filteredEntries.length) })}</span>
        {isEditable && dirtyCount !== 0 && (
          <span className="text-amber-300">{t('csf.editor.dirtyCount', { count: String(dirtyCount) })}</span>
        )}
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs text-gray-200">
          <thead className="sticky top-0 bg-gray-800">
            <tr className="text-left border-b border-gray-700">
              {isEditable && <th className="px-2 py-2 w-8"></th>}
              <th className="px-2 py-2 w-12 text-gray-400">#</th>
              <th className="px-2 py-2 w-1/3 text-gray-400">{t('csf.editor.keyColumn')}</th>
              <th className="px-2 py-2 text-gray-400">{t('csf.editor.valueColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={isEditable ? 4 : 3} className="px-3 py-4 text-gray-500">
                  {t('csf.noMatches')}
                </td>
              </tr>
            ) : (
              filteredEntries.map(({ entry, originalIndex }) => {
                const isEditingKey =
                  isEditable && editing?.rowIndex === originalIndex && editing.column === 'key'
                const isEditingValue =
                  isEditable && editing?.rowIndex === originalIndex && editing.column === 'value'
                const isEditingExtra =
                  isEditable && editing?.rowIndex === originalIndex && editing.column === 'extra'

                // Key 校验状态
                const keyDraft = isEditingKey ? editing!.draftValue.trim().toUpperCase() : ''
                const keyEmpty = isEditingKey && keyDraft.length === 0
                const keyDup = isEditingKey && !keyEmpty && isDuplicateKey(keyDraft, originalIndex)
                const keyInvalid = keyEmpty || keyDup

                return (
                  <tr key={`${entry.key}-${originalIndex}`} className="border-b border-gray-800 align-top">
                    {isEditable && (
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selected.has(originalIndex)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(originalIndex)
                              else next.delete(originalIndex)
                              return next
                            })
                          }}
                        />
                      </td>
                    )}
                    <td className="px-2 py-1 text-gray-500">{originalIndex + 1}</td>
                    <td className="px-2 py-1 font-mono break-all">
                      {isEditingKey ? (
                        <div>
                          <input
                            ref={(el) => { editingInputRef.current = el }}
                            type="text"
                            value={editing!.draftValue}
                            onChange={(e) =>
                              setEditing({ ...editing!, draftValue: e.target.value } as EditingState)
                            }
                            onKeyDown={handleEditKeyDown}
                            onBlur={commitEdit}
                            className={`w-full bg-gray-950 px-1.5 py-1 text-gray-100 outline-none rounded border ${
                              keyInvalid ? 'border-red-500' : 'border-blue-500'
                            }`}
                          />
                          {keyEmpty && (
                            <div className="text-[10px] text-red-300 mt-0.5">{t('csf.editor.keyEmpty')}</div>
                          )}
                          {keyDup && (
                            <div className="text-[10px] text-red-300 mt-0.5">{t('csf.editor.keyDuplicate')}</div>
                          )}
                        </div>
                      ) : (
                        <div
                          onDoubleClick={() => beginEdit(originalIndex, 'key', entry.key)}
                          className={isEditable ? 'cursor-text hover:bg-gray-800 -mx-1 px-1 rounded' : ''}
                          title={isEditable ? t('csf.editor.editingHint') : undefined}
                        >
                          {entry.key}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-pre-wrap break-words">
                      {isEditingValue ? (
                        <textarea
                          ref={(el) => { editingInputRef.current = el }}
                          value={editing!.draftValue}
                          onChange={(e) =>
                            setEditing({ ...editing!, draftValue: e.target.value } as EditingState)
                          }
                          onKeyDown={handleEditKeyDown}
                          onBlur={commitEdit}
                          rows={3}
                          className="w-full bg-gray-950 px-1.5 py-1 text-gray-100 outline-none rounded border border-blue-500 resize-y"
                        />
                      ) : (
                        <div
                          onDoubleClick={() => beginEdit(originalIndex, 'value', entry.value)}
                          className={isEditable ? 'cursor-text hover:bg-gray-800 -mx-1 px-1 rounded' : ''}
                          title={isEditable ? t('csf.editor.editingHint') : undefined}
                        >
                          {entry.value || (isEditable ? <span className="text-gray-600 italic">(empty)</span> : '')}
                        </div>
                      )}

                      {/* extraValue 行 */}
                      {(entry.extraValue !== undefined || (isEditable && isEditingExtra)) && (
                        <div className="mt-1">
                          {isEditingExtra ? (
                            <input
                              ref={(el) => { editingInputRef.current = el }}
                              type="text"
                              value={editing!.draftValue}
                              onChange={(e) =>
                                setEditing({ ...editing!, draftValue: e.target.value } as EditingState)
                              }
                              onKeyDown={handleEditKeyDown}
                              onBlur={commitEdit}
                              placeholder={t('csf.editor.extraColumn')}
                              className="w-full bg-gray-950 px-1.5 py-1 text-[11px] text-gray-300 outline-none rounded border border-blue-500"
                            />
                          ) : (
                            <div
                              onDoubleClick={() => beginEdit(originalIndex, 'extra', entry.extraValue ?? '')}
                              className={`text-[11px] text-gray-500 ${
                                isEditable ? 'cursor-text hover:bg-gray-800 -mx-1 px-1 rounded' : ''
                              }`}
                              title={isEditable ? t('csf.editor.editingHint') : undefined}
                            >
                              [extra] {entry.extraValue}
                            </div>
                          )}
                        </div>
                      )}
                      {isEditable && entry.extraValue === undefined && !isEditingExtra && (
                        <button
                          type="button"
                          className="mt-1 text-[10px] text-gray-600 hover:text-gray-400"
                          onClick={() => beginEdit(originalIndex, 'extra', '')}
                        >
                          + {t('csf.editor.extraColumn')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default CsfViewer
