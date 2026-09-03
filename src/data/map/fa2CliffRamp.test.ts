import { describe, expect, it } from 'vitest'
import { placeFa2Cliff } from './fa2Cliff'
import { paintCliffRamp } from './fa2CliffRamp'
import { forEachIsoCell, isValidIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { TheaterRules, parseTheaterIni } from './theaterIndex'

const RAMP_INI = `
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

function playableLine(): { from: { rx: number; ry: number }; to: { rx: number; ry: number } } {
  let found: { from: { rx: number; ry: number }; to: { rx: number; ry: number } } | null = null
  forEachIsoCell(24, 24, (cell) => {
    if (found) return
    const to = { rx: cell.rx, ry: cell.ry + 12 }
    const mid = { rx: cell.rx, ry: cell.ry + 6 }
    const low = { rx: cell.rx + 4, ry: cell.ry + 6 }
    const side = { rx: cell.rx, ry: cell.ry + 2 }
    if (![cell, to, mid, low, side].every((item) => isValidIsoCell(item.rx, item.ry, 24, 24))) return
    found = { from: { rx: cell.rx, ry: cell.ry }, to }
  })
  if (!found) throw new Error('no line')
  return found
}

describe('paintCliffRamp', () => {
  it('cuts a cliff line and leaves a 4-step RampBase gap with cliffs on both sides', () => {
    const theater = parseTheaterIni(RAMP_INI)
    const rules = new TheaterRules(theater)
    const cliffSet = rules.getGeneralValue('CliffSet')
    const rampSet = rules.getGeneralValue('RampBase')
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const { from, to } = playableLine()
    expect(placeFa2Cliff(doc, from, to, theater, 'TEMPERATE', {
      face: 'front',
      pick: (tiles) => tiles[0] ?? -1,
    })).toBe(true)

    const midRy = from.ry + 6
    let click: { rx: number; ry: number } | null = null
    forEachIsoCell(24, 24, (cell) => {
      if (click) return
      if (cell.ry !== midRy) return
      if (rules.getSetNum(doc.getCell(cell.rx, cell.ry).tileNum) !== cliffSet) return
      click = { rx: cell.rx, ry: cell.ry }
    })
    if (!click) throw new Error('no cliff at midpoint')

    expect(paintCliffRamp(doc, click.rx, click.ry, theater, 'TEMPERATE', { width: 2 })).toBe(true)

    const ramps: Array<{ rx: number; ry: number; height: number }> = []
    const cliffs: Array<{ rx: number; ry: number }> = []
    forEachIsoCell(24, 24, (cell) => {
      const mapCell = doc.getCell(cell.rx, cell.ry)
      const setNum = rules.getSetNum(mapCell.tileNum)
      if (setNum === rampSet) ramps.push({ rx: cell.rx, ry: cell.ry, height: mapCell.height })
      if (setNum === cliffSet) cliffs.push({ rx: cell.rx, ry: cell.ry })
    })
    expect(ramps.length).toBeGreaterThan(0)
    const heights = [...new Set(ramps.map((cell) => cell.height))].sort((a, b) => a - b)
    expect(heights.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...ramps.map((cell) => cell.height)) - Math.min(...ramps.map((cell) => cell.height))).toBeGreaterThanOrEqual(3)

    const leftCliff = cliffs.some((cell) => cell.ry < click.ry - 1)
    const rightCliff = cliffs.some((cell) => cell.ry > click.ry + 1)
    expect(leftCliff).toBe(true)
    expect(rightCliff).toBe(true)
  })

  it('does nothing on a morphable ground cell', () => {
    const theater = parseTheaterIni(RAMP_INI)
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'TEMPERATE' })
    const { from } = playableLine()
    expect(paintCliffRamp(doc, from.rx, from.ry, theater, 'TEMPERATE')).toBe(false)
    expect(doc.getCell(from.rx, from.ry).tileNum).toBe(0)
  })
})
