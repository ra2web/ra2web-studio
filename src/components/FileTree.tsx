import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, File, Folder } from 'lucide-react'
import { useLocale } from '../i18n/LocaleContext'
import { MixFileData } from './MixEditor'
import SearchableSelect from './common/SearchableSelect'

type SortColumn = 'filename' | 'type' | 'size'
type SortDirection = 'asc' | 'desc'

interface FileItem {
  filename: string
  extension: string
  length: number
  path: string
  mixName: string
  isMixFile: boolean
}

interface FileTreeProps {
  title: string
  description?: string
  mixFiles: MixFileData[]
  activeMixName: string | null
  onActiveMixChange: (mixName: string) => void
  selectedFile: string | null
  onFileSelect: (file: string) => void
  container?: { name: string; info: any }
  navPrefix?: string
  onDrillDown?: (filename: string) => void
  onNavigateUp?: () => void
  emptyText: string
  searchPlaceholder?: string
}

const FileTree: React.FC<FileTreeProps> = ({
  title,
  description,
  mixFiles,
  activeMixName,
  onActiveMixChange,
  selectedFile,
  onFileSelect,
  container,
  navPrefix,
  onDrillDown,
  onNavigateUp,
  emptyText,
  searchPlaceholder,
}) => {
  const { t } = useLocale()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortState, setSortState] = useState<{ column: SortColumn | null; direction: SortDirection | null }>({
    column: null,
    direction: null,
  })

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getFileTypeName = (extension: string): string => {
    const ext = (extension || '').trim().toLowerCase()
    return ext || '-'
  }

  const nextSortState = (column: SortColumn) => {
    setSortState((prev) => {
      if (prev.column !== column) {
        return { column, direction: 'asc' }
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' }
      }
      if (prev.direction === 'desc') {
        return { column: null, direction: null }
      }
      return { column, direction: 'asc' }
    })
  }

  const getSortIndicator = (column: SortColumn): React.ReactNode => {
    const baseClass = 'inline-block ml-1 align-middle text-gray-400'
    if (sortState.column !== column || !sortState.direction) {
      return <ArrowUpDown size={12} className={`${baseClass} opacity-60`} aria-hidden="true" />
    }
    if (sortState.direction === 'asc') {
      return <ArrowUp size={12} className={baseClass} aria-hidden="true" />
    }
    return <ArrowDown size={12} className={baseClass} aria-hidden="true" />
  }

  const activeMix = useMemo(() => {
    if (!mixFiles.length) return null
    if (!activeMixName) return mixFiles[0]
    return mixFiles.find((mix) => mix.info.name === activeMixName) ?? mixFiles[0]
  }, [activeMixName, mixFiles])

  const fileList = useMemo<FileItem[]>(() => {
    if (!container && !activeMix) return []
    const resolvedContainer = container ?? (activeMix ? { name: activeMix.info.name, info: activeMix.info } : null)
    const prefix = navPrefix ? `${navPrefix}/` : resolvedContainer ? `${resolvedContainer.name}/` : ''
    if (!resolvedContainer) return []
    return resolvedContainer.info.files.map((file: any) => ({
      filename: file.filename,
      extension: file.extension,
      length: file.length,
      path: `${prefix}${file.filename}`,
      mixName: activeMix?.info.name ?? resolvedContainer.name,
      isMixFile: ['mix', 'mmx', 'yro'].includes(file.extension.toLowerCase()),
    }))
  }, [activeMix, container, navPrefix])

  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery])
  const filteredFileList = useMemo(() => {
    if (!normalizedSearchQuery) return fileList
    return fileList.filter((file) => {
      const haystack = `${file.filename} ${file.extension} ${file.path}`.toLowerCase()
      return haystack.includes(normalizedSearchQuery)
    })
  }, [fileList, normalizedSearchQuery])

  const sortedFileList = useMemo(() => {
    const { column, direction } = sortState
    if (!column || !direction) return filteredFileList
    const sorted = [...filteredFileList].sort((a, b) => {
      let result = 0
      if (column === 'filename') {
        result = a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' })
      } else if (column === 'type') {
        result = getFileTypeName(a.extension).localeCompare(getFileTypeName(b.extension), undefined, {
          sensitivity: 'base',
        })
      } else if (column === 'size') {
        result = a.length - b.length
      }
      if (result === 0) {
        result = a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' })
      }
      return direction === 'asc' ? result : -result
    })
    return sorted
  }, [filteredFileList, sortState])

  const activeMixOptions = useMemo(
    () => mixFiles.map((mix) => ({
      value: mix.info.name,
      label: mix.info.name,
    })),
    [mixFiles],
  )

  const activeMixValue = activeMix?.info.name ?? ''

  const renderFileRow = (file: FileItem, key: string) => {
    const isSelected = selectedFile === file.path
    return (
      <div
        key={key}
        data-context-kind="file-tree-row"
        data-file-path={file.path}
        data-is-mix-file={String(Boolean(file.isMixFile))}
        data-mix-name={file.mixName}
        className={`flex items-center hover:bg-gray-700 cursor-pointer border-b border-gray-800 ${
          isSelected ? 'bg-blue-600' : ''
        }`}
        onClick={() => onFileSelect(file.path)}
        onDoubleClick={() => {
          if (file.isMixFile) onDrillDown?.(file.filename)
        }}
      >
        <div className="flex-1 min-w-0 flex items-center px-2 py-1" style={{ minWidth: '175px' }}>
          {file.isMixFile ? (
            <Folder size={16} className="mr-2 flex-shrink-0" />
          ) : (
            <File size={16} className="mr-2 flex-shrink-0" />
          )}
          <span className="truncate text-sm" title={file.filename}>
            {file.filename}
          </span>
        </div>
        <div className="w-16 text-center text-xs text-gray-400 px-2 py-1" title={getFileTypeName(file.extension)}>
          {getFileTypeName(file.extension)}
        </div>
        <div className="w-20 text-right text-xs text-gray-400 px-2 py-1" title={`${file.length} ${t('fileTree.bytes')}`}>
          {formatFileSize(file.length)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 flex-shrink-0 border-b border-gray-700">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</div>
        {description && <div className="mt-1 text-xs text-gray-500">{description}</div>}
        <div className="mt-2">
          <input
            data-testid="file-tree-search-input"
            type="text"
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100"
            placeholder={searchPlaceholder ?? t('fileTree.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {mixFiles.length > 1 && (
          <div className="mt-2">
            <label className="text-xs text-gray-400 block mb-1">{t('fileTree.activeMixLabel')}</label>
            <SearchableSelect
              value={activeMixValue}
              options={activeMixOptions}
              onChange={(next) => {
                if (next) onActiveMixChange(next)
              }}
              triggerClassName="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-left text-gray-100 flex items-center gap-2"
              menuClassName="z-50 rounded border border-gray-600 bg-gray-700 shadow-xl"
              searchPlaceholder={t('fileTree.searchMixPlaceholder')}
              noResultsText={t('fileTree.noMatchMix')}
              footerHint=""
            />
          </div>
        )}
        {navPrefix && navPrefix.includes('/') && (
          <div className="mt-2 flex items-center gap-2">
            <div className="text-xs text-gray-400 truncate flex-1" title={navPrefix}>
              {t('fileTree.currentContainer')}：{navPrefix}
            </div>
            {onNavigateUp && (
              <button
                type="button"
                className="px-2 py-0.5 text-[11px] rounded border border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600"
                onClick={onNavigateUp}
              >
                {t('fileTree.backUp')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-800 border-b border-gray-700">
        <button
          type="button"
          className="flex-1 min-w-0 px-2 py-1 text-left hover:bg-gray-700/60 transition-colors"
          onClick={() => nextSortState('filename')}
          title={t('fileTree.sortHint', { col: t('fileTree.filename') })}
        >
          {t('fileTree.filename')} {getSortIndicator('filename')}
        </button>
        <button
          type="button"
          className="w-16 text-center px-2 py-1 hover:bg-gray-700/60 transition-colors"
          onClick={() => nextSortState('type')}
          title={t('fileTree.sortHint', { col: t('fileTree.type') })}
        >
          {t('fileTree.type')} {getSortIndicator('type')}
        </button>
        <button
          type="button"
          className="w-20 text-right px-2 py-1 hover:bg-gray-700/60 transition-colors"
          onClick={() => nextSortState('size')}
          title={t('fileTree.sortHint', { col: t('fileTree.size') })}
        >
          {t('fileTree.size')} {getSortIndicator('size')}
        </button>
      </div>

      <div className="text-sm flex-1 overflow-y-auto" data-context-kind="file-tree-empty">
        {fileList.length > 0 ? (
          sortedFileList.length > 0 ? (
            sortedFileList.map((file, index) => renderFileRow(file, `${file.path}-${index}`))
          ) : (
            <div className="px-3 py-3 text-xs text-gray-400">{t('fileTree.noMatchMaterial')}</div>
          )
        ) : (
          <div className="px-3 py-3 text-xs text-gray-400">{emptyText}</div>
        )}
      </div>
    </div>
  )
}

export default FileTree
