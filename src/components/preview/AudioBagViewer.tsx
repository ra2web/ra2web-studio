import React, { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Download, Loader2, Music, Scissors } from 'lucide-react'
import { MixParser, type MixFileInfo } from '../../services/MixParser'
import { FileSystemUtil } from '../../services/gameRes/FileSystemUtil'
import {
  getResourcePathBasename,
  getResourcePathDirname,
  getResourcePathExtension,
  normalizeResourceFilename,
  normalizeResourcePath,
} from '../../services/gameRes/patterns'
import { ProjectService } from '../../services/projects/ProjectService'
import { bytesToBlob, triggerBrowserDownload } from '../../services/export/utils'
import { useAppDialog } from '../common/AppDialogProvider'
import { AudioBagFile, getAudioBagChannelCount, getAudioBagEncoding } from '../../data/AudioBagFile'
import { IdxFile, type IdxEntry } from '../../data/IdxFile'
import { WavFile } from '../../data/WavFile'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type MixFileData = { file: File; info: MixFileInfo }

type AudioPackageState = {
  bag: AudioBagFile
  entries: IdxEntry[]
  idxName: string
  bagName: string
}

export type AudioPackageSplitResult =
  | { kind: 'project-file'; idxPath: string; bagPath: string }
  | { kind: 'mix-entry'; idxEntryName: string; bagEntryName: string }

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

function replaceBasename(pathLike: string, basename: string): string {
  const dirname = getResourcePathDirname(pathLike)
  return dirname ? `${dirname}/${basename}` : basename
}

function replaceExtension(filename: string, extension: 'idx' | 'bag'): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return `${stem}.${extension}`
}

function normalizeSplitBaseName(value: string): string {
  const trimmed = value.trim().replace(/\.(idx|bag)$/i, '')
  return normalizeResourceFilename(trimmed)
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

async function readMixEntrySiblingBytes(
  mixFile: File,
  nestedPath: string,
): Promise<Uint8Array> {
  const vf = await MixParser.extractFile(mixFile, nestedPath)
  if (!vf) {
    throw new Error(`未找到配对文件 ${getResourcePathBasename(nestedPath)}`)
  }
  return vf.getBytes()
}

async function readSiblingBytes(args: {
  siblingName: string
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
}): Promise<Uint8Array> {
  const { siblingName, selectedFile, mixFiles = [], target } = args

  if (target?.kind === 'base-mix-entry') {
    const topFile = await FileSystemUtil.readImportedFile('base', target.topLevelOwner)
    return readMixEntrySiblingBytes(topFile, [...target.containerChain, siblingName].join('/'))
  }

  if (target?.kind === 'mix-entry') {
    const topFile = await ProjectService.readProjectFile(target.projectName, target.owningMixPath)
    return readMixEntrySiblingBytes(topFile, [...target.containerChain, siblingName].join('/'))
  }

  if (target?.kind === 'project-file') {
    const siblingPath = replaceBasename(target.relativePath, siblingName)
    const file = await ProjectService.readProjectFile(target.projectName, siblingPath)
    return new Uint8Array(await file.arrayBuffer())
  }

  if (selectedFile) {
    const slash = selectedFile.indexOf('/')
    if (slash > 0) {
      const mixName = selectedFile.slice(0, slash)
      const innerPath = selectedFile.slice(slash + 1)
      const mix = mixFiles.find((item) => item.info.name === mixName)
      if (mix) {
        return readMixEntrySiblingBytes(mix.file, replaceBasename(innerPath, siblingName))
      }
    }
  }

  throw new Error(`无法定位配对文件 ${siblingName}`)
}

const AudioBagViewer: React.FC<{
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
  actionsDisabled?: boolean
  onSplitComplete?: (result: AudioPackageSplitResult) => void | Promise<void>
}> = ({ selectedFile, mixFiles, target, actionsDisabled = false, onSplitComplete }) => {
  const dialog = useAppDialog()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [audioPackage, setAudioPackage] = useState<AudioPackageState | null>(null)
  const [selectedEntryName, setSelectedEntryName] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [selectedWavBytes, setSelectedWavBytes] = useState<Uint8Array | null>(null)
  const [decodedSize, setDecodedSize] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [splitStatus, setSplitStatus] = useState<string | null>(null)
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  useEffect(() => {
    let cancelled = false

    async function loadPackage() {
      if (source.loading) return
      setLoading(true)
      setError(null)
      setAudioPackage(null)
      setSelectedEntryName(null)
      setPlaybackError(null)

      try {
        if (!source.resolved) throw new Error(source.error || 'File not found')
        const selectedName = source.resolved.name || getResourcePathBasename(selectedFile ?? '')
        const selectedExt = source.resolved.extension || getResourcePathExtension(selectedName)
        const idxName = selectedExt === 'idx' ? selectedName : replaceExtension(selectedName, 'idx')
        const bagName = selectedExt === 'bag' ? selectedName : replaceExtension(selectedName, 'bag')
        const selectedBytes = await source.resolved.readBytes()
        const idxBytes = selectedExt === 'idx'
          ? selectedBytes
          : await readSiblingBytes({ siblingName: idxName, selectedFile, mixFiles, target })
        const bagBytes = selectedExt === 'bag'
          ? selectedBytes
          : await readSiblingBytes({ siblingName: bagName, selectedFile, mixFiles, target })
        const idx = new IdxFile(idxBytes)
        const bag = new AudioBagFile(bagBytes, idx)
        const entries = bag.getEntries().sort((a, b) => a.filename.localeCompare(b.filename, undefined, {
          sensitivity: 'base',
        }))

        if (cancelled) return
        setAudioPackage({ bag, entries, idxName, bagName })
        setSelectedEntryName(entries[0]?.filename ?? null)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '音频包读取失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPackage()
    return () => {
      cancelled = true
    }
  }, [mixFiles, selectedFile, source.error, source.loading, source.resolved, target])

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    const audio = audioRef.current
    try {
      audio?.pause()
      if (audio) audio.currentTime = 0
    } catch {
      // Ignore cleanup errors from browser media element.
    }

    setAudioUrl(null)
    setSelectedWavBytes(null)
    setDecodedSize(0)
    setPlaybackError(null)

    if (!audioPackage || !selectedEntryName) {
      return () => undefined
    }

    try {
      const wavBytes = audioPackage.bag.buildWavBytes(selectedEntryName)
      const decodedBytes = new WavFile(wavBytes).getData()
      const playableBytes = new Uint8Array(decodedBytes)
      const url = URL.createObjectURL(bytesToBlob(playableBytes, 'audio/wav'))
      createdUrl = url
      if (!cancelled) {
        setSelectedWavBytes(playableBytes)
        setDecodedSize(playableBytes.byteLength)
        setAudioUrl(url)
      }
    } catch (e: any) {
      if (!cancelled) setPlaybackError(e?.message || '音频条目解码失败')
    }

    return () => {
      cancelled = true
      try {
        audioRef.current?.pause()
      } catch {
        // Ignore cleanup errors from browser media element.
      }
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [audioPackage, selectedEntryName])

  const selectedEntry = useMemo(
    () => audioPackage?.entries.find((entry) => entry.filename === selectedEntryName) ?? null,
    [audioPackage, selectedEntryName],
  )

  const filteredEntries = useMemo(() => {
    const entries = audioPackage?.entries ?? []
    const normalized = query.trim().toLowerCase()
    if (!normalized) return entries
    return entries.filter((entry) => entry.filename.toLowerCase().includes(normalized))
  }, [audioPackage, query])

  const splitDefaultName = useMemo(() => {
    const sourceName = source.resolved?.name || selectedFile || 'audio'
    const stem = normalizeSplitBaseName(sourceName) || 'audio'
    const suffix = query.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
    return suffix ? `${stem}-${suffix}` : `${stem}-split`
  }, [query, selectedFile, source.resolved?.name])

  async function ensureProjectFileTargetsAvailable(idxPath: string, bagPath: string, projectName: string): Promise<void> {
    if (await FileSystemUtil.importedEntryExists('mod', idxPath, projectName)) {
      throw new Error(`目标文件已存在：${idxPath}`)
    }
    if (await FileSystemUtil.importedEntryExists('mod', bagPath, projectName)) {
      throw new Error(`目标文件已存在：${bagPath}`)
    }
  }

  async function ensureProjectMixTargetsAvailable(idxEntryName: string, bagEntryName: string): Promise<void> {
    if (target?.kind !== 'mix-entry') return
    const topFile = await ProjectService.readProjectFile(target.projectName, target.owningMixPath)
    const idxPath = [...target.containerChain, idxEntryName].join('/')
    const bagPath = [...target.containerChain, bagEntryName].join('/')
    const existingIdx = await MixParser.extractFile(topFile, idxPath)
    if (existingIdx) throw new Error(`目标 MIX 内已存在：${idxEntryName}`)
    const existingBag = await MixParser.extractFile(topFile, bagPath)
    if (existingBag) throw new Error(`目标 MIX 内已存在：${bagEntryName}`)
  }

  async function handleSplitPackage(): Promise<void> {
    if (!audioPackage || splitStatus) return
    if (!filteredEntries.length) {
      await dialog.info('当前搜索结果为空，没有可拆分的音频条目。')
      return
    }
    if (target?.kind !== 'project-file' && target?.kind !== 'mix-entry') {
      await dialog.info('当前音频包来自基座或只读来源。请先加入项目后再拆分。')
      return
    }

    flushSync(() => setSplitStatus('等待输入拆分名称...'))
    const input = await dialog.prompt({
      title: '拆分音频包',
      message: `将按当前搜索结果拆分 ${filteredEntries.length} 个音频条目，并在同目录生成新的 .idx/.bag。`,
      defaultValue: splitDefaultName,
      placeholder: '新音频包名称',
      confirmText: '一键拆分',
      validate: (value) => {
        const normalized = normalizeSplitBaseName(value)
        if (!normalized) return '名称不能为空'
        if (/[\\/]/.test(value)) return '名称不能包含路径分隔符'
        if (normalized === '.' || normalized === '..') return '名称无效'
        return null
      },
    })
    if (input == null) {
      setSplitStatus(null)
      return
    }

    const baseName = normalizeSplitBaseName(input)
    const idxName = `${baseName}.idx`
    const bagName = `${baseName}.bag`

    let completed = false
    try {
      flushSync(() => setSplitStatus(`正在生成 ${filteredEntries.length} 个音频条目的拆分包...`))
      await waitForPaint()
      const { idxBytes, bagBytes } = audioPackage.bag.buildSplitPackage(filteredEntries)
      let result: AudioPackageSplitResult
      if (target.kind === 'project-file') {
        const idxFile = new File([toOwnedArrayBuffer(idxBytes)], idxName, { type: 'application/octet-stream' })
        const bagFile = new File([toOwnedArrayBuffer(bagBytes)], bagName, { type: 'application/octet-stream' })
        const dir = getResourcePathDirname(target.relativePath)
        const idxPath = normalizeResourcePath(dir ? `${dir}/${idxName}` : idxName)
        const bagPath = normalizeResourcePath(dir ? `${dir}/${bagName}` : bagName)
        flushSync(() => setSplitStatus(`正在写入 ${idxName} / ${bagName}...`))
        await waitForPaint()
        await ensureProjectFileTargetsAvailable(idxPath, bagPath, target.projectName)
        await ProjectService.writeProjectFile(target.projectName, idxPath, idxFile)
        await ProjectService.writeProjectFile(target.projectName, bagPath, bagFile)
        result = { kind: 'project-file', idxPath, bagPath }
      } else {
        flushSync(() => setSplitStatus(`正在重建 MIX 并写入 ${idxName} / ${bagName}...`))
        await waitForPaint()
        await ensureProjectMixTargetsAvailable(idxName, bagName)
        await ProjectService.writeFilesIntoProjectMix({
          projectName: target.projectName,
          owningMixPath: target.owningMixPath,
          containerChain: target.containerChain,
          files: [
            { bytes: idxBytes, targetFilename: idxName },
            { bytes: bagBytes, targetFilename: bagName },
          ],
        })
        result = { kind: 'mix-entry', idxEntryName: idxName, bagEntryName: bagName }
      }
      completed = true
      flushSync(() => setSplitStatus(null))
      await dialog.info(`拆分完成：${idxName} / ${bagName}`)
      await onSplitComplete?.(result)
    } catch (e: any) {
      await dialog.alert({
        title: '拆分失败',
        message: e?.message || String(e),
      })
    } finally {
      if (!completed) setSplitStatus(null)
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      {splitStatus && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950/55 px-4 backdrop-blur-[1px]">
          <div className="flex max-w-sm items-center gap-3 rounded border border-emerald-500/40 bg-gray-900 px-4 py-3 text-sm text-gray-100 shadow-2xl">
            <Loader2 size={18} className="shrink-0 animate-spin text-emerald-300" />
            <span>{splitStatus}</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-b border-gray-700 px-3 py-2 text-xs text-gray-400">
        <span>IDX/BAG 音频包预览</span>
        <span className="truncate text-gray-500">
          {audioPackage ? `${audioPackage.idxName} + ${audioPackage.bagName}` : source.resolved?.name || selectedFile}
        </span>
      </div>

      {loading && (
        <div className="p-4 text-sm text-gray-400">音频包加载中...</div>
      )}

      {!loading && error && (
        <div className="space-y-3 p-4">
          <div className="text-sm text-red-400">{error}</div>
          <div className="text-xs text-gray-500">
            请确认 .idx 与 .bag 在同一层级，并且文件名只差扩展名。
          </div>
        </div>
      )}

      {!loading && !error && audioPackage && (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 flex-1 flex-col border-r border-gray-700">
            <div className="flex flex-col gap-2 border-b border-gray-700 p-2 sm:flex-row">
              <input
                type="text"
                className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-400"
                placeholder="搜索音频条目..."
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={actionsDisabled || Boolean(splitStatus) || !audioPackage || filteredEntries.length === 0}
                onClick={() => {
                  void handleSplitPackage()
                }}
                title="按当前搜索结果生成新的 IDX/BAG"
              >
                {splitStatus ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                一键拆分
                <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px]">
                  {filteredEntries.length}
                </span>
              </button>
            </div>
            <div className="flex border-b border-gray-700 bg-gray-800 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <div className="flex-1 min-w-0 px-2 py-1">文件名</div>
              <div className="w-24 px-2 py-1 text-right">大小</div>
              <div className="w-20 px-2 py-1 text-right">采样率</div>
              <div className="w-20 px-2 py-1 text-center">编码</div>
              <div className="w-16 px-2 py-1 text-center">声道</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto text-sm">
              {filteredEntries.map((entry) => {
                const selected = entry.filename === selectedEntryName
                return (
                  <button
                    key={entry.filename}
                    type="button"
                    className={`flex w-full items-center border-b border-gray-800 text-left hover:bg-gray-700 ${
                      selected ? 'bg-blue-600' : ''
                    }`}
                    onClick={() => setSelectedEntryName(entry.filename)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
                      <Music size={14} className="flex-shrink-0 text-yellow-300" />
                      <span className="truncate" title={entry.filename}>{entry.filename}</span>
                    </div>
                    <div className="w-24 px-2 py-1.5 text-right text-xs text-gray-300">
                      {formatFileSize(entry.length)}
                    </div>
                    <div className="w-20 px-2 py-1.5 text-right text-xs text-gray-300">
                      {entry.sampleRate}
                    </div>
                    <div className="w-20 px-2 py-1.5 text-center text-xs text-gray-300">
                      {getAudioBagEncoding(entry)}
                    </div>
                    <div className="w-16 px-2 py-1.5 text-center text-xs text-gray-300">
                      {getAudioBagChannelCount(entry)}
                    </div>
                  </button>
                )
              })}
              {filteredEntries.length === 0 && (
                <div className="px-3 py-3 text-xs text-gray-400">没有匹配的音频条目。</div>
              )}
            </div>
          </div>

          <div className="w-full flex-shrink-0 border-t border-gray-700 p-4 lg:w-[22rem] lg:border-t-0">
            {selectedEntry ? (
              <div className="space-y-4">
                <div>
                  <div className="truncate text-sm font-semibold text-gray-100" title={selectedEntry.filename}>
                    {selectedEntry.filename}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    offset {selectedEntry.offset} · flags 0x{selectedEntry.flags.toString(16)}
                  </div>
                </div>

                {audioUrl ? (
                  <audio
                    ref={audioRef}
                    controls
                    preload="metadata"
                    src={audioUrl}
                    className="w-full"
                    onError={() => setPlaybackError('浏览器无法播放该音频流。')}
                    onLoadedData={() => setPlaybackError(null)}
                  />
                ) : (
                  <div className="text-sm text-gray-400">正在准备音频...</div>
                )}

                <div className="space-y-1 text-xs text-gray-400">
                  <div>原始大小: {formatFileSize(selectedEntry.length)}</div>
                  <div>可播放数据大小: {formatFileSize(decodedSize)}</div>
                  <div>采样率: {selectedEntry.sampleRate} Hz</div>
                  <div>编码: {getAudioBagEncoding(selectedEntry)}</div>
                  <div>声道: {getAudioBagChannelCount(selectedEntry)}</div>
                  <div>块大小: {selectedEntry.chunkSize || '-'}</div>
                </div>

                {playbackError && (
                  <div className="text-xs text-amber-300">{playbackError}</div>
                )}

                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded bg-gray-700 px-3 py-1.5 text-xs text-gray-100 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!selectedWavBytes}
                  onClick={() => {
                    if (!selectedWavBytes || !selectedEntry) return
                    triggerBrowserDownload(bytesToBlob(selectedWavBytes, 'audio/wav'), selectedEntry.filename)
                  }}
                >
                  <Download size={14} />
                  导出 WAV
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-400">选择一个音频条目进行播放。</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AudioBagViewer
