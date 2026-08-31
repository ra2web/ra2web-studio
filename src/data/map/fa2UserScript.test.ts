import { describe, expect, it } from 'vitest'
import { MapDocument } from './MapDocument'
import {
  atoi,
  csvParamCount,
  getParam,
  isValSet,
  parseUserScript,
  runUserScript,
  setParam,
} from './fa2UserScript'

describe('FA2 user script parser', () => {
  it('parses comments, escaped quotes, labels and functions', () => {
    const parsed = parseUserScript(`
// ignore me
:start:
SetVariable("n","1")
Print("say ""hi""")
JumpTo("start","0")
`)
    expect(parsed.labels.get('start')).toBe(0)
    expect(parsed.functions[0]).toEqual({ name: 'SetVariable', params: ['n', '1'] })
    expect(parsed.functions[1]?.params[0]).toBe('say "hi"')
    expect(parsed.functions[2]?.name).toBe('JumpTo')
  })

  it('matches FA2 atoi / IsValSet / CSV helpers', () => {
    expect(atoi('12px')).toBe(12)
    expect(atoi('')).toBe(0)
    expect(isValSet('yes')).toBe(true)
    expect(isValSet('no')).toBe(false)
    expect(isValSet('0')).toBe(false)
    expect(isValSet('3')).toBe(true)
    expect(csvParamCount('a,b,c')).toBe(3)
    expect(getParam('house,e1,256,12,12', 1)).toBe('e1')
    expect(setParam('a,b,c', 1, 'x')).toBe('a,x,c')
  })
})

describe('FA2 user script runner', () => {
  it('runs SetVariable, arithmetic, JumpTo and Print', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const result = runUserScript(doc, `
SetVariable("%n%","0")
:loop:
Add("%n%","1")
Is("%n%","<","3","%again%")
JumpTo("loop","%again%")
Print("%n%")
`)
    expect(result.ok).toBe(true)
    expect(result.report).toContain('3')
  })

  it('writes extra INI after SetSafeMode(false) like FA2', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const blocked = runUserScript(doc, `SetIniKey("ScriptExtra","1","abc")`)
    expect(blocked.ok).toBe(true)
    expect(doc.toIniString()).not.toMatch(/\[ScriptExtra\]/)
    const result = runUserScript(doc, `
SetSafeMode("false","test")
SetIniKey("ScriptExtra","1","abc")
GetIniKey("%got%","ScriptExtra","1")
Print("%got%")
`)
    expect(result.ok).toBe(true)
    expect(result.report).toContain('abc')
    expect(doc.toIniString()).toMatch(/\[ScriptExtra\]/)
    expect(doc.toIniString()).toMatch(/1=abc/)
  })

  it('places terrain and waypoints with FA2 command names', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
    const result = runUserScript(doc, `
AllowAdd("trees")
AddTerrain("TREE01","12","12")
SetSafeMode("false","wp")
SetWaypoint("20","12","13")
GetWaypointPos("20","%wx%","%wy%")
Print("%wx%,%wy%")
`)
    expect(result.ok).toBe(true)
    expect(doc.terrains.some((item) => item.name === 'TREE01' && item.rx === 12 && item.ry === 12)).toBe(true)
    expect(doc.waypoints.some((item) => item.number === 20 && item.rx === 12 && item.ry === 13)).toBe(true)
    expect(result.report).toContain('12,13')
  })

  it('adds infantry from a 14-field CSV', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const result = runUserScript(doc, `
AddInfantry("Americans,E1,256,12,12,0,Guard,0,none,0,-1,0,0,0")
`)
    expect(result.ok).toBe(true)
    expect(doc.infantry[0]?.name).toBe('E1')
    expect(doc.infantry[0]?.rx).toBe(12)
    expect(doc.infantry[0]?.ry).toBe(12)
  })
})
