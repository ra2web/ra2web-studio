import { VxlFile } from '../VxlFile'
import { TmpFile } from '../TmpFile'
import type { TmpImage } from '../TmpImage'
import { ShpFile } from '../ShpFile'
import { HvaFile } from '../HvaFile'
import type { VirtualFile } from '../vfs/VirtualFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH, type MapTheater } from './constants'
import { artShpCandidates, artVxlCandidates, BUILDING_SUBGRAPHIC_KEYS, readArtImage, resolveRulesImage } from './imageFinder'
import { MapIni } from './MapIni'
import { blitIndexedToRgba, compositeShpFrame, emptyRgba, overlayBuildingSubgraphic, overlayRgbaAt, pickShpFrame, rgbaHasOpaque, type IndexedRgba } from './shpBlit'
import { blitTmpToRgba, type TmpRadarRgb, type TmpRgba } from './tmpBlit'
import { blitVoxelsToRgba, applyHvaToVoxels, quantizedFacing } from './vxlBlit'
import { fa2InfantryShpFrame, fa2UnitShpFrame, type ObjectSpriteKind } from './fa2Facing'
import { houseRemapPalette, parseHouseColors, type HouseColorTable, type HouseRgb } from './fa2HouseColor'
import { fa2BuildingTurretShpFrame, readBuildingTurret } from './fa2BuildingTurret'
import { parseBuildingFoundations, type BuildingFoundation } from './rulesObjects'
import { TILE_TO_LAT, type SmoothTerrainLookup } from './fa2Smooth'
import { shorePieceFromShape, shapeFromTmp, type TmpTileShape } from './tmpCatalog'
import type { ShorePiece } from './fa2Shore'
import {
  THEATER_ASSETS,
  TheaterRules,
  marbleTileNum,
  parseTheaterIni,
  theaterIniNames,
  tmpFileName,
  tmpVariantFileName,
  cellTmpVariantIndex,
  tileNumToSet,
  type TheaterIndex,
} from './theaterIndex'

export type TilePixels = IndexedRgba & Partial<Pick<TmpRgba, 'drawOffsetX' | 'drawOffsetY' | 'blockWidth' | 'blockHeight' | 'radarLeft' | 'radarRight'>>

type OpenFile = (name: string) => Promise<VirtualFile | null>

function fillPalette(target: Uint8Array, palFile: VirtualFile | null): void {
  if (!palFile) return
  const parsed = PaletteParser.fromBytes(palFile.getBytes())
    ?? PaletteParser.fromUnknownContent({ text: palFile.readAsString(), bytes: palFile.getBytes() })
  parsed?.colors.forEach((color, index) => {
    target[index * 3] = color.r
    target[index * 3 + 1] = color.g
    target[index * 3 + 2] = color.b
  })
}

export class TheaterArt {
  index: TheaterIndex | null = null
  overlayNames: string[] = []
  palette = new Uint8Array(768)
  unitPalette = new Uint8Array(768)
  overlayPalette = new Uint8Array(768)
  foundations: Record<string, BuildingFoundation> = {}
  houseColors: HouseColorTable = {}
  shoreCatalog: ShorePiece[] = []
  cliffShapes = new Map<number, TmpTileShape>()
  onUpdate: (() => void) | null = null
  private artIni: MapIni | null = null
  private rulesIni: MapIni | null = null
  private readonly pixels = new Map<string, TilePixels | null>()
  private readonly tmpCache = new Map<string, TmpFile | null>()
  private readonly shpCache = new Map<string, ShpFile | null>()
  private readonly hvaCache = new Map<string, HvaFile | null>()
  private readonly setTerrain = new Map<number, number>()
  private readonly tileShapes = new Map<number, TmpTileShape>()
  private readonly inflight = new Set<string>()
  private readonly variantFiles = new Map<string, TmpFile[]>()

  constructor(
    private readonly openFile: OpenFile,
    public readonly theater: MapTheater,
  ) {}

  static async load(resourceContext: ResourceContext | null | undefined, theater: MapTheater): Promise<TheaterArt | null> {
    if (!resourceContext) return null
    const openFile: OpenFile = (name) => resourceContext.resolveFileFromOverlay(name)
    const art = new TheaterArt(openFile, theater)
    const assets = THEATER_ASSETS[theater]
    let iniFile: VirtualFile | null = null
    for (const iniName of theaterIniNames(theater)) {
      const opened = await openFile(iniName)
      if (opened) {
        iniFile = opened
        break
      }
    }
    if (!iniFile) return null
    art.index = parseTheaterIni(iniFile.readAsString())
    const palFile = await openFile(assets.pal)
    fillPalette(art.palette, palFile)
    art.unitPalette.set(art.palette)
    fillPalette(art.unitPalette, await openFile(assets.unitPal))
    art.overlayPalette.set(art.palette)
    fillPalette(art.overlayPalette, await openFile(assets.overlayPal) ?? await openFile('overlay.pal'))
    const artFile = await openFile('artmd.ini') ?? await openFile('art.ini')
    if (artFile) art.artIni = MapIni.parse(artFile.readAsString())
    const rulesFile = await openFile('rulesmd.ini') ?? await openFile('rules.ini')
    if (rulesFile) art.rulesIni = MapIni.parse(rulesFile.readAsString())
    if (art.rulesIni) {
      art.foundations = parseBuildingFoundations(
        art.rulesIni.toString(),
        art.artIni?.toString(),
      )
      art.houseColors = parseHouseColors(art.rulesIni.getSection('Colors')?.entries)
    }
    void art.loadEditorCatalogs()
    return art
  }

  peek(tileNum: number, subTile: number, variant = 0): TilePixels | null | undefined {
    return this.pixels.get(this.tileKey(tileNum, subTile, variant))
  }

  /** TMP header radar color without waiting for RGBA blit when the mix is already cached. */
  peekRadar(tileNum: number, subTile: number): TmpRadarRgb | null | undefined {
    const pixels = this.peek(tileNum, subTile, 0)
    if (pixels?.radarLeft) return pixels.radarLeft
    if (pixels === null) return null
    const image = this.peekTmpImage(tileNum, subTile)
    if (image === undefined) return undefined
    if (!image) return null
    return image.radarLeft
  }

  /** FA2 Marble Madness：把普通瓦片集映射到对应 Marble 集。 */
  marbleTile(tileNum: number): number {
    if (!this.index) return tileNum
    return marbleTileNum(this.index, tileNum)
  }

  request(tileNum: number, subTile: number, variant = 0): void {
    this.queue(this.tileKey(tileNum, subTile, variant), () => this.loadTile(tileNum, subTile, variant))
  }

  /** werhd `files.filter(subTile < images.length).length` after letter variants are loaded. */
  variantCount(tileNum: number, subTile = 0): number {
    const files = this.variantFiles.get(this.baseTmpName(tileNum) ?? '')
    if (!files?.length) return 0
    return files.filter((file) => subTile < file.images.length).length
  }

  /** Stable per-cell pick among werhd TMP letter variants. */
  cellVariant(rx: number, ry: number, tileNum: number, subTile = 0): number {
    return cellTmpVariantIndex(rx, ry, tileNum, this.variantCount(tileNum, subTile))
  }

  private tileKey(tileNum: number, subTile: number, variant = 0): string {
    return `tile:${tileNum}:${subTile}:${variant}`
  }

  private baseTmpName(tileNum: number): string | null {
    if (!this.index) return null
    const set = tileNumToSet(this.index, tileNum)
    if (!set) return null
    return tmpFileName(set, tileNum - set.startTileNum, THEATER_ASSETS[this.theater].ext)
  }

  private peekTmpImage(tileNum: number, subTile: number): TmpImage | null | undefined {
    if (!this.index) return null
    const set = tileNumToSet(this.index, tileNum)
    if (!set) return null
    const fileName = tmpFileName(set, tileNum - set.startTileNum, THEATER_ASSETS[this.theater].ext)
    const tmp = this.tmpCache.get(fileName)
    if (tmp === undefined) return undefined
    if (!tmp) return null
    return tmp.images[subTile] ?? tmp.images[0] ?? null
  }

  peekOverlay(id: number, frame = 0): TilePixels | null | undefined {
    return this.pixels.get(`ovl:${id}:${frame}`)
  }

  requestOverlay(id: number, frame = 0): void {
    if (this.overlayNames.length === 0) return
    const name = this.overlayNames[id]
    if (!name) {
      this.pixels.set(`ovl:${id}:${frame}`, null)
      return
    }
    this.queue(`ovl:${id}:${frame}`, () => this.loadArtShp(name, frame, this.overlayPalette))
  }

  peekObject(name: string, frame = 0, facing = 0, house?: HouseRgb, kind?: ObjectSpriteKind): TilePixels | null | undefined {
    return this.pixels.get(this.objectKey(name, frame, facing, house, kind))
  }

  requestObject(name: string, frame = 0, facing = 0, house?: HouseRgb, kind?: ObjectSpriteKind): void {
    if (!name) return
    const key = this.objectKey(name, frame, facing, house, kind)
    this.queue(key, () => this.loadArtShp(name, frame, this.unitPalette, facing, house, kind))
  }

  cliffShape(tileInSet: number): TmpTileShape | undefined {
    return this.cliffShapes.get(tileInSet)
  }

  tileShape(tileNum: number): TmpTileShape | undefined {
    return this.tileShapes.get(tileNum)
  }

  tileShapeMap(): Map<number, TmpTileShape> {
    return this.tileShapes
  }

  setTerrainType(setNum: number): number | undefined {
    return this.setTerrain.get(setNum)
  }

  cellTerrain(tileNum: number, subTile: number): number {
    const shape = this.tileShapes.get(tileNum)
    if (!shape) return 0
    return shape.subtiles[subTile]?.terrainType ?? shape.subtiles[0]?.terrainType ?? 0
  }

  /** FA2 SmoothAt `its!=iss` 用的 TMP `bTerrainType`。目录未就绪时全 0，等价主路径。 */
  smoothLookup(getCell: (rx: number, ry: number) => { tileNum: number; subTile: number }): SmoothTerrainLookup {
    return {
      setType: (setNum) => this.setTerrain.get(setNum) ?? 0,
      cellType: (rx, ry) => {
        const cell = getCell(rx, ry)
        return this.cellTerrain(cell.tileNum, cell.subTile)
      },
    }
  }

  private objectKey(name: string, frame: number, facing: number, house?: HouseRgb, kind?: ObjectSpriteKind): string {
    const houseKey = house ? `${house.r},${house.g},${house.b}` : ''
    return `obj:${name}:${frame}:${quantizedFacing(facing)}:${houseKey}:${kind ?? ''}`
  }

  /** 预载 ShorePieces / CliffSet / LAT 相关集的 TMP，供 CreateShore、崖块 z、SmoothAt its!=iss。 */
  async loadEditorCatalogs(): Promise<void> {
    if (!this.index) return
    const rules = new TheaterRules(this.index)
    const ext = THEATER_ASSETS[this.theater].ext
    const shoreNum = rules.getGeneralValue('ShorePieces')
    const loadSet = async (setNum: number) => {
      const set = this.index?.sets[setNum]
      if (!set || set.tilesInSet <= 0) return undefined
      const shapes: Array<TmpTileShape | undefined> = []
      const fa2Cblocks = setNum === shoreNum
      for (let i = 0; i < set.tilesInSet; i++) {
        const tmp = await this.loadTmp(tmpFileName(set, i, ext))
        if (!tmp) continue
        const shape = shapeFromTmp(tmp, fa2Cblocks)
        shapes[i] = shape
        this.tileShapes.set(set.startTileNum + i, shape)
        if (!this.setTerrain.has(setNum)) this.setTerrain.set(setNum, shape.subtiles[0]?.terrainType ?? 0)
      }
      return { set, shapes }
    }

    const cliffNum = rules.getGeneralValue('CliffSet')
    const waterNum = rules.getGeneralValue('WaterSet')
    const extra = TILE_TO_LAT.flatMap(([smooth, lat, target]) => (
      [smooth, lat, target].map((key) => rules.getGeneralValue(key)).filter((setNum) => setNum >= 0)
    ))
    const unique = [...new Set([
      shoreNum, cliffNum, waterNum,
      rules.getGeneralValue('ClearTile'),
      rules.getGeneralValue('RampBase'),
      rules.getGeneralValue('RampSmooth'),
      ...extra,
    ].filter((setNum) => setNum >= 0))]
    const loaded = await Promise.all(unique.map((setNum) => loadSet(setNum)))
    const bySet = new Map(unique.map((setNum, index) => [setNum, loaded[index]]))
    const shore = shoreNum >= 0 ? bySet.get(shoreNum) : undefined
    if (shore) {
      this.shoreCatalog = shore.shapes.flatMap((shape, offset) => (
        shape ? [shorePieceFromShape(offset, shape, false)] : []
      ))
    }
    const cliff = cliffNum >= 0 ? bySet.get(cliffNum) : undefined
    if (cliff) {
      this.cliffShapes.clear()
      cliff.shapes.forEach((shape, offset) => {
        if (shape) this.cliffShapes.set(offset, shape)
      })
    }
    this.onUpdate?.()
  }

  private queue(key: string, loader: () => Promise<TilePixels | null>): void {
    if (this.pixels.has(key) || this.inflight.has(key)) return
    this.inflight.add(key)
    void loader().then((pixels) => {
      this.pixels.set(key, pixels)
      this.inflight.delete(key)
      this.onUpdate?.()
    }).catch(() => {
      this.pixels.set(key, null)
      this.inflight.delete(key)
    })
  }

  private async loadTile(tileNum: number, subTile: number, variant = 0): Promise<TilePixels | null> {
    if (!this.index) return null
    const set = tileNumToSet(this.index, tileNum)
    if (!set) return null
    const ext = THEATER_ASSETS[this.theater].ext
    const fileName = tmpFileName(set, tileNum - set.startTileNum, ext)
    const files = await this.loadTmpVariants(fileName, set.setName)
    const usable = files.filter((file) => subTile < file.images.length)
    if (!usable.length) return null
    const pick = Math.min(Math.max(0, variant), usable.length - 1)
    let requested: TilePixels | null = null
    for (let index = 0; index < usable.length; index++) {
      const tmp = usable[index]
      const image = tmp.images[subTile] ?? tmp.images[0]
      if (!image) continue
      const pixels = blitTmpToRgba(
        image,
        this.palette,
        tmp.blockWidth || RA2_ISO_TILE_WIDTH,
        tmp.blockHeight || RA2_ISO_TILE_HEIGHT,
      )
      this.pixels.set(this.tileKey(tileNum, subTile, index), pixels)
      if (index === pick) requested = pixels
    }
    return requested
  }

  /** werhd TileSets: numbered file then a–z until the first miss. Bridges skip letter suffixes. */
  private async loadTmpVariants(baseFileName: string, setName: string): Promise<TmpFile[]> {
    const cached = this.variantFiles.get(baseFileName)
    if (cached) return cached
    const files: TmpFile[] = []
    const skipLetters = setName === 'Bridges'
    for (let letter = -1; letter < 26; letter++) {
      if (letter >= 0 && skipLetters) break
      const tmp = await this.loadTmp(tmpVariantFileName(baseFileName, letter))
      if (!tmp) break
      files.push(tmp)
    }
    this.variantFiles.set(baseFileName, files)
    return files
  }

  /** werhd TileSets also tries letter suffixes (clear01a.tem) after the numbered file. */
  private async loadTmp(fileName: string): Promise<TmpFile | null> {
    const cached = this.tmpCache.get(fileName)
    if (cached !== undefined) return cached
    const ext = THEATER_ASSETS[this.theater].ext
    const candidates = [fileName, fileName.replace(new RegExp(`${ext}$`), `a${ext}`)]
    for (const candidate of candidates) {
      const existing = this.tmpCache.get(candidate)
      if (existing) {
        this.tmpCache.set(fileName, existing)
        return existing
      }
      const file = await this.openFile(candidate)
      if (!file) continue
      try {
        const tmp = TmpFile.fromVirtualFile(file)
        this.tmpCache.set(candidate, tmp)
        this.tmpCache.set(fileName, tmp)
        return tmp
      } catch {
        this.tmpCache.set(candidate, null)
      }
    }
    this.tmpCache.set(fileName, null)
    return null
  }

  private async loadArtShp(
    objectName: string,
    frame: number,
    palette: Uint8Array,
    facing = 0,
    house?: HouseRgb,
    kind?: ObjectSpriteKind,
  ): Promise<TilePixels | null> {
    const rulesImage = resolveRulesImage(this.rulesIni, objectName)
    const info = readArtImage(this.artIni?.getSection(rulesImage), rulesImage)
    const imageName = info.image || rulesImage
    const pal = house ? houseRemapPalette(info.terrainPalette ? this.palette : palette, house) : (info.terrainPalette ? this.palette : palette)
    if (info.voxel) {
      const vxl = await this.loadVxl(imageName, pal, facing)
      if (vxl) return vxl
    }
    const assets = THEATER_ASSETS[this.theater]
    const settings = { extension: assets.ext, newTheaterChar: assets.newTheaterChar }
    const names = artShpCandidates(objectName, info, settings)
    const walk = info.walkFrames ?? 1
    const start = info.startWalkFrame ?? 0
    const shpFrame = kind === 'building'
      ? 0
      : kind === 'infantry'
        ? fa2InfantryShpFrame(facing, walk, start)
        : kind === 'unit'
          ? fa2UnitShpFrame(facing, walk, start)
          : (frame || fa2UnitShpFrame(facing, walk, start))
    for (const name of names) {
      const pixels = await this.loadShp(name, shpFrame, pal)
      if (!pixels) continue
      if (kind === 'building' || kind === undefined) {
        return this.compositeBuildingSubs(objectName, rulesImage, imageName, pixels, pal, facing)
      }
      return pixels
    }
    if (kind === 'building') {
      const extras = await this.compositeBuildingSubs(objectName, rulesImage, imageName, emptyRgba(1, 1), pal, facing)
      if (rgbaHasOpaque(extras)) return extras
    }
    if (!info.voxel) return this.loadVxl(imageName, pal, facing)
    return null
  }

  private async compositeBuildingSubs(
    objectName: string,
    artSectionName: string,
    imageName: string,
    base: TilePixels,
    palette: Uint8Array,
    facing = 0,
  ): Promise<TilePixels> {
    const section = this.artIni?.getSection(artSectionName) ?? this.artIni?.getSection(imageName)
    const info = readArtImage(section, artSectionName)
    const assets = THEATER_ASSETS[this.theater]
    const settings = { extension: assets.ext, newTheaterChar: assets.newTheaterChar }
    const bibDenied = (this.rulesIni?.getValue(objectName, 'Bib') || this.rulesIni?.getValue(artSectionName, 'Bib') || '')
      .trim()
      .toLowerCase() === 'no'
    let result: TilePixels = base
    const seen = new Set<string>()
    if (section) {
      for (const key of BUILDING_SUBGRAPHIC_KEYS) {
        if (key.toLowerCase().startsWith('bib') && bibDenied) continue
        const subName = section.entries.find((entry) => entry.key.toLowerCase() === key.toLowerCase())?.value.trim()
        if (!subName) continue
        const fileKey = subName.toLowerCase()
        if (seen.has(fileKey)) continue
        seen.add(fileKey)
        const subInfo = { ...info, image: subName, voxel: false }
        for (const fileName of artShpCandidates(subName, subInfo, settings)) {
          const extra = await this.loadShp(fileName, 0, palette)
          if (!extra || !rgbaHasOpaque(extra)) continue
          result = overlayBuildingSubgraphic(result, extra)
          break
        }
      }
    }
    return this.compositeBuildingTurret(objectName, artSectionName, imageName, result, palette, facing)
  }

  private async compositeBuildingTurret(
    objectName: string,
    artSectionName: string,
    imageName: string,
    base: TilePixels,
    palette: Uint8Array,
    facing: number,
  ): Promise<TilePixels> {
    const spec = readBuildingTurret(this.rulesIni, objectName, artSectionName, facing)
    if (!spec) return base
    const turretSection = this.artIni?.getSection(spec.anim)
    const turretInfo = readArtImage(turretSection, spec.anim)
    if (spec.voxel) {
      let result = base
      const vxl = await this.loadVxl(turretInfo.image || spec.anim, palette, facing)
      if (vxl && rgbaHasOpaque(vxl)) {
        const dx = Math.round(base.width / 2 + spec.x + spec.offsetX - vxl.width / 2)
        const dy = Math.round(base.height / 2 + spec.y + spec.offsetY - vxl.height / 2)
        result = overlayRgbaAt(result, vxl, dx, dy)
      }
      for (const barrelName of [`${artSectionName}barl`, `${objectName}barl`, `${imageName}barl`]) {
        const barrel = await this.loadVxl(barrelName, palette, facing)
        if (!barrel || !rgbaHasOpaque(barrel)) continue
        const dx = Math.round(base.width / 2 + spec.x + spec.offsetX - barrel.width / 2)
        const dy = Math.round(base.height / 2 + spec.y + spec.offsetY - barrel.height / 2)
        result = overlayRgbaAt(result, barrel, dx, dy)
        break
      }
      return result
    }
    const assets = THEATER_ASSETS[this.theater]
    const settings = { extension: assets.ext, newTheaterChar: assets.newTheaterChar }
    const frame = fa2BuildingTurretShpFrame(facing)
    for (const fileName of artShpCandidates(spec.anim, turretInfo, settings)) {
      const extra = await this.loadShp(fileName, frame, palette)
      if (!extra || !rgbaHasOpaque(extra)) continue
      return overlayRgbaAt(base, extra, spec.x + spec.offsetX, spec.y + spec.offsetY)
    }
    return base
  }

  private async loadVxl(objectName: string, palette: Uint8Array, facing = 0): Promise<TilePixels | null> {
    const names = artVxlCandidates(objectName)
    for (const name of names) {
      const file = await this.openFile(name)
      if (!file) continue
      try {
        const vxl = new VxlFile(file)
        const hva = await this.loadHva(objectName)
        const voxels = vxl.sections.flatMap((section, index) => {
          const raw = section.getAllVoxels().voxels
          const hvaSection = hva?.sections[index]
          const matrix = hvaSection?.matrices[0]
          return applyHvaToVoxels(raw, matrix, section.hvaMultiplier || 1)
        })
        const first = vxl.sections[0]
        const pal = vxl.embeddedPalette.length >= 768 ? vxl.embeddedPalette : palette
        const pixels = blitVoxelsToRgba(
          voxels,
          pal,
          first?.sizeX ?? 16,
          first?.sizeY ?? 16,
          first?.sizeZ ?? 16,
          { facing: quantizedFacing(facing) },
        )
        if (pixels) return pixels
      } catch {
        continue
      }
    }
    return null
  }

  private async loadHva(objectName: string): Promise<HvaFile | null> {
    const names = [`${objectName.toLowerCase()}.hva`, `${objectName}.hva`]
    for (const name of names) {
      const cached = this.hvaCache.get(name)
      if (cached) return cached
      if (cached === null) continue
      const file = await this.openFile(name)
      if (!file) {
        this.hvaCache.set(name, null)
        continue
      }
      try {
        const hva = new HvaFile(file)
        this.hvaCache.set(name, hva)
        return hva
      } catch {
        this.hvaCache.set(name, null)
      }
    }
    return null
  }

  private async loadShp(fileName: string, frame: number, palette: Uint8Array): Promise<TilePixels | null> {
    const key = fileName.toLowerCase()
    let shp = this.shpCache.get(key)
    if (shp === undefined) {
      const file = await this.openFile(fileName)
      try {
        shp = file ? ShpFile.fromVirtualFile(file) : null
      } catch {
        shp = null
      }
      this.shpCache.set(key, shp)
    }
    if (!shp) return null
    const image = pickShpFrame(shp.images, frame)
    if (!image) return emptyRgba(shp.width, shp.height)
    const composited = compositeShpFrame({ width: shp.width, height: shp.height }, image)
    return blitIndexedToRgba(composited.indexed, composited.width, composited.height, palette)
  }
}
