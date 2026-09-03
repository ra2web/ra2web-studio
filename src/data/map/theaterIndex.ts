import { pad } from '../../util/string'
import { MapIni } from './MapIni'
import type { MapTheater } from './constants'

/** Overlay SHP 用剧院 pal（werhd overlayPaletteName / FA2 矿石 m_hPalTemp），不是 isotem.pal。 */
export const THEATER_ASSETS: Record<MapTheater, { ini: string; pal: string; ext: string; unitPal: string; overlayPal: string; newTheaterChar: string }> = {
  TEMPERATE: { ini: 'temperat.ini', pal: 'isotem.pal', ext: '.tem', unitPal: 'unittem.pal', overlayPal: 'temperat.pal', newTheaterChar: 'T' },
  SNOW: { ini: 'snow.ini', pal: 'isosno.pal', ext: '.sno', unitPal: 'unitsno.pal', overlayPal: 'snow.pal', newTheaterChar: 'A' },
  URBAN: { ini: 'urban.ini', pal: 'isourb.pal', ext: '.urb', unitPal: 'uniturb.pal', overlayPal: 'urban.pal', newTheaterChar: 'U' },
  NEWURBAN: { ini: 'urbann.ini', pal: 'isoubn.pal', ext: '.ubn', unitPal: 'unitubn.pal', overlayPal: 'urbann.pal', newTheaterChar: 'N' },
  LUNAR: { ini: 'lunar.ini', pal: 'isolun.pal', ext: '.lun', unitPal: 'unitlun.pal', overlayPal: 'lunar.pal', newTheaterChar: 'L' },
  DESERT: { ini: 'desert.ini', pal: 'isodes.pal', ext: '.des', unitPal: 'unitdes.pal', overlayPal: 'desert.pal', newTheaterChar: 'D' },
}

/** YR ships `temperatmd.ini` etc.; fall back to the vanilla theater.ini. */
export function theaterIniNames(theater: MapTheater): string[] {
  const ini = THEATER_ASSETS[theater].ini
  const md = ini.replace(/\.ini$/i, 'md.ini')
  return md.toLowerCase() === ini.toLowerCase() ? [ini] : [md, ini]
}

export type TheaterTileSetInfo = {
  setIndex: number
  fileName: string
  setName: string
  tilesInSet: number
  startTileNum: number
  /** theater.ini MarbleMadness 指向的 TileSet 序号；-1 表示无。 */
  marbleMadnessSet: number
  /** theater.ini `AllowTiberium=true`；FA2 矿石笔刷只刷这类集。 */
  allowTiberium: boolean
  /** theater.ini `Morphable=true`；FA2 抬高/降低与 CreateSlopesAt 只改这类瓦片。 */
  morphable: boolean
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
    const fileName = (section.entries.find((item) => item.key.toLowerCase() === 'filename')?.value ?? '').trim()
    const setName = (section.entries.find((item) => item.key.toLowerCase() === 'setname')?.value ?? fileName).trim()
    const tilesInSet = Number(section.entries.find((item) => item.key.toLowerCase() === 'tilesinset')?.value ?? '0') || 0
    const marbleRaw = section.entries.find((item) => item.key.toLowerCase() === 'marblemadness')?.value
    const marbleMadnessSet = marbleRaw !== undefined && marbleRaw !== '' ? Number(marbleRaw) : -1
    const allowRaw = section.entries.find((item) => item.key.toLowerCase() === 'allowtiberium')?.value
    const morphRaw = section.entries.find((item) => item.key.toLowerCase() === 'morphable')?.value
    sets.push({
      setIndex,
      fileName,
      setName,
      tilesInSet,
      startTileNum: tileNum,
      marbleMadnessSet: Number.isFinite(marbleMadnessSet) ? marbleMadnessSet : -1,
      allowTiberium: allowRaw?.trim().toLowerCase() === 'true',
      morphable: morphRaw?.trim().toLowerCase() === 'true',
    })
    tileNum += tilesInSet
  }
  return { sets, general, tileCount: tileNum }
}

export function tileNumToSet(index: TheaterIndex, tileNum: number): TheaterTileSetInfo | undefined {
  return index.sets.find((set) => tileNum >= set.startTileNum && tileNum < set.startTileNum + set.tilesInSet)
}

export function theaterGeneralValue(index: TheaterIndex, name: string): number | undefined {
  const direct = index.general[name]
  if (direct !== undefined) return direct
  const needle = name.toLowerCase()
  for (const [key, value] of Object.entries(index.general)) {
    if (key.toLowerCase() === needle) return value
  }
  return undefined
}

function heightBaseSet(index: TheaterIndex): TheaterTileSetInfo | undefined {
  const heightBase = theaterGeneralValue(index, 'HeightBase')
  if (heightBase === undefined || !Number.isFinite(heightBase)) return undefined
  const dest = index.sets[heightBase]
  return dest && dest.tilesInSet > 0 ? dest : undefined
}

/** FA2 IsoView：`if (madnessid)` 换集，否则 HeightBase + height（草地/公路变成高度色块）。 */
export function marbleTileNum(index: TheaterIndex, tileNum: number, height = 0): number {
  const set = tileNumToSet(index, tileNum)
  if (set && set.marbleMadnessSet > 0) {
    const dest = index.sets[set.marbleMadnessSet]
    if (!dest) return tileNum
    const offset = tileNum - set.startTileNum
    return dest.startTileNum + Math.min(offset, Math.max(0, dest.tilesInSet - 1))
  }
  const dest = heightBaseSet(index)
  if (!dest) return tileNum
  return dest.startTileNum + Math.min(Math.max(0, height), dest.tilesInSet - 1)
}

/** HeightBase 回退格 FA2 会把 bSubTile 置 0；有 MarbleMadness 映射的悬崖保持原 subTile。 */
export function marbleUsesHeightBase(index: TheaterIndex, tileNum: number): boolean {
  const set = tileNumToSet(index, tileNum)
  if (set && set.marbleMadnessSet > 0) return false
  return heightBaseSet(index) !== undefined
}

export function tmpFileName(set: TheaterTileSetInfo, tileInSet: number, ext: string): string {
  return `${set.fileName.trim()}${pad(tileInSet + 1, '00')}${ext}`.toLowerCase()
}

/** werhd TileSets: letter -1 is the numbered file, 0=`a`, 1=`b`, … */
export function tmpVariantFileName(baseFileName: string, letter: number): string {
  const name = baseFileName.toLowerCase()
  if (letter < 0) return name
  const dot = name.lastIndexOf('.')
  const suffix = String.fromCharCode(97 + letter)
  if (dot < 0) return `${name}${suffix}`
  return `${name.slice(0, dot)}${suffix}${name.slice(dot)}`
}

/**
 * Stable stand-in for werhd `getTmpFile(subTile, getRandomInt)` / FA2 `bRNDImage`.
 * Hash by cell so pan/zoom does not re-roll the variant every frame.
 */
export function cellTmpVariantIndex(rx: number, ry: number, tileNum: number, count: number): number {
  if (count <= 1) return 0
  const hash = (
    Math.imul(rx | 0, 73856093)
    ^ Math.imul(ry | 0, 19349663)
    ^ Math.imul(tileNum | 0, 83492791)
  ) >>> 0
  return hash % count
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
    const value = theaterGeneralValue(this.index, name)
    return value === undefined ? -1 : value
  }

  getSetNum(tileNum: number): number {
    return tileNumToSet(this.index, tileNum)?.setIndex ?? 0
  }

  allowsTiberium(tileNum: number): boolean {
    return tileNumToSet(this.index, tileNum)?.allowTiberium === true
  }

  isMorphable(tileNum: number): boolean {
    return tileNumToSet(this.index, tileNum)?.morphable === true
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
