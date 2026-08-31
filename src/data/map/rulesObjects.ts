import { MapIni } from './MapIni'

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
