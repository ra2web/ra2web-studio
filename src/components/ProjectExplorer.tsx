import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, Package } from 'lucide-react'
import { useLocale } from '../i18n/LocaleContext'
import type { ProjectTreeNode } from '../types/studio'
import { isMixLikeFile } from '../services/gameRes/patterns'

type FlattenedNode = {
  path: string
  name: string
  kind: 'file' | 'directory'
  depth: number
  extension?: string
  size: number
  childrenCount: number
}

interface ProjectExplorerProps {
  title: string
  description?: string
  projectName: string | null
  tree: ProjectTreeNode[]
  selectedPath: string | null
  onSelectPath: (path: string, kind: 'file' | 'directory') => void
  onOpenMix: (path: string) => void
  emptyText: string
  searchPlaceholder: string
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

function flattenTree(
  nodes: ProjectTreeNode[],
  expanded: Set<string>,
  depth = 0,
  output: FlattenedNode[] = [],
): FlattenedNode[] {
  for (const node of nodes) {
    output.push({
      path: node.path,
      name: node.name,
      kind: node.kind,
      depth,
      extension: node.extension,
      size: node.size,
      childrenCount: node.children?.length ?? 0,
    })
    if (node.kind === 'directory' && expanded.has(node.path)) {
      flattenTree(node.children ?? [], expanded, depth + 1, output)
    }
  }
  return output
}

function flattenAllNodes(nodes: ProjectTreeNode[], depth = 0, output: FlattenedNode[] = []): FlattenedNode[] {
  for (const node of nodes) {
    output.push({
      path: node.path,
      name: node.name,
      kind: node.kind,
      depth,
      extension: node.extension,
      size: node.size,
      childrenCount: node.children?.length ?? 0,
    })
    flattenAllNodes(node.children ?? [], depth + 1, output)
  }
  return output
}

const ProjectExplorer: React.FC<ProjectExplorerProps> = ({
  title,
  description,
  projectName,
  tree,
  selectedPath,
  onSelectPath,
  onOpenMix,
  emptyText,
  searchPlaceholder,
}) => {
  const { t } = useLocale()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    const defaults = new Set<string>()
    for (const node of tree) {
      if (node.kind === 'directory') defaults.add(node.path)
    }
    setExpandedPaths(defaults)
  }, [tree])

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visibleRows = useMemo(() => {
    if (normalizedQuery) {
      return flattenAllNodes(tree).filter((node) => (
        `${node.path} ${node.name} ${node.extension ?? ''}`.toLowerCase().includes(normalizedQuery)
      ))
    }
    return flattenTree(tree, expandedPaths)
  }, [expandedPaths, normalizedQuery, tree])

  const toggleDirectory = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-700 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
        {description && <div className="mt-1 text-xs text-gray-500">{description}</div>}
        <div className="mt-2">
          <input
            data-testid="project-tree-search-input"
            type="text"
            className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-100"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        {projectName && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/80 px-2 py-1 text-[11px] text-gray-400">
            <Package size={12} className="text-blue-300" />
            <span className="truncate">{projectName}</span>
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-700 bg-gray-800 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <div className="flex-1 min-w-0 px-3 py-2 text-left">{t('fileTree.filename')}</div>
        <div className="w-16 px-2 py-2 text-center">{t('fileTree.type')}</div>
        <div className="w-20 px-3 py-2 text-right">{t('fileTree.size')}</div>
      </div>

      <div className="flex-1 overflow-y-auto text-sm" data-context-kind="file-tree-empty">
        {visibleRows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400">{emptyText}</div>
        ) : (
          visibleRows.map((node) => {
            const isDirectory = node.kind === 'directory'
            const isSelected = selectedPath === node.path
            const paddingLeft = 12 + node.depth * 16
            const isMixFile = node.kind === 'file' && isMixLikeFile(node.path)
            const isExpanded = expandedPaths.has(node.path)

            return (
              <div
                key={node.path}
                data-context-kind="file-tree-row"
                data-file-path={node.path}
                data-is-mix-file={String(isMixFile)}
                className={`flex cursor-pointer items-center border-b border-gray-800 hover:bg-gray-700 ${
                  isSelected ? 'bg-blue-600' : ''
                }`}
                onClick={() => {
                  if (isMixFile) {
                    onOpenMix(node.path)
                    return
                  }
                  onSelectPath(node.path, node.kind)
                }}
                onDoubleClick={() => {
                  if (isDirectory) {
                    toggleDirectory(node.path)
                  }
                }}
              >
                <div className="flex flex-1 items-center gap-2 px-2 py-1.5" style={{ paddingLeft }}>
                  {isDirectory ? (
                    <button
                      type="button"
                      className="rounded p-0.5 text-gray-300 hover:bg-gray-600"
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleDirectory(node.path)
                      }}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : (
                    <span className="w-[18px] flex-shrink-0" />
                  )}
                  {isDirectory ? (
                    <Folder size={15} className="flex-shrink-0 text-sky-300" />
                  ) : (
                    <File size={15} className={`flex-shrink-0 ${isMixFile ? 'text-cyan-300' : 'text-gray-300'}`} />
                  )}
                  <span className="min-w-0 truncate" title={node.path}>{node.name}</span>
                  {isDirectory && (
                    <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                      {node.childrenCount}
                    </span>
                  )}
                </div>
                <div className="w-16 px-2 py-1 text-center text-xs text-gray-400">
                  {isDirectory ? t('common.directory' as any) : (node.extension || '-')}
                </div>
                <div className="w-20 px-3 py-1 text-right text-xs text-gray-400">
                  {isDirectory ? '-' : formatFileSize(node.size)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default ProjectExplorer
