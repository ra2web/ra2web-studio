import { describe, expect, it } from 'vitest'
import { parseTheaterIni } from '../../data/map/theaterIndex'
import {
  buildObjectToolTree,
  brushSizeFromId,
  FA2_BRUSH_SIZES,
  resolveTreeTileNum,
  toolUsesBrush,
} from './fa2Layout'

describe('fa2Layout', () => {
  it('lists FA2 brush sizes including non-square picks', () => {
    expect(FA2_BRUSH_SIZES.map((item) => item.id)).toEqual([
      '1x1', '2x2', '3x3', '4x4', '5x5', '10x10', '1x2', '2x1', '1x3', '3x1',
    ])
    expect(brushSizeFromId('10x10').brush).toBe(10)
    expect(toolUsesBrush('raise')).toBe(true)
    expect(toolUsesBrush('select')).toBe(false)
    expect(toolUsesBrush('infantry')).toBe(false)
  })

  it('builds an FA2-style object tree with nothing, ground and overlay leaves', () => {
    const theater = parseTheaterIni(`
[General]
ClearTile=0
SandTile=1
WaterSet=2
[TileSet0000]
FileName=clear01
SetName=Clear
TilesInSet=1
[TileSet0001]
FileName=sand01
SetName=Sand
TilesInSet=1
[TileSet0002]
FileName=water01
SetName=Water
TilesInSet=1
`)
    const tree = buildObjectToolTree({
      theater,
      infantry: ['E1'],
      units: ['MTNK'],
      aircraft: ['ORCA'],
      structures: ['GACNST'],
      terrain: ['TREE1'],
      smudges: ['CR1'],
      overlays: ['ORE'],
    })
    expect(tree[0]).toMatchObject({ id: 'nothing', action: { tool: 'select' } })
    const overlay = tree.find((node) => node.id === 'overlay')
    const labels = overlay?.children?.map((child) => child.id)
    expect(labels).toEqual(expect.arrayContaining(['ore', 'gems', 'veinhole', 'bridges', 'wall']))
    expect(resolveTreeTileNum(theater, 'ClearTile')).toBe(0)
    expect(resolveTreeTileNum(theater, 'SandTile')).toBe(1)
  })
})
