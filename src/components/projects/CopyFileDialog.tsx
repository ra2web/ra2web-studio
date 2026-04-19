import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File as FileIcon, Folder, FolderOpen, Loader2, Package } from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'
import { isMixLikeFile } from '../../services/gameRes/patterns'
import type {
  ProjectDestinationTarget,
  ProjectTreeNode,
} from '../../types/studio'

/**
 * 复制文件对话框：用户从项目树里选一个目标位置（文件夹或顶层 MIX 文件），
 * 输入新文件名，确认后调用 `onConfirm(destination, newName)`。
 *
 * 关注点：
 * - 显示集：项目根 + 全部目录 + 顶层 MIX 文件（以 .mix/.mmx/.yro 为扩展）。普通非 MIX 文件不展示。
 * - 默认展开：项目根 + 选中节点的所有祖先。
 * - 文件名 input 默认填源文件 basename，可自由编辑。
 * - 实时校验：非空 / 不含路径分隔符 / 与源路径不同（仅 directory 分支） / 已知冲突列表（外部传入 existingPaths）。
 * - IME 友好：Enter 在拼音输入法组词期间不会误提交。
 */

export interface CopyFileDialogProps {
  open: boolean
  /** 项目名称（仅做展示用途；调用方负责把它放进最终的 ProjectDestinationTarget） */
  projectName: string
  /** 项目目录树；CopyFileDialog 自行过滤出目录 + MIX 顶层文件 */
  tree: ProjectTreeNode[]
  /** 待复制源文件的项目相对路径（例如 art/icons/foo.shp），用于显示 + same-path 校验 */
  sourceRelativePath: string
  /**
   * 已存在条目集合：检测目标位置（dir/path 或 mix/path）下是否已有同名文件。
   *  - 对 directory 分支：传项目内全部文件路径（normalize 后）以便实时检测目标 path 冲突
   *  - 对 mix 分支：传项目内全部 MIX 顶层条目集（key = `${owningMixPath}::${entryName.toLowerCase()}`）
   *  这两类均由 `MixEditor` 在打开对话框前一次性收集。
   */
  existingFilePaths: Set<string>
  existingMixEntries: Set<string>
  saving?: boolean
  onCancel: () => void
  onConfirm: (destination: ProjectDestinationTarget, newName: string) => void | Promise<void>
}

type SelectedDestination =
  | { kind: 'directory'; path: string }
  | { kind: 'mix'; mixPath: string }

const FILENAME_BAD_CHAR = /[\\/]/

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().trim()
}

/**
 * 把项目树过滤成「仅目录 + 顶层 MIX 文件」的子树。MIX 文件在树里作为可选叶子节点出现；
 * 其他非 MIX 文件直接剪掉。
 */
function pickDestinationNodes(nodes: ProjectTreeNode[]): ProjectTreeNode[] {
  const result: ProjectTreeNode[] = []
  for (const node of nodes) {
    if (node.kind === 'directory') {
      const children = pickDestinationNodes(node.children ?? [])
      result.push({ ...node, children })
      continue
    }
    if (node.kind === 'file' && node.extension && isMixLikeFile(`x.${node.extension}`)) {
      result.push({ ...node, children: undefined })
    }
  }
  return result
}

/** 收集源所在目录的所有祖先路径，作为初始展开集。 */
function collectAncestorPaths(sourcePath: string): string[] {
  const parts = sourcePath.split('/').filter(Boolean)
  parts.pop() // 去掉文件名本身
  const result: string[] = []
  let cursor = ''
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part
    result.push(cursor)
  }
  return result
}

const CopyFileDialog: React.FC<CopyFileDialogProps> = ({
  open,
  projectName,
  tree,
  sourceRelativePath,
  existingFilePaths,
  existingMixEntries,
  saving = false,
  onCancel,
  onConfirm,
}) => {
  const { t } = useLocale()
  const initialName = useMemo(() => basename(sourceRelativePath), [sourceRelativePath])
  const sourceParentPath = useMemo(() => {
    const slash = sourceRelativePath.lastIndexOf('/')
    return slash >= 0 ? sourceRelativePath.slice(0, slash) : ''
  }, [sourceRelativePath])

  const filteredTree = useMemo(() => pickDestinationNodes(tree), [tree])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // 默认目标 = 源文件所在目录（最常用的一种）；为空字符串即项目根
  const [destination, setDestination] = useState<SelectedDestination>(() => ({
    kind: 'directory',
    path: sourceParentPath,
  }))
  const [newName, setNewName] = useState<string>(initialName)

  // 重新打开时把状态恢复成默认（避免上次残留）
  useEffect(() => {
    if (!open) return
    setExpanded(new Set(['', ...collectAncestorPaths(sourceRelativePath)]))
    setDestination({ kind: 'directory', path: sourceParentPath })
    setNewName(initialName)
  }, [open, sourceRelativePath, sourceParentPath, initialName])

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
      // 选中文件名「主体」（不含扩展名），方便直接改名
      const dot = initialName.lastIndexOf('.')
      const end = dot > 0 ? dot : initialName.length
      try {
        inputRef.current?.setSelectionRange(0, end)
      } catch {
        // 部分输入类型不支持选择范围，忽略
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, initialName])

  const trimmedName = newName.trim()
  const validationError = useMemo<string | null>(() => {
    if (!trimmedName) return t('mixEditor.copyFile.errorEmpty')
    if (FILENAME_BAD_CHAR.test(trimmedName)) return t('mixEditor.copyFile.errorBadChar')

    if (destination.kind === 'directory') {
      const targetPath = destination.path
        ? `${destination.path}/${trimmedName}`
        : trimmedName
      if (normalizeForCompare(targetPath) === normalizeForCompare(sourceRelativePath)) {
        return t('mixEditor.copyFile.sameAsSource')
      }
      if (existingFilePaths.has(normalizeForCompare(targetPath))) {
        return t('mixEditor.copyFile.targetExists')
      }
    } else {
      const key = `${destination.mixPath}::${normalizeForCompare(trimmedName)}`
      if (existingMixEntries.has(key)) {
        return t('mixEditor.copyFile.targetExists')
      }
    }
    return null
  }, [
    destination,
    existingFilePaths,
    existingMixEntries,
    sourceRelativePath,
    t,
    trimmedName,
  ])

  const previewPath = useMemo(() => {
    if (!trimmedName) return null
    if (destination.kind === 'directory') {
      const dirPart = destination.path || t('mixEditor.copyFile.projectRoot')
      return `${dirPart}/${trimmedName}`
    }
    return `${destination.mixPath} :: ${trimmedName}`
  }, [destination, trimmedName, t])

  const canSubmit = !saving && validationError == null

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    const target: ProjectDestinationTarget =
      destination.kind === 'directory'
        ? { kind: 'directory', projectName, relativePath: destination.path }
        : {
            kind: 'mix',
            projectName,
            owningMixPath: destination.mixPath,
            containerChain: [],
          }
    await onConfirm(target, trimmedName)
  }, [canSubmit, destination, onConfirm, projectName, trimmedName])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // IME 组词期间的 Enter（keyCode 229 / nativeEvent.isComposing）不应触发提交
      if (event.key === 'Enter') {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return
        event.preventDefault()
        void handleSubmit()
      } else if (event.key === 'Escape') {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return
        event.preventDefault()
        if (!saving) onCancel()
      }
    },
    [handleSubmit, onCancel, saving],
  )

  // 全局 Esc：在对话框打开期间，按 Esc 取消（同样跳过 IME 状态）
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.isComposing || event.keyCode === 229) return
      if (saving) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, open, saving])

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  if (!open) return null

  const isSelectedDirectory = (path: string) =>
    destination.kind === 'directory' && destination.path === path
  const isSelectedMix = (path: string) =>
    destination.kind === 'mix' && destination.mixPath === path

  // 节点行渲染，支持递归。根节点（path==''）在 renderRoot 单独画。
  const renderNodeRow = (node: ProjectTreeNode, depth: number): React.ReactNode => {
    const indent = 8 + depth * 14
    if (node.kind === 'directory') {
      const isExpanded = expanded.has(node.path)
      const hasChildren = (node.children?.length ?? 0) > 0
      const selected = isSelectedDirectory(node.path)
      return (
        <React.Fragment key={`d:${node.path}`}>
          <div
            className={`flex items-center gap-1 cursor-pointer px-2 py-1 text-xs ${
              selected ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700'
            }`}
            style={{ paddingLeft: indent }}
            onClick={() => setDestination({ kind: 'directory', path: node.path })}
            onDoubleClick={() => toggleExpand(node.path)}
          >
            <button
              type="button"
              className="inline-flex items-center justify-center w-4 h-4 text-gray-400"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(node.path)
              }}
              aria-label={isExpanded ? t('mixEditor.copyFile.collapse') : t('mixEditor.copyFile.expand')}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
              ) : null}
            </button>
            {isExpanded
              ? <FolderOpen size={14} className={selected ? 'text-white' : 'text-amber-300'} />
              : <Folder size={14} className={selected ? 'text-white' : 'text-amber-300'} />}
            <span className="truncate">{node.name}</span>
          </div>
          {isExpanded && node.children?.map((child) => renderNodeRow(child, depth + 1))}
        </React.Fragment>
      )
    }
    // mix 文件节点
    const selected = isSelectedMix(node.path)
    return (
      <div
        key={`m:${node.path}`}
        className={`flex items-center gap-1 cursor-pointer px-2 py-1 text-xs ${
          selected ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700'
        }`}
        style={{ paddingLeft: indent }}
        onClick={() => setDestination({ kind: 'mix', mixPath: node.path })}
      >
        <span className="inline-block w-4" />
        <Package size={14} className={selected ? 'text-white' : 'text-cyan-300'} />
        <span className="truncate">{node.name}</span>
      </div>
    )
  }

  const rootSelected = isSelectedDirectory('')
  const rootExpanded = expanded.has('')

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-2xl rounded border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-700 px-4 py-3">
          <h3 className="text-base font-semibold text-white">
            {t('mixEditor.copyFile.title')}
          </h3>
          <div className="mt-1 text-[11px] text-gray-400 truncate" title={sourceRelativePath}>
            {t('mixEditor.copyFile.sourceLabel')}: <span className="text-gray-200">{sourceRelativePath}</span>
          </div>
        </div>

        {/* Body: 左侧目标树 + 右侧文件名 */}
        <div className="flex min-h-[20rem]">
          <div className="w-1/2 border-r border-gray-700 flex flex-col">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-400">
              {t('mixEditor.copyFile.targetTreeLabel')}
            </div>
            <div className="flex-1 overflow-y-auto py-1" data-testid="copy-dialog-tree">
              {/* 项目根节点 */}
              <div
                className={`flex items-center gap-1 cursor-pointer px-2 py-1 text-xs ${
                  rootSelected ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700'
                }`}
                style={{ paddingLeft: 8 }}
                onClick={() => setDestination({ kind: 'directory', path: '' })}
                onDoubleClick={() => toggleExpand('')}
              >
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-4 h-4 text-gray-400"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpand('')
                  }}
                  aria-label={rootExpanded ? t('mixEditor.copyFile.collapse') : t('mixEditor.copyFile.expand')}
                >
                  {filteredTree.length > 0
                    ? (rootExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                    : null}
                </button>
                {rootExpanded
                  ? <FolderOpen size={14} className={rootSelected ? 'text-white' : 'text-amber-300'} />
                  : <Folder size={14} className={rootSelected ? 'text-white' : 'text-amber-300'} />}
                <span className="truncate">{t('mixEditor.copyFile.projectRoot')}</span>
              </div>
              {rootExpanded && filteredTree.map((node) => renderNodeRow(node, 1))}
              {filteredTree.length === 0 && rootExpanded && (
                <div className="px-3 py-2 text-[11px] text-gray-500">
                  {t('mixEditor.copyFile.noSubFolders')}
                </div>
              )}
            </div>
          </div>

          <div className="w-1/2 px-4 py-3 flex flex-col gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-gray-400">
                {t('mixEditor.copyFile.newNameLabel')}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={initialName}
                disabled={saving}
                className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-400 disabled:opacity-50"
              />
            </label>

            <div className="rounded border border-gray-700 bg-gray-950/40 px-3 py-2 text-[11px]">
              <div className="text-gray-400">{t('mixEditor.copyFile.previewLabel')}</div>
              <div className="mt-1 flex items-start gap-1 text-gray-200 break-all">
                {destination.kind === 'directory' ? (
                  <FileIcon size={12} className="mt-0.5 flex-shrink-0 text-gray-400" />
                ) : (
                  <Package size={12} className="mt-0.5 flex-shrink-0 text-cyan-300" />
                )}
                <span>{previewPath ?? '—'}</span>
              </div>
            </div>

            {validationError && (
              <div className="rounded border border-red-500/40 bg-red-900/30 px-3 py-1.5 text-xs text-red-200">
                {validationError}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-700 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-600 disabled:opacity-50"
          >
            {t('mixEditor.copyFile.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {t('mixEditor.copyFile.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CopyFileDialog
