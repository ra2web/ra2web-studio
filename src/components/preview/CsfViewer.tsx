import React, { useEffect, useMemo, useState } from 'react'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import { CsfEntry, CsfFile } from '../../data/CsfFile'
import { DataStream } from '../../data/DataStream'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

const CsfViewer: React.FC<{
  selectedFile?: string
  mixFiles?: Array<{ file: File; info: any }>
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles, target }) => {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [csfFile, setCsfFile] = useState<CsfFile | null>(null)
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  useEffect(() => {
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
        if (!cancelled) {
          setError(e?.message || 'Failed to parse CSF')
        }
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
  }, [source.resolved])

  const filteredEntries = useMemo(() => {
    const entries = csfFile?.entries ?? []
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) => {
      return (
        entry.key.toLowerCase().includes(q)
        || entry.value.toLowerCase().includes(q)
        || (entry.extraValue ?? '').toLowerCase().includes(q)
      )
    })
  }, [csfFile, query])

  const copyEntries = async (entries: CsfEntry[]) => {
    const text = entries
      .map((entry) => {
        if (entry.extraValue) {
          return `${entry.key}=${entry.value}\n  [extra] ${entry.extraValue}`
        }
        return `${entry.key}=${entry.value}`
      })
      .join('\n')
    await navigator.clipboard.writeText(text)
  }

  if (loading) {
    return <div className="h-full w-full flex items-center justify-center text-gray-400">{t('csf.loading')}</div>
  }

  if (error) {
    return (
      <div className="p-3 text-sm text-red-400">
        <div>{t('csf.parseFailed')}{error}</div>
        <div className="mt-2 text-xs text-gray-400">{t('csf.hexViewHint')}</div>
      </div>
    )
  }

  if (!csfFile) {
    return <div className="h-full w-full flex items-center justify-center text-gray-500">{t('csf.noContent')}</div>
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-300 flex items-center gap-2">
        <span>{t('csf.csfStringTable')}</span>
        <span className="text-gray-500">
          v{csfFile.version} · lang: {csfFile.languageName} · labels: {csfFile.stats.parsedLabels}/
          {csfFile.stats.declaredLabels}
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
            onClick={() => copyEntries(csfFile.entries).catch(() => {})}
            type="button"
          >
            {t('csf.copyAll')}
          </button>
          <button
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            onClick={() => copyEntries(filteredEntries).catch(() => {})}
            type="button"
          >
            {t('csf.copyFiltered')}
          </button>
        </div>
      </div>

      <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-800">
        {t('csf.showingCount', { count: String(filteredEntries.length) })}
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs text-gray-200">
          <thead className="sticky top-0 bg-gray-800">
            <tr className="text-left border-b border-gray-700">
              <th className="px-2 py-2 w-16 text-gray-400">#</th>
              <th className="px-2 py-2 w-1/3 text-gray-400">Key</th>
              <th className="px-2 py-2 text-gray-400">Value</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-gray-500">
                  {t('csf.noMatches')}
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry, index) => (
                <tr key={`${entry.key}-${index}`} className="border-b border-gray-800 align-top">
                  <td className="px-2 py-1 text-gray-500">{index + 1}</td>
                  <td className="px-2 py-1 font-mono break-all">{entry.key}</td>
                  <td className="px-2 py-1 whitespace-pre-wrap break-words">
                    <div>{entry.value}</div>
                    {entry.extraValue && (
                      <div className="mt-1 text-[11px] text-gray-500">[extra] {entry.extraValue}</div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default CsfViewer
