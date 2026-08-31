import { TmpFile } from '../TmpFile'
import type { VirtualFile } from '../vfs/VirtualFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH, type MapTheater } from './constants'
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

export class TheaterArt {
  index: TheaterIndex | null = null
  palette = new Uint8Array(768)
  onUpdate: (() => void) | null = null
  private readonly pixels = new Map<string, TilePixels | null>()
  private readonly tmpCache = new Map<string, TmpFile | null>()
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
    const palFile = await openFile(assets.pal)
    if (palFile) {
      const parsed = PaletteParser.fromBytes(palFile.getBytes())
        ?? PaletteParser.fromUnknownContent({ text: palFile.readAsString(), bytes: palFile.getBytes() })
      if (parsed?.colors) {
        parsed.colors.forEach((color, index) => {
          art.palette[index * 3] = color.r
          art.palette[index * 3 + 1] = color.g
          art.palette[index * 3 + 2] = color.b
        })
      }
    }
    return art
  }

  peek(tileNum: number, subTile: number): TilePixels | null | undefined {
    return this.pixels.get(`${tileNum}:${subTile}`)
  }

  request(tileNum: number, subTile: number): void {
    const key = `${tileNum}:${subTile}`
    if (this.pixels.has(key) || this.inflight.has(key) || !this.index) return
    this.inflight.add(key)
    void this.loadTile(tileNum, subTile).then((pixels) => {
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
    const fileName = tmpFileName(set, tileNum - set.startTileNum, THEATER_ASSETS[this.theater].ext)
    let tmp = this.tmpCache.get(fileName)
    if (tmp === undefined) {
      const file = await this.openFile(fileName)
      try {
        tmp = file ? TmpFile.fromVirtualFile(file) : null
      } catch {
        tmp = null
      }
      this.tmpCache.set(fileName, tmp)
    }
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
}
