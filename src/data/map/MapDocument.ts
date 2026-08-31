import { Format5 } from '../encoding/Format5'
import { base64StringToUint8Array, uint8ArrayToBase64String } from '../../util/string'
import {
  EMPTY_OVERLAY,
  OVERLAY_PLANE_SIZE,
  OVRL_VEINHOLE,
  OVRL_VEINHOLEBORDER,
  OVRL_VEINS,
  PLAYABLE_HOUSES,
  CRUENTUS_BEGIN,
  CRUENTUS_END,
  RIPARIUS_BEGIN,
  RIPARIUS_END,
  houseNamesForMode,
  overlayIndex,
  type MapTheater,
} from './constants'
import { forEachIsoCell, isoSizeOf, parseWaypointCell, waypointCell } from './isoCoords'
import { MapIni, type MapIniEntry } from './MapIni'
import {
  cellKey,
  decodeIsoMapPack5,
  decodeOverlayPack,
  emptyCell,
  encodeIsoMapPack5,
  encodeOverlayPack,
} from './packs'
import type {
  MapAiTrigger,
  MapBasic,
  MapCell,
  MapCellTag,
  MapHouse,
  MapLighting,
  MapScriptType,
  MapSmudge,
  MapSpecialFlags,
  MapTag,
  MapTaskForce,
  MapTeamType,
  MapTechno,
  MapTerrainObject,
  MapTrigger,
  MapTriggerAction,
  MapTriggerEvent,
  MapTube,
  MapVariable,
  MapWaypoint,
} from './types'

function yn(value: boolean): string {
  return value ? 'yes' : 'no'
}

function parseBool(value: string, fallback = false): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  return normalized === 'yes' || normalized === 'true' || normalized === '1'
}

function csv(value: string): string[] {
  return value.split(',')
}

function nextId(prefix: string): string {
  const rand = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')
  return `${prefix}${rand}`.slice(0, 8)
}

function defaultLighting(): MapLighting {
  return { ambient: 1, level: 0.032, red: 1, green: 1, blue: 1, ground: 0 }
}

function defaultSpecialFlags(): MapSpecialFlags {
  return {
    tiberiumGrows: true,
    tiberiumSpreads: true,
    tiberiumExplosive: false,
    destroyableBridges: true,
    mcvDeploy: false,
    initialVeteran: false,
    fixedAlliance: false,
    harvesterImmune: false,
    fogOfWar: false,
    inert: false,
    ionStorms: false,
    meteorites: false,
    visceroids: true,
  }
}

function defaultBasic(multiplayer: boolean): MapBasic {
  return {
    name: 'No name',
    newIniFormat: 4,
    multiplayerOnly: multiplayer,
    player: '',
    nextScenario: '',
    altNextScenario: '',
    homeCell: 98,
    altHomeCell: 99,
    percent: 0,
    carryOverMoney: 0,
    carryOverCap: 0,
    official: false,
    skipScore: false,
    oneTimeOnly: false,
    skipMapSelect: false,
    endOfGame: false,
    truckCrate: false,
    trainCrate: false,
    tiberiumGrowthEnabled: true,
    veinGrowthEnabled: true,
    iceGrowthEnabled: true,
    tiberiumDeathToVisceroid: false,
    freeRadar: false,
    initTime: 10000,
    ignoreGlobalAITriggers: false,
    intro: '',
    brief: '',
    win: '',
    lose: '',
    action: '',
    postScore: '',
  }
}

function defaultHouse(name: string, playable: boolean): MapHouse {
  return {
    name,
    iq: playable ? 0 : 0,
    edge: 'North',
    country: name,
    color: name === 'Neutral' || name === 'Special' ? 'LightGrey' : 'DarkOrange',
    allies: name,
    credits: playable ? 10000 : 0,
    actsLike: 0,
    techLevel: playable ? 10 : 0,
    percentBuilt: 100,
    playerControl: playable,
    parentCountry: name,
    smartAI: false,
    nodes: [],
  }
}

export type NewMapOptions = {
  width: number
  height: number
  theater: MapTheater
  groundHeight?: number
  multiplayer?: boolean
  name?: string
  /** true=YR（含 YuriCountry）；false=原版 RA2。默认 YR。 */
  yuriRevenge?: boolean
}

export class MapDocument {
  width = 50
  height = 50
  theater: MapTheater = 'TEMPERATE'
  localX = 2
  localY = 4
  localWidth = 46
  localHeight = 44
  basic: MapBasic = defaultBasic(true)
  lighting: MapLighting = defaultLighting()
  ionLighting: MapLighting = defaultLighting()
  dominatorLighting: MapLighting = {
    ambient: 1.5,
    level: 0,
    red: 0.85,
    green: 0.2,
    blue: 0.3,
    ground: 0,
  }
  dominatorAmbientChangeRate = 0.009
  specialFlags: MapSpecialFlags = defaultSpecialFlags()
  cells = new Map<string, MapCell>()
  overlay = new Uint8Array(OVERLAY_PLANE_SIZE).fill(EMPTY_OVERLAY)
  overlayData = new Uint8Array(OVERLAY_PLANE_SIZE)
  infantry: MapTechno[] = []
  units: MapTechno[] = []
  aircraft: MapTechno[] = []
  structures: MapTechno[] = []
  terrains: MapTerrainObject[] = []
  smudges: MapSmudge[] = []
  waypoints: MapWaypoint[] = []
  cellTags: MapCellTag[] = []
  tags: MapTag[] = []
  triggers: MapTrigger[] = []
  houses: MapHouse[] = []
  /** FA2 RA2 的 [Countries] 列表；与 [Houses] 可独立。 */
  countries: string[] = []
  scripts: MapScriptType[] = []
  taskForces: MapTaskForce[] = []
  teams: MapTeamType[] = []
  aiTriggers: MapAiTrigger[] = []
  /** FA2 `[AITriggerTypesEnable]`：值为 yes 的 ID。 */
  aiTriggerEnable: Record<string, boolean> = {}
  tubes: MapTube[] = []
  variables: MapVariable[] = []
  extraSections: { name: string; entries: MapIniEntry[] }[] = []
  previewRgb: Uint8Array | null = null
  previewWidth = 0
  previewHeight = 0

  get isoSize(): number {
    return isoSizeOf(this.width, this.height)
  }

  getCell(rx: number, ry: number): MapCell {
    const key = cellKey(rx, ry)
    const existing = this.cells.get(key)
    if (existing) return existing
    const created = emptyCell(rx, ry)
    this.cells.set(key, created)
    return created
  }

  setCell(cell: MapCell): void {
    this.cells.set(cellKey(cell.rx, cell.ry), { ...cell })
  }

  getOverlay(rx: number, ry: number): { id: number; value: number } {
    const index = overlayIndex(rx, ry)
    return { id: this.overlay[index] ?? EMPTY_OVERLAY, value: this.overlayData[index] ?? 0 }
  }

  setOverlay(rx: number, ry: number, id: number, value = 0): void {
    const index = overlayIndex(rx, ry)
    this.overlay[index] = id & 0xff
    this.overlayData[index] = value & 0xff
  }

  clone(): MapDocument {
    return MapDocument.parse(this.toIniString())
  }

  static create(options: NewMapOptions): MapDocument {
    const doc = new MapDocument()
    doc.width = options.width
    doc.height = options.height
    doc.theater = options.theater
    doc.localX = 2
    doc.localY = 4
    doc.localWidth = Math.max(1, options.width - 4)
    doc.localHeight = Math.max(1, options.height - 6)
    doc.basic = defaultBasic(options.multiplayer !== false)
    if (options.name) doc.basic.name = options.name
    const height = options.groundHeight ?? 0
    forEachIsoCell(options.width, options.height, ({ rx, ry }) => {
      doc.cells.set(cellKey(rx, ry), emptyCell(rx, ry, height))
    })
    const houseNames = houseNamesForMode(options.yuriRevenge !== false)
    doc.houses = houseNames.map((name) => (
      defaultHouse(name, (PLAYABLE_HOUSES as readonly string[]).includes(name))
    ))
    doc.countries = houseNames.slice()
    if (doc.basic.multiplayerOnly) {
      const centerRx = Math.floor(options.width / 2) + 1
      const centerRy = Math.floor(options.height / 2) + 1
      const offsets = [
        [0, 0], [8, 0], [0, 8], [-8, 0], [0, -8], [8, 8], [-8, 8], [8, -8],
      ]
      doc.waypoints = offsets.slice(0, 8).map((offset, index) => ({
        number: index,
        rx: Math.max(1, centerRx + offset[0]),
        ry: Math.max(1, centerRy + offset[1]),
      }))
    }
    doc.rebuildPreview()
    return doc
  }

  static parse(text: string): MapDocument {
    const ini = MapIni.parse(text)
    const doc = new MapDocument()
    const size = csv(ini.getValue('Map', 'Size', '0,0,50,50')).map(Number)
    doc.width = size[2] || 50
    doc.height = size[3] || 50
    const local = csv(ini.getValue('Map', 'LocalSize', `2,4,${doc.width - 4},${doc.height - 6}`)).map(Number)
    doc.localX = local[0] || 2
    doc.localY = local[1] || 4
    doc.localWidth = local[2] || doc.width - 4
    doc.localHeight = local[3] || doc.height - 6
    const theater = ini.getValue('Map', 'Theater', 'TEMPERATE').toUpperCase() as MapTheater
    doc.theater = theater

    const basic = ini.getSection('Basic')
    doc.basic = defaultBasic(parseBool(ini.getValue('Basic', 'MultiplayerOnly', '0')))
    if (basic) {
      for (const entry of basic.entries) {
        switch (entry.key.toLowerCase()) {
          case 'name': doc.basic.name = entry.value; break
          case 'newiniformat': doc.basic.newIniFormat = Number(entry.value) || 4; break
          case 'multiplayeronly': doc.basic.multiplayerOnly = parseBool(entry.value); break
          case 'player': doc.basic.player = entry.value; break
          case 'nextscenario': doc.basic.nextScenario = entry.value; break
          case 'altnextscenario': doc.basic.altNextScenario = entry.value; break
          case 'homecell': doc.basic.homeCell = Number(entry.value) || 98; break
          case 'althomecell': doc.basic.altHomeCell = Number(entry.value) || 99; break
          case 'percent': doc.basic.percent = Number(entry.value) || 0; break
          case 'carryovermoney': doc.basic.carryOverMoney = Number(entry.value) || 0; break
          case 'carryovercap': doc.basic.carryOverCap = Number(entry.value) || 0; break
          case 'official': doc.basic.official = parseBool(entry.value); break
          case 'skipscore': doc.basic.skipScore = parseBool(entry.value); break
          case 'onetimeonly': doc.basic.oneTimeOnly = parseBool(entry.value); break
          case 'skipmapselect': doc.basic.skipMapSelect = parseBool(entry.value); break
          case 'endofgame': doc.basic.endOfGame = parseBool(entry.value); break
          case 'truckcrate': doc.basic.truckCrate = parseBool(entry.value); break
          case 'traincrate': doc.basic.trainCrate = parseBool(entry.value); break
          case 'tiberiumgrowthenabled': doc.basic.tiberiumGrowthEnabled = parseBool(entry.value, true); break
          case 'veingrowthenabled': doc.basic.veinGrowthEnabled = parseBool(entry.value, true); break
          case 'icegrowthenabled': doc.basic.iceGrowthEnabled = parseBool(entry.value, true); break
          case 'tiberiumdeathtovisceroid': doc.basic.tiberiumDeathToVisceroid = parseBool(entry.value); break
          case 'freeradar': doc.basic.freeRadar = parseBool(entry.value); break
          case 'inittime': doc.basic.initTime = Number(entry.value) || 10000; break
          case 'ignoreglobalaitriggers': doc.basic.ignoreGlobalAITriggers = parseBool(entry.value); break
          case 'intro': doc.basic.intro = entry.value; break
          case 'brief': doc.basic.brief = entry.value; break
          case 'win': doc.basic.win = entry.value; break
          case 'lose': doc.basic.lose = entry.value; break
          case 'action': doc.basic.action = entry.value; break
          case 'postscore': doc.basic.postScore = entry.value; break
        }
      }
    }

    const lighting = ini.getSection('Lighting')
    if (lighting) {
      doc.lighting = {
        ambient: Number(ini.getValue('Lighting', 'Ambient', '1')) || 1,
        level: Number(ini.getValue('Lighting', 'Level', '0.032')) || 0,
        red: Number(ini.getValue('Lighting', 'Red', '1')) || 1,
        green: Number(ini.getValue('Lighting', 'Green', '1')) || 1,
        blue: Number(ini.getValue('Lighting', 'Blue', '1')) || 1,
        ground: Number(ini.getValue('Lighting', 'Ground', '0')) || 0,
      }
      doc.ionLighting = {
        ambient: Number(ini.getValue('Lighting', 'IonAmbient', '1')) || 1,
        level: Number(ini.getValue('Lighting', 'IonLevel', '0.032')) || 0,
        red: Number(ini.getValue('Lighting', 'IonRed', '1')) || 1,
        green: Number(ini.getValue('Lighting', 'IonGreen', '1')) || 1,
        blue: Number(ini.getValue('Lighting', 'IonBlue', '1')) || 1,
        ground: Number(ini.getValue('Lighting', 'IonGround', '0')) || 0,
      }
      doc.dominatorLighting = {
        ambient: Number(ini.getValue('Lighting', 'DominatorAmbient', '1.5')) || 1.5,
        level: Number(ini.getValue('Lighting', 'DominatorLevel', '0')) || 0,
        red: Number(ini.getValue('Lighting', 'DominatorRed', '0.85')) || 0.85,
        green: Number(ini.getValue('Lighting', 'DominatorGreen', '0.2')) || 0.2,
        blue: Number(ini.getValue('Lighting', 'DominatorBlue', '0.3')) || 0.3,
        ground: Number(ini.getValue('Lighting', 'DominatorGround', '0')) || 0,
      }
      doc.dominatorAmbientChangeRate = Number(ini.getValue('Lighting', 'DominatorAmbientChangeRate', '0.009')) || 0.009
    }

    const flags = ini.getSection('SpecialFlags')
    if (flags) {
      doc.specialFlags = {
        tiberiumGrows: parseBool(ini.getValue('SpecialFlags', 'TiberiumGrows', 'yes'), true),
        tiberiumSpreads: parseBool(ini.getValue('SpecialFlags', 'TiberiumSpreads', 'yes'), true),
        tiberiumExplosive: parseBool(ini.getValue('SpecialFlags', 'TiberiumExplosive')),
        destroyableBridges: parseBool(ini.getValue('SpecialFlags', 'DestroyableBridges', 'yes'), true),
        mcvDeploy: parseBool(ini.getValue('SpecialFlags', 'MCVDeploy')),
        initialVeteran: parseBool(ini.getValue('SpecialFlags', 'InitialVeteran')),
        fixedAlliance: parseBool(ini.getValue('SpecialFlags', 'FixedAlliance')),
        harvesterImmune: parseBool(ini.getValue('SpecialFlags', 'HarvesterImmune')),
        fogOfWar: parseBool(ini.getValue('SpecialFlags', 'FogOfWar')),
        inert: parseBool(ini.getValue('SpecialFlags', 'Inert')),
        ionStorms: parseBool(ini.getValue('SpecialFlags', 'IonStorms')),
        meteorites: parseBool(ini.getValue('SpecialFlags', 'Meteorites')),
        visceroids: parseBool(ini.getValue('SpecialFlags', 'Visceroids', 'yes'), true),
      }
    }

    doc.cells = decodeIsoMapPack5(ini.getConcatenated('IsoMapPack5'), doc.width, doc.height)
    doc.overlay = new Uint8Array(decodeOverlayPack(ini.getConcatenated('OverlayPack')))
    doc.overlayData = new Uint8Array(decodeOverlayPack(ini.getConcatenated('OverlayDataPack')))
    if (!ini.getSection('OverlayDataPack')) doc.overlayData.fill(0)

    doc.waypoints = (ini.getSection('Waypoints')?.entries ?? []).map((entry) => {
      const parsed = parseWaypointCell(Number(entry.value))
      return { number: Number(entry.key), rx: parsed.rx, ry: parsed.ry }
    }).filter((item) => !Number.isNaN(item.number))

    doc.infantry = readTechnos(ini, 'Infantry', true)
    doc.units = readTechnos(ini, 'Units', false)
    doc.aircraft = readTechnos(ini, 'Aircraft', false)
    doc.structures = readStructures(ini)
    doc.terrains = (ini.getSection('Terrain')?.entries ?? []).map((entry) => {
      const parsed = parseWaypointCell(Number(entry.key))
      return { id: entry.key, name: entry.value, rx: parsed.rx, ry: parsed.ry }
    })
    doc.smudges = (ini.getSection('Smudge')?.entries ?? []).map((entry, index) => {
      const fields = csv(entry.value)
      return {
        id: entry.key || String(index),
        name: fields[0] || 'SMOKE',
        rx: Number(fields[1]) || 0,
        ry: Number(fields[2]) || 0,
        extra: Number(fields[3]) || 0,
      }
    })
    doc.cellTags = (ini.getSection('CellTags')?.entries ?? []).map((entry) => {
      const parsed = parseWaypointCell(Number(entry.key))
      return { rx: parsed.rx, ry: parsed.ry, tagId: entry.value }
    })
    doc.tags = (ini.getSection('Tags')?.entries ?? []).map((entry) => {
      const fields = csv(entry.value)
      return {
        id: entry.key,
        repeatType: Number(fields[0]) || 0,
        name: fields[1] || entry.key,
        triggerId: fields[2] || '',
      }
    })
    doc.triggers = readTriggers(ini)
    doc.houses = readHouses(ini)
    doc.countries = readCountryNames(ini)
    if (doc.countries.length === 0) doc.countries = doc.houses.map((house) => house.name)
    doc.scripts = readScripts(ini)
    doc.taskForces = readTaskForces(ini)
    doc.teams = readTeams(ini)
    doc.aiTriggers = readAiTriggers(ini)
    doc.aiTriggerEnable = readAiTriggerEnable(ini)
    doc.tubes = (ini.getSection('Tubes')?.entries ?? []).map((entry) => {
      const fields = csv(entry.value).map(Number)
      const end = fields.indexOf(-1, 5)
      return {
        id: entry.key,
        startY: fields[0] || 0,
        startX: fields[1] || 0,
        startDir: fields[2] || 0,
        endY: fields[3] || 0,
        endX: fields[4] || 0,
        parts: fields.slice(5, end === -1 ? undefined : end),
      }
    })
    doc.variables = (ini.getSection('VariableNames')?.entries ?? []).map((entry) => {
      const fields = csv(entry.value)
      return { index: Number(entry.key) || 0, name: fields[0] || '', value: Number(fields[1]) || 0 }
    })

    const previewPack = ini.getConcatenated('PreviewPack')
    if (ini.getSection('Preview') && previewPack) {
      const previewSize = csv(ini.getValue('Preview', 'Size', '0,0,0,0')).map(Number)
      doc.previewWidth = previewSize[2] || 0
      doc.previewHeight = previewSize[3] || 0
      if (doc.previewWidth > 0 && doc.previewHeight > 0) {
        try {
          const packed = base64StringToUint8Array(previewPack)
          const rgb = new Uint8Array(doc.previewWidth * doc.previewHeight * 3)
          Format5.decodeInto(packed, rgb)
          doc.previewRgb = rgb
        } catch {
          doc.previewRgb = null
        }
      }
    }

    const known = new Set([
      'header', 'digest', 'preview', 'previewpack', 'basic', 'map', 'lighting', 'specialflags',
      'isomappack5', 'overlaypack', 'overlaydatapack', 'waypoints', 'infantry', 'units', 'aircraft',
      'structures', 'terrain', 'smudge', 'celltags', 'tags', 'triggers', 'events', 'actions',
      'houses', 'countries', 'scripttypes', 'taskforces', 'teamtypes', 'aitriggertypes', 'aitriggertypesenable',
      'tubes', 'variablenames',
    ])
    const houseNames = new Set(doc.houses.map((house) => house.name.toLowerCase()))
    const scriptIds = new Set(doc.scripts.map((item) => item.id.toLowerCase()))
    const taskIds = new Set(doc.taskForces.map((item) => item.id.toLowerCase()))
    const teamIds = new Set(doc.teams.map((item) => item.id.toLowerCase()))
    for (const section of ini.sections) {
      const name = section.name.toLowerCase()
      if (known.has(name) || houseNames.has(name) || scriptIds.has(name) || taskIds.has(name) || teamIds.has(name)) {
        continue
      }
      doc.extraSections.push({ name: section.name, entries: section.entries.map((entry) => ({ ...entry })) })
    }
    return doc
  }

  rebuildPreview(): void {
    const width = Math.max(8, Math.min(200, this.width))
    const height = Math.max(8, Math.min(200, this.height))
    const rgb = new Uint8Array(width * height * 3)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rx = 1 + Math.floor((x / width) * this.width)
        const ry = 1 + Math.floor((y / height) * this.height)
        const cell = this.cells.get(cellKey(rx, ry))
        const overlay = this.getOverlay(rx, ry)
        const shade = 40 + Math.min(200, (cell?.height ?? 0) * 14)
        let r = shade
        let g = shade + 20
        let b = shade - 10
        if (overlay.id !== EMPTY_OVERLAY) {
          if (overlay.id >= RIPARIUS_BEGIN && overlay.id <= RIPARIUS_END) {
            r = 220; g = 180; b = 40
          } else if (overlay.id >= CRUENTUS_BEGIN && overlay.id <= CRUENTUS_END) {
            r = 80; g = 160; b = 220
          } else if (overlay.id === OVRL_VEINS || overlay.id === OVRL_VEINHOLE || overlay.id === OVRL_VEINHOLEBORDER) {
            r = 165; g = 160; b = 120
          } else {
            r = 90; g = 90; b = 90
          }
        }
        const index = (y * width + x) * 3
        rgb[index] = r
        rgb[index + 1] = g
        rgb[index + 2] = b
      }
    }
    this.previewWidth = width
    this.previewHeight = height
    this.previewRgb = rgb
  }

  copyFrom(other: MapDocument): void {
    const parsed = MapDocument.parse(other.toIniString())
    this.width = parsed.width
    this.height = parsed.height
    this.theater = parsed.theater
    this.localX = parsed.localX
    this.localY = parsed.localY
    this.localWidth = parsed.localWidth
    this.localHeight = parsed.localHeight
    this.basic = parsed.basic
    this.lighting = parsed.lighting
    this.ionLighting = parsed.ionLighting
    this.dominatorLighting = parsed.dominatorLighting
    this.dominatorAmbientChangeRate = parsed.dominatorAmbientChangeRate
    this.specialFlags = parsed.specialFlags
    this.cells = parsed.cells
    this.overlay = parsed.overlay
    this.overlayData = parsed.overlayData
    this.infantry = parsed.infantry
    this.units = parsed.units
    this.aircraft = parsed.aircraft
    this.structures = parsed.structures
    this.terrains = parsed.terrains
    this.smudges = parsed.smudges
    this.waypoints = parsed.waypoints
    this.cellTags = parsed.cellTags
    this.tags = parsed.tags
    this.triggers = parsed.triggers
    this.houses = parsed.houses
    this.countries = parsed.countries
    this.scripts = parsed.scripts
    this.taskForces = parsed.taskForces
    this.teams = parsed.teams
    this.aiTriggers = parsed.aiTriggers
    this.aiTriggerEnable = parsed.aiTriggerEnable
    this.tubes = parsed.tubes
    this.variables = parsed.variables
    this.extraSections = parsed.extraSections
    this.previewRgb = parsed.previewRgb
    this.previewWidth = parsed.previewWidth
    this.previewHeight = parsed.previewHeight
  }

  toIniString(): string {
    this.rebuildPreview()
    const ini = new MapIni()
    ini.replaceSection('Header', [
      { key: 'Width', value: String(this.width) },
      { key: 'Height', value: String(this.height) },
    ])
    ini.replaceSection('Preview', [
      { key: 'Size', value: `0,0,${this.previewWidth},${this.previewHeight}` },
    ])
    if (this.previewRgb) {
      ini.setPackedSection('PreviewPack', uint8ArrayToBase64String(Format5.encode(this.previewRgb, 5)))
    }
    ini.replaceSection('Basic', [
      { key: 'Name', value: this.basic.name },
      { key: 'NewINIFormat', value: String(this.basic.newIniFormat) },
      { key: 'CarryOverCap', value: String(this.basic.carryOverCap) },
      { key: 'EndOfGame', value: yn(this.basic.endOfGame) },
      { key: 'SkipScore', value: yn(this.basic.skipScore) },
      { key: 'OneTimeOnly', value: yn(this.basic.oneTimeOnly) },
      { key: 'SkipMapSelect', value: yn(this.basic.skipMapSelect) },
      { key: 'Official', value: yn(this.basic.official) },
      { key: 'IgnoreGlobalAITriggers', value: yn(this.basic.ignoreGlobalAITriggers) },
      { key: 'TruckCrate', value: yn(this.basic.truckCrate) },
      { key: 'TrainCrate', value: yn(this.basic.trainCrate) },
      { key: 'Percent', value: String(this.basic.percent) },
      { key: 'CarryOverMoney', value: String(this.basic.carryOverMoney) },
      { key: 'HomeCell', value: String(this.basic.homeCell) },
      { key: 'AltHomeCell', value: String(this.basic.altHomeCell) },
      { key: 'MultiplayerOnly', value: this.basic.multiplayerOnly ? '1' : '0' },
      { key: 'TiberiumGrowthEnabled', value: yn(this.basic.tiberiumGrowthEnabled) },
      { key: 'VeinGrowthEnabled', value: yn(this.basic.veinGrowthEnabled) },
      { key: 'IceGrowthEnabled', value: yn(this.basic.iceGrowthEnabled) },
      { key: 'TiberiumDeathToVisceroid', value: yn(this.basic.tiberiumDeathToVisceroid) },
      { key: 'FreeRadar', value: yn(this.basic.freeRadar) },
      { key: 'InitTime', value: String(this.basic.initTime) },
      { key: 'Player', value: this.basic.player },
      { key: 'NextScenario', value: this.basic.nextScenario },
      { key: 'AltNextScenario', value: this.basic.altNextScenario },
      { key: 'Intro', value: this.basic.intro },
      { key: 'Brief', value: this.basic.brief },
      { key: 'Win', value: this.basic.win },
      { key: 'Lose', value: this.basic.lose },
      { key: 'Action', value: this.basic.action },
      { key: 'PostScore', value: this.basic.postScore },
    ])
    ini.replaceSection('Map', [
      { key: 'Size', value: `0,0,${this.width},${this.height}` },
      { key: 'Theater', value: this.theater },
      { key: 'LocalSize', value: `${this.localX},${this.localY},${this.localWidth},${this.localHeight}` },
    ])
    ini.replaceSection('Lighting', [
      { key: 'Ambient', value: fmt(this.lighting.ambient) },
      { key: 'Red', value: fmt(this.lighting.red) },
      { key: 'Green', value: fmt(this.lighting.green) },
      { key: 'Blue', value: fmt(this.lighting.blue) },
      { key: 'Ground', value: fmt(this.lighting.ground) },
      { key: 'Level', value: fmt(this.lighting.level) },
      { key: 'IonAmbient', value: fmt(this.ionLighting.ambient) },
      { key: 'IonRed', value: fmt(this.ionLighting.red) },
      { key: 'IonGreen', value: fmt(this.ionLighting.green) },
      { key: 'IonBlue', value: fmt(this.ionLighting.blue) },
      { key: 'IonGround', value: fmt(this.ionLighting.ground) },
      { key: 'IonLevel', value: fmt(this.ionLighting.level) },
      { key: 'DominatorRed', value: fmt(this.dominatorLighting.red) },
      { key: 'DominatorBlue', value: fmt(this.dominatorLighting.blue) },
      { key: 'DominatorGreen', value: fmt(this.dominatorLighting.green) },
      { key: 'DominatorLevel', value: fmt(this.dominatorLighting.level) },
      { key: 'DominatorGround', value: fmt(this.dominatorLighting.ground) },
      { key: 'DominatorAmbient', value: fmt(this.dominatorLighting.ambient) },
      { key: 'DominatorAmbientChangeRate', value: fmt(this.dominatorAmbientChangeRate) },
    ])
    ini.replaceSection('SpecialFlags', [
      { key: 'TiberiumGrows', value: yn(this.specialFlags.tiberiumGrows) },
      { key: 'TiberiumSpreads', value: yn(this.specialFlags.tiberiumSpreads) },
      { key: 'TiberiumExplosive', value: yn(this.specialFlags.tiberiumExplosive) },
      { key: 'DestroyableBridges', value: yn(this.specialFlags.destroyableBridges) },
      { key: 'MCVDeploy', value: yn(this.specialFlags.mcvDeploy) },
      { key: 'InitialVeteran', value: yn(this.specialFlags.initialVeteran) },
      { key: 'FixedAlliance', value: yn(this.specialFlags.fixedAlliance) },
      { key: 'HarvesterImmune', value: yn(this.specialFlags.harvesterImmune) },
      { key: 'FogOfWar', value: yn(this.specialFlags.fogOfWar) },
      { key: 'Inert', value: yn(this.specialFlags.inert) },
      { key: 'IonStorms', value: yn(this.specialFlags.ionStorms) },
      { key: 'Meteorites', value: yn(this.specialFlags.meteorites) },
      { key: 'Visceroids', value: yn(this.specialFlags.visceroids) },
    ])
    ini.setPackedSection('IsoMapPack5', encodeIsoMapPack5(this.cells, this.width, this.height))
    ini.setPackedSection('OverlayPack', encodeOverlayPack(this.overlay))
    ini.setPackedSection('OverlayDataPack', encodeOverlayPack(this.overlayData))
    ini.replaceSection('Waypoints', this.waypoints.map((item) => ({
      key: String(item.number),
      value: String(waypointCell(item.rx, item.ry)),
    })))
    writeTechnos(ini, 'Infantry', this.infantry, true)
    writeTechnos(ini, 'Units', this.units, false)
    writeTechnos(ini, 'Aircraft', this.aircraft, false)
    writeStructures(ini, this.structures)
    ini.replaceSection('Terrain', this.terrains.map((item) => ({
      key: String(waypointCell(item.rx, item.ry)),
      value: item.name,
    })))
    ini.replaceSection('Smudge', this.smudges.map((item, index) => ({
      key: item.id || String(index),
      value: `${item.name},${item.rx},${item.ry},${item.extra}`,
    })))
    ini.replaceSection('CellTags', this.cellTags.map((item) => ({
      key: String(waypointCell(item.rx, item.ry)),
      value: item.tagId,
    })))
    ini.replaceSection('Tags', this.tags.map((item) => ({
      key: item.id,
      value: `${item.repeatType},${item.name},${item.triggerId}`,
    })))
    writeTriggers(ini, this.triggers)
    writeHouses(ini, this.houses, this.countries)
    writeScripts(ini, this.scripts)
    writeTaskForces(ini, this.taskForces)
    writeTeams(ini, this.teams)
    ini.replaceSection('AITriggerTypes', this.aiTriggers.map((item) => ({
      key: item.id,
      value: item.raw || serializeAiTrigger(item),
    })))
    ini.replaceSection('AITriggerTypesEnable', Object.entries(this.aiTriggerEnable)
      .filter(([, enabled]) => enabled)
      .map(([id]) => ({ key: id, value: 'yes' })))
    ini.replaceSection('Tubes', this.tubes.map((item) => ({
      key: item.id,
      value: [item.startY, item.startX, item.startDir, item.endY, item.endX, ...item.parts, -1].join(','),
    })))
    ini.replaceSection('VariableNames', this.variables.map((item) => ({
      key: String(item.index),
      value: `${item.name},${item.value}`,
    })))
    for (const extra of this.extraSections) {
      ini.replaceSection(extra.name, extra.entries.map((entry) => ({ ...entry })))
    }
    return ini.toString()
  }
}

function fmt(value: number): string {
  return value.toFixed(6)
}

function readTechnos(ini: MapIni, section: string, infantry: boolean): MapTechno[] {
  return (ini.getSection(section)?.entries ?? []).map((entry) => {
    const fields = csv(entry.value)
    return {
      id: entry.key,
      owner: fields[0] || 'Neutral',
      name: fields[1] || '',
      health: Number(fields[2]) || 256,
      rx: Number(fields[3]) || 0,
      ry: Number(fields[4]) || 0,
      subCell: infantry ? Number(fields[5]) || 0 : undefined,
      mission: infantry ? (fields[6] || 'Guard') : (fields[6] || 'Guard'),
      direction: infantry ? Number(fields[7]) || 0 : Number(fields[5]) || 0,
      tag: infantry ? (fields[8] || 'none') : (fields[7] || 'none'),
      veterancy: infantry ? Number(fields[9]) || 0 : Number(fields[8]) || 0,
      group: infantry ? Number(fields[10]) || -1 : Number(fields[9]) || -1,
      onBridge: infantry ? fields[11] === '1' : fields[10] === '1',
      recruitable: infantry ? fields[12] === '1' : fields[12] === '1',
      aiRecruitable: infantry ? fields[13] === '1' : fields[13] === '1',
      extra: fields.slice(infantry ? 14 : 14),
    }
  })
}

function writeTechnos(ini: MapIni, section: string, items: MapTechno[], infantry: boolean): void {
  ini.replaceSection(section, items.map((item, index) => {
    const fields = infantry
      ? [
        item.owner, item.name, String(item.health), String(item.rx), String(item.ry),
        String(item.subCell ?? 0), item.mission, String(item.direction), item.tag || 'none',
        String(item.veterancy), String(item.group), item.onBridge ? '1' : '0',
        item.recruitable ? '1' : '0', item.aiRecruitable ? '1' : '0',
        ...item.extra,
      ]
      : [
        item.owner, item.name, String(item.health), String(item.rx), String(item.ry),
        String(item.direction), item.mission, item.tag || 'none', String(item.veterancy),
        String(item.group), item.onBridge ? '1' : '0', '0',
        item.recruitable ? '1' : '0', item.aiRecruitable ? '1' : '0',
        ...item.extra,
      ]
    return { key: item.id || String(index), value: fields.join(',') }
  }))
}

function readStructures(ini: MapIni): MapTechno[] {
  return (ini.getSection('Structures')?.entries ?? []).map((entry) => {
    const fields = csv(entry.value)
    return {
      id: entry.key,
      owner: fields[0] || 'Neutral',
      name: fields[1] || '',
      health: Number(fields[2]) || 256,
      rx: Number(fields[3]) || 0,
      ry: Number(fields[4]) || 0,
      direction: Number(fields[5]) || 0,
      tag: fields[6] || 'none',
      extra: fields.slice(15),
      poweredOn: fields[9] !== '0',
      upgradeCount: Number(fields[10]) || 0,
      spotlight: fields[11] || '0',
      upgrade1: fields[12] || 'none',
      upgrade2: fields[13] || 'none',
      upgrade3: fields[14] || 'none',
      mission: 'Guard',
      veterancy: 0,
      group: -1,
      onBridge: false,
      recruitable: false,
      aiRecruitable: false,
    }
  })
}

function writeStructures(ini: MapIni, items: MapTechno[]): void {
  ini.replaceSection('Structures', items.map((item, index) => ({
    key: item.id || String(index),
    value: [
      item.owner, item.name, String(item.health), String(item.rx), String(item.ry),
      String(item.direction), item.tag || 'none', '1', '0', item.poweredOn === false ? '0' : '1',
      String(item.upgradeCount ?? 0), item.spotlight || '0',
      item.upgrade1 || 'none', item.upgrade2 || 'none', item.upgrade3 || 'none',
      '0', '0',
      ...item.extra,
    ].join(','),
  })))
}

function readTriggers(ini: MapIni): MapTrigger[] {
  const eventsById = new Map<string, MapTriggerEvent[]>()
  for (const entry of ini.getSection('Events')?.entries ?? []) {
    const fields = csv(entry.value)
    const count = Number(fields.shift()) || 0
    const events: MapTriggerEvent[] = []
    for (let i = 0; i < count; i++) {
      const type = Number(fields.shift()) || 0
      const paramKind = Number(fields.shift()) || 0
      const params = fields.splice(0, paramKind === 2 ? 2 : 1)
      events.push({ type, paramKind, params })
    }
    eventsById.set(entry.key, events)
  }
  const actionsById = new Map<string, MapTriggerAction[]>()
  for (const entry of ini.getSection('Actions')?.entries ?? []) {
    const fields = csv(entry.value)
    const count = Number(fields.shift()) || 0
    const actions: MapTriggerAction[] = []
    for (let i = 0; i < count; i++) {
      const type = Number(fields.shift()) || 0
      const params = fields.splice(0, 7)
      while (params.length < 7) params.push('0')
      actions.push({ type, params })
    }
    actionsById.set(entry.key, actions)
  }
  return (ini.getSection('Triggers')?.entries ?? []).map((entry) => {
    const fields = csv(entry.value)
    return {
      id: entry.key,
      houseName: fields[0] || '<none>',
      attachedTriggerId: fields[1] || '<none>',
      name: fields[2] || entry.key,
      disabled: fields[3] === '1',
      easy: fields[4] !== '0',
      medium: fields[5] !== '0',
      hard: fields[6] !== '0',
      events: eventsById.get(entry.key) ?? [],
      actions: actionsById.get(entry.key) ?? [],
    }
  })
}

function writeTriggers(ini: MapIni, triggers: MapTrigger[]): void {
  ini.replaceSection('Triggers', triggers.map((item) => ({
    key: item.id,
    value: [
      item.houseName, item.attachedTriggerId || '<none>', item.name,
      item.disabled ? '1' : '0', item.easy ? '1' : '0', item.medium ? '1' : '0', item.hard ? '1' : '0',
      '0',
    ].join(','),
  })))
  ini.replaceSection('Events', triggers.map((item) => {
    const parts = [String(item.events.length)]
    for (const event of item.events) {
      parts.push(String(event.type), String(event.paramKind), ...event.params)
    }
    return { key: item.id, value: parts.join(',') }
  }))
  ini.replaceSection('Actions', triggers.map((item) => {
    const parts = [String(item.actions.length)]
    for (const action of item.actions) {
      const params = [...action.params]
      while (params.length < 7) params.push('0')
      parts.push(String(action.type), ...params.slice(0, 7))
    }
    return { key: item.id, value: parts.join(',') }
  }))
}

function readCountryNames(ini: MapIni): string[] {
  const list = ini.getSection('Countries')?.entries ?? []
  return list.map((entry) => entry.value || entry.key).filter(Boolean)
}

function readHouses(ini: MapIni): MapHouse[] {
  const houseList = ini.getSection('Houses')?.entries ?? []
  const countryList = ini.getSection('Countries')?.entries ?? []
  const list = houseList.length > 0 ? houseList : countryList
  if (list.length === 0) return []
  return list.map((entry) => {
    const name = entry.value || entry.key
    const section = ini.getSection(name)
    const house = defaultHouse(name, (PLAYABLE_HOUSES as readonly string[]).includes(name))
    if (!section) return house
    const values = Object.fromEntries(section.entries.map((item) => [item.key.toLowerCase(), item.value]))
    house.iq = Number(values.iq) || 0
    house.edge = values.edge || 'North'
    house.country = values.country || values.side || name
    house.color = values.color || house.color
    house.allies = values.allies || name
    house.credits = Number(values.credits) || 0
    house.actsLike = Number(values.actslike) || 0
    house.techLevel = Number(values.techlevel) || 0
    house.percentBuilt = Number(values.percentbuilt) || 100
    house.playerControl = parseBool(values.playercontrol || '')
    house.parentCountry = values.parentcountry || name
    house.smartAI = parseBool(values.smartai || '')
    const nodeCount = Number(values.nodecount) || 0
    house.nodes = []
    for (let i = 0; i < nodeCount; i++) {
      const node = csv(values[String(i)] || '')
      if (node.length >= 3) {
        house.nodes.push({ type: node[0], rx: Number(node[1]) || 0, ry: Number(node[2]) || 0 })
      }
    }
    return house
  })
}

function writeHouses(ini: MapIni, houses: MapHouse[], countries: string[]): void {
  const countryNames = countries.length > 0 ? countries : houses.map((house) => house.name)
  ini.replaceSection('Countries', countryNames.map((name, index) => ({
    key: String(index),
    value: name,
  })))
  ini.replaceSection('Houses', houses.map((house, index) => ({
    key: String(index),
    value: house.name,
  })))
  for (const house of houses) {
    const entries: MapIniEntry[] = [
      { key: 'IQ', value: String(house.iq) },
      { key: 'Edge', value: house.edge },
      { key: 'Country', value: house.country },
      { key: 'Color', value: house.color },
      { key: 'Allies', value: house.allies },
      { key: 'Credits', value: String(house.credits) },
      { key: 'ActsLike', value: String(house.actsLike) },
      { key: 'NodeCount', value: String(house.nodes.length) },
      { key: 'TechLevel', value: String(house.techLevel) },
      { key: 'PercentBuilt', value: String(house.percentBuilt) },
      { key: 'PlayerControl', value: yn(house.playerControl) },
      { key: 'ParentCountry', value: house.parentCountry },
      { key: 'SmartAI', value: yn(house.smartAI) },
    ]
    house.nodes.forEach((node, index) => {
      entries.push({ key: String(index), value: `${node.type},${node.rx},${node.ry}` })
    })
    ini.replaceSection(house.name, entries)
  }
}

function readScripts(ini: MapIni): MapScriptType[] {
  const list = ini.getSection('ScriptTypes')?.entries ?? []
  return list.map((entry) => {
    const id = entry.value || entry.key
    const section = ini.getSection(id)
    const actions: MapScriptType['actions'] = []
    let name = id
    if (section) {
      for (const item of section.entries) {
        if (item.key.toLowerCase() === 'name') name = item.value
        else if (/^\d+$/.test(item.key)) {
          const fields = csv(item.value)
          actions.push({ type: Number(fields[0]) || 0, argument: fields[1] || '0' })
        }
      }
    }
    return { id, name, actions }
  })
}

function writeScripts(ini: MapIni, scripts: MapScriptType[]): void {
  ini.replaceSection('ScriptTypes', scripts.map((item, index) => ({
    key: String(index),
    value: item.id,
  })))
  for (const script of scripts) {
    ini.replaceSection(script.id, [
      { key: 'Name', value: script.name },
      ...script.actions.map((action, index) => ({
        key: String(index),
        value: `${action.type},${action.argument}`,
      })),
    ])
  }
}

function readTaskForces(ini: MapIni): MapTaskForce[] {
  const list = ini.getSection('TaskForces')?.entries ?? []
  return list.map((entry) => {
    const id = entry.value || entry.key
    const section = ini.getSection(id)
    const task: MapTaskForce = { id, name: id, group: -1, entries: [] }
    if (section) {
      for (const item of section.entries) {
        const key = item.key.toLowerCase()
        if (key === 'name') task.name = item.value
        else if (key === 'group') task.group = Number(item.value)
        else if (/^\d+$/.test(item.key)) {
          const fields = csv(item.value)
          task.entries.push({ count: Number(fields[0]) || 1, objectName: fields[1] || '' })
        }
      }
    }
    return task
  })
}

function writeTaskForces(ini: MapIni, items: MapTaskForce[]): void {
  ini.replaceSection('TaskForces', items.map((item, index) => ({
    key: String(index),
    value: item.id,
  })))
  for (const item of items) {
    ini.replaceSection(item.id, [
      { key: 'Name', value: item.name },
      { key: 'Group', value: String(item.group) },
      ...item.entries.map((entry, index) => ({
        key: String(index),
        value: `${entry.count},${entry.objectName}`,
      })),
    ])
  }
}

function readTeams(ini: MapIni): MapTeamType[] {
  const list = ini.getSection('TeamTypes')?.entries ?? []
  return list.map((entry) => {
    const id = entry.value || entry.key
    const section = ini.getSection(id)
    const team: MapTeamType = {
      id,
      name: id,
      houseName: 'Americans',
      script: '<none>',
      taskForce: '<none>',
      tag: '<none>',
      waypoint: -1,
      transportWaypoint: -1,
      veteranLevel: 1,
      max: 1,
      priority: 5,
      techLevel: 0,
      group: -1,
      aggressive: false,
      annoyance: false,
      autocreate: false,
      droppod: false,
      full: false,
      guardSlower: false,
      loadable: false,
      looseRecruit: false,
      onTransOnly: false,
      prebuild: false,
      recruiter: false,
      reinforce: false,
      suicide: false,
      transportsReturnOnUnload: false,
      useTransportOrigin: false,
      areTeamMembersRecruitable: false,
      onlyTargetHouseEnemy: false,
      whiner: false,
      avoidThreats: false,
      ionImmune: false,
      isBaseDefense: false,
      mindControlDecision: 0,
    }
    if (!section) return team
    const values = Object.fromEntries(section.entries.map((item) => [item.key.toLowerCase(), item.value]))
    team.name = values.name || team.name
    team.houseName = values.house || team.houseName
    team.script = values.script || team.script
    team.taskForce = values.taskforce || team.taskForce
    team.tag = values.tag || team.tag
    team.waypoint = Number(values.waypoint ?? -1)
    team.transportWaypoint = Number(values.transportwaypoint ?? -1)
    team.veteranLevel = Number(values.veteranlevel ?? 1)
    team.max = Number(values.max ?? 1)
    team.priority = Number(values.priority ?? 5)
    team.techLevel = Number(values.techlevel ?? 0)
    team.group = Number(values.group ?? -1)
    team.aggressive = parseBool(values.aggressive || '')
    team.annoyance = parseBool(values.annoyance || '')
    team.autocreate = parseBool(values.autocreate || '')
    team.droppod = parseBool(values.droppod || '')
    team.full = parseBool(values.full || '')
    team.guardSlower = parseBool(values.guardslower || '')
    team.loadable = parseBool(values.loadable || '')
    team.looseRecruit = parseBool(values.looserecruit || '')
    team.onTransOnly = parseBool(values.ontransonly || '')
    team.prebuild = parseBool(values.prebuild || '')
    team.recruiter = parseBool(values.recruiter || '')
    team.reinforce = parseBool(values.reinforce || '')
    team.suicide = parseBool(values.suicide || '')
    team.transportsReturnOnUnload = parseBool(values.transportsreturnonunload || '')
    team.useTransportOrigin = parseBool(values.usetransportorigin || '')
    team.areTeamMembersRecruitable = parseBool(values.areteammembersrecruitable || '')
    team.onlyTargetHouseEnemy = parseBool(values.onlytargethouseenemy || '')
    team.whiner = parseBool(values.whiner || '')
    team.avoidThreats = parseBool(values.avoidthreats || '')
    team.ionImmune = parseBool(values.ionimmune || '')
    team.isBaseDefense = parseBool(values.isbasedefense || '')
    team.mindControlDecision = Number(values.mindcontroldecision ?? 0) || 0
    return team
  })
}

function writeTeams(ini: MapIni, items: MapTeamType[]): void {
  ini.replaceSection('TeamTypes', items.map((item, index) => ({
    key: String(index),
    value: item.id,
  })))
  for (const item of items) {
    ini.replaceSection(item.id, [
      { key: 'Name', value: item.name },
      { key: 'House', value: item.houseName },
      { key: 'Script', value: item.script },
      { key: 'TaskForce', value: item.taskForce },
      { key: 'Tag', value: item.tag },
      { key: 'Waypoint', value: String(item.waypoint) },
      { key: 'TransportWaypoint', value: String(item.transportWaypoint) },
      { key: 'VeteranLevel', value: String(item.veteranLevel) },
      { key: 'Max', value: String(item.max) },
      { key: 'Priority', value: String(item.priority) },
      { key: 'TechLevel', value: String(item.techLevel) },
      { key: 'Group', value: String(item.group) },
      { key: 'Aggressive', value: yn(item.aggressive) },
      { key: 'Annoyance', value: yn(item.annoyance) },
      { key: 'Autocreate', value: yn(item.autocreate) },
      { key: 'Droppod', value: yn(item.droppod) },
      { key: 'Full', value: yn(item.full) },
      { key: 'GuardSlower', value: yn(item.guardSlower) },
      { key: 'Loadable', value: yn(item.loadable) },
      { key: 'LooseRecruit', value: yn(item.looseRecruit) },
      { key: 'OnTransOnly', value: yn(item.onTransOnly) },
      { key: 'Prebuild', value: yn(item.prebuild) },
      { key: 'Recruiter', value: yn(item.recruiter) },
      { key: 'Reinforce', value: yn(item.reinforce) },
      { key: 'Suicide', value: yn(item.suicide) },
      { key: 'TransportsReturnOnUnload', value: yn(item.transportsReturnOnUnload) },
      { key: 'UseTransportOrigin', value: yn(item.useTransportOrigin) },
      { key: 'AreTeamMembersRecruitable', value: yn(item.areTeamMembersRecruitable) },
      { key: 'OnlyTargetHouseEnemy', value: yn(item.onlyTargetHouseEnemy) },
      { key: 'Whiner', value: yn(item.whiner) },
      { key: 'AvoidThreats', value: yn(item.avoidThreats) },
      { key: 'IonImmune', value: yn(item.ionImmune) },
      { key: 'IsBaseDefense', value: yn(item.isBaseDefense) },
      { key: 'MindControlDecision', value: String(item.mindControlDecision) },
    ])
  }
}

function readAiTriggers(ini: MapIni): MapAiTrigger[] {
  return (ini.getSection('AITriggerTypes')?.entries ?? []).map((entry) => {
    const fields = csv(entry.value)
    return {
      id: entry.key,
      name: fields[0] || entry.key,
      team1: fields[1] || '<none>',
      ownerHouse: fields[2] || '<all>',
      techLevel: Number(fields[3]) || 0,
      conditionType: Number(fields[4]) || -1,
      conditionObject: fields[5] || '<none>',
      comparator: fields[6] || '0',
      startingCredits: Number(fields[15]) || 0,
      sideIndex: Number(fields[16]) || 0,
      baseDefense: fields[17] === '1',
      team2: fields[18] || '<none>',
      enabledEasy: fields[19] !== '0',
      enabledMedium: fields[20] !== '0',
      enabledHard: fields[21] !== '0',
      raw: entry.value,
    }
  })
}

function serializeAiTrigger(item: MapAiTrigger): string {
  return [
    item.name, item.team1, item.ownerHouse, String(item.techLevel),
    String(item.conditionType), item.conditionObject, item.comparator,
    '0', '0', '0', '0', '0', '0', '0', '0',
    String(item.startingCredits), String(item.sideIndex), item.baseDefense ? '1' : '0',
    item.team2, item.enabledEasy ? '1' : '0', item.enabledMedium ? '1' : '0', item.enabledHard ? '1' : '0',
  ].join(',')
}

function readAiTriggerEnable(ini: MapIni): Record<string, boolean> {
  const enabled: Record<string, boolean> = {}
  for (const entry of ini.getSection('AITriggerTypesEnable')?.entries ?? []) {
    const value = entry.value.trim().toLowerCase()
    enabled[entry.key] = value === 'yes' || value === 'true' || value === '1'
  }
  return enabled
}

export function createMapObjectId(): string {
  return nextId('')
}
