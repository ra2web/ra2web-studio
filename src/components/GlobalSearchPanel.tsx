import React from 'react'
import { Archive, Boxes, FolderPlus } from 'lucide-react'
import { useLocale } from '../i18n/LocaleContext'
import type { GlobalSearchResult } from '../types/studio'

interface GlobalSearchPanelProps {
  query: string
  results: GlobalSearchResult[]
  loading?: boolean
  activeProjectName: string | null
  onOpenResult: (result: GlobalSearchResult) => void
  onAddToProject: (result: GlobalSearchResult) => void
}

const GlobalSearchPanel: React.FC<GlobalSearchPanelProps> = ({
  query,
  results,
  loading = false,
  activeProjectName,
  onOpenResult,
  onAddToProject,
}) => {
  const { t } = useLocale()
  const normalizedQuery = query.trim()
  const visibleResults = normalizedQuery ? results : []

  const showCountStrip = !!normalizedQuery && !loading && visibleResults.length > 0
  const emptyMessage = loading
    ? t('search.indexing')
    : normalizedQuery
      ? t('search.emptyTitle')
      : t('search.emptyHint')

  return (
    <div
      className="flex w-full max-h-[min(70vh,42rem)] flex-col overflow-hidden rounded-b border-x border-b border-gray-700 bg-gray-900 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      data-context-kind="global-shell"
      data-testid="global-search-overlay"
    >
      {showCountStrip && (
        <div className="border-b border-gray-800 bg-gray-900 px-4 py-1.5 text-[11px] text-gray-500">
          {t('search.resultCount', { count: String(visibleResults.length) })}
        </div>
      )}

      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {visibleResults.length > 0 ? (
          visibleResults.map((result) => (
            <div
              key={result.id}
              className="border-b border-gray-800 px-5 py-4 transition-colors hover:bg-gray-800/70"
              data-context-kind="search-result"
              data-file-path={result.path}
              data-search-scope={result.scope}
              data-result-kind={result.resultKind}
              data-project-name={result.projectName ?? ''}
              data-top-level-owner={result.topLevelOwner}
              data-container-chain={JSON.stringify(result.containerChain)}
            >
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  className="min-w-0 text-left flex-1"
                  onClick={() => onOpenResult(result)}
                >
                  <div className="text-sm font-medium text-gray-100 truncate">{result.displayName}</div>
                  <div className="mt-1 break-all text-xs text-gray-400">{result.path}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-300">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                      result.scope === 'base' ? 'bg-sky-900/60 text-sky-200' : 'bg-emerald-900/60 text-emerald-200'
                    }`}>
                      {result.scope === 'base' ? <Archive size={12} /> : <Boxes size={12} />}
                      {result.scope === 'base'
                        ? t('search.baseScopeTag')
                        : t('search.projectScopeTag', { name: result.projectName ?? '' })}
                    </span>
                    {result.isNestedMixHit && (
                      <span className="rounded-full bg-gray-700 px-2.5 py-1 text-gray-200">
                        {t('search.nestedMixTag')}
                      </span>
                    )}
                    <span className="rounded-full border border-gray-700 px-2.5 py-1 text-gray-300">
                      {result.extension || '-'}
                    </span>
                    <span className="rounded-full border border-gray-700 px-2.5 py-1 text-gray-300">
                      {result.size} B
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {result.scope === 'base' && (
                    <button
                      type="button"
                      onClick={() => onAddToProject(result)}
                      className="inline-flex items-center gap-1 rounded bg-gray-700 px-2.5 py-1.5 text-xs text-gray-100 transition-colors hover:bg-gray-600"
                      title={activeProjectName
                        ? t('search.addToActiveProject', { name: activeProjectName })
                        : t('search.addToProject')}
                    >
                      <FolderPlus size={12} />
                      {t('search.addToProject')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenResult(result)}
                    className="rounded bg-blue-600 px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-blue-500"
                  >
                    {t('search.openResult')}
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="px-5 py-6 text-center text-xs text-gray-500">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  )
}

export default GlobalSearchPanel
