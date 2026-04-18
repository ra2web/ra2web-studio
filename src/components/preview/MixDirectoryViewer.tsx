import React, { useEffect, useMemo, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

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

function getTypeLabel(extension: string): string {
  const ext = (extension || '').toLowerCase()
  if (!ext) return '-'
  if (ext === 'mix' || ext === 'mmx' || ext === 'yro') return 'mix'
  return ext
}

const MixDirectoryViewer: React.FC<{
  selectedFile?: string
  mixFiles?: Array<{ file: File; info: MixFileInfo }>
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
  onEnterCurrentMix?: () => void
  canEnterCurrentMix?: boolean
}> = ({ selectedFile, mixFiles, target, onEnterCurrentMix, canEnterCurrentMix = false }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [containerName, setContainerName] = useState('')
  const [items, setItems] = useState<MixFileInfo['files']>([])
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  useEffect(() => {
    let disposed = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (!source.resolved) return
        const bytes = await source.resolved.readBytes()
        const buffer = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buffer).set(bytes)
        const parsed = await MixParser.parseFile(
          new File(
            [buffer],
            source.resolved?.name || 'archive.mix',
          ),
        )
        if (disposed) return

        setContainerName(parsed.name || source.resolved?.name || '')
        setItems(parsed.files)
      } catch (e: any) {
        if (!disposed) {
          setContainerName(source.resolved?.name || selectedFile || '')
          setItems([])
          setError(e?.message || '读取 MIX 目录失败')
        }
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    if (source.resolved) {
      void load()
    }
    return () => {
      disposed = true
    }
  }, [selectedFile, source.resolved])

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' })),
    [items],
  )

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center justify-between gap-2">
        <span>
          此处展示解析出的MIX内部一级文件目录，可以在左侧双击MIX文件名进入MIX内部文件目录，也可
          <button
            type="button"
            className={`mx-1 underline underline-offset-2 ${
              canEnterCurrentMix ? 'text-blue-300 hover:text-blue-200' : 'text-gray-500 cursor-not-allowed'
            }`}
            onClick={() => {
              if (!canEnterCurrentMix) return
              onEnterCurrentMix?.()
            }}
            disabled={!canEnterCurrentMix}
            title={canEnterCurrentMix ? '直接进入当前 MIX 内部目录' : '当前不可直接进入'}
          >
            点击此处
          </button>
          直接进入本MIX
        </span>
        <span className="truncate text-gray-500">
          {containerName || (source.resolved?.name || selectedFile || '')} · {sortedItems.length} 项
        </span>
      </div>

      <div className="flex text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-800 border-b border-gray-700">
        <div className="flex-1 min-w-0 px-2 py-1">文件名</div>
        <div className="w-20 text-center px-2 py-1">类型</div>
        <div className="w-24 text-right px-2 py-1">大小</div>
      </div>

      <div className="flex-1 overflow-y-auto text-sm">
        {sortedItems.length > 0 ? (
          sortedItems.map((file, index) => (
            <div
              key={`${file.filename}-${index}`}
              className="flex items-center border-b border-gray-800 hover:bg-gray-800/70"
            >
              <div className="flex-1 min-w-0 px-2 py-1 truncate" title={file.filename}>
                {file.filename}
              </div>
              <div className="w-20 text-center text-xs text-gray-400 px-2 py-1" title={file.extension}>
                {getTypeLabel(file.extension)}
              </div>
              <div className="w-24 text-right text-xs text-gray-400 px-2 py-1" title={`${file.length} 字节`}>
                {formatFileSize(file.length)}
              </div>
            </div>
          ))
        ) : (
          <div className="px-3 py-3 text-xs text-gray-400">
            {error ? '目录读取失败，当前没有可展示条目。' : '该 MIX 中没有可展示的一级条目。'}
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">
          目录加载中...
        </div>
      )}
      {error && !loading && (
        <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">
          {error}
        </div>
      )}
    </div>
  )
}

export default MixDirectoryViewer
