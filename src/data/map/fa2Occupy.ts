import type { BuildingFoundation } from './rulesObjects'
import type { MapDocument } from './MapDocument'

/** FA2 地基：w 沿 +ry，h 沿 +rx，与视口建筑外框一致。 */
export function foundationCells(rx: number, ry: number, size: BuildingFoundation): Array<{ rx: number; ry: number }> {
  const cells: Array<{ rx: number; ry: number }> = []
  const width = Math.max(1, size.w)
  const height = Math.max(1, size.h)
  for (let dw = 0; dw < width; dw++) {
    for (let dh = 0; dh < height; dh++) {
      cells.push({ rx: rx + dh, ry: ry + dw })
    }
  }
  return cells
}

export function structureSize(name: string, foundations: Record<string, BuildingFoundation>): BuildingFoundation {
  return foundations[name] ?? { w: 1, h: 1 }
}

/** FA2 允许 GAPAVE 铺路叠在建筑上。 */
export function isPavementStructure(name: string): boolean {
  return name.toUpperCase() === 'GAPAVE'
}

export function structureAt(
  doc: MapDocument,
  rx: number,
  ry: number,
  foundations: Record<string, BuildingFoundation>,
) {
  return doc.structures.find((building) => (
    foundationCells(building.rx, building.ry, structureSize(building.name, foundations))
      .some((cell) => cell.rx === rx && cell.ry === ry)
  ))
}

export function structureOccupies(
  doc: MapDocument,
  rx: number,
  ry: number,
  foundations: Record<string, BuildingFoundation>,
): boolean {
  return doc.structures.some((building) => {
    if (isPavementStructure(building.name)) return false
    return foundationCells(building.rx, building.ry, structureSize(building.name, foundations))
      .some((cell) => cell.rx === rx && cell.ry === ry)
  })
}

export function canPlaceStructure(
  doc: MapDocument,
  rx: number,
  ry: number,
  name: string,
  foundations: Record<string, BuildingFoundation>,
): boolean {
  if (isPavementStructure(name)) return true
  return !foundationCells(rx, ry, structureSize(name, foundations))
    .some((cell) => structureOccupies(doc, cell.rx, cell.ry, foundations))
}
