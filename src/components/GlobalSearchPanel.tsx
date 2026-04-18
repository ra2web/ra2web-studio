import React from 'react'
import { Archive, Boxes, FolderPlus, Search } from 'lucide-react'
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

  return (
    <div
      className="relative z-10 flex w-[min(56rem,calc(100%-1rem))] max-h-[min(70vh,42rem)] flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      data-context-kind="global-shell"
      data-testid="global-search-overlay"
    >
      <div className="border-b border-gray-700 bg-gradient-to-r from-gray-900 via-gray-900 to-slate-900/70 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-blue-300/80">
              <Search size={14} />
              <span>{t('search.title')}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h3 className="min-w-0 truncate text-lg font-semibold text-white">
                {normalizedQuery || t('search.title')}
              </h3>
              <span className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300">
                {loading ? t('search.indexing') : t('search.resultCount', { count: String(visibleResults.length) })}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-400">
              {normalizedQuery ? t('search.recursiveHint') : t('search.emptyHint')}
            </p>
          </div>

          <div className="hidden rounded-full border border-gray-700 bg-gray-800/90 px-3 py-1 text-[11px] text-gray-400 lg:block">
            {t('search.recursiveHint')}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
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
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-700 px-2.5 py-1.5 text-xs text-gray-100 transition-colors hover:bg-gray-600"
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
                    className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-blue-500"
                  >
                    {t('search.openResult')}
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-gray-500">
            <div className="text-center">
              <Search size={44} className="mx-auto mb-3 opacity-60" />
              <div className="text-sm text-gray-300">
                {normalizedQuery ? t('search.emptyTitle') : t('search.title')}
              </div>
              <div className="mt-1 text-xs text-gray-500">{t('search.emptyHint')}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GlobalSearchPanel
