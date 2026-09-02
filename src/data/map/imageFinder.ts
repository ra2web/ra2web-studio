/** Port of werhd `engine/ImageFinder` plus FA2 `CLoading::FindUnitShp` filename rules. */

import type { MapIni } from './MapIni'

export type TheaterFileSettings = {
  extension: string
  newTheaterChar: string
}

const NEW_THEATER_PREFIX = ['G', 'N', 'C', 'Y']
const NEW_THEATER_SECOND = ['A', 'T', 'U', 'D', 'L', 'N']
const THEATER_CHARS = ['G', 'T', 'A', 'U', 'N', 'D', 'L'] as const
const THEATER_SUFFIXES = ['.tem', '.sno', '.urb', '.lun', '.des', '.ubn'] as const

export function artFileName(imageName: string, useTheaterExtension: boolean, theater: TheaterFileSettings): string {
  const lower = imageName.toLowerCase() + (useTheaterExtension ? theater.extension : '.shp')
  return applyNewTheaterIfNeeded(imageName, lower, theater)
}

export function applyNewTheaterIfNeeded(artName: string, fileName: string, theater: TheaterFileSettings): string {
  const first = artName[0]?.toUpperCase()
  const second = artName[1]?.toUpperCase()
  if (!first || !second) return fileName
  if (!NEW_THEATER_PREFIX.includes(first) || !NEW_THEATER_SECOND.includes(second)) return fileName
  return applyNewTheater(fileName, theater)
}

export function applyNewTheater(fileName: string, theater: TheaterFileSettings, hasFile?: (name: string) => boolean): string {
  const prefix = fileName[0] ?? ''
  const rest = fileName.slice(2)
  const preferred = `${prefix}${theater.newTheaterChar.toLowerCase()}${rest}`
  if (!hasFile) return preferred
  if (hasFile(preferred)) return preferred
  const generic = `${prefix}g${rest}`
  if (hasFile(generic)) return generic
  return fileName
}

export type ArtImageInfo = {
  image: string
  theater: boolean
  voxel: boolean
  terrainPalette: boolean
  walkFrames?: number
  startWalkFrame?: number
}

export function readArtImage(section: { entries: Array<{ key: string; value: string }> } | undefined, objectName: string): ArtImageInfo {
  const values = new Map((section?.entries ?? []).map((entry) => [entry.key.toLowerCase(), entry.value]))
  const image = values.get('image')?.trim()
  return {
    image: image && image.toLowerCase() !== 'null' ? image : objectName,
    theater: parseBool(values.get('theater')),
    voxel: parseBool(values.get('voxel')),
    terrainPalette: parseBool(values.get('terrainpalette')) || parseBool(values.get('shouldusecelldrawer')),
    walkFrames: Math.max(1, Number(values.get('walkframes')) || 1),
    startWalkFrame: Math.max(0, Number(values.get('startwalkframe')) || 0),
  }
}

/** FA2 `LoadUnitGraphic`: rules `Image=` then art `Image=` on that section. */
export function resolveRulesImage(rulesIni: MapIni | null | undefined, objectName: string): string {
  const image = rulesIni?.getValue(objectName, 'Image')?.trim()
  if (image && image.toLowerCase() !== 'null') return image
  return objectName
}

function supportsNewTheater(image: string): boolean {
  const first = image[0]?.toUpperCase()
  return first === 'G' || first === 'N' || first === 'C' || first === 'Y'
}

/**
 * FA2 `FindUnitShp` 候选名：Theater 后缀、第二字母剧院字、原名 `.shp`、再试 `.tem/.sno/...`。
 * 无 `hasFile` 时列出全部候选，由调用方按序打开。
 */
export function artShpCandidates(objectName: string, info: ArtImageInfo, theater: TheaterFileSettings): string[] {
  const image = (info.image || objectName).trim()
  if (!image) return []
  const names: string[] = []
  const push = (name: string) => {
    const lower = name.toLowerCase()
    if (lower && !names.includes(lower)) names.push(lower)
  }
  const preferred = theater.newTheaterChar.toUpperCase()
  const chars = [preferred, ...THEATER_CHARS.filter((ch) => ch !== preferred)]
  const theaterExt = theater.extension.toLowerCase()
  const suffixes = [theaterExt, ...THEATER_SUFFIXES.filter((suffix) => suffix !== theaterExt)]

  if (info.theater) {
    for (const suffix of suffixes) push(image + suffix)
  }

  if (supportsNewTheater(image) && image.length >= 2) {
    for (const ch of chars) {
      push(`${image[0]}${ch}${image.slice(2)}.shp`)
    }
  }

  push(`${image}.shp`)
  if (objectName.toLowerCase() !== image.toLowerCase()) push(`${objectName}.shp`)

  if (!info.theater) {
    for (const suffix of suffixes) push(image + suffix)
  }

  if (!supportsNewTheater(image) && image.length >= 2) {
    for (const ch of chars) {
      push(`${image[0]}${ch}${image.slice(2)}.shp`)
    }
  }

  return names
}

export function artVxlCandidates(imageName: string): string[] {
  const image = imageName.trim()
  if (!image) return []
  return [`${image.toLowerCase()}.vxl`]
}

/** FA2 `LoadBuildingSubGraphic` 叠到主 SHP 上的 art.ini 键（含 ActiveAnim2/Two 两种写法）。 */
export const BUILDING_SUBGRAPHIC_KEYS = [
  'BibShape',
  'ActiveAnim',
  'IdleAnim',
  'ActiveAnim2',
  'ActiveAnim3',
  'ActiveAnimTwo',
  'ActiveAnimThree',
  'SuperAnim',
  'SuperAnimTwo',
  'SuperAnimThree',
  'SuperAnimFour',
  'SpecialAnim',
  'SpecialAnimTwo',
  'SpecialAnimThree',
  'SpecialAnimFour',
] as const

function parseBool(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'yes' || normalized === 'true' || normalized === '1'
}
