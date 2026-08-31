import { MapDocument } from './MapDocument'
import { MapIni } from './MapIni'

const PACKED = new Set(['isomappack5', 'overlaypack', 'overlaydatapack', 'previewpack'])

export function isPackedIniSection(name: string): boolean {
  return PACKED.has(name.toLowerCase())
}

/** FA2 CAll：改 INI 后重载任务段；IsoMapPack/OverlayPack 保持当前文档，避免误改压缩段。 */
export function applyIniEdit(doc: MapDocument, mutate: (ini: MapIni) => void): void {
  const ini = MapIni.parse(doc.toIniString())
  mutate(ini)
  for (const section of [...ini.sections]) {
    if (isPackedIniSection(section.name)) ini.removeSection(section.name)
  }
  const next = MapDocument.parse(ini.toString())
  next.cells = doc.cells
  next.overlay = doc.overlay
  next.overlayData = doc.overlayData
  next.previewRgb = doc.previewRgb
  next.previewWidth = doc.previewWidth
  next.previewHeight = doc.previewHeight
  doc.copyFrom(next)
}

export function listIniSections(doc: MapDocument): string[] {
  return MapIni.parse(doc.toIniString()).sections
    .map((section) => section.name)
    .filter((name) => !isPackedIniSection(name))
}

export function listIniKeys(doc: MapDocument, section: string): Array<{ key: string; value: string }> {
  return MapIni.parse(doc.toIniString()).getSection(section)?.entries.map((entry) => ({ ...entry })) ?? []
}
