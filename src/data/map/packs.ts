import { Format5 } from '../encoding/Format5'
import { DataStream } from '../DataStream'
import { base64StringToUint8Array, uint8ArrayToBase64String } from '../../util/string'
import {
  EMPTY_TILE,
  MAP_FIELD_BYTES,
  OVERLAY_PLANE_SIZE,
} from './constants'
import { forEachIsoCell } from './isoCoords'
import type { MapCell } from './types'

export function decodeIsoMapPack5(
  base64: string,
  width: number,
  height: number,
): Map<string, MapCell> {
  const cells = new Map<string, MapCell>()
  if (!base64) {
    forEachIsoCell(width, height, ({ rx, ry }) => {
      cells.set(cellKey(rx, ry), emptyCell(rx, ry))
    })
    return cells
  }

  const packed = base64StringToUint8Array(base64)
  const tileCount = (2 * width - 1) * height
  const unpacked = new Uint8Array(MAP_FIELD_BYTES * tileCount + 4)
  Format5.decodeInto(packed, unpacked)

  const stream = new DataStream(unpacked.buffer)
  const recordCount = Math.floor(unpacked.length / MAP_FIELD_BYTES)
  for (let i = 0; i < recordCount; i++) {
    if (stream.position + MAP_FIELD_BYTES > unpacked.length) break
    const rx = stream.readUint16()
    const ry = stream.readUint16()
    const tileNumRaw = stream.readInt16()
    const extra = stream.readInt16()
    const subTile = stream.readUint8()
    const heightValue = stream.readUint8()
    const iceGrowth = stream.readUint8()
    if (rx === 0 && ry === 0 && tileNumRaw === 0 && i >= tileCount) continue
    cells.set(cellKey(rx, ry), {
      rx,
      ry,
      tileNum: Math.max(0, tileNumRaw === EMPTY_TILE ? 0 : tileNumRaw),
      extra,
      subTile,
      height: heightValue,
      iceGrowth,
    })
  }

  forEachIsoCell(width, height, ({ rx, ry }) => {
    const key = cellKey(rx, ry)
    if (!cells.has(key)) cells.set(key, emptyCell(rx, ry))
  })
  return cells
}

export function encodeIsoMapPack5(
  cells: Map<string, MapCell>,
  width: number,
  height: number,
): string {
  const records: MapCell[] = []
  forEachIsoCell(width, height, ({ rx, ry }) => {
    records.push(cells.get(cellKey(rx, ry)) ?? emptyCell(rx, ry))
  })
  const bytes = new Uint8Array(records.length * MAP_FIELD_BYTES)
  const view = new DataView(bytes.buffer)
  let offset = 0
  for (const cell of records) {
    view.setUint16(offset, cell.rx, true)
    view.setUint16(offset + 2, cell.ry, true)
    view.setInt16(offset + 4, cell.tileNum, true)
    view.setInt16(offset + 6, cell.extra, true)
    bytes[offset + 8] = cell.subTile & 0xff
    bytes[offset + 9] = cell.height & 0xff
    bytes[offset + 10] = cell.iceGrowth & 0xff
    offset += MAP_FIELD_BYTES
  }
  return uint8ArrayToBase64String(Format5.encode(bytes, 5))
}

export function decodeOverlayPack(base64: string): Uint8Array {
  const plane = new Uint8Array(OVERLAY_PLANE_SIZE)
  plane.fill(0xff)
  if (!base64) return plane
  const packed = base64StringToUint8Array(base64)
  Format5.decodeInto(packed, plane, 80)
  return plane
}

export function encodeOverlayPack(plane: Uint8Array): string {
  if (plane.length !== OVERLAY_PLANE_SIZE) {
    throw new Error(`Overlay plane must be ${OVERLAY_PLANE_SIZE} bytes`)
  }
  return uint8ArrayToBase64String(Format5.encode(plane, 80))
}

export function cellKey(rx: number, ry: number): string {
  return `${rx},${ry}`
}

export function emptyCell(rx: number, ry: number, height = 0): MapCell {
  return {
    rx,
    ry,
    tileNum: 0,
    subTile: 0,
    height,
    iceGrowth: 0,
    extra: 0,
  }
}
