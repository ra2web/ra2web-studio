import { TmpFile } from '../TmpFile'
import { ShpFile } from '../ShpFile'
import type { VirtualFile } from '../vfs/VirtualFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH, type MapTheater } from './constants'
import { artShpCandidates, readArtImage } from './imageFinder'
import { MapIni } from './MapIni'
import { blitIndexedToRgba } from './shpBlit'
import { blitTmpToRgba, type TmpRgba } from './tmpBlit'
import {
  THEATER_ASSETS,
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
  onUpdate: (() => void) | null = null
  private artIni: MapIni | null = null
  private readonly pixels = new Map<string, TilePixels | null>()
  private readonly tmpCache = new Map<string, TmpFile | null>()
  private readonly shpCache = new Map<string, ShpFile | null>()
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
    return art
  }

  peek(tileNum: number, subTile: number): TilePixels | null | undefined {
    return this.pixels.get(`tile:${tileNum}:${subTile}`)
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

  peekObject(name: string, frame = 0): TilePixels | null | undefined {
    return this.pixels.get(`obj:${name}:${frame}`)
  }

  requestObject(name: string, frame = 0): void {
    if (!name) return
    this.queue(`obj:${name}:${frame}`, () => this.loadArtShp(name, frame, this.unitPalette))
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

  private async loadArtShp(objectName: string, frame: number, palette: Uint8Array): Promise<TilePixels | null> {
    const info = readArtImage(this.artIni?.getSection(objectName), objectName)
    if (info.voxel) return null
    const assets = THEATER_ASSETS[this.theater]
    const settings = { extension: assets.ext, newTheaterChar: assets.newTheaterChar }
    const names = artShpCandidates(objectName, info, settings)
    for (const name of names) {
      const pixels = await this.loadShp(name, frame, info.terrainPalette ? this.palette : palette)
      if (pixels) return pixels
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
