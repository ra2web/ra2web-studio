import { describe, expect, it } from 'vitest'
import { MapDocument } from './MapDocument'
import { addMapHouse, deleteMapHouse, prepareHouses } from './fa2Houses'

describe('FA2 house CRUD', () => {
  it('adds and deletes a house in both [Houses] and [Countries]', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', yuriRevenge: false })
    expect(addMapHouse(doc, 'CustomAI')).toBeNull()
    expect(doc.houses.some((house) => house.name === 'CustomAI')).toBe(true)
    expect(doc.countries).toContain('CustomAI')
    const text = doc.toIniString()
    expect(text).toMatch(/CustomAI/)
    deleteMapHouse(doc, 'CustomAI')
    expect(doc.houses.some((house) => house.name === 'CustomAI')).toBe(false)
    expect(doc.countries).not.toContain('CustomAI')
  })

  it('refuses PrepareHouses on a single-player map that already has houses', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: false })
    expect(doc.basic.multiplayerOnly).toBe(false)
    expect(prepareHouses(doc)).toMatch(/already houses/)
  })

  it('fills missing multiplayer houses like FA2 Prepare houses', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true, yuriRevenge: true })
    doc.houses = doc.houses.filter((house) => house.name !== 'Russians')
    expect(prepareHouses(doc)).toBeNull()
    expect(doc.houses.some((house) => house.name === 'Russians')).toBe(true)
    const russians = doc.houses.find((house) => house.name === 'Russians')
    expect(russians?.credits).toBe(0)
    expect(russians?.techLevel).toBe(1)
    expect(russians?.playerControl).toBe(false)
  })
})
