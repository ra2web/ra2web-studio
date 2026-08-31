import type { MapAiTrigger } from './types'

/** FA2 `AITriggerTypes.cpp` `AIT_*`，写入 CSV 第 5 段（0-based param 4）。 */
export const FA2_AI_TRIGGER_KINDS = [
  { value: -1, label: '-1 None' },
  { value: 0, label: '0 Enemy owns (CONDITION) N of type X' },
  { value: 1, label: '1 House owns (CONDITION) N of type X' },
  { value: 2, label: '2 Enemy: Yellow power' },
  { value: 3, label: '3 Enemy: Red power' },
  { value: 4, label: '4 Enemy owns (CONDITION) N money' },
  { value: 5, label: '5 Iron curtain near ready' },
  { value: 6, label: '6 Chronosphere near ready' },
  { value: 7, label: '7 Neutral owns (CONDITION) N of type X' },
] as const

/** FA2 `ConditionEnum` / IDC_CONDITION。 */
export const FA2_AI_COMPARISONS = [
  { value: 0, label: 'less than' },
  { value: 1, label: 'less than or equal to' },
  { value: 2, label: 'equal to' },
  { value: 3, label: 'greater than or equal to' },
  { value: 4, label: 'greater than' },
  { value: 5, label: 'not equal to' },
] as const

/** FA2 IDC_MULTISIDE TruncSpace 后的第一段。 */
export const FA2_AI_SIDES = [
  { value: '0', label: '0 None' },
  { value: '1', label: '1 Allied' },
  { value: '2', label: '2 Soviet' },
  { value: '3', label: '3 Third' },
] as const

export const EMPTY_AI_COMPARATOR = '0'.repeat(64)

function csv(value: string): string[] {
  return value.split(',')
}

function ynFlag(value: string | undefined, fallback = true): boolean {
  if (value === undefined || value === '') return fallback
  return value !== '0'
}

/** FA2 `ConvertToHexFromAITrigInfo`：32 字节 LE Number+Condition。 */
export function encodeAiComparator(number: number, condition: number): string {
  const buf = new Uint8Array(32)
  const view = new DataView(buf.buffer)
  view.setInt32(0, number | 0, true)
  view.setInt32(4, condition | 0, true)
  return Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function decodeAiComparator(hex: string): { number: number; condition: number } {
  const clean = hex.replace(/\s/g, '').padEnd(64, '0').slice(0, 64)
  const buf = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    buf[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0
  }
  const view = new DataView(buf.buffer)
  return { number: view.getInt32(0, true), condition: view.getInt32(4, true) }
}

/** FA2 `CAITriggerTypes::OnAdd` 默认 CSV。 */
export function defaultAiTrigger(id: string, team1 = '<none>'): MapAiTrigger {
  const comparator = EMPTY_AI_COMPARATOR
  return {
    id,
    name: 'New AI Trigger',
    team1,
    ownerHouse: '<all>',
    techLevel: 1,
    conditionType: 0,
    conditionObject: '<none>',
    comparator,
    conditionNumber: 0,
    conditionCmp: 0,
    weight: 50,
    minWeight: 30,
    maxWeight: 50,
    skirmish: true,
    flag4: '0',
    multiSide: '1',
    baseDefense: true,
    team2: '<none>',
    enabledEasy: true,
    enabledMedium: true,
    enabledHard: true,
  }
}

export function parseAiTriggerLine(id: string, line: string): MapAiTrigger {
  const fields = csv(line)
  const comparator = (fields[6] || EMPTY_AI_COMPARATOR).replace(/\s/g, '').padEnd(64, '0').slice(0, 64)
  const decoded = decodeAiComparator(comparator)
  const conditionType = fields[4] === undefined || fields[4] === '' ? 0 : Number(fields[4])
  return {
    id,
    name: fields[0] || id,
    team1: fields[1] || '<none>',
    ownerHouse: fields[2] || '<all>',
    techLevel: Number(fields[3]) || 0,
    conditionType: Number.isFinite(conditionType) ? conditionType : 0,
    conditionObject: fields[5] || '<none>',
    comparator,
    conditionNumber: decoded.number,
    conditionCmp: decoded.condition,
    weight: Number(fields[7]) || 0,
    minWeight: Number(fields[8]) || 0,
    maxWeight: Number(fields[9]) || 0,
    skirmish: ynFlag(fields[10], true),
    flag4: fields[11] || '0',
    multiSide: fields[12] || '1',
    baseDefense: fields[13] === '1',
    team2: fields[14] || '<none>',
    enabledEasy: ynFlag(fields[15], true),
    enabledMedium: ynFlag(fields[16], true),
    enabledHard: ynFlag(fields[17], true),
  }
}

export function serializeAiTrigger(item: MapAiTrigger): string {
  const comparator = encodeAiComparator(item.conditionNumber, item.conditionCmp)
  return [
    item.name,
    item.team1,
    item.ownerHouse,
    String(item.techLevel),
    String(item.conditionType),
    item.conditionObject,
    comparator,
    item.weight.toFixed(6),
    item.minWeight.toFixed(6),
    item.maxWeight.toFixed(6),
    item.skirmish ? '1' : '0',
    item.flag4 || '0',
    item.multiSide || '1',
    item.baseDefense ? '1' : '0',
    item.team2,
    item.enabledEasy ? '1' : '0',
    item.enabledMedium ? '1' : '0',
    item.enabledHard ? '1' : '0',
  ].join(',')
}

export function syncAiComparator(item: MapAiTrigger): void {
  item.comparator = encodeAiComparator(item.conditionNumber, item.conditionCmp)
}
