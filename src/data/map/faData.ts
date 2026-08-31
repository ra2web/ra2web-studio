import faDataText from './fa2/FAData.ini?raw'
import { MapIni } from './MapIni'

export type FaParamType = {
  id: number
  name: string
  listType: number
  code: number
}

export type FaEventDef = {
  id: number
  name: string
  p1: number
  p2: number
  tagNeeded: boolean
  obsolete: boolean
  description: string
  yrOnly: boolean
}

export type FaActionDef = {
  id: number
  name: string
  params: number[]
  usesWaypoint: boolean
  usesTag: boolean
  obsolete: boolean
  description: string
  yrOnly: boolean
}

export type FaDataCatalog = {
  paramTypes: Map<number, FaParamType>
  events: FaEventDef[]
  actions: FaActionDef[]
}

function csv(value: string): string[] {
  return value.split(',')
}

export function parseFaData(text: string): FaDataCatalog {
  const ini = MapIni.parse(text)
  const paramTypes = new Map<number, FaParamType>()
  for (const entry of ini.getSection('ParamTypes')?.entries ?? []) {
    const id = Number(entry.key)
    if (Number.isNaN(id)) continue
    const fields = csv(entry.value)
    paramTypes.set(id, {
      id,
      name: fields[0] || `Param ${id}`,
      listType: Number(fields[1]) || 0,
      code: Number(fields[2]) || 0,
    })
  }

  const events: FaEventDef[] = []
  for (const entry of ini.getSection('EventsRA2')?.entries ?? []) {
    const fields = csv(entry.value)
    const usedRa2 = fields[7] === '1'
    if (!usedRa2) continue
    events.push({
      id: Number(entry.key),
      name: (fields[0] || entry.key).replace(/%1/g, ','),
      p1: Number(fields[1]) || 0,
      p2: Number(fields[2]) || 0,
      tagNeeded: fields[3] === '1',
      obsolete: fields[4] === '1',
      description: (fields[5] || '').replace(/%1/g, ','),
      yrOnly: fields[9] === '1',
    })
  }

  const actions: FaActionDef[] = []
  for (const entry of ini.getSection('ActionsRA2')?.entries ?? []) {
    const fields = csv(entry.value)
    const usedRa2 = fields[12] === '1'
    if (!usedRa2) continue
    actions.push({
      id: Number(entry.key),
      name: (fields[0] || entry.key).replace(/%1/g, ','),
      params: [1, 2, 3, 4, 5, 6].map((index) => Number(fields[index]) || 0),
      usesWaypoint: fields[7] === '1',
      usesTag: fields[8] === '1',
      obsolete: fields[9] === '1',
      description: (fields[10] || '').replace(/%1/g, ','),
      yrOnly: fields[13] === '1',
    })
  }

  return { paramTypes, events, actions }
}

let cached: FaDataCatalog | null = null

export function getFaData(): FaDataCatalog {
  cached ??= parseFaData(faDataText)
  return cached
}

export function paramTypeName(catalog: FaDataCatalog, typeId: number): string {
  if (typeId < 0) return catalog.paramTypes.get(Math.abs(typeId))?.name ?? 'Fixed'
  return catalog.paramTypes.get(typeId)?.name ?? 'Number'
}

export function isListParam(catalog: FaDataCatalog, typeId: number): boolean {
  const def = catalog.paramTypes.get(Math.abs(typeId))
  return (def?.listType ?? 0) > 0
}
