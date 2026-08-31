import { isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { TheaterRules, type TheaterIndex } from './theaterIndex'
import { smoothAllAround, type SmoothTerrainLookup } from './fa2Smooth'

/** 与 werhd TileDirection 一致的四向（等距菱形邻格）。 */
export const IsoDir = {
  TopRight: 2,
  TopLeft: 1,
  BottomLeft: 5,
  BottomRight: 7,
} as const

export type AutoLatTile = {
  rx: number
  ry: number
  tileNum: number
  rampType: number
  terrainType: number
}

function neighborOf(rx: number, ry: number, direction: number): { rx: number; ry: number } {
  switch (direction) {
    case IsoDir.TopRight: return { rx, ry: ry - 1 }
    case IsoDir.BottomRight: return { rx: rx + 1, ry }
    case IsoDir.BottomLeft: return { rx, ry: ry + 1 }
    case IsoDir.TopLeft: return { rx: rx - 1, ry }
    default: return { rx, ry }
  }
}

/**
 * 移植 werhd AutoLat：LAT 地块按四邻接位写入 CLAT 过渡瓦片，并处理 RampSmooth。
 */
export function calculateAutoLat(tiles: AutoLatTile[], rules: TheaterRules, inBounds: (rx: number, ry: number) => boolean): void {
  const byKey = new Map(tiles.map((tile) => [`${tile.rx},${tile.ry}`, tile]))
  const setOf = new Map<AutoLatTile, number>()
  const neighbour = (tile: AutoLatTile, direction: number) => {
    const next = neighborOf(tile.rx, tile.ry, direction)
    return byKey.get(`${next.rx},${next.ry}`)
  }

  for (const tile of tiles) {
    let setNum = rules.getSetNum(tile.tileNum)
    if (rules.isCLAT(setNum)) {
      setNum = rules.getLAT(setNum)
      tile.tileNum = rules.getTileNumFromSet(setNum)
    }
    setOf.set(tile, setNum)
  }

  for (const tile of tiles) {
    const setNum = setOf.get(tile)
    if (rules.isLAT(setNum)) {
      let mask = 0
      const tr = neighbour(tile, IsoDir.TopRight)
      const br = neighbour(tile, IsoDir.BottomRight)
      const bl = neighbour(tile, IsoDir.BottomLeft)
      const tl = neighbour(tile, IsoDir.TopLeft)
      if (tr && rules.canConnectTiles(setNum, setOf.get(tr))) mask += 1
      if (br && rules.canConnectTiles(setNum, setOf.get(br))) mask += 2
      if (bl && rules.canConnectTiles(setNum, setOf.get(bl))) mask += 4
      if (tl && rules.canConnectTiles(setNum, setOf.get(tl))) mask += 8
      if (mask > 0) {
        const clat = rules.getCLATSet(setNum!)
        if (clat >= 0) tile.tileNum = rules.getTileNumFromSet(clat, mask)
      }
    } else if (setNum === rules.getGeneralValue('RampBase') && tile.rampType >= 1 && tile.terrainType <= 4) {
      let extra = -1
      const tr = neighbour(tile, IsoDir.TopRight)
      const br = neighbour(tile, IsoDir.BottomRight)
      const bl = neighbour(tile, IsoDir.BottomLeft)
      const tl = neighbour(tile, IsoDir.TopLeft)
      switch (tile.rampType) {
        case 1:
          if (tl && tl.rampType === 0) extra++
          if (br && br.rampType === 0) extra += 2
          break
        case 2:
          if (tr && tr.rampType === 0) extra++
          if (bl && bl.rampType === 0) extra += 2
          break
        case 3:
          if (br && br.rampType === 0) extra++
          if (tl && tl.rampType === 0) extra += 2
          break
        case 4:
          if (bl && bl.rampType === 0) extra++
          if (tr && tr.rampType === 0) extra += 2
          break
        default:
          break
      }
      if (extra !== -1) {
        const smooth = rules.getGeneralValue('RampSmooth')
        if (smooth >= 0) tile.tileNum = rules.getTileNumFromSet(smooth, 3 * (tile.rampType - 1) + extra)
      }
    }
  }

  void inBounds
}

export function applyLatAt(
  doc: MapDocument,
  rx: number,
  ry: number,
  theater: TheaterIndex,
  radius = 2,
  lookup?: SmoothTerrainLookup,
): void {
  const rules = new TheaterRules(theater)
  const tiles: AutoLatTile[] = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = rx + dx
      const cy = ry + dy
      if (!isValidIsoCell(cx, cy, doc.width, doc.height)) continue
      const cell = doc.getCell(cx, cy)
      tiles.push({
        rx: cx,
        ry: cy,
        tileNum: cell.tileNum,
        rampType: 0,
        terrainType: 0,
      })
    }
  }
  calculateAutoLat(tiles, rules, (cx, cy) => isValidIsoCell(cx, cy, doc.width, doc.height))
  for (const tile of tiles) {
    const cell = doc.getCell(tile.rx, tile.ry)
    if (cell.tileNum === tile.tileNum) continue
    cell.tileNum = tile.tileNum
    doc.setCell(cell)
  }
  /** FA2 PlaceTile 在笔刷周围调用 SmoothAllAt，覆盖 werhd LAT 编号以对齐编辑器。 */
  smoothAllAround(doc, rx, ry, theater, radius + 1, lookup)
}
