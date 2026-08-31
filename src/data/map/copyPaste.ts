import { EMPTY_OVERLAY, MAX_HEIGHT } from './constants'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument, createMapObjectId } from './MapDocument'
import type { MapCell, MapHouseNode, MapSmudge, MapTechno, MapTerrainObject } from './types'

export type MapCopyRect = {
  minRx: number
  minRy: number
  maxRx: number
  maxRy: number
}

export type MapClipboardCell = {
  dx: number
  dy: number
  tileNum: number
  subTile: number
  height: number
  iceGrowth: number
  extra: number
  overlayId: number
  overlayValue: number
}

export type MapClipboard = {
  width: number
  height: number
  originRx: number
  originRy: number
  cells: MapClipboardCell[]
  infantry: MapTechno[]
  units: MapTechno[]
  aircraft: MapTechno[]
  structures: MapTechno[]
  terrains: MapTerrainObject[]
  smudges: MapSmudge[]
  waypoints: { dx: number; dy: number }[]
  cellTags: { dx: number; dy: number; tagId: string }[]
  nodes: Array<MapHouseNode & { house: string; dx: number; dy: number }>
}

export function normalizeCopyRect(a: { rx: number; ry: number }, b: { rx: number; ry: number }): MapCopyRect {
  return {
    minRx: Math.min(a.rx, b.rx),
    minRy: Math.min(a.ry, b.ry),
    maxRx: Math.max(a.rx, b.rx),
    maxRy: Math.max(a.ry, b.ry),
  }
}

function inRect(rx: number, ry: number, rect: MapCopyRect): boolean {
  return rx >= rect.minRx && rx <= rect.maxRx && ry >= rect.minRy && ry <= rect.maxRy
}

function cloneTechno(item: MapTechno, dx: number, dy: number): MapTechno {
  return { ...item, extra: [...item.extra], rx: dx, ry: dy }
}

/** FA2 Copy：矩形 iso 格存相对高度/瓦片/overlay，并附带格子上的对象。 */
export function copyRegion(doc: MapDocument, rect: MapCopyRect): MapClipboard {
  const originRx = rect.minRx
  const originRy = rect.minRy
  const width = rect.maxRx - rect.minRx + 1
  const height = rect.maxRy - rect.minRy + 1
  const cells: MapClipboardCell[] = []
  let lowest = 255
  forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
    if (!inRect(rx, ry, rect)) return
    const cell = doc.getCell(rx, ry)
    if (cell.height < lowest) lowest = cell.height
  })
  if (lowest === 255) lowest = 0
  forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
    if (!inRect(rx, ry, rect)) return
    const cell = doc.getCell(rx, ry)
    const overlay = doc.getOverlay(rx, ry)
    cells.push({
      dx: rx - originRx,
      dy: ry - originRy,
      tileNum: cell.tileNum,
      subTile: cell.subTile,
      height: cell.height - lowest,
      iceGrowth: cell.iceGrowth,
      extra: cell.extra,
      overlayId: overlay.id,
      overlayValue: overlay.value,
    })
  })
  const rel = <T extends { rx: number; ry: number }>(item: T) => (
    inRect(item.rx, item.ry, rect) ? { ...item, dx: item.rx - originRx, dy: item.ry - originRy } : null
  )
  return {
    width,
    height,
    originRx,
    originRy,
    cells,
    infantry: doc.infantry.filter((item) => inRect(item.rx, item.ry, rect)).map((item) => cloneTechno(item, item.rx - originRx, item.ry - originRy)),
    units: doc.units.filter((item) => inRect(item.rx, item.ry, rect)).map((item) => cloneTechno(item, item.rx - originRx, item.ry - originRy)),
    aircraft: doc.aircraft.filter((item) => inRect(item.rx, item.ry, rect)).map((item) => cloneTechno(item, item.rx - originRx, item.ry - originRy)),
    structures: doc.structures.filter((item) => inRect(item.rx, item.ry, rect)).map((item) => cloneTechno(item, item.rx - originRx, item.ry - originRy)),
    terrains: doc.terrains.filter((item) => inRect(item.rx, item.ry, rect)).map((item) => ({ ...item, rx: item.rx - originRx, ry: item.ry - originRy })),
    smudges: doc.smudges.filter((item) => inRect(item.rx, item.ry, rect)).map((item) => ({ ...item, rx: item.rx - originRx, ry: item.ry - originRy })),
    waypoints: doc.waypoints.map((item) => rel(item)).filter(Boolean).map((item) => ({ dx: item!.dx, dy: item!.dy })),
    cellTags: doc.cellTags.filter((item) => inRect(item.rx, item.ry, rect)).map((item) => ({
      dx: item.rx - originRx,
      dy: item.ry - originRy,
      tagId: item.tagId,
    })),
    nodes: doc.houses.flatMap((house) => house.nodes.filter((node) => inRect(node.rx, node.ry, rect)).map((node) => ({
      ...node,
      house: house.name,
      dx: node.rx - originRx,
      dy: node.ry - originRy,
    }))),
  }
}

function pasteTechno(list: MapTechno[], items: MapTechno[], originRx: number, originRy: number, width: number, height: number): void {
  for (const item of items) {
    const rx = originRx + item.rx
    const ry = originRy + item.ry
    if (!isValidIsoCell(rx, ry, width, height)) continue
    list.push({ ...item, extra: [...item.extra], id: createMapObjectId(), rx, ry })
  }
}

/** FA2 Paste：以点击格为中心，相对高度叠到目标格高度上。 */
export function pasteRegion(doc: MapDocument, clip: MapClipboard, destRx: number, destRy: number): void {
  const originRx = destRx - Math.floor(clip.width / 2)
  const originRy = destRy - Math.floor(clip.height / 2)
  const destCell = doc.getCell(destRx, destRy)
  const baseHeight = destCell.height
  for (const item of clip.cells) {
    const rx = originRx + item.dx
    const ry = originRy + item.dy
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    const cell: MapCell = {
      rx,
      ry,
      tileNum: item.tileNum,
      subTile: item.subTile,
      height: Math.max(0, Math.min(MAX_HEIGHT, baseHeight + item.height)),
      iceGrowth: item.iceGrowth,
      extra: item.extra,
    }
    doc.setCell(cell)
    doc.setOverlay(rx, ry, item.overlayId ?? EMPTY_OVERLAY, item.overlayValue ?? 0)
  }
  pasteTechno(doc.infantry, clip.infantry, originRx, originRy, doc.width, doc.height)
  pasteTechno(doc.units, clip.units, originRx, originRy, doc.width, doc.height)
  pasteTechno(doc.aircraft, clip.aircraft, originRx, originRy, doc.width, doc.height)
  pasteTechno(doc.structures, clip.structures, originRx, originRy, doc.width, doc.height)
  for (const item of clip.terrains) {
    const rx = originRx + item.rx
    const ry = originRy + item.ry
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    doc.terrains.push({ ...item, id: createMapObjectId(), rx, ry })
  }
  for (const item of clip.smudges) {
    const rx = originRx + item.rx
    const ry = originRy + item.ry
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    doc.smudges.push({ ...item, id: createMapObjectId(), rx, ry })
  }
  let nextWp = doc.waypoints.reduce((max, item) => Math.max(max, item.number), -1) + 1
  for (const item of clip.waypoints) {
    const rx = originRx + item.dx
    const ry = originRy + item.dy
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    doc.waypoints.push({ number: nextWp, rx, ry })
    nextWp += 1
  }
  for (const item of clip.cellTags) {
    const rx = originRx + item.dx
    const ry = originRy + item.dy
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    doc.cellTags.push({ rx, ry, tagId: item.tagId })
  }
  for (const item of clip.nodes) {
    const rx = originRx + item.dx
    const ry = originRy + item.dy
    if (!isValidIsoCell(rx, ry, doc.width, doc.height)) continue
    const house = doc.houses.find((entry) => entry.name === item.house)
    house?.nodes.push({ type: item.type, rx, ry })
  }
}

/** FA2 `CMapData::Copy()` 无参：整张 iso 菱形。 */
export function copyWholeMap(doc: MapDocument): MapClipboard {
  let minRx = Number.POSITIVE_INFINITY
  let minRy = Number.POSITIVE_INFINITY
  let maxRx = Number.NEGATIVE_INFINITY
  let maxRy = Number.NEGATIVE_INFINITY
  forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
    minRx = Math.min(minRx, rx)
    minRy = Math.min(minRy, ry)
    maxRx = Math.max(maxRx, rx)
    maxRy = Math.max(maxRy, ry)
  })
  return copyRegion(doc, { minRx, minRy, maxRx, maxRy })
}

/** FA2 `Paste(isoSize/2, isoSize/2, 0)`：以目标格为中心贴回。 */
export function pasteWholeMap(doc: MapDocument, clip: MapClipboard, destRx?: number, destRy?: number): void {
  pasteRegion(doc, clip, destRx ?? Math.floor(doc.isoSize / 2), destRy ?? Math.floor(doc.isoSize / 2))
}
