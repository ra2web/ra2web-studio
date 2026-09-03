import { MAX_UNDO_TERRAIN } from './constants'
import { fa2CenteredRectOffsets, fa2PaintRectOffsets } from './fa2Brush'
import { MapDocument } from './MapDocument'
import { cellKey } from './packs'
import type { MapCell } from './types'

export type TerrainSnapshot = {
  cells: Array<[string, MapCell]>
  overlay: Uint8Array
  overlayData: Uint8Array
}

export type MapCommand = {
  label: string
  apply: (doc: MapDocument) => void
  revert: (doc: MapDocument) => void
}

export class MapCommandStack {
  private undoStack: MapCommand[] = []
  private redoStack: MapCommand[] = []

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  snapshotTerrain(doc: MapDocument, label = 'terrain'): MapCommand {
    const before = captureTerrain(doc)
    return {
      label,
      apply: () => {},
      revert: (target) => restoreTerrain(target, before),
    }
  }

  beginTerrain(doc: MapDocument, label: string): { commit: () => void } {
    const before = captureTerrain(doc)
    return {
      commit: () => {
        const after = captureTerrain(doc)
        this.push({
          label,
          apply: (target) => restoreTerrain(target, after),
          revert: (target) => restoreTerrain(target, before),
        })
      },
    }
  }

  push(command: MapCommand): void {
    this.undoStack.push(command)
    if (this.undoStack.length > MAX_UNDO_TERRAIN) this.undoStack.shift()
    this.redoStack = []
  }

  execute(doc: MapDocument, command: MapCommand): void {
    command.apply(doc)
    this.push(command)
  }

  undo(doc: MapDocument): boolean {
    const command = this.undoStack.pop()
    if (!command) return false
    command.revert(doc)
    this.redoStack.push(command)
    return true
  }

  redo(doc: MapDocument): boolean {
    const command = this.redoStack.pop()
    if (!command) return false
    command.apply(doc)
    this.undoStack.push(command)
    return true
  }
}

function captureTerrain(doc: MapDocument): TerrainSnapshot {
  return {
    cells: [...doc.cells.entries()].map(([key, cell]) => [key, { ...cell }]),
    overlay: new Uint8Array(doc.overlay),
    overlayData: new Uint8Array(doc.overlayData),
  }
}

function restoreTerrain(doc: MapDocument, snapshot: TerrainSnapshot): void {
  doc.cells = new Map(snapshot.cells.map(([key, cell]) => [key, { ...cell }]))
  doc.overlay = new Uint8Array(snapshot.overlay)
  doc.overlayData = new Uint8Array(snapshot.overlayData)
}

export function paintHeight(
  doc: MapDocument,
  rx: number,
  ry: number,
  delta: number,
  brush: number | { w: number; h: number } = 1,
  fromHeight?: number,
): void {
  const w = typeof brush === 'number' ? brush : Math.max(1, brush.w)
  const h = typeof brush === 'number' ? brush : Math.max(1, brush.h)
  const target = fromHeight === undefined ? undefined : fromHeight + delta
  const bump = (cx: number, cy: number) => {
    const cell = doc.getCell(cx, cy)
    if (fromHeight !== undefined && cell.height !== fromHeight) return
    cell.height = Math.max(0, Math.min(14, target ?? cell.height + delta))
    doc.setCell(cell)
  }
  for (const { dx, dy } of fa2CenteredRectOffsets(w, h)) bump(rx + dx, ry + dy)
}

export function paintTile(
  doc: MapDocument,
  rx: number,
  ry: number,
  tileNum: number,
  brush: number | { w: number; h: number } = 1,
): void {
  const w = typeof brush === 'number' ? brush : Math.max(1, brush.w)
  const h = typeof brush === 'number' ? brush : Math.max(1, brush.h)
  const offsets = fa2PaintRectOffsets(w, h)
  for (const { dx, dy } of offsets) {
    const cell = doc.getCell(rx + dx, ry + dy)
    cell.tileNum = tileNum
    cell.subTile = 0
    doc.setCell(cell)
  }
}

export function flattenHeight(
  doc: MapDocument,
  rx: number,
  ry: number,
  brush: number | { w: number; h: number } = 1,
  lockHeight?: number,
): void {
  const w = typeof brush === 'number' ? brush : Math.max(1, brush.w)
  const h = typeof brush === 'number' ? brush : Math.max(1, brush.h)
  const base = lockHeight ?? doc.getCell(rx, ry).height
  for (const { dx, dy } of fa2CenteredRectOffsets(w, h)) {
    const cell = doc.getCell(rx + dx, ry + dy)
    cell.height = base
    doc.setCell(cell)
  }
}

export { cellKey }
