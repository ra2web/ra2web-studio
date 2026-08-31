import { describe, expect, it } from 'vitest'
import { EMPTY_OVERLAY, THEATERS, validateMapSize } from './constants'
import { forEachIsoCell, projectCell, unprojectCell } from './isoCoords'
import { MapDocument } from './MapDocument'
import { defaultTeamType } from './types'
import { MapCommandStack, paintHeight, paintTile } from './MapCommandStack'
import { applyOreBrush } from './mapTools'

describe('validateMapSize', () => {
  it('accepts FA2 legal sizes', () => {
    expect(validateMapSize(50, 50)).toBeNull()
    expect(validateMapSize(16, 16)).toBeNull()
    expect(validateMapSize(400, 112)).toBeNull()
  })

  it('rejects illegal sizes', () => {
    expect(validateMapSize(10, 50)).not.toBeNull()
    expect(validateMapSize(300, 300)).not.toBeNull()
  })
})

describe('iso projection', () => {
  it('round-trips a cell at height 0', () => {
    const isoSize = 100
    const projected = projectCell(20, 30, 0, isoSize)
    const back = unprojectCell(projected.px, projected.py, 0, isoSize)
    expect(back.rx).toBeCloseTo(20, 5)
    expect(back.ry).toBeCloseTo(30, 5)
  })
})

describe('MapDocument', () => {
  it('creates a multiplayer map with waypoints 0-7', () => {
    const doc = MapDocument.create({
      width: 32,
      height: 32,
      theater: 'TEMPERATE',
      multiplayer: true,
      name: 'Test Map',
    })
    expect(doc.width).toBe(32)
    expect(doc.height).toBe(32)
    expect(doc.basic.multiplayerOnly).toBe(true)
    expect(doc.waypoints.map((item) => item.number).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(doc.houses.some((house) => house.name === 'YuriCountry')).toBe(true)
    expect(THEATERS).toContain(doc.theater)
  })

  it('omits YuriCountry in RA2 mode and writes [Countries]', () => {
    const doc = MapDocument.create({
      width: 16,
      height: 16,
      theater: 'TEMPERATE',
      yuriRevenge: false,
    })
    expect(doc.houses.some((house) => house.name === 'YuriCountry')).toBe(false)
    expect(doc.countries).toContain('Americans')
    const text = doc.toIniString()
    expect(text).toContain('[Countries]')
    expect(text).toContain('[Houses]')
    expect(text).not.toContain('YuriCountry')
  })

  it('reads [Countries] when [Houses] is missing', () => {
    const text = `[Map]
Size=0,0,16,16
Theater=TEMPERATE
[Countries]
0=Neutral
1=Special
2=Americans
[Americans]
IQ=0
Edge=North
Country=Americans
Color=DarkOrange
Allies=Americans
Credits=10000
ActsLike=0
NodeCount=0
TechLevel=10
PercentBuilt=100
PlayerControl=yes
ParentCountry=Americans
SmartAI=no
`
    const doc = MapDocument.parse(text)
    expect(doc.houses.map((house) => house.name)).toEqual(['Neutral', 'Special', 'Americans'])
    expect(doc.countries).toEqual(['Neutral', 'Special', 'Americans'])
    expect(doc.houses.find((house) => house.name === 'Americans')?.credits).toBe(10000)
  })

  it('round-trips tiles, overlay, objects, logic and houses', () => {
    const doc = MapDocument.create({ width: 24, height: 24, theater: 'SNOW', groundHeight: 2 })
    let paintRx = 0
    let paintRy = 0
    forEachIsoCell(24, 24, (cell) => {
      if (cell.dx === 20 && cell.dy === 20) {
        paintRx = cell.rx
        paintRy = cell.ry
      }
    })
    expect(paintRx).toBeGreaterThan(0)
    const cell = doc.getCell(paintRx, paintRy)
    cell.tileNum = 7
    cell.height = 4
    doc.setCell(cell)
    applyOreBrush(doc, paintRx, paintRy, 8)
    doc.units.push({
      id: '0',
      owner: 'Americans',
      name: 'MTNK',
      health: 256,
      rx: paintRx,
      ry: paintRy,
      direction: 64,
      mission: 'Guard',
      tag: 'none',
      veterancy: 0,
      group: -1,
      onBridge: false,
      recruitable: false,
      aiRecruitable: false,
      extra: [],
    })
    doc.waypoints.push({ number: 20, rx: 15, ry: 16 })
    doc.tags.push({ id: '01000001', repeatType: 2, name: 'TestTag', triggerId: '01000002' })
    doc.triggers.push({
      id: '01000002',
      houseName: 'Americans',
      attachedTriggerId: '<none>',
      name: 'Test Trigger',
      disabled: false,
      easy: true,
      medium: true,
      hard: true,
      events: [{ type: 13, paramKind: 0, params: ['50'] }],
      actions: [{ type: 11, params: ['1', '0', '0', '0', '0', '0', '0'] }],
    })
    doc.scripts.push({ id: 'scr00001', name: 'Hunt', actions: [{ type: 0, argument: '0' }] })
    doc.taskForces.push({ id: 'tsk00001', name: 'Tanks', group: -1, entries: [{ count: 3, objectName: 'MTNK' }] })
    doc.teams.push({
      ...defaultTeamType('tem00001', 'Americans'),
      name: 'Attack',
      script: 'scr00001',
      taskForce: 'tsk00001',
      waypoint: 20,
      max: 1,
      priority: 8,
      aggressive: true,
      autocreate: true,
      full: false,
      whiner: true,
      isBaseDefense: true,
      mindControlDecision: 2,
    })
    doc.tubes.push({
      id: '0',
      startX: 10,
      startY: 10,
      startDir: 0,
      endX: 12,
      endY: 12,
      parts: [0, 0],
    })

    const text = doc.toIniString()
    expect(text).toContain('[IsoMapPack5]')
    expect(text).toContain('[OverlayPack]')
    expect(text).toContain('[Houses]')
    expect(text).toContain('[Countries]')
    expect(text).toContain('[Triggers]')
    expect(text).toContain('[Tubes]')

    const back = MapDocument.parse(text)
    expect(back.width).toBe(24)
    expect(back.height).toBe(24)
    expect(back.theater).toBe('SNOW')
    expect(back.getCell(paintRx, paintRy).tileNum).toBe(7)
    expect(back.getCell(paintRx, paintRy).height).toBe(4)
    expect(back.getOverlay(paintRx, paintRy).id).not.toBe(EMPTY_OVERLAY)
    expect(back.units[0].name).toBe('MTNK')
    expect(back.triggers[0].name).toBe('Test Trigger')
    expect(back.triggers[0].events[0].type).toBe(13)
    expect(back.scripts[0].name).toBe('Hunt')
    expect(back.taskForces[0].entries[0].objectName).toBe('MTNK')
    expect(back.teams[0].script).toBe('scr00001')
    expect(back.teams[0].whiner).toBe(true)
    expect(back.teams[0].isBaseDefense).toBe(true)
    expect(back.teams[0].mindControlDecision).toBe(2)
    expect(back.toIniString()).toMatch(/Whiner=yes/)
    expect(back.tubes[0].endX).toBe(12)
    expect(back.houses.some((house) => house.name === 'Russians')).toBe(true)
  })

  it('round-trips AITriggerTypesEnable yes flags', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.aiTriggers.push({
      id: '010000AA',
      name: 'Attack',
      team1: '<none>',
      ownerHouse: '<all>',
      techLevel: 1,
      conditionType: 0,
      conditionObject: '<none>',
      comparator: '0'.repeat(64),
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
    })
    doc.aiTriggerEnable['010000AA'] = true
    const back = MapDocument.parse(doc.toIniString())
    expect(back.aiTriggerEnable['010000AA']).toBe(true)
    expect(back.aiTriggers[0]?.weight).toBe(50)
    expect(back.aiTriggers[0]?.skirmish).toBe(true)
    expect(back.aiTriggers[0]?.team2).toBe('<none>')
    const csv = back.toIniString().split('\n').find((line) => line.startsWith('010000AA='))
    expect(csv?.split(',').length).toBe(18)
    expect(back.toIniString()).toMatch(/\[AITriggerTypesEnable\]/)
  })

  it('round-trips RequiredAddOn and omits the key when it is 0', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.basic.requiredAddOn = '1'
    doc.basic.fillSilos = 'yes'
    expect(doc.toIniString()).toMatch(/RequiredAddOn=1/)
    expect(doc.toIniString()).toMatch(/FillSilos=yes/)
    const back = MapDocument.parse(doc.toIniString())
    expect(back.basic.requiredAddOn).toBe('1')
    expect(back.basic.fillSilos).toBe('yes')
    back.basic.requiredAddOn = '0'
    expect(back.toIniString()).not.toMatch(/RequiredAddOn/)
  })
})

describe('MapCommandStack', () => {
  it('undoes terrain paint', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'URBAN' })
    const stack = new MapCommandStack()
    const before = doc.getCell(8, 8).height
    const stroke = stack.beginTerrain(doc, 'raise')
    paintHeight(doc, 8, 8, 1, 2)
    paintTile(doc, 8, 8, 3, 1)
    stroke.commit()
    expect(doc.getCell(8, 8).height).toBe(before + 1)
    expect(stack.undo(doc)).toBe(true)
    expect(doc.getCell(8, 8).height).toBe(before)
    expect(stack.redo(doc)).toBe(true)
    expect(doc.getCell(8, 8).tileNum).toBe(3)
  })

  it('FA2 HeightenTile uses a rectangular brush', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'URBAN' })
    const origin = doc.getCell(12, 12).height
    paintHeight(doc, 12, 12, 1, 3, 'rect')
    expect(doc.getCell(12, 12).height).toBe(origin + 1)
    expect(doc.getCell(13, 13).height).toBe(origin + 1)
    expect(doc.getCell(14, 12).height).toBe(origin)
  })

  it('FA2 Raise Tile SetHeightAt ignores morphable and uses a rect brush', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const cell = doc.getCell(12, 12)
    cell.tileNum = 99
    doc.setCell(cell)
    const origin = cell.height
    paintHeight(doc, 12, 12, 1, 1, 'rect')
    expect(doc.getCell(12, 12).height).toBe(origin + 1)
    expect(doc.getCell(12, 12).tileNum).toBe(99)
  })
})
