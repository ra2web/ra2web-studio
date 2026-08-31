import { describe, expect, it } from 'vitest'
import { FA2_SCRIPT_MISSIONS, scriptMissionName } from './fa2ScriptMissions'

describe('FA2 script missions', () => {
  it('matches FA2 TMISSION_COUNT and Attack / Success labels', () => {
    expect(FA2_SCRIPT_MISSIONS).toHaveLength(59)
    expect(scriptMissionName(0)).toBe('Attack...')
    expect(scriptMissionName(49)).toBe('Success')
    expect(scriptMissionName(58)).toBe('Move to own building')
  })
})
