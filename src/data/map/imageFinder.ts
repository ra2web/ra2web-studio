/** Port of werhd `engine/ImageFinder` filename rules. */

export type TheaterFileSettings = {
  extension: string
  newTheaterChar: string
}

const NEW_THEATER_PREFIX = ['G', 'N', 'C', 'Y']
const NEW_THEATER_SECOND = ['A', 'T', 'U', 'D', 'L', 'N']

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
}

export function readArtImage(section: { entries: Array<{ key: string; value: string }> } | undefined, objectName: string): ArtImageInfo {
  const values = new Map((section?.entries ?? []).map((entry) => [entry.key.toLowerCase(), entry.value]))
  const image = values.get('image')?.trim()
  return {
    image: image && image.toLowerCase() !== 'null' ? image : objectName,
    theater: parseBool(values.get('theater')),
    voxel: parseBool(values.get('voxel')),
    terrainPalette: parseBool(values.get('terrainpalette')) || parseBool(values.get('shouldusecelldrawer')),
  }
}

export function artShpCandidates(objectName: string, info: ArtImageInfo, theater: TheaterFileSettings): string[] {
  const preferred = artFileName(info.image, info.theater, theater)
  const generic = artFileName(info.image, false, theater)
  const fallback = `${objectName.toLowerCase()}.shp`
  return [...new Set([preferred, generic, fallback])]
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'yes' || normalized === 'true' || normalized === '1'
}
