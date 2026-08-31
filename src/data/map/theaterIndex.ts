import { pad } from '../../util/string'
import { MapIni } from './MapIni'
import type { MapTheater } from './constants'

export const THEATER_ASSETS: Record<MapTheater, { ini: string; pal: string; ext: string; unitPal: string; overlayPal: string; newTheaterChar: string }> = {
  TEMPERATE: { ini: 'temperat.ini', pal: 'isotem.pal', ext: '.tem', unitPal: 'unittem.pal', overlayPal: 'isotem.pal', newTheaterChar: 'T' },
  SNOW: { ini: 'snow.ini', pal: 'isosno.pal', ext: '.sno', unitPal: 'unitsno.pal', overlayPal: 'isosno.pal', newTheaterChar: 'A' },
  URBAN: { ini: 'urban.ini', pal: 'isourb.pal', ext: '.urb', unitPal: 'uniturb.pal', overlayPal: 'isourb.pal', newTheaterChar: 'U' },
  NEWURBAN: { ini: 'urbann.ini', pal: 'isoubn.pal', ext: '.ubn', unitPal: 'unitubn.pal', overlayPal: 'isoubn.pal', newTheaterChar: 'N' },
  LUNAR: { ini: 'lunar.ini', pal: 'isolun.pal', ext: '.lun', unitPal: 'unitlun.pal', overlayPal: 'isolun.pal', newTheaterChar: 'L' },
  DESERT: { ini: 'desert.ini', pal: 'isodes.pal', ext: '.des', unitPal: 'unitdes.pal', overlayPal: 'isodes.pal', newTheaterChar: 'D' },
}

export type TheaterTileSetInfo = {
  setIndex: number
  fileName: string
  setName: string
  tilesInSet: number
  startTileNum: number
}

export type TheaterIndex = {
  sets: TheaterTileSetInfo[]
  general: Record<string, number>
  tileCount: number
}

export function parseTheaterIni(text: string): TheaterIndex {
  const ini = MapIni.parse(text)
  const general: Record<string, number> = {}
  for (const entry of ini.getSection('General')?.entries ?? []) {
    const value = Number(entry.value)
    if (!Number.isNaN(value)) general[entry.key] = value
  }
  const sets: TheaterTileSetInfo[] = []
  let tileNum = 0
  for (let setIndex = 0; setIndex < 1024; setIndex++) {
    const section = ini.getSection(`TileSet${pad(setIndex, '0000')}`)
    if (!section) break
    const fileName = section.entries.find((item) => item.key.toLowerCase() === 'filename')?.value ?? ''
    const setName = section.entries.find((item) => item.key.toLowerCase() === 'setname')?.value ?? fileName
    const tilesInSet = Number(section.entries.find((item) => item.key.toLowerCase() === 'tilesinset')?.value ?? '0') || 0
    sets.push({ setIndex, fileName, setName, tilesInSet, startTileNum: tileNum })
    tileNum += tilesInSet
  }
  return { sets, general, tileCount: tileNum }
}

export function tileNumToSet(index: TheaterIndex, tileNum: number): TheaterTileSetInfo | undefined {
  return index.sets.find((set) => tileNum >= set.startTileNum && tileNum < set.startTileNum + set.tilesInSet)
}

export function tmpFileName(set: TheaterTileSetInfo, tileInSet: number, ext: string): string {
  return `${set.fileName}${pad(tileInSet + 1, '00')}${ext}`.toLowerCase()
}

export function latSets(general: Record<string, number>) {
  return {
    clear: general.ClearTile ?? 0,
    sand: general.SandTile ?? -1,
    rough: general.RoughTile ?? -1,
    green: general.GreenTile ?? -1,
    pave: general.PaveTile ?? -1,
    clearToSand: general.ClearToSandLat ?? -1,
    clearToRough: general.ClearToRoughLat ?? -1,
    clearToGreen: general.ClearToGreenLat ?? -1,
    clearToPave: general.ClearToPaveLat ?? -1,
  }
}

/** 对齐 werhd TileSets 的 LAT / CLAT 查询，供 AutoLAT 与悬崖/岸线使用。 */
export class TheaterRules {
  constructor(public readonly index: TheaterIndex) {}

  getGeneralValue(name: string): number {
    const value = this.index.general[name]
    return value === undefined ? -1 : value
  }

  getSetNum(tileNum: number): number {
    return tileNumToSet(this.index, tileNum)?.setIndex ?? 0
  }

  getTileNumFromSet(setNum: number, tileIndex = 0): number {
    const set = this.index.sets[setNum]
    if (!set) return 0
    return set.startTileNum + Math.max(0, Math.min(tileIndex, Math.max(0, set.tilesInSet - 1)))
  }

  isLAT(setNum: number | undefined): boolean {
    if (setNum === undefined) return false
    return (
      setNum === this.getGeneralValue('RoughTile')
      || setNum === this.getGeneralValue('SandTile')
      || setNum === this.getGeneralValue('GreenTile')
      || setNum === this.getGeneralValue('PaveTile')
      || setNum === this.getGeneralValue('BlueMoldTile')
      || setNum === this.getGeneralValue('CrystalTile')
      || setNum === this.getGeneralValue('SwampTile')
    )
  }

  isCLAT(setNum: number): boolean {
    return (
      setNum === this.getGeneralValue('ClearToRoughLat')
      || setNum === this.getGeneralValue('ClearToSandLat')
      || setNum === this.getGeneralValue('ClearToGreenLat')
      || setNum === this.getGeneralValue('ClearToPaveLat')
      || setNum === this.getGeneralValue('ClearToBlueMoldLat')
      || setNum === this.getGeneralValue('ClearToCrystalLat')
      || setNum === this.getGeneralValue('WaterToSwampLat')
    )
  }

  getLAT(setNum: number): number {
    if (setNum === this.getGeneralValue('ClearToRoughLat')) return this.getGeneralValue('RoughTile')
    if (setNum === this.getGeneralValue('ClearToSandLat')) return this.getGeneralValue('SandTile')
    if (setNum === this.getGeneralValue('ClearToGreenLat')) return this.getGeneralValue('GreenTile')
    if (setNum === this.getGeneralValue('ClearToPaveLat')) return this.getGeneralValue('PaveTile')
    if (setNum === this.getGeneralValue('ClearToBlueMoldLat')) return this.getGeneralValue('BlueMoldTile')
    if (setNum === this.getGeneralValue('ClearToCrystalLat')) return this.getGeneralValue('CrystalTile')
    if (setNum === this.getGeneralValue('WaterToSwampLat')) return this.getGeneralValue('SwampTile')
    return -1
  }

  getCLATSet(setNum: number): number {
    if (setNum === this.getGeneralValue('RoughTile')) return this.getGeneralValue('ClearToRoughLat')
    if (setNum === this.getGeneralValue('SandTile')) return this.getGeneralValue('ClearToSandLat')
    if (setNum === this.getGeneralValue('GreenTile')) return this.getGeneralValue('ClearToGreenLat')
    if (setNum === this.getGeneralValue('PaveTile')) return this.getGeneralValue('ClearToPaveLat')
    if (setNum === this.getGeneralValue('BlueMoldTile')) return this.getGeneralValue('ClearToBlueMoldLat')
    if (setNum === this.getGeneralValue('CrystalTile')) return this.getGeneralValue('ClearToCrystalLat')
    if (setNum === this.getGeneralValue('SwampTile')) return this.getGeneralValue('WaterToSwampLat')
    return -1
  }

  canConnectTiles(first: number | undefined, second: number | undefined): boolean {
    if (first === undefined || second === undefined || first === second) return false
    const green = this.getGeneralValue('GreenTile')
    const pave = this.getGeneralValue('PaveTile')
    const miscPave = this.getGeneralValue('MiscPaveTile')
    const shore = this.getGeneralValue('ShorePieces')
    const waterBridge = this.getGeneralValue('WaterBridge')
    const pavedRoads = this.getGeneralValue('PavedRoads')
    const medians = this.getGeneralValue('Medians')
    if ((first === green && second === shore) || (second === green && first === shore)) return false
    if ((first === green && second === waterBridge) || (second === green && first === waterBridge)) return false
    if ((first === pave && second === pavedRoads) || (second === pave && first === pavedRoads)) return false
    if ((first === pave && second === miscPave) || (second === pave && first === miscPave)) return false
    if ((first === pave && second === medians) || (second === pave && first === medians)) return false
    return true
  }
}
