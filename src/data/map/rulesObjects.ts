import { MapIni } from './MapIni'
import { resolveRulesImage } from './imageFinder'

export type RulesObjectLists = {
  infantry: string[]
  units: string[]
  aircraft: string[]
  structures: string[]
  terrain: string[]
  smudges: string[]
  overlays: string[]
}

function sectionValues(ini: MapIni, name: string): string[] {
  return (ini.getSection(name)?.entries ?? [])
    .map((entry) => (entry.value || entry.key).trim())
    .filter(Boolean)
}

export function parseRulesObjectLists(text: string): RulesObjectLists {
  const ini = MapIni.parse(text)
  return {
    infantry: sectionValues(ini, 'InfantryTypes'),
    units: sectionValues(ini, 'VehicleTypes'),
    aircraft: sectionValues(ini, 'AircraftTypes'),
    structures: sectionValues(ini, 'BuildingTypes'),
    terrain: sectionValues(ini, 'TerrainTypes'),
    smudges: sectionValues(ini, 'SmudgeTypes'),
    overlays: sectionValues(ini, 'OverlayTypes'),
  }
}

export type BuildingFoundation = { w: number; h: number }

export function parseBuildingFoundations(text: string, artText?: string): Record<string, BuildingFoundation> {
  const ini = MapIni.parse(text)
  const art = artText ? MapIni.parse(artText) : ini
  const names = new Set(sectionValues(ini, 'BuildingTypes'))
  const result: Record<string, BuildingFoundation> = {}
  for (const name of names) {
    const lookup = resolveRulesImage(ini, name)
    const artImage = art.getValue(lookup, 'Image')?.trim()
    const artSection = artImage && artImage.toLowerCase() !== 'null' ? artImage : lookup
    const raw = art.getValue(artSection, 'Foundation')
      || art.getValue(lookup, 'Foundation')
      || ini.getValue(name, 'Foundation')
      || art.getValue(name, 'Foundation')
      || '1x1'
    const match = raw.trim().match(/^(\d+)\s*[xX]\s*(\d+)$/)
    result[name] = match
      ? { w: Math.max(1, Number(match[1]) || 1), h: Math.max(1, Number(match[2]) || 1) }
      : { w: 1, h: 1 }
  }
  return result
}

export function emptyRulesObjectLists(): RulesObjectLists {
  return {
    infantry: [],
    units: [],
    aircraft: [],
    structures: [],
    terrain: [],
    smudges: [],
    overlays: [],
  }
}
