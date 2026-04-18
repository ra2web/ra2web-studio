import React, { useMemo, useState } from 'react'
import { Archive, ArrowUp, File, Folder } from 'lucide-react'
import type { MixFileInfo } from '../services/MixParser'
import { useLocale } from '../i18n/LocaleContext'

interface MixExplorerProps {
  mixPath: string
  navStack: Array<{ name: string; info: MixFileInfo }>
  selectedEntryName: string | null
  onSelectEntry: (entryName: string) => void
  onDrillDown: (entryName: string) => void
  onNavigateUp?: () => void
  onClose?: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const MixExplorer: React.FC<MixExplorerProps> = ({
  mixPath,
  navStack,
  selectedEntryName,
  onSelectEntry,
  onDrillDown,
  onNavigateUp,
  onClose,
}) => {
  const { t } = useLocale()
  const [searchQuery, setSearchQuery] = useState('')
  const currentContainer = navStack[navStack.length - 1] ?? null

  const visibleEntries = useMemo(() => {
    const files = currentContainer?.info.files ?? []
    const normalized = searchQuery.trim().toLowerCase()
    const filtered = normalized
      ? files.filter((entry) => `${entry.filename} ${entry.extension}`.toLowerCase().includes(normalized))
      : files
    return [...filtered].sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }))
  }, [currentContainer?.info.files, searchQuery])

  if (!currentContainer) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500">
        {t('mixEditor.projectEmptyDesc')}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col border-l border-gray-700 bg-gray-800/80">
      <div className="border-b border-gray-700 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">
              <Archive size={14} />
              <span>MIX Explorer</span>
            </div>
            <div className="mt-1 truncate text-sm text-gray-200" title={mixPath}>{mixPath}</div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateUp && (
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-700 p-1 text-gray-200 hover:bg-gray-600"
                onClick={onNavigateUp}
                title={t('fileTree.backUp')}
              >
                <ArrowUp size={14} />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600"
                onClick={onClose}
              >
                {t('common.close')}
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
          {navStack.map((node, index) => (
            <span key={`${node.name}-${index}`} className="flex items-center gap-1">
              <span>{node.name}</span>
              {index < navStack.length - 1 && <span>/</span>}
            </span>
          ))}
        </div>
        <div className="mt-2">
          <input
            type="text"
            className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('fileTree.searchMixPlaceholder')}
          />
        </div>
      </div>

      <div className="flex border-b border-gray-700 bg-gray-800 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <div className="flex-1 min-w-0 px-3 py-2 text-left">{t('fileTree.filename')}</div>
        <div className="w-16 px-2 py-2 text-center">{t('fileTree.type')}</div>
        <div className="w-20 px-3 py-2 text-right">{t('fileTree.size')}</div>
      </div>

      <div className="flex-1 overflow-y-auto text-sm" data-context-kind="file-tree-empty">
        {visibleEntries.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400">{t('fileTree.noMatchMaterial')}</div>
        ) : (
          visibleEntries.map((entry) => {
            const isMixFile = ['mix', 'mmx', 'yro'].includes(entry.extension.toLowerCase())
            const isSelected = selectedEntryName != null && entry.filename.toLowerCase() === selectedEntryName.toLowerCase()
            return (
              <div
                key={entry.filename}
                data-context-kind="file-tree-row"
                data-file-path={[mixPath, ...navStack.slice(1).map((node) => node.name), entry.filename].join('/')}
                data-is-mix-file={String(isMixFile)}
                className={`flex cursor-pointer items-center border-b border-gray-800 hover:bg-gray-700 ${
                  isSelected ? 'bg-blue-600' : ''
                }`}
                onClick={() => onSelectEntry(entry.filename)}
                onDoubleClick={() => {
                  if (isMixFile) onDrillDown(entry.filename)
                }}
              >
                <div className="flex flex-1 items-center gap-2 px-3 py-1.5">
                  {isMixFile ? (
                    <Folder size={15} className="flex-shrink-0 text-cyan-300" />
                  ) : (
                    <File size={15} className="flex-shrink-0 text-gray-300" />
                  )}
                  <span className="min-w-0 truncate">{entry.filename}</span>
                </div>
                <div className="w-16 px-2 py-1 text-center text-xs text-gray-400">{entry.extension || '-'}</div>
                <div className="w-20 px-3 py-1 text-right text-xs text-gray-400">{formatFileSize(entry.length)}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default MixExplorer
