import { describe, expect, it } from 'vitest'
import { EMPTY_OVERLAY } from './constants'
import { copyRegion, copyWholeMap, normalizeCopyRect, pasteRegion } from './copyPaste'
import { forEachIsoCell } from './isoCoords'
import { MapDocument } from './MapDocument'

function twoCells(width = 16, height = 16): [{ rx: number; ry: number }, { rx: number; ry: number }] {
  const found: { rx: number; ry: number }[] = []
  forEachIsoCell(width, height, (cell) => {
    if (found.length < 2) found.push({ rx: cell.rx, ry: cell.ry })
  })
  if (found.length < 2) throw new Error('need two iso cells')
  return [found[0], found[1]]
}

describe('copyRegion / pasteRegion', () => {
  it('copies terrain, overlay and units then pastes centered', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const [origin, dest] = twoCells()
    const cell = doc.getCell(origin.rx, origin.ry)
    cell.tileNum = 9
    cell.height = 3
    doc.setCell(cell)
    doc.setOverlay(origin.rx, origin.ry, 102, 8)
    doc.units.push({
      id: '0',
      owner: 'Americans',
      name: 'MTNK',
      health: 256,
      rx: origin.rx,
      ry: origin.ry,
      direction: 0,
      mission: 'Guard',
      tag: 'none',
      veterancy: 0,
      group: -1,
      onBridge: false,
      recruitable: false,
      aiRecruitable: false,
      extra: [],
    })
    const clip = copyRegion(doc, normalizeCopyRect(origin, origin))
    expect(clip.cells).toHaveLength(1)
    expect(clip.cells[0].tileNum).toBe(9)
    expect(clip.units[0].name).toBe('MTNK')

    pasteRegion(doc, clip, dest.rx, dest.ry)
    expect(doc.getCell(dest.rx, dest.ry).tileNum).toBe(9)
    expect(doc.getOverlay(dest.rx, dest.ry).id).not.toBe(EMPTY_OVERLAY)
    expect(doc.units.some((unit) => unit.rx === dest.rx && unit.ry === dest.ry && unit.name === 'MTNK')).toBe(true)
  })

  it('copies the whole iso field like FA2 Copy()', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const [origin] = twoCells()
    const cell = doc.getCell(origin.rx, origin.ry)
    cell.tileNum = 11
    doc.setCell(cell)
    const clip = copyWholeMap(doc)
    expect(clip.cells.length).toBeGreaterThan(1)
    expect(clip.cells.some((item) => item.tileNum === 11)).toBe(true)
  })
})
