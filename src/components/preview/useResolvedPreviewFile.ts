import { useEffect, useState } from 'react'
import { resolvePreviewFile } from './previewFileResolver'
import type { PreviewResolvedFile, PreviewTarget } from './types'

export function useResolvedPreviewFile(target: PreviewTarget | null | undefined) {
  const [resolved, setResolved] = useState<PreviewResolvedFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!target) {
      setResolved(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    setResolved(null)

    void (async () => {
      try {
        const next = await resolvePreviewFile(target)
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
  }, [target])

  return {
    resolved,
    loading,
    error,
  }
}
