import {
  ABOREUS_BEGIN,
  ABOREUS_END,
  CRUENTUS_BEGIN,
  CRUENTUS_END,
  EMPTY_OVERLAY,
  FA2_ORE_GEMS,
  FA2_ORE_RIPARIUS_FIXED,
  FA2_ORE_RIPARIUS_RANDOM_BASE,
  FA2_VEINS_DATA,
  MAX_HEIGHT,
  OVRL_VEINHOLE,
  OVRL_VEINHOLEBORDER,
  OVRL_VEINS,
  RIPARIUS_BEGIN,
  RIPARIUS_END,
  VINIFERA_BEGIN,
  VINIFERA_END,
} from './constants'
import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'

/** FA2 `CMapData::SmoothTiberium` 邻接表 `_adj[count-1]`。 */
export const ORE_ADJ = [0, 1, 3, 4, 6, 7, 8, 10, 11] as const

export type OreKind = 'riparius' | 'gems'
export type OreStyle = 'fixed' | 'random'

export type OrePaintOptions = {
  kind?: OreKind
  style?: OreStyle
  brush?: number
  brushH?: number
  theater?: TheaterIndex | null
  random?: () => number
}

export function isOreOverlay(id: number): boolean {
  return (
    (id >= RIPARIUS_BEGIN && id <= RIPARIUS_END)
    || (id >= CRUENTUS_BEGIN && id <= CRUENTUS_END)
    || (id >= VINIFERA_BEGIN && id <= VINIFERA_END)
    || (id >= ABOREUS_BEGIN && id <= ABOREUS_END)
  )
}

export function cellAllowsOre(doc: MapDocument, rx: number, ry: number, theater?: TheaterIndex | null): boolean {
  if (!theater) return true
  return new TheaterRules(theater).allowsTiberium(doc.getCell(rx, ry).tileNum)
}

/**
 * FA2 `CMapData::SmoothTiberium`：按 3×3 矿石邻接数写 OverlayData。
 * IsoView 随后的 SetOverlayDataAt 对矿石是空操作。
 */
export function smoothTiberium(doc: MapDocument, rx: number, ry: number): void {
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  const overlay = doc.getOverlay(rx, ry)
  if (!isOreOverlay(overlay.id)) return
  let count = 0
  for (let i = -1; i <= 1; i++) {
    for (let e = -1; e <= 1; e++) {
      const nx = rx + i
      const ny = ry + e
      if (!isValidIsoCell(nx, ny, doc.width, doc.height)) continue
      if (isOreOverlay(doc.getOverlay(nx, ny).id)) count++
    }
  }
  if (count <= 0) return
  const data = ORE_ADJ[Math.min(count, 9) - 1] ?? 0
  doc.setOverlay(rx, ry, overlay.id, data)
}

export function smoothTiberiumAround(doc: MapDocument, rx: number, ry: number): void {
  for (let i = -1; i <= 1; i++) {
    for (let e = -1; e <= 1; e++) {
      smoothTiberium(doc, rx + i, ry + e)
    }
  }
}

function oreId(kind: OreKind, style: OreStyle, random: () => number): number {
  if (kind === 'gems') return FA2_ORE_GEMS
  if (style === 'random') return FA2_ORE_RIPARIUS_RANDOM_BASE + Math.floor(random() * 8)
  return FA2_ORE_RIPARIUS_FIXED
}

/** FA2 IsoView DrawTib / DrawTib2：笔刷为点击格向 +x/+y 的矩形。 */
export function applyOreBrush(
  doc: MapDocument,
  rx: number,
  ry: number,
  options: OrePaintOptions | number = {},
): void {
  const opts: OrePaintOptions = typeof options === 'number' ? {} : options
  const kind = opts.kind ?? 'riparius'
  const style = opts.style ?? 'fixed'
  const bw = Math.max(1, opts.brush ?? 1)
  const bh = Math.max(1, opts.brushH ?? bw)
  const random = opts.random ?? Math.random
  for (let dx = 0; dx < bw; dx++) {
    for (let dy = 0; dy < bh; dy++) {
      const cx = rx + dx
      const cy = ry + dy
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) continue
      if (!cellAllowsOre(doc, cx, cy, opts.theater)) continue
      doc.setOverlay(cx, cy, oreId(kind, style, random), 0)
      smoothTiberiumAround(doc, cx, cy)
    }
  }
}

/** FA2 `AD.data==4 data2==0`：3×3 VeinHoleBorder + 中心 VeinHole，中心高度 -1。 */
export function placeVeinhole(doc: MapDocument, rx: number, ry: number): void {
  for (let gx = rx - 1; gx <= rx + 1; gx++) {
    for (let gy = ry - 1; gy <= ry + 1; gy++) {
      if (!isValidIsoCell(gx, gy, doc.width, doc.height)) continue
      doc.setOverlay(gx, gy, OVRL_VEINHOLEBORDER, 0)
    }
  }
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  doc.setOverlay(rx, ry, OVRL_VEINHOLE, 0)
  const cell = doc.getCell(rx, ry)
  cell.height = Math.max(0, Math.min(MAX_HEIGHT, cell.height - 1))
  doc.setCell(cell)
}

/** FA2 `AD.data==4 data2==1`：Veins，OverlayData=0x30。 */
export function placeVeins(doc: MapDocument, rx: number, ry: number, brush = 1, brushH = brush): void {
  const bw = Math.max(1, brush)
  const bh = Math.max(1, brushH)
  for (let dx = 0; dx < bw; dx++) {
    for (let dy = 0; dy < bh; dy++) {
      const cx = rx + dx
      const cy = ry + dy
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) continue
      doc.setOverlay(cx, cy, OVRL_VEINS, FA2_VEINS_DATA)
    }
  }
}

/** FA2 删除 Overlay：以点击为中心、半径 `brush-1` 的方块。 */
export function clearOverlay(doc: MapDocument, rx: number, ry: number, brush = 1): void {
  const radius = Math.max(0, brush - 1)
  for (let gx = rx - radius; gx <= rx + radius; gx++) {
    for (let gy = ry - radius; gy <= ry + radius; gy++) {
      if (!isValidIsoCell(gx, gy, doc.width, doc.height)) continue
      doc.setOverlay(gx, gy, EMPTY_OVERLAY, 0)
      smoothTiberiumAround(doc, gx, gy)
    }
  }
}
