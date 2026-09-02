import { EMPTY_OVERLAY, OVRL_TRACK_BEGIN, OVRL_TRACK_END } from './constants'
import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'

/** FA2 RA2 `overlay_number`：沙袋/盟军墙/苏军墙/黑篱/监狱篱/白篱/尤里墙/克宫墙。 */
export const FA2_WALL_OVERLAYS = [0x00, 0x02, 0x1a, 0xcb, 0xf1, 0xcc, 0xf3, 0xf0] as const

export const OVRL_BIG_BRIDGE_NS = 0x18
export const OVRL_BIG_BRIDGE_EW = 0x19
export const OVRL_TRACK_BRIDGE_NS = 0xed
export const OVRL_TRACK_BRIDGE_EW = 0xee
export const OVRL_SMALL_BRIDGE_START = 0x4a
export const OVRL_CONCRETE_BRIDGE_START = 0xcd

export type BridgeKind = 'big' | 'small' | 'track' | 'concrete'

/** FA2 `isBigBridge`：高架木桥 / TS 轨桥 / RA2 轨桥。 */
export function isBigBridgeOverlay(id: number): boolean {
  return (id >= 0x18 && id <= 0x19) || (id >= 0x3b && id <= 0x3c) || (id >= 0xed && id <= 0xee)
}

export function isTrackOverlay(id: number): boolean {
  return id >= OVRL_TRACK_BEGIN && id <= OVRL_TRACK_END
}

export function isWallOverlay(id: number): boolean {
  return (FA2_WALL_OVERLAYS as readonly number[]).includes(id)
}

export function isTrailOverlay(id: number): boolean {
  return isTrackOverlay(id) || isWallOverlay(id)
}

/**
 * FA2 `CIsoView::GetOverlayDirection`。
 * 轨道看邻接轨道件；墙看同 ID 四邻，位：西=1 南=2 东=4 北=8。
 */
export function overlayDirection(doc: MapDocument, rx: number, ry: number): number {
  const type = doc.getOverlay(rx, ry).id
  const at = (x: number, y: number) => doc.getOverlay(x, y).id
  if (isTrackOverlay(type)) {
    const t = (x: number, y: number) => isTrackOverlay(at(x, y))
    if (t(rx - 1, ry - 1) && t(rx + 1, ry + 1)) return 0
    if (t(rx + 1, ry - 1) && t(rx - 1, ry + 1)) return 1
    if (t(rx - 1, ry) && t(rx + 1, ry)) return 2
    if (t(rx, ry - 1) && t(rx, ry + 1)) return 3
    if (t(rx - 1, ry) && t(rx + 1, ry + 1)) return 4
    if (t(rx, ry - 1) && t(rx + 1, ry + 1)) return 5
    if (t(rx - 1, ry - 1) && t(rx, ry + 1)) return 6
    if (t(rx - 1, ry - 1) && t(rx + 1, ry)) return 7
    if (t(rx - 1, ry) && t(rx + 1, ry - 1)) return 8
    if (t(rx, ry + 1) && t(rx + 1, ry - 1)) return 9
    if (t(rx, ry - 1) && t(rx - 1, ry + 1)) return 10
    if (t(rx - 1, ry + 1) && t(rx + 1, ry)) return 11
    if (t(rx - 1, ry - 1)) return 0
    if (t(rx - 1, ry + 1)) return 1
    if (t(rx - 1, ry)) return 2
    if (t(rx, ry - 1)) return 3
    if (t(rx + 1, ry + 1)) return 0
    if (t(rx + 1, ry - 1)) return 1
    if (t(rx + 1, ry)) return 2
    if (t(rx, ry + 1)) return 3
    return 0
  }
  if (isWallOverlay(type)) {
    let bits = 0
    if (at(rx - 1, ry) === type) bits |= 0x1
    if (at(rx, ry + 1) === type) bits |= 0x2
    if (at(rx + 1, ry) === type) bits |= 0x4
    if (at(rx, ry - 1) === type) bits |= 0x8
    return bits
  }
  return 0
}

/** FA2 `CIsoView::HandleTrail`：墙改 OverlayData，轨道改 Overlay ID。 */
export function handleTrail(doc: MapDocument, rx: number, ry: number): void {
  const type = doc.getOverlay(rx, ry).id
  if (type === EMPTY_OVERLAY) return
  const track = isTrackOverlay(type)
  if (!track && !isWallOverlay(type)) return
  for (let i = rx - 2; i <= rx + 2; i++) {
    for (let e = ry - 1; e <= ry + 1; e++) {
      const ov = doc.getOverlay(i, e)
      if (track && isTrackOverlay(ov.id)) {
        doc.setOverlay(i, e, OVRL_TRACK_BEGIN + overlayDirection(doc, i, e), ov.value)
      } else if (!track && ov.id === type) {
        const dir = overlayDirection(doc, i, e)
        if (dir >= 0) doc.setOverlay(i, e, ov.id, dir)
      }
    }
  }
}

export function refreshTrailsAround(doc: MapDocument, rx: number, ry: number): void {
  for (let i = rx - 2; i <= rx + 2; i++) {
    for (let e = ry - 1; e <= ry + 1; e++) {
      handleTrail(doc, i, e)
    }
  }
}

function axisAlign(
  from: { rx: number; ry: number },
  to: { rx: number; ry: number },
): { minX: number; maxX: number; minY: number; maxY: number; alongX: boolean } {
  const dx = Math.abs(to.rx - from.rx)
  const dy = Math.abs(to.ry - from.ry)
  if (dx >= dy) {
    const minX = Math.min(from.rx, to.rx)
    const maxX = Math.max(from.rx, to.rx)
    return { minX, maxX, minY: from.ry, maxY: from.ry, alongX: true }
  }
  const minY = Math.min(from.ry, to.ry)
  const maxY = Math.max(from.ry, to.ry)
  return { minX: from.rx, maxX: from.rx, minY, maxY, alongX: false }
}

function heightAt(doc: MapDocument, rx: number, ry: number): number {
  return doc.getCell(rx, ry).height
}

function bigBridgeStartHeight(
  doc: MapDocument,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  alongX: boolean,
): number {
  let start = heightAt(doc, minX, minY)
  if (alongX) {
    for (let x = minX; x <= maxX; x++) {
      if (heightAt(doc, x, minY) === start - 4) {
        start = heightAt(doc, x, minY)
        break
      }
    }
  } else {
    for (let y = minY; y <= maxY; y++) {
      if (heightAt(doc, minX, y) === start - 4) {
        start = heightAt(doc, minX, y)
        break
      }
    }
  }
  return start
}

function put(doc: MapDocument, rx: number, ry: number, id: number, data: number): void {
  if (!isValidIsoCell(rx, ry, doc.width, doc.height)) return
  doc.setOverlay(rx, ry, id, data)
}

export type BridgeOverlayCell = { rx: number; ry: number; id: number; value: number }

/**
 * FA2 连桥会写入的 Overlay 格。不改地图，供笔刷幽灵预览。
 */
export function bridgeLineOverlays(
  doc: MapDocument,
  from: { rx: number; ry: number },
  to: { rx: number; ry: number },
  kind: BridgeKind,
  pickFrame: (span: number) => number = () => 0,
): BridgeOverlayCell[] {
  if (from.rx === to.rx && from.ry === to.ry) return []
  const { minX, maxX, minY, maxY, alongX } = axisAlign(from, to)
  const out: BridgeOverlayCell[] = []
  const add = (rx: number, ry: number, id: number, value: number) => {
    if (isValidIsoCell(rx, ry, doc.width, doc.height)) out.push({ rx, ry, id, value })
  }

  if (kind === 'big' || kind === 'track') {
    const startHeight = bigBridgeStartHeight(doc, minX, maxX, minY, maxY, alongX)
    const overlay = kind === 'track'
      ? (alongX ? OVRL_TRACK_BRIDGE_EW : OVRL_TRACK_BRIDGE_NS)
      : (alongX ? OVRL_BIG_BRIDGE_EW : OVRL_BIG_BRIDGE_NS)
    const data = alongX ? 0x9 : 0x0
    if (alongX) {
      for (let x = minX; x <= maxX; x++) {
        if (heightAt(doc, x, minY) === startHeight) add(x, minY, overlay, data)
      }
    } else {
      for (let y = minY; y <= maxY; y++) {
        if (heightAt(doc, minX, y) === startHeight) add(minX, y, overlay, data)
      }
    }
    return out
  }

  const start = kind === 'concrete' ? OVRL_CONCRETE_BRIDGE_START : OVRL_SMALL_BRIDGE_START
  if (alongX) {
    for (let x = minX + 1; x <= maxX - 1; x++) {
      const frame = start + 9 + (pickFrame(x) & 3)
      add(x, minY - 1, frame, 0x0)
      add(x, minY, frame, 0x1)
      add(x, minY + 1, frame, 0x2)
    }
    add(minX, minY - 1, start + 22, 0x0)
    add(minX, minY, start + 22, 0x1)
    add(minX, minY + 1, start + 22, 0x2)
    add(maxX, minY - 1, start + 24, 0x0)
    add(maxX, minY, start + 24, 0x1)
    add(maxX, minY + 1, start + 24, 0x2)
  } else {
    for (let y = minY + 1; y <= maxY - 1; y++) {
      const frame = start + (pickFrame(y) & 3)
      add(minX - 1, y, frame, 0x0)
      add(minX, y, frame, 0x1)
      add(minX + 1, y, frame, 0x2)
    }
    add(minX - 1, minY, start + 20, 0x0)
    add(minX, minY, start + 20, 0x1)
    add(minX + 1, minY, start + 20, 0x2)
    add(minX - 1, maxY, start + 18, 0x0)
    add(minX, maxY, start + 18, 0x1)
    add(minX + 1, maxY, start + 18, 0x2)
  }
  return out
}

/**
 * FA2 `ACTIONMODE_PLACE` type 6 data 5：轴对齐拖线桥。
 * `pickFrame` 对应小桥中段 `rand() * 4`，测试可固定为 0。
 */
export function placeBridgeLine(
  doc: MapDocument,
  from: { rx: number; ry: number },
  to: { rx: number; ry: number },
  kind: BridgeKind,
  pickFrame: (span: number) => number = () => 0,
): void {
  for (const cell of bridgeLineOverlays(doc, from, to, kind, pickFrame)) {
    put(doc, cell.rx, cell.ry, cell.id, cell.value)
  }
}
