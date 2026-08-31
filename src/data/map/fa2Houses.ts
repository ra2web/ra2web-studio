import { houseNamesForMode } from './constants'
import type { MapDocument } from './MapDocument'
import type { MapHouse } from './types'

/** FA2 `CHouses::AddHouse`（RA2 段）默认值。 */
export function createAddedHouse(name: string, parentCountry = name): MapHouse {
  return {
    name,
    iq: 0,
    edge: 'West',
    country: name,
    color: 'Gold',
    allies: name,
    credits: 0,
    actsLike: 0,
    techLevel: 10,
    percentBuilt: 100,
    playerControl: false,
    parentCountry,
    smartAI: false,
    nodes: [],
  }
}

/** FA2 RA2 `OnPreparehouses` 多人分支默认值。 */
export function createPreparedHouse(name: string): MapHouse {
  return {
    name,
    iq: 0,
    edge: 'North',
    country: name,
    color: name === 'Neutral' || name === 'Special' ? 'LightGrey' : 'DarkOrange',
    allies: name,
    credits: 0,
    actsLike: 0,
    techLevel: 1,
    percentBuilt: 0,
    playerControl: false,
    parentCountry: name,
    smartAI: false,
    nodes: [],
  }
}

export function addMapHouse(doc: MapDocument, rawName: string): string | null {
  const name = rawName.trim()
  if (!name) return '阵营名不能为空'
  if (doc.houses.some((house) => house.name === name)) return `阵营 ${name} 已存在`
  doc.houses.push(createAddedHouse(name))
  if (!doc.countries.includes(name)) doc.countries.push(name)
  return null
}

export function deleteMapHouse(doc: MapDocument, name: string): void {
  doc.houses = doc.houses.filter((house) => house.name !== name)
  doc.countries = doc.countries.filter((country) => country !== name)
  if (doc.basic.player === name) doc.basic.player = ''
}

export function inferYuriRevenge(doc: MapDocument): boolean {
  return doc.houses.some((house) => house.name === 'YuriCountry')
    || doc.countries.includes('YuriCountry')
}

/**
 * FA2 `CHouses::OnPreparehouses`：
 * 多人图按 rules 国家补齐 Houses；单人图若已有 Houses 则拒绝。
 */
export function prepareHouses(doc: MapDocument): string | null {
  const names = houseNamesForMode(inferYuriRevenge(doc) || doc.houses.length === 0)
  if (!doc.basic.multiplayerOnly) {
    if (doc.houses.length > 0) return 'There are already houses in your map. You need to delete these first.'
    for (const name of names) {
      doc.houses.push(createPreparedHouse(name))
      if (!doc.countries.includes(name)) doc.countries.push(name)
    }
    return null
  }
  const existing = new Set(doc.houses.map((house) => house.name))
  for (const name of names) {
    if (existing.has(name)) continue
    doc.houses.push(createPreparedHouse(name))
    if (!doc.countries.includes(name)) doc.countries.push(name)
  }
  return null
}
