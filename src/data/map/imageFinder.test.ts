import { describe, expect, it } from 'vitest'
import { applyNewTheater, artFileName, artShpCandidates, artVxlCandidates, readArtImage, resolveRulesImage } from './imageFinder'
import { MapIni } from './MapIni'

const temperate = { extension: '.tem', newTheaterChar: 'T' }

describe('artFileName', () => {
  it('uses .shp unless Theater=yes, matching werhd ImageFinder', () => {
    expect(artFileName('E1', false, temperate)).toBe('e1.shp')
    expect(artFileName('TREE01', true, temperate)).toBe('tree01.tem')
  })

  it('rewrites NewTheater second letter (GA -> GT on temperate)', () => {
    expect(artFileName('GACNST', false, temperate)).toBe('gtcnst.shp')
    expect(applyNewTheater('gacnst.shp', temperate)).toBe('gtcnst.shp')
  })

  it('falls back to G then original when preferred NewTheater file is missing', () => {
    expect(applyNewTheater('gacnst.shp', temperate, (name) => name === 'ggcnst.shp')).toBe('ggcnst.shp')
    expect(applyNewTheater('gacnst.shp', temperate, () => false)).toBe('gacnst.shp')
  })
})

describe('readArtImage', () => {
  it('reads Image/Theater/Voxel from an art.ini section', () => {
    const info = readArtImage({
      entries: [
        { key: 'Image', value: 'GACNST' },
        { key: 'Theater', value: 'no' },
        { key: 'Voxel', value: 'no' },
      ],
    }, 'GACNST')
    expect(info.image).toBe('GACNST')
    expect(info.theater).toBe(false)
    expect(info.voxel).toBe(false)
  })
})

describe('resolveRulesImage', () => {
  it('follows rules.ini Image= like FA2 LoadUnitGraphic', () => {
    const rules = MapIni.parse('[E1]\nImage=CONSCR\n[MTNK]\nName=Grizzly\n')
    expect(resolveRulesImage(rules, 'E1')).toBe('CONSCR')
    expect(resolveRulesImage(rules, 'MTNK')).toBe('MTNK')
    expect(resolveRulesImage(null, 'E1')).toBe('E1')
  })
})

describe('artShpCandidates', () => {
  it('uses gtradr.shp for GARADR NewTheater on temperate', () => {
    const names = artShpCandidates('GARADR', {
      image: 'GARADR',
      theater: false,
      voxel: false,
      terrainPalette: false,
    }, temperate)
    expect(names[0]).toBe('gtradr.shp')
    expect(names).not.toContain('gtpadr.shp')
  })

  it('lists NewTheater shp then generic shp for a GDI construction yard', () => {
    const names = artShpCandidates('GACNST', {
      image: 'GACNST',
      theater: false,
      voxel: false,
      terrainPalette: false,
    }, temperate)
    expect(names[0]).toBe('gtcnst.shp')
    expect(names).toContain('gacnst.shp')
    expect(names).toContain('gacnst.tem')
  })

  it('uses art Image=CONSCR instead of e1.shp for GI infantry', () => {
    const names = artShpCandidates('E1', {
      image: 'CONSCR',
      theater: false,
      voxel: false,
      terrainPalette: false,
    }, temperate)
    expect(names).toContain('conscr.shp')
    expect(names).toContain('e1.shp')
    expect(names.indexOf('conscr.shp')).toBeLessThan(names.indexOf('e1.shp'))
  })

  it('tries theater suffixes first when Theater=yes', () => {
    const names = artShpCandidates('Riparius', {
      image: 'GOLD01',
      theater: true,
      voxel: false,
      terrainPalette: false,
    }, temperate)
    expect(names[0]).toBe('gold01.tem')
    expect(names).toContain('gold01.shp')
  })
})

describe('artVxlCandidates', () => {
  it('looks up lowercase .vxl like FA2 voxel units', () => {
    expect(artVxlCandidates('MTNK')).toEqual(['mtnk.vxl'])
  })
})
