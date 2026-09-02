import { describe, expect, it } from 'vitest'
import { MapIni } from './MapIni'
import {
  fa2OverlayGraphicPalette,
  fa2UnitGraphicPalette,
  isTheaterShpFile,
  overlayUsesTemperatPalette,
} from './fa2ShpPalette'

const plain = { image: 'CR1', theater: true, voxel: false, terrainPalette: false }

describe('fa2UnitGraphicPalette', () => {
  it('uses iso pal for theater-suffix files even without TerrainPalette', () => {
    expect(fa2UnitGraphicPalette('cr1.tem', plain)).toBe('iso')
    expect(fa2UnitGraphicPalette('tree01.tem', { ...plain, image: 'TREE01' })).toBe('iso')
    expect(isTheaterShpFile('bridge1.tem')).toBe(true)
  })

  it('uses unit pal for regular SHP and tibtre/veinhole exceptions', () => {
    expect(fa2UnitGraphicPalette('e1.shp', { image: 'E1', theater: false, voxel: false, terrainPalette: false })).toBe('unit')
    expect(fa2UnitGraphicPalette('tibtre01.tem', { image: 'TIBTRE01', theater: true, voxel: false, terrainPalette: true })).toBe('unit')
    expect(fa2UnitGraphicPalette('veinhole.tem', plain)).toBe('unit')
  })

  it('honors TerrainPalette / ShouldUseCellDrawer as iso', () => {
    expect(fa2UnitGraphicPalette('tree01.shp', { ...plain, terrainPalette: true })).toBe('iso')
  })
})

describe('fa2OverlayGraphicPalette', () => {
  it('uses overlay pal for Tiberium / veins / veinhole monster', () => {
    const rules = MapIni.parse('[Riparius]\nTiberium=yes\n[VEINS]\nIsVeins=yes\n')
    expect(overlayUsesTemperatPalette(rules, 'Riparius')).toBe(true)
    expect(fa2OverlayGraphicPalette('gold01.tem', { ...plain, image: 'GOLD01' }, 'Riparius', rules)).toBe('overlay')
    expect(fa2OverlayGraphicPalette('veins.tem', plain, 'VEINS', rules)).toBe('overlay')
  })

  it('uses iso pal for theater-suffix overlays such as bridges', () => {
    const rules = MapIni.parse('[BRIDGE1]\nName=Bridge\n')
    expect(fa2OverlayGraphicPalette('bridge1.tem', { image: 'BRIDGE1', theater: true, voxel: false, terrainPalette: false }, 'BRIDGE1', rules)).toBe('iso')
  })

  it('uses unit pal when the overlay file is a .shp', () => {
    expect(fa2OverlayGraphicPalette('wall.shp', { image: 'WALL', theater: false, voxel: false, terrainPalette: false }, 'WALL')).toBe('unit')
  })
})
