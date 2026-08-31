import { describe, expect, it } from 'vitest'
import { applyNewTheater, artFileName, artShpCandidates, readArtImage } from './imageFinder'

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

describe('artShpCandidates', () => {
  it('lists NewTheater shp then generic shp for a GDI construction yard', () => {
    const names = artShpCandidates('GACNST', {
      image: 'GACNST',
      theater: false,
      voxel: false,
      terrainPalette: false,
    }, temperate)
    expect(names[0]).toBe('gtcnst.shp')
    expect(names).toContain('gacnst.shp')
  })
})
