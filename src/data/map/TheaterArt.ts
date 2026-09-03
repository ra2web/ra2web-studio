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
import { fa2OverlayGraphicPalette, fa2UnitGraphicPalette, type Fa2ShpPaletteKind } from './fa2ShpPalette'
import { MapIni } from './MapIni'
import { blitIndexedToRgba, compositeShpFrame, emptyRgba, overlayBuildingSubgraphic, overlayRgbaAt, overlayRgbaAtExpand, pickOverlayShpFrame, pickShpFrame, rgbaHasOpaque, type IndexedRgba } from './shpBlit'
import { blitTmpToRgba, composeTmpFilePreview, type TmpFilePreviewImage, type TmpRadarRgb, type TmpRgba } from './tmpBlit'
import { blitVoxelsToRgba, blitFa2VxlSections, applyHvaToVoxels, quantizedFacing } from './vxlBlit'
import { fa2InfantryDirIndex, fa2InfantryShpFrame, fa2UnitShpFrame, fa2VehicleVxlDirIndex, type ObjectSpriteKind } from './fa2Facing'
import { houseRemapPalette, parseHouseColors, type HouseColorTable, type HouseRgb } from './fa2HouseColor'
import { artTurretModelOffset, fa2BuildingTurretShpFrame, readBuildingTurret, rulesHasTurret, vehicleVoxelTurretOffset } from './fa2BuildingTurret'
import { parseBuildingFoundations, type BuildingFoundation } from './rulesObjects'
import { TILE_TO_LAT, type SmoothTerrainLookup } from './fa2Smooth'
import { fa2CblocksForSet, shorePieceFromShape, shapeFromTmp, type TmpTileShape } from './tmpCatalog'
import type { ShorePiece } from './fa2Shore'
import {
  THEATER_ASSETS,
  TheaterRules,
  marbleTileNum,
  marbleUsesHeightBase as marbleTileUsesHeightBase,
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
  private notifyScheduled = false

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

  /** FA2 `RenderTile` 整块 TMP 预览；1×1 与 `peek(tileNum, 0)` 相同。 */
  peekTilePreview(tileNum: number): TilePixels | null | undefined {
    return this.pixels.get(this.previewKey(tileNum))
  }

  requestTilePreview(tileNum: number): void {
    this.queue(this.previewKey(tileNum), () => this.loadTilePreview(tileNum))
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

  /** FA2 Framework Mode：有 MarbleMadness 换集，否则 HeightBase + height。 */
  marbleTile(tileNum: number, height = 0): number {
    if (!this.index) return tileNum
    return marbleTileNum(this.index, tileNum, height)
  }

  marbleUsesHeightBase(tileNum: number): boolean {
    if (!this.index) return false
    return marbleTileUsesHeightBase(this.index, tileNum)
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

  private previewKey(tileNum: number): string {
    return `preview:file:${tileNum}`
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
    this.queue(`ovl:${id}:${frame}`, () => this.loadArtShp(name, frame, this.overlayPalette, 0, undefined, undefined, 'overlay'))
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

  private rememberTileShape(tileNum: number, tmp: TmpFile, setIndex: number): TmpTileShape {
    const cliffSet = this.index ? new TheaterRules(this.index).getGeneralValue('CliffSet') : -1
    const shape = shapeFromTmp(tmp, fa2CblocksForSet(setIndex, cliffSet))
    this.tileShapes.set(tileNum, shape)
    return shape
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

  /** 预载 ShorePieces / CliffSet / BridgeSet / LAT 相关集的 TMP，供 CreateShore、崖块 z、高架坡道 PlaceTile、SmoothAt its!=iss。 */
  async loadEditorCatalogs(): Promise<void> {
    if (!this.index) return
    const rules = new TheaterRules(this.index)
    const ext = THEATER_ASSETS[this.theater].ext
    const shoreNum = rules.getGeneralValue('ShorePieces')
    const bridgeNum = rules.getGeneralValue('BridgeSet')
    const cliffNum = rules.getGeneralValue('CliffSet')
    const loadSet = async (setNum: number) => {
      const set = this.index?.sets[setNum]
      if (!set || set.tilesInSet <= 0) return undefined
      const shapes: Array<TmpTileShape | undefined> = []
      const fa2Cblocks = fa2CblocksForSet(setNum, cliffNum)
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

    const waterNum = rules.getGeneralValue('WaterSet')
    const extra = TILE_TO_LAT.flatMap(([smooth, lat, target]) => (
      [smooth, lat, target].map((key) => rules.getGeneralValue(key)).filter((setNum) => setNum >= 0)
    ))
    const unique = [...new Set([
      shoreNum, cliffNum, waterNum, bridgeNum,
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
    this.notify()
  }

  private notify() {
    if (this.notifyScheduled) return
    this.notifyScheduled = true
    const flush = () => {
      this.notifyScheduled = false
      this.onUpdate?.()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
    else queueMicrotask(flush)
  }

  private queue(key: string, loader: () => Promise<TilePixels | null>): void {
    if (this.pixels.has(key) || this.inflight.has(key)) return
    this.inflight.add(key)
    void loader().then((pixels) => {
      this.pixels.set(key, pixels)
      this.inflight.delete(key)
      this.notify()
    }).catch(() => {
      this.pixels.set(key, null)
      this.inflight.delete(key)
      this.notify()
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
    if (files[0]) this.rememberTileShape(tileNum, files[0], set.setIndex)
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

  private async loadTilePreview(tileNum: number): Promise<TilePixels | null> {
    if (!this.index) return null
    const set = tileNumToSet(this.index, tileNum)
    if (!set) return null
    const ext = THEATER_ASSETS[this.theater].ext
    const fileName = tmpFileName(set, tileNum - set.startTileNum, ext)
    const files = await this.loadTmpVariants(fileName, set.setName)
    const tmp = files[0]
    if (!tmp) return null
    this.rememberTileShape(tileNum, tmp, set.setIndex)
    const parts: TmpFilePreviewImage[] = []
    for (const image of tmp.images) {
      if (!image || image.tileData.length === 0) continue
      const pixels = blitTmpToRgba(
        image,
        this.palette,
        tmp.blockWidth || RA2_ISO_TILE_WIDTH,
        tmp.blockHeight || RA2_ISO_TILE_HEIGHT,
      )
      parts.push({
        pixels,
        x: image.x,
        y: image.y,
        zHeight: image.height,
        drawOffsetX: pixels.drawOffsetX,
        drawOffsetY: pixels.drawOffsetY,
      })
    }
    if (parts.length === 0) return null
    if (parts.length === 1) return parts[0].pixels
    return composeTmpFilePreview(parts, tmp.blockHeight || RA2_ISO_TILE_HEIGHT)
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

  private resolveShpPalette(kind: Fa2ShpPaletteKind, fallback: Uint8Array): Uint8Array {
    if (kind === 'iso') return this.palette
    if (kind === 'overlay') return this.overlayPalette
    return fallback
  }

  private async loadArtShp(
    objectName: string,
    frame: number,
    palette: Uint8Array,
    facing = 0,
    house?: HouseRgb,
    kind?: ObjectSpriteKind,
    usage: 'object' | 'overlay' = 'object',
  ): Promise<TilePixels | null> {
    const rulesImage = resolveRulesImage(this.rulesIni, objectName)
    const info = readArtImage(this.artIni?.getSection(rulesImage), rulesImage)
    const imageName = info.image || rulesImage
    const assets = THEATER_ASSETS[this.theater]
    const settings = { extension: assets.ext, newTheaterChar: assets.newTheaterChar }
    const names = artShpCandidates(objectName, info, settings)
    const found = await this.findShpFile(names)
    const palKind = usage === 'overlay'
      ? fa2OverlayGraphicPalette(found, info, objectName, this.rulesIni)
      : fa2UnitGraphicPalette(found, info)
    const basePal = this.resolveShpPalette(palKind, palette)
    const pal = house ? houseRemapPalette(info.terrainPalette ? this.palette : basePal, house) : basePal
    const walk = info.walkFrames ?? 1
    const start = info.startWalkFrame ?? 0
    const still = kind === 'building' || kind === 'terrain' || kind === 'smudge'
    const shpFrame = usage === 'overlay'
      ? frame
      : still
        ? 0
        : kind === 'infantry'
          ? fa2InfantryShpFrame(facing, walk, start)
          : kind === 'unit'
            ? fa2UnitShpFrame(facing, walk, start)
            : (frame || fa2UnitShpFrame(facing, walk, start))
    if (info.voxel) {
      const vehicle = kind !== 'building' && kind !== 'terrain' && kind !== 'smudge'
      const vxl = await this.loadVxl(imageName, pal, facing, vehicle ? 'fa2-vehicle' : 'icon')
      if (vxl) {
        if (vehicle) return this.compositeVehicleVxl(objectName, imageName, vxl, pal, facing)
        return vxl
      }
    }
    if (found) {
      const pixels = await this.loadShp(found, shpFrame, pal, usage !== 'overlay')
      if (pixels) {
        if (usage === 'object' && (kind === 'building' || kind === undefined)) {
          return this.compositeBuildingSubs(objectName, rulesImage, imageName, pixels, pal, facing)
        }
        return pixels
      }
    }
    if (usage === 'object' && kind === 'building') {
      const extras = await this.compositeBuildingSubs(objectName, rulesImage, imageName, emptyRgba(1, 1), pal, facing)
      if (rgbaHasOpaque(extras)) return extras
    }
    if (!info.voxel) return this.loadVxl(imageName, pal, facing)
    return null
  }

  private async findShpFile(names: string[]): Promise<string | null> {
    for (const name of names) {
      const key = name.toLowerCase()
      let shp = this.shpCache.get(key)
      if (shp === undefined) {
        const file = await this.openFile(name)
        try {
          shp = file ? ShpFile.fromVirtualFile(file) : null
        } catch {
          shp = null
        }
        this.shpCache.set(key, shp)
      }
      if (shp) return name
    }
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

  private async compositeVehicleVxl(
    objectName: string,
    imageName: string,
    body: TilePixels & { centerX?: number; centerY?: number },
    palette: Uint8Array,
    facing: number,
  ): Promise<TilePixels> {
    const hasTurret = rulesHasTurret(this.rulesIni, objectName, imageName)
    if (!hasTurret) return body
    const modelX = artTurretModelOffset(this.artIni, imageName)
    const mover = vehicleVoxelTurretOffset(objectName, imageName)
    let result: TilePixels & { centerX?: number; centerY?: number } = body
    const turret = await this.loadVxl(`${imageName}tur`, palette, facing, 'fa2-vehicle', { x: modelX })
      ?? await this.loadVxl(`${objectName}tur`, palette, facing, 'fa2-vehicle', { x: modelX })
    if (turret && rgbaHasOpaque(turret)) {
      const dx = Math.round((body.centerX ?? body.width / 2) - (turret.centerX ?? turret.width / 2) + mover.offsetX)
      const dy = Math.round((body.centerY ?? body.height / 2) - (turret.centerY ?? turret.height / 2) + mover.offsetY)
      const next = overlayRgbaAtExpand(result, turret, dx, dy)
      const shiftX = Math.min(0, dx)
      const shiftY = Math.min(0, dy)
      result = {
        ...next,
        centerX: (body.centerX ?? 0) - shiftX,
        centerY: (body.centerY ?? 0) - shiftY,
      }
    }
    const barrel = await this.loadVxl(`${imageName}barl`, palette, facing, 'fa2-vehicle', { x: modelX })
      ?? await this.loadVxl(`${objectName}barl`, palette, facing, 'fa2-vehicle', { x: modelX })
    if (barrel && rgbaHasOpaque(barrel)) {
      const dx = Math.round((result.centerX ?? result.width / 2) - (barrel.centerX ?? barrel.width / 2) + mover.offsetX)
      const dy = Math.round((result.centerY ?? result.height / 2) - (barrel.centerY ?? barrel.height / 2) + mover.offsetY)
      result = overlayRgbaAtExpand(result, barrel, dx, dy)
    }
    return result
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
      const vxl = await this.loadVxl(turretInfo.image || spec.anim, palette, facing, 'fa2')
      if (vxl && rgbaHasOpaque(vxl)) {
        const dx = Math.round(base.width / 2 + spec.x + spec.offsetX - (vxl.centerX ?? vxl.width / 2))
        const dy = Math.round(base.height / 2 + spec.y + spec.offsetY - (vxl.centerY ?? vxl.height / 2))
        result = overlayRgbaAt(result, vxl, dx, dy)
      }
      for (const barrelName of [`${artSectionName}barl`, `${objectName}barl`, `${imageName}barl`]) {
        const barrel = await this.loadVxl(barrelName, palette, facing, 'fa2')
        if (!barrel || !rgbaHasOpaque(barrel)) continue
        const dx = Math.round(base.width / 2 + spec.x + spec.offsetX - (barrel.centerX ?? barrel.width / 2))
        const dy = Math.round(base.height / 2 + spec.y + spec.offsetY - (barrel.centerY ?? barrel.height / 2))
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
      const dx = spec.x + spec.offsetX
      const dy = spec.y + spec.offsetY
      return overlayRgbaAt(base, extra, dx, dy)
    }
    return base
  }

  private async loadVxl(
    objectName: string,
    palette: Uint8Array,
    facing = 0,
    mode: 'icon' | 'fa2' | 'fa2-vehicle' = 'icon',
    modelOffset: { x?: number; y?: number; z?: number } = {},
  ): Promise<(TilePixels & { centerX?: number; centerY?: number }) | null> {
    const names = artVxlCandidates(objectName)
    for (const name of names) {
      const file = await this.openFile(name)
      if (!file) continue
      try {
        const vxl = new VxlFile(file)
        const hva = await this.loadHva(objectName)
        const usedEmbedded = vxl.embeddedPalette.length >= 768
        const pal = new Uint8Array(usedEmbedded ? vxl.embeddedPalette : palette)
        for (let i = 0x10 * 3; i <= 0x1F * 3 + 2; i++) pal[i] = palette[i] ?? pal[i]
        if (mode === 'fa2' || mode === 'fa2-vehicle') {
          const dirIndex = mode === 'fa2-vehicle' ? fa2VehicleVxlDirIndex(facing) : fa2InfantryDirIndex(facing)
          const pixels = blitFa2VxlSections(
            vxl.sections.map((section, index) => ({
              voxels: section.getAllVoxels().voxels,
              sizeX: section.sizeX,
              sizeY: section.sizeY,
              sizeZ: section.sizeZ,
              minBounds: section.minBounds,
              maxBounds: section.maxBounds,
              hvaMultiplier: section.hvaMultiplier || 1,
              hvaMatrix: hva?.sections[index]?.matrices[0],
            })),
            pal,
            dirIndex,
            modelOffset,
          )
          if (pixels) return pixels
          continue
        }
        const voxels = vxl.sections.flatMap((section, index) => {
          const raw = section.getAllVoxels().voxels
          const hvaSection = hva?.sections[index]
          const matrix = hvaSection?.matrices[0]
          return applyHvaToVoxels(raw, matrix, section.hvaMultiplier || 1)
        })
        const first = vxl.sections[0]
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

  private async loadShp(
    fileName: string,
    frame: number,
    palette: Uint8Array,
    fallbackEmptyFrame = true,
  ): Promise<TilePixels | null> {
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
    const image = fallbackEmptyFrame
      ? pickShpFrame(shp.images, frame)
      : pickOverlayShpFrame(shp.images, frame)
    if (!image) return emptyRgba(shp.width, shp.height)
    const composited = compositeShpFrame({ width: shp.width, height: shp.height }, image)
    return blitIndexedToRgba(composited.indexed, composited.width, composited.height, palette)
  }
}
