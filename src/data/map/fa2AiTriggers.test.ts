import { describe, expect, it } from 'vitest'
import {
  decodeAiComparator,
  defaultAiTrigger,
  encodeAiComparator,
  parseAiTriggerLine,
  serializeAiTrigger,
} from './fa2AiTriggers'

describe('FA2 AITriggerTypes CSV', () => {
  it('encodes Number/Condition as 32-byte little-endian hex', () => {
    expect(encodeAiComparator(0, 0)).toBe('0'.repeat(64))
    const hex = encodeAiComparator(5, 2)
    expect(hex).toHaveLength(64)
    expect(hex.startsWith('0500000002000000')).toBe(true)
    expect(decodeAiComparator(hex)).toEqual({ number: 5, condition: 2 })
  })

  it('round-trips FA2 OnAdd default line', () => {
    const created = defaultAiTrigger('010000AA', 'team1')
    const line = serializeAiTrigger(created)
    const fields = line.split(',')
    expect(fields).toHaveLength(18)
    expect(fields[0]).toBe('New AI Trigger')
    expect(fields[1]).toBe('team1')
    expect(fields[2]).toBe('<all>')
    expect(fields[3]).toBe('1')
    expect(fields[4]).toBe('0')
    expect(fields[5]).toBe('<none>')
    expect(fields[6]).toBe('0'.repeat(64))
    expect(fields[7]).toBe('50.000000')
    expect(fields[8]).toBe('30.000000')
    expect(fields[9]).toBe('50.000000')
    expect(fields[10]).toBe('1')
    expect(fields[13]).toBe('1')
    expect(fields[14]).toBe('<none>')
    expect(fields[15]).toBe('1')
    const back = parseAiTriggerLine('010000AA', line)
    expect(back.weight).toBe(50)
    expect(back.minWeight).toBe(30)
    expect(back.maxWeight).toBe(50)
    expect(back.skirmish).toBe(true)
    expect(back.baseDefense).toBe(true)
    expect(back.multiSide).toBe('1')
    expect(back.team2).toBe('<none>')
    expect(back.enabledHard).toBe(true)
  })

  it('parses FA2 GetParam indices, not the old 22-field layout', () => {
    const comparator = encodeAiComparator(3, 4)
    const line = [
      'Attack', 't1', 'Americans', '5', '-1', 'GACNST', comparator,
      '10.000000', '20.000000', '30.000000', '0', '0', '2', '0', 't2', '1', '0', '1',
    ].join(',')
    const parsed = parseAiTriggerLine('id', line)
    expect(parsed.conditionType).toBe(-1)
    expect(parsed.conditionObject).toBe('GACNST')
    expect(parsed.conditionNumber).toBe(3)
    expect(parsed.conditionCmp).toBe(4)
    expect(parsed.skirmish).toBe(false)
    expect(parsed.multiSide).toBe('2')
    expect(parsed.baseDefense).toBe(false)
    expect(parsed.team2).toBe('t2')
    expect(parsed.enabledEasy).toBe(true)
    expect(parsed.enabledMedium).toBe(false)
    expect(parsed.enabledHard).toBe(true)
  })
})
