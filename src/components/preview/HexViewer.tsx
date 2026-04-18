import React, { useEffect, useState } from 'react'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type HexRow = {
  lineNo: string
  rawData: string
  translated: string
}
type HexColumnKey = 'line' | 'raw' | 'translated'

const HexViewer: React.FC<{
  selectedFile?: string
  mixFiles?: Array<{ file: File; info: any }>
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles, target }) => {
  const [rows, setRows] = useState<HexRow[]>([])
  const [activeSelectionColumn, setActiveSelectionColumn] = useState<HexColumnKey | null>(null)
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  useEffect(() => {
    const clearActiveColumn = () => setActiveSelectionColumn(null)
    window.addEventListener('mouseup', clearActiveColumn)
    return () => window.removeEventListener('mouseup', clearActiveColumn)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setRows([])
      try {
        if (!source.resolved) return
        const bytes = await source.resolved.readBytes()
        const viewLen = Math.min(bytes.length, 4096)
        const out: HexRow[] = []
        for (let off = 0; off < viewLen; off += 16) {
          const hexParts: string[] = []
          let ascii = ''
          for (let j = 0; j < 16 && off + j < viewLen; j++) {
            const b = bytes[off + j]
            hexParts.push(b.toString(16).toUpperCase().padStart(2, '0'))
            ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
          }
          out.push({
            lineNo: off.toString(16).toUpperCase().padStart(8, '0'),
            rawData: hexParts.join(' '),
            translated: ascii,
          })
        }
        if (!cancelled) setRows(out)
      } catch {
        // error is handled by source hook
      }
    }
    if (source.resolved) {
      void load()
    }
    return () => { cancelled = true }
  }, [source.resolved])

  const getColumnSelectionClass = (column: HexColumnKey): string => {
    if (activeSelectionColumn && activeSelectionColumn !== column) return 'select-none'
    return 'select-text'
  }

  if (source.loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (source.error) return <div className="p-3 text-red-400 text-sm">{source.error}</div>

  return (
    <div className="w-full h-full overflow-x-auto">
      <div className="min-w-[460px] h-full text-xs font-mono flex flex-col">
        {rows.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div
              className="grid grid-cols-[80px_380px_minmax(0,1fr)]"
            >
              <div
                className={`border-r border-gray-700 text-cyan-300 ${getColumnSelectionClass('line')}`}
                onMouseDown={() => setActiveSelectionColumn('line')}
              >
                {rows.map((row) => (
                  <div key={`line-${row.lineNo}`} className="h-6 leading-6 px-3 border-b border-gray-800 whitespace-pre">
                    {row.lineNo}
                  </div>
                ))}
              </div>
              <div
                className={`border-r border-gray-700 text-gray-200 ${getColumnSelectionClass('raw')}`}
                onMouseDown={() => setActiveSelectionColumn('raw')}
              >
                {rows.map((row) => (
                  <div key={`raw-${row.lineNo}`} className="h-6 leading-6 px-3 border-b border-gray-800 whitespace-pre tracking-wide">
                    {row.rawData}
                  </div>
                ))}
              </div>
              <div
                className={`text-gray-400 ${getColumnSelectionClass('translated')}`}
                onMouseDown={() => setActiveSelectionColumn('translated')}
              >
                {rows.map((row) => (
                  <div key={`translated-${row.lineNo}`} className="h-6 leading-6 px-3 border-b border-gray-800 whitespace-pre">
                    {row.translated || '.'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 text-gray-400">文件为空或无可显示内容。</div>
        )}
      </div>
    </div>
  )
}

export default HexViewer
