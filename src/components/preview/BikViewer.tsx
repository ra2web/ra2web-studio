import React, { useEffect, useRef, useState } from 'react'
import { MixFileInfo } from '../../services/MixParser'
import { BikTranscoder } from '../../services/video/BikTranscoder'
import { BikCacheStore } from '../../services/video/BikCacheStore'
import { buildBikCacheKey } from '../../services/video/BikCacheKey'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
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

function roundMs(value: number): number {
  return Math.round(value * 10) / 10
}

const LARGE_FILE_WARNING_THRESHOLD = 32 * 1024 * 1024

const BikViewer: React.FC<{
  selectedFile?: string
  mixFiles?: MixFileData[]
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles, target }) => {
  const { t } = useLocale()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [phaseText, setPhaseText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState(0)
  const [convertedSize, setConvertedSize] = useState(0)
  const [cacheStatus, setCacheStatus] = useState('')
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })
  const assetPath = source.resolved?.displayPath ?? selectedFile ?? ''

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    const cleanupVideo = () => {
      const video = videoRef.current
      if (!video) return
      try {
        video.pause()
        video.currentTime = 0
      } catch {
        // Ignore media cleanup errors.
      }
    }

    async function load() {
      const totalStart = performance.now()
      let extractMs = 0
      let keyMs = 0
      let cacheLookupMs = 0
      let transcodeMs = 0
      let cacheSource = ''
      let loadedBytes = 0
      cleanupVideo()
      setLoading(true)
      setPhaseText(t('bik.readingMixEntry'))
      setError(null)
      setPlaybackError(null)
      setVideoUrl(null)
      setSourceSize(0)
      setConvertedSize(0)
      setCacheStatus('')
      const warmupPromise = BikTranscoder.warmup().catch(() => {})
      try {
        const extractStart = performance.now()
        if (!source.resolved) throw new Error('Failed to read BIK file')
        const rawBytes = await source.resolved.readBytes()
        const inner = source.resolved.name
        extractMs = performance.now() - extractStart
        if (cancelled) return

        setSourceSize(rawBytes.byteLength)
        loadedBytes = rawBytes.byteLength

        setPhaseText(t('bik.computingCacheKey'))
        const keyStart = performance.now()
        const cacheKey = await buildBikCacheKey({
          mixName: assetPath,
          innerPath: inner,
          bytes: rawBytes,
        })
        keyMs = performance.now() - keyStart
        if (cancelled) return

        setPhaseText(t('bik.checkingCache'))
        const cacheLookupStart = performance.now()
        const cached = await BikCacheStore.get(cacheKey)
        cacheLookupMs = performance.now() - cacheLookupStart
        if (cancelled) return

        let webmBytes: Uint8Array
        if (cached) {
          cacheSource = cached.source
          setCacheStatus(cached.source === 'memory' ? t('bik.cacheHitMemory') : t('bik.cacheHitDisk'))
          setPhaseText(t('bik.preparingPlayback'))
          webmBytes = cached.bytes
        } else {
          cacheSource = 'transcode'
          setCacheStatus(t('bik.firstTranscode'))
          setPhaseText(t('bik.firstTranscodeProgress'))
          await warmupPromise
          const transcodeStart = performance.now()
          webmBytes = await BikTranscoder.transcodeToWebm(cacheKey, inner, rawBytes)
          transcodeMs = performance.now() - transcodeStart
          await BikCacheStore.set(cacheKey, webmBytes).catch(() => {})
          setPhaseText(t('bik.firstTranscodeDone'))
        }
        if (cancelled) return

        const webmBuffer = new ArrayBuffer(webmBytes.byteLength)
        new Uint8Array(webmBuffer).set(webmBytes)
        const url = URL.createObjectURL(new Blob([webmBuffer], { type: 'video/webm' }))
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }

        createdUrl = url
        setVideoUrl(url)
        setConvertedSize(webmBytes.byteLength)
        if (!cached) {
          setPhaseText(t('bik.firstTranscodeReady'))
        }
        console.info('[BikViewer] load timings', {
          file: inner,
          cacheSource,
          sourceSize: loadedBytes,
          extractMs: roundMs(extractMs),
          keyMs: roundMs(keyMs),
          cacheLookupMs: roundMs(cacheLookupMs),
          transcodeMs: roundMs(transcodeMs),
          totalMs: roundMs(performance.now() - totalStart),
        })
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || source.error || t('bik.previewFailed'))
          setPhaseText('')
          setCacheStatus('')
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
      cleanupVideo()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [assetPath, source.error, source.resolved, t])

  const largeFile = sourceSize >= LARGE_FILE_WARNING_THRESHOLD

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center justify-between gap-3">
        <span>{t('bik.previewCaption')}</span>
        <span className="text-gray-500 truncate">{source.resolved?.name || selectedFile}</span>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {loading && (
          <div className="space-y-2 text-sm text-gray-400">
            <div>{phaseText || t('bik.loading')}</div>
            {sourceSize > 0 && <div className="text-xs text-gray-500">{t('bik.sourceSize')}{formatFileSize(sourceSize)}</div>}
          </div>
        )}

        {!loading && error && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{error}</div>
            <div className="text-xs text-gray-500">{t('bik.hexViewHint')}</div>
          </div>
        )}

        {!loading && !error && videoUrl && (
          <div className="space-y-4">
            <video
              ref={videoRef}
              controls
              muted
              playsInline
              preload="metadata"
              src={videoUrl}
              className="w-full max-w-[900px] bg-black rounded"
              onError={() => setPlaybackError(t('bik.playbackError'))}
              onLoadedData={() => setPlaybackError(null)}
            />

            <div className="text-xs text-gray-400 space-y-1">
              <div>{t('bik.sourceSize')}{formatFileSize(sourceSize)}</div>
              <div>{t('bik.convertedSize')}{formatFileSize(convertedSize)}</div>
              <div>{t('bik.cacheStatus')}{cacheStatus || t('bik.cacheMiss')}</div>
              <div>{t('bik.noteVideoOnly')}</div>
            </div>

            {largeFile && (
              <div className="text-xs text-amber-300">
                {t('bik.largeFileWarning')}
              </div>
            )}

            {playbackError && <div className="text-xs text-amber-300">{playbackError}</div>}
          </div>
        )}

        {!loading && !error && !videoUrl && (
          <div className="text-sm text-gray-400">{t('bik.noVideoData')}</div>
        )}
      </div>
    </div>
  )
}

export default BikViewer
