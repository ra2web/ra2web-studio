import React, { useEffect, useRef, useState } from 'react'
import { MixFileInfo } from '../../services/MixParser'
import { WavFile } from '../../data/WavFile'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

type MixFileData = { file: File; info: MixFileInfo }

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

const WavViewer: React.FC<{
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles, target }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState(0)
  const [decodedSize, setDecodedSize] = useState(0)
  const [isImaAdpcm, setIsImaAdpcm] = useState(false)
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })
  const assetPath = source.resolved?.displayPath ?? selectedFile ?? ''

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    const cleanupAudio = () => {
      const audio = audioRef.current
      if (!audio) return
      try {
        audio.pause()
        audio.currentTime = 0
      } catch {
        // Ignore cleanup errors from browser media element.
      }
    }

    async function load() {
      cleanupAudio()
      setLoading(true)
      setError(null)
      setPlaybackError(null)
      setAudioUrl(null)
      setFileSize(0)
      setDecodedSize(0)
      setIsImaAdpcm(false)

      try {
        if (!source.resolved) throw new Error('File not found')
        const rawBytes = await source.resolved.readBytes()
        const wav = new WavFile(rawBytes)
        const adpcm = wav.isRawImaAdpcm()
        const decodedBytes = wav.getData()
        const playableBytes = new Uint8Array(decodedBytes)
        const url = URL.createObjectURL(new Blob([playableBytes], { type: 'audio/wav' }))

        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }

        createdUrl = url
        setAudioUrl(url)
        setFileSize(rawBytes.byteLength)
        setDecodedSize(playableBytes.byteLength)
        setIsImaAdpcm(adpcm)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || source.error || 'WAV 读取/解码失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
      cleanupAudio()
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [assetPath, source.error, source.resolved])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center justify-between gap-3">
        <span>WAV 预览（音频播放）</span>
        <span className="text-gray-500 truncate">
          {source.resolved?.name || selectedFile}
          {isImaAdpcm ? ' · IMA ADPCM -> PCM' : ' · PCM/标准WAV'}
        </span>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {loading && (
          <div className="text-sm text-gray-400">音频加载中...</div>
        )}

        {!loading && error && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{error}</div>
            <div className="text-xs text-gray-500">
              可切换到“十六进制”视图排查文件头或数据结构。
            </div>
          </div>
        )}

        {!loading && !error && audioUrl && (
          <div className="space-y-4">
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={audioUrl}
              className="w-full max-w-[760px]"
              onError={() => setPlaybackError('浏览器无法播放该音频流，可切换十六进制视图排查。')}
              onLoadedData={() => setPlaybackError(null)}
            />

            <div className="text-xs text-gray-400 space-y-1">
              <div>原始大小: {formatFileSize(fileSize)}</div>
              <div>可播放数据大小: {formatFileSize(decodedSize)}</div>
              <div>编码: {isImaAdpcm ? 'IMA ADPCM（已转PCM）' : 'PCM/标准WAV'}</div>
            </div>

            {playbackError && (
              <div className="text-xs text-amber-300">{playbackError}</div>
            )}
          </div>
        )}

        {!loading && !error && !audioUrl && (
          <div className="text-sm text-gray-400">没有可播放的音频数据。</div>
        )}
      </div>
    </div>
  )
}

export default WavViewer
