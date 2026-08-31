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

  it('resizes with FA2 left/top like Resize(X,Y,NW,NH)', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const cell = doc.getCell(12, 12)
    cell.tileNum = 7
    doc.setCell(cell)
    const result = runUserScript(doc, `Resize("1","2","20","18")`)
    expect(result.ok).toBe(true)
    expect(doc.width).toBe(20)
    expect(doc.height).toBe(18)
    expect(doc.getCell(12 + (20 - 16) + 2 - 1, 12 + 2 + 1).tileNum).toBe(7)
  })

  it('adds FA2 AddTrigger / Tag / AITrigger after AllowAdd', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const result = runUserScript(doc, `
AllowAdd("TRUE")
AddTrigger("%TriggerID%", "Americans,<none>,Reveal Map Debug Trigger,0,1,1,1,0", "1,13,0,10", "1,16,0,0,0,0,0,0,A", "TRUE")
AddAITrigger("%AI%", "Apoc Attack,<none>,Russians,10,0,<none>,0,0,0,0,0,0,0,0,0,0,1,0,<none>,1,1,1")
AddTag("%Tag2%", "0,Manual Tag,01000000")
Print("%TriggerID%")
`)
    expect(result.ok).toBe(true)
    expect(doc.triggers[0]?.id).toBe('01000000')
    expect(doc.triggers[0]?.name).toBe('Reveal Map Debug Trigger')
    expect(doc.triggers[0]?.events[0]).toEqual({ type: 13, paramKind: 0, params: ['10'] })
    expect(doc.triggers[0]?.actions[0]?.type).toBe(16)
    expect(doc.tags[0]?.triggerId).toBe('01000000')
    expect(doc.tags[0]?.name).toBe('Reveal Map Debug Trigger')
    expect(doc.aiTriggers[0]?.name).toBe('Apoc Attack')
    expect(doc.tags.some((item) => item.name === 'Manual Tag')).toBe(true)
    expect(result.report).toContain('01000000')
    expect(doc.toIniString()).toMatch(/\[Triggers\]/)
    expect(doc.toIniString()).toMatch(/Reveal Map Debug Trigger/)
  })

  it('skips AddTrigger without AllowAdd like FA2', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const result = runUserScript(doc, `
AddTrigger("%TriggerID%", "Americans,<none>,Nope,0,1,1,1,0", "0", "0", "TRUE")
`)
    expect(result.ok).toBe(true)
    expect(doc.triggers).toHaveLength(0)
  })

  it('stops the script when AskContinue is declined', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const result = runUserScript(doc, `
AskContinue("go?")
Print("after")
`, {
      ui: {
        confirm: () => false,
        alert: () => {},
        prompt: () => null,
        pick: () => null,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.report).not.toContain('after')
  })

  it('collects Message, Ask, UInput and pick results from the host', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.triggers.push({
      id: '01000005', houseName: 'Americans', attachedTriggerId: '<none>', name: 'Demo',
      disabled: false, easy: true, medium: true, hard: true, events: [], actions: [],
    })
    const alerts: string[] = []
    const result = runUserScript(doc, `
Ask("%yes%", "ready?", "Ask")
UInputGetInteger("%n%", "num", "1", "9")
UInputGetString("%s%", "name")
UInputGetHouse("%h%", "house")
UInputGetTrigger("%t%", "trigger")
Message("done %n% %s% %h% %t% %yes%", "ok")
Print("%n%,%s%,%h%,%t%,%yes%")
`, {
      ui: {
        confirm: () => true,
        alert: (message) => { alerts.push(message) },
        prompt: (message) => (message === 'num' ? '4' : 'Alpha'),
        pick: (_caption, options) => options.find((item) => item.value === 'Americans')?.value
          ?? options[0]?.value
          ?? '',
      },
    })
    expect(result.ok).toBe(true)
    expect(result.report).toContain('4,Alpha,Americans,01000005,1')
    expect(alerts[0]).toContain('done 4 Alpha Americans 01000005 1')
  })
})
