import { describe, expect, it } from 'vitest'
import { paintHighland, highlandOutlineRuns } from './fa2Highland'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { TheaterRules, parseTheaterIni } from './theaterIndex'
import { cliffFootprint } from './tmpCatalog'

const HIGHLAND_INI = `
[General]
ClearTile=0
CliffSet=1
RampBase=2
[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
Morphable=true
[TileSet0001]
FileName=CLF
SetName=Cliff
TilesInSet=40
Morphable=false
[TileSet0002]
FileName=RAMP
SetName=RampBase
TilesInSet=20
Morphable=true
`

function findBlock(width: number, height: number, size: number, pad: number): { rx: number; ry: number } {
  let found: { rx: number; ry: number } | null = null
  forEachIsoCell(width, height, (cell) => {
    if (found) return
    for (let dx = -pad; dx < size + pad; dx++) {
      for (let dy = -pad; dy < size + pad; dy++) {
        if (!isValidIsoCell(cell.rx + dx, cell.ry + dy, width, height)) return
      }
    }
    found = { rx: cell.rx, ry: cell.ry }
  })
  if (!found) throw new Error('no block')
  return found
}

function blob3(origin: { rx: number; ry: number }): Array<{ rx: number; ry: number }> {
  const cells: Array<{ rx: number; ry: number }> = []
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) cells.push({ rx: origin.rx + dx, ry: origin.ry + dy })
  }
  return cells
}

describe('paintHighland', () => {
  it('splits the outside outline into front and back runs', () => {
    const origin = { rx: 10, ry: 10 }
    const runs = highlandOutlineRuns(blob3(origin))
    expect(runs.some((run) => run.face === 'front')).toBe(true)
    expect(runs.some((run) => run.face === 'back')).toBe(true)
    const down = runs.find((run) => run.from.ry === origin.ry + 2 && run.to.ry === origin.ry + 2)
    expect(down?.face).toBe('front')
    const up = runs.find((run) => run.from.ry === origin.ry && run.to.ry === origin.ry)
    expect(up?.face).toBe('back')
    const left = runs.find((run) => run.from.rx === origin.rx && run.to.rx === origin.rx)
    expect(left?.face).toBe('back')
    const right = runs.find((run) => run.from.rx === origin.rx + 2 && run.to.rx === origin.rx + 2)
    expect(right?.face).toBe('front')
  })

  it('raises a 3x3 blob by 4 and keeps the interior morphable with CliffSet around it', () => {
    const theater = parseTheaterIni(HIGHLAND_INI)
    const rules = new TheaterRules(theater)
    const cliffSet = rules.getGeneralValue('CliffSet')
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = findBlock(24, 24, 3, 2)
    const cells = blob3(origin)
    paintHighland(doc, cells, theater, 'TEMPERATE')

    for (const cell of cells) {
      const mapCell = doc.getCell(cell.rx, cell.ry)
      if (rules.getSetNum(mapCell.tileNum) === cliffSet) continue
      expect(mapCell.height).toBe(4)
      expect(rules.isMorphable(mapCell.tileNum)).toBe(true)
    }

    let cliffs = 0
    for (let dx = -1; dx < 4; dx++) {
      for (let dy = -1; dy < 4; dy++) {
        const inBlob = dx >= 0 && dx < 3 && dy >= 0 && dy < 3
        if (inBlob) continue
        const cell = doc.getCell(origin.rx + dx, origin.ry + dy)
        if (rules.getSetNum(cell.tileNum) === cliffSet) cliffs += 1
      }
    }
    expect(cliffs).toBeGreaterThan(0)
  })

  it('debug: 8x8 blob with mixed cliff zHeight records stage heights', () => {
    const theater = parseTheaterIni(HIGHLAND_INI)
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = findBlock(24, 24, 8, 2)
    const cells: Array<{ rx: number; ry: number }> = []
    for (let dx = 0; dx < 8; dx++) {
      for (let dy = 0; dy < 8; dy++) cells.push({ rx: origin.rx + dx, ry: origin.ry + dy })
    }
    paintHighland(doc, cells, theater, 'TEMPERATE', {
      shapeOf: () => ({
        cx: 2,
        cy: 2,
        subtiles: [
          { terrainType: 0, zHeight: 0, hasPic: true },
          { terrainType: 0, zHeight: 4, hasPic: true },
          { terrainType: 0, zHeight: 0, hasPic: true },
          { terrainType: 0, zHeight: 4, hasPic: true },
        ],
      }),
    })
    const rules = new TheaterRules(theater)
    const blob = new Set(cells.map((cell) => `${cell.rx},${cell.ry}`))
    const ortho = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const
    for (const cell of cells) {
      const interior = ortho.every(([dx, dy]) => blob.has(`${cell.rx + dx},${cell.ry + dy}`))
      if (!interior) continue
      const mapCell = doc.getCell(cell.rx, cell.ry)
      if (rules.getSetNum(mapCell.tileNum) === rules.getGeneralValue('CliffSet')) continue
      expect(mapCell.height).toBe(4)
      expect(rules.isMorphable(mapCell.tileNum)).toBe(true)
    }
  })

  it('does not punch height-0 holes where cliff TMP has no picture', () => {
    const theater = parseTheaterIni(HIGHLAND_INI)
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = findBlock(24, 24, 6, 2)
    const cells: Array<{ rx: number; ry: number }> = []
    for (let dx = 0; dx < 6; dx++) {
      for (let dy = 0; dy < 6; dy++) cells.push({ rx: origin.rx + dx, ry: origin.ry + dy })
    }
    paintHighland(doc, cells, theater, 'TEMPERATE', {
      shapeOf: () => ({
        cx: 2,
        cy: 2,
        subtiles: [
          { terrainType: 0, zHeight: 4, hasPic: true },
          { terrainType: 0, zHeight: 0, hasPic: false },
          { terrainType: 0, zHeight: 4, hasPic: true },
          { terrainType: 0, zHeight: 0, hasPic: false },
        ],
      }),
    })
    const rules = new TheaterRules(theater)
    const cliffSet = rules.getGeneralValue('CliffSet')
    for (const cell of cells) {
      const mapCell = doc.getCell(cell.rx, cell.ry)
      if (rules.getSetNum(mapCell.tileNum) === cliffSet) continue
      expect(mapCell.height).toBe(4)
    }
  })

  it('debug: 5x5 rectangle records outline geometry', () => {
    const theater = parseTheaterIni(HIGHLAND_INI)
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = findBlock(24, 24, 5, 3)
    const cells: Array<{ rx: number; ry: number }> = []
    for (let dx = 0; dx < 5; dx++) {
      for (let dy = 0; dy < 5; dy++) cells.push({ rx: origin.rx + dx, ry: origin.ry + dy })
    }
    paintHighland(doc, cells, theater, 'TEMPERATE')
    expect(doc.getCell(origin.rx + 2, origin.ry + 2).height).toBe(4)
  })

  it('keeps 2x2 cliff stamps intact on the rim of a 6x6 highland', () => {
    const theater = parseTheaterIni(HIGHLAND_INI)
    const rules = new TheaterRules(theater)
    const cliffSet = rules.getGeneralValue('CliffSet')
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = findBlock(24, 24, 6, 2)
    const cells: Array<{ rx: number; ry: number }> = []
    for (let dx = 0; dx < 6; dx++) {
      for (let dy = 0; dy < 6; dy++) cells.push({ rx: origin.rx + dx, ry: origin.ry + dy })
    }
    paintHighland(doc, cells, theater, 'TEMPERATE')

    let complete = 0
    const broken: Array<{ rx: number; ry: number; tile: number; cells: string[] }> = []
    for (let dx = -2; dx < 8; dx++) {
      for (let dy = -2; dy < 8; dy++) {
        const rx = origin.rx + dx
        const ry = origin.ry + dy
        if (!isValidIsoCell(rx, ry, 24, 24)) continue
        const cell = doc.getCell(rx, ry)
        if (rules.getSetNum(cell.tileNum) !== cliffSet || cell.subTile !== 0) continue
        // 只检查 2×2 件（1×2 / 2×1 / 1×1 的直线与转角件是正常布局）。
        const fp = cliffFootprint(undefined, cell.tileNum - 1)
        if (fp.cx * fp.cy !== 4) continue
        // Studio 轴向：subtile p = i*cy+e 落在 (rx+i, ry+e)。
        let ok = 0
        const cells: string[] = []
        for (let i = 0; i < 2; i++) {
          for (let e = 0; e < 2; e++) {
            if (!isValidIsoCell(rx + i, ry + e, 24, 24)) continue
            const next = doc.getCell(rx + i, ry + e)
            cells.push(`${rx + i},${ry + e}:t${next.tileNum}/s${next.subTile}`)
            if (next.tileNum === cell.tileNum && next.subTile === i * 2 + e) ok += 1
          }
        }
        if (ok === 4) complete += 1
        else broken.push({ rx, ry, tile: cell.tileNum, cells })
      }
    }
    expect(complete).toBeGreaterThan(0)
    expect(broken.length).toBeLessThan(complete)
  })

  it('only raises when theater.ini has no CliffSet', () => {
    const theater = parseTheaterIni(`
[General]
ClearTile=0
[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
Morphable=true
`)
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const origin = findBlock(24, 24, 3, 1)
    paintHighland(doc, blob3(origin), theater, 'TEMPERATE')
    expect(doc.getCell(origin.rx + 1, origin.ry + 1).height).toBe(4)
    let cliffs = 0
    forEachIsoCell(24, 24, (cell) => {
      if (doc.getCell(cell.rx, cell.ry).tileNum > 0) cliffs += 1
    })
    expect(cliffs).toBe(0)
  })
})
