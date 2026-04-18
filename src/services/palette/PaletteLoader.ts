import type { MixFileInfo } from '../MixParser'
import { MixParser } from '../MixParser'
import type { ResourceContext } from '../gameRes/ResourceContext'
import { PaletteParser } from './PaletteParser'
import { sharedPaletteCache } from './PaletteCache'
import type { Rgb } from './PaletteTypes'

type MixFileData = { file: File; info: MixFileInfo }

export async function loadPaletteByPath(
  palettePath: string,
  mixFilesOrContext: MixFileData[] | ResourceContext | null | undefined,
): Promise<Rgb[] | null> {
  const cacheKey = palettePath.toLowerCase()
  const cached = sharedPaletteCache.get(cacheKey)
  if (cached) return cached

  let vf = null
  if (Array.isArray(mixFilesOrContext)) {
    const slash = palettePath.indexOf('/')
    if (slash <= 0) return null
    const mixName = palettePath.substring(0, slash)
    const inner = palettePath.substring(slash + 1)
    const mix = mixFilesOrContext.find((item) => item.info.name === mixName)
    if (!mix) return null
    vf = await MixParser.extractFile(mix.file, inner)
  } else {
    const context = mixFilesOrContext
    const archive = context?.archives
      .filter((item) => palettePath.startsWith(`${item.info.name}/`))
      .sort((a, b) => b.info.name.length - a.info.name.length)[0]
    if (!archive) return null
    const inner = palettePath.slice(archive.info.name.length + 1)
    vf = await MixParser.extractFile(archive.file, inner)
  }
  if (!vf) return null

  const parsed = PaletteParser.fromUnknownContent({
    text: vf.readAsString(),
    bytes: vf.getBytes(),
  })
  if (!parsed) return null
  const fixed = PaletteParser.ensurePalette256(parsed.colors)
  sharedPaletteCache.set(cacheKey, fixed)
  return fixed
}
