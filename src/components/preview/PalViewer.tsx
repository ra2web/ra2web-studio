import React, { useEffect, useMemo, useState } from 'react'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import type { PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

const PalViewer: React.FC<{
  selectedFile?: string
  mixFiles?: Array<{ file: File; info: any }>
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles, target }) => {
  const { t } = useLocale()
  const [colors, setColors] = useState<Rgb[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setColors(null)
      try {
        if (!source.resolved) return
        const bytes = await source.resolved.readBytes()
        const text = await source.resolved.readText()
        const parsed = PaletteParser.fromUnknownContent({
          text,
          bytes,
        })
        if (!parsed) throw new Error('Unsupported PAL format')
        if (!cancelled) setColors(PaletteParser.ensurePalette256(parsed.colors))
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load PAL')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (source.resolved) {
      void load()
    }
    return () => { cancelled = true }
  }, [source.resolved])

  const count = colors?.length ?? 0
  const cells = useMemo(() => {
    if (!colors) return []
    const limit = Math.min(colors.length, 256)
    return colors.slice(0, limit)
  }, [colors])

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">{t('bik.loading')}</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>
  if (!colors) return null

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">
        {t('viewer.paletteColorCount', { count: String(count) })}
      </div>
      <div className="p-2">
        <div className="grid grid-cols-16 gap-1">
          {cells.map((c, i) => (
            <div
              key={i}
              className="w-6 h-6 border border-gray-700"
              title={`#${i} rgb(${c.r}, ${c.g}, ${c.b})`}
              style={{ backgroundColor: `rgb(${c.r}, ${c.g}, ${c.b})` }}
              onClick={() => navigator.clipboard.writeText(`#${i} rgb(${c.r}, ${c.g}, ${c.b})`)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default PalViewer



