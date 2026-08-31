import { VxlFile } from '../VxlFile'
import { TmpFile } from '../TmpFile'
import { ShpFile } from '../ShpFile'
import { HvaFile } from '../HvaFile'
import type { VirtualFile } from '../vfs/VirtualFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH, type MapTheater } from './constants'
import { artShpCandidates, readArtImage } from './imageFinder'
import { MapIni } from './MapIni'
import { blitIndexedToRgba } from './shpBlit'
import { blitTmpToRgba, type TmpRgba } from './tmpBlit'
import { blitVoxelsToRgba, applyHvaToVoxels, facingStep, quantizedFacing } from './vxlBlit'
import { TILE_TO_LAT, type SmoothTerrainLookup } from './fa2Smooth'
import { shorePieceFromShape, shapeFromTmp, type TmpTileShape } from './tmpCatalog'
import type { ShorePiece } from './fa2Shore'
import {
  THEATER_ASSETS,
  TheaterRules,
  marbleTileNum,
  parseTheaterIni,
  tmpFileName,
  tileNumToSet,
  type TheaterIndex,
} from './theaterIndex'

export type TilePixels = TmpRgba

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
  shoreCatalog: ShorePiece[] = []
  cliffShapes = new Map<number, TmpTileShape>()
  onUpdate: (() => void) | null = null
  private artIni: MapIni | null = null
  private readonly pixels = new Map<string, TilePixels | null>()
  private readonly tmpCache = new Map<string, TmpFile | null>()
  private readonly shpCache = new Map<string, ShpFile | null>()
  private readonly hvaCache = new Map<string, HvaFile | null>()
  private readonly setTerrain = new Map<number, number>()
  private readonly tileShapes = new Map<number, TmpTileShape>()
  private readonly inflight = new Set<string>()

  constructor(
    private readonly openFile: OpenFile,
    public readonly theater: MapTheater,
  ) {}

  static async load(resourceContext: ResourceContext | null | undefined, theater: MapTheater): Promise<TheaterArt | null> {
    if (!resourceContext) return null
    const openFile: OpenFile = (name) => resourceContext.resolveFileFromOverlay(name)
    const art = new TheaterArt(openFile, theater)
    const assets = THEATER_ASSETS[theater]
    const iniFile = await openFile(assets.ini)
    if (!iniFile) return null
    art.index = parseTheaterIni(iniFile.readAsString())
    fillPalette(art.palette, await openFile(assets.pal))
    art.unitPalette.set(art.palette)
    fillPalette(art.unitPalette, await openFile(assets.unitPal))
    art.overlayPalette.set(art.palette)
    fillPalette(art.overlayPalette, await openFile('overlay.pal'))
    const artFile = await openFile('artmd.ini') ?? await openFile('art.ini')
    if (artFile) art.artIni = MapIni.parse(artFile.readAsString())
    void art.loadEditorCatalogs()
    return art
  }

  peek(tileNum: number, subTile: number): TilePixels | null | undefined {
    return this.pixels.get(`tile:${tileNum}:${subTile}`)
  }

  /** FA2 Marble Madness：把普通瓦片集映射到对应 Marble 集。 */
  marbleTile(tileNum: number): number {
    if (!this.index) return tileNum
    return marbleTileNum(this.index, tileNum)
  }

  request(tileNum: number, subTile: number): void {
    this.queue(`tile:${tileNum}:${subTile}`, () => this.loadTile(tileNum, subTile))
  }

  peekOverlay(id: number, frame = 0): TilePixels | null | undefined {
    return this.pixels.get(`ovl:${id}:${frame}`)
  }

  requestOverlay(id: number, frame = 0): void {
    const name = this.overlayNames[id]
    if (!name) {
      this.pixels.set(`ovl:${id}:${frame}`, null)
      return
    }
    this.queue(`ovl:${id}:${frame}`, () => this.loadArtShp(name, frame, this.overlayPalette))
  }

  peekObject(name: string, frame = 0, facing = 0): TilePixels | null | undefined {
    return this.pixels.get(this.objectKey(name, frame, facing))
  }

  requestObject(name: string, frame = 0, facing = 0): void {
    if (!name) return
    const key = this.objectKey(name, frame, facing)
    this.queue(key, () => this.loadArtShp(name, frame, this.unitPalette, facing))
  }

  cliffShape(tileInSet: number): TmpTileShape | undefined {
    return this.cliffShapes.get(tileInSet)
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

  private objectKey(name: string, frame: number, facing: number): string {
    return `obj:${name}:${frame}:${quantizedFacing(facing)}`
  }

  /** 预载 ShorePieces / CliffSet / LAT 相关集的 TMP，供 CreateShore、崖块 z、SmoothAt its!=iss。 */
  async loadEditorCatalogs(): Promise<void> {
    if (!this.index) return
    const rules = new TheaterRules(this.index)
    const ext = THEATER_ASSETS[this.theater].ext
    const loadSet = async (setNum: number) => {
      const set = this.index?.sets[setNum]
      if (!set || set.tilesInSet <= 0) return undefined
      const shapes: Array<TmpTileShape | undefined> = []
      for (let i = 0; i < set.tilesInSet; i++) {
        const tmp = await this.loadTmp(tmpFileName(set, i, ext))
        if (!tmp) continue
        const shape = shapeFromTmp(tmp)
        shapes[i] = shape
        this.tileShapes.set(set.startTileNum + i, shape)
        if (!this.setTerrain.has(setNum)) this.setTerrain.set(setNum, shape.subtiles[0]?.terrainType ?? 0)
      }
      return { set, shapes }
    }

    const shoreNum = rules.getGeneralValue('ShorePieces')
    const cliffNum = rules.getGeneralValue('CliffSet')
    const waterNum = rules.getGeneralValue('WaterSet')
    const extra = TILE_TO_LAT.flatMap(([smooth, lat, target]) => (
      [smooth, lat, target].map((key) => rules.getGeneralValue(key)).filter((setNum) => setNum >= 0)
    ))
    const unique = [...new Set([shoreNum, cliffNum, waterNum, ...extra].filter((setNum) => setNum >= 0))]
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

  private async loadTile(tileNum: number, subTile: number): Promise<TilePixels | null> {
    if (!this.index) return null
    const set = tileNumToSet(this.index, tileNum)
    if (!set) return null
    const ext = THEATER_ASSETS[this.theater].ext
    const fileName = tmpFileName(set, tileNum - set.startTileNum, ext)
    const tmp = await this.loadTmp(fileName)
    if (!tmp) return null
    const image = tmp.images[subTile] ?? tmp.images[0]
    if (!image) return null
    return blitTmpToRgba(
      image,
      this.palette,
      tmp.blockWidth || RA2_ISO_TILE_WIDTH,
      tmp.blockHeight || RA2_ISO_TILE_HEIGHT,
    )
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

  private async loadArtShp(objectName: string, frame: number, palette: Uint8Array, facing = 0): Promise<TilePixels | null> {
    const info = readArtImage(this.artIni?.getSection(objectName), objectName)
    if (info.voxel) return this.loadVxl(info.image || objectName, palette, facing)
    const assets = THEATER_ASSETS[this.theater]
    const settings = { extension: assets.ext, newTheaterChar: assets.newTheaterChar }
    const names = artShpCandidates(objectName, info, settings)
    const shpFrame = frame || facingStep(facing)
    for (const name of names) {
      const pixels = await this.loadShp(name, shpFrame, info.terrainPalette ? this.palette : palette)
      if (pixels) return pixels
    }
    return null
  }

  private async loadVxl(objectName: string, palette: Uint8Array, facing = 0): Promise<TilePixels | null> {
    const names = [`${objectName.toLowerCase()}.vxl`, `${objectName}.vxl`]
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
    const image = shp.images[frame] ?? shp.images[0]
    if (!image) return null
    return blitIndexedToRgba(image.imageData, image.width, image.height, palette)
  }
}
