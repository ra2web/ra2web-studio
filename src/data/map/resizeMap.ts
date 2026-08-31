import { validateMapSize } from './constants'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { cellKey, emptyCell } from './packs'

export function resizeMap(doc: MapDocument, width: number, height: number): string | null {
  const error = validateMapSize(width, height)
  if (error) return error
  const previous = doc.cells
  doc.width = width
  doc.height = height
  doc.localWidth = Math.max(1, width - 4)
  doc.localHeight = Math.max(1, height - 6)
  const next = new Map<string, ReturnType<typeof emptyCell>>()
  forEachIsoCell(width, height, ({ rx, ry }) => {
    const key = cellKey(rx, ry)
    next.set(key, previous.get(key) ?? emptyCell(rx, ry))
  })
  doc.cells = next
  const keep = (rx: number, ry: number) => isValidIsoCell(rx, ry, width, height)
  doc.units = doc.units.filter((item) => keep(item.rx, item.ry))
  doc.infantry = doc.infantry.filter((item) => keep(item.rx, item.ry))
  doc.aircraft = doc.aircraft.filter((item) => keep(item.rx, item.ry))
  doc.structures = doc.structures.filter((item) => keep(item.rx, item.ry))
  doc.terrains = doc.terrains.filter((item) => keep(item.rx, item.ry))
  doc.smudges = doc.smudges.filter((item) => keep(item.rx, item.ry))
  doc.waypoints = doc.waypoints.filter((item) => keep(item.rx, item.ry))
  doc.cellTags = doc.cellTags.filter((item) => keep(item.rx, item.ry))
  for (const house of doc.houses) {
    house.nodes = house.nodes.filter((node) => keep(node.rx, node.ry))
  }
  return null
}
