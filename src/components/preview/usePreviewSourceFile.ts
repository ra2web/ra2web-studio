import { useEffect, useState } from 'react'
import type { MixFileInfo } from '../../services/MixParser'
import { MixParser } from '../../services/MixParser'
import type { PreviewResolvedFile, PreviewTarget } from './types'
import { resolvePreviewFile } from './previewFileResolver'

type LegacyMixFileData = { file: File; info: MixFileInfo }

async function resolveLegacyPreviewFile(
  selectedFile: string,
  mixFiles: LegacyMixFileData[],
): Promise<PreviewResolvedFile> {
  const slash = selectedFile.indexOf('/')
  if (slash <= 0) {
    throw new Error('Invalid path')
  }
  const mixName = selectedFile.substring(0, slash)
  const inner = selectedFile.substring(slash + 1)
  const mix = mixFiles.find((item) => item.info.name === mixName)
  if (!mix) {
    throw new Error('MIX not found')
  }

  return {
    displayPath: selectedFile,
    name: inner.split('/').pop() || inner,
    extension: inner.split('.').pop()?.toLowerCase() ?? '',
    readBytes: async () => {
      const vf = await MixParser.extractFile(mix.file, inner)
      if (!vf) throw new Error('File not found in MIX')
      return vf.getBytes()
    },
    readText: async () => {
      const vf = await MixParser.extractFile(mix.file, inner)
      if (!vf) throw new Error('File not found in MIX')
      return vf.readAsString()
    },
  }
}

export function usePreviewSourceFile(args: {
  target?: PreviewTarget | null
  selectedFile?: string
  mixFiles?: LegacyMixFileData[]
}) {
  const { target, selectedFile, mixFiles = [] } = args
  const [resolved, setResolved] = useState<PreviewResolvedFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!target && !selectedFile) {
      setResolved(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setResolved(null)
    setError(null)

    void (async () => {
      try {
        const next = target
          ? await resolvePreviewFile(target)
          : await resolveLegacyPreviewFile(selectedFile as string, mixFiles)
        if (cancelled) return
        setResolved(next)
      } catch (err: any) {
        if (cancelled) return
        setError(err?.message || '读取文件失败')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mixFiles, selectedFile, target])

  return {
    resolved,
    loading,
    error,
  }
}
