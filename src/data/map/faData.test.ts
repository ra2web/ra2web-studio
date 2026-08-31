import { describe, expect, it } from 'vitest'
import { getFaData, parseFaData } from './faData'

describe('parseFaData', () => {
  it('loads RA2 events, actions and house param type from bundled FAData.ini', () => {
    const catalog = getFaData()
    expect(catalog.events.some((item) => item.id === 13 && /Elapsed Time/i.test(item.name))).toBe(true)
    expect(catalog.actions.some((item) => item.id === 11 && /Text Trigger/i.test(item.name))).toBe(true)
    expect(catalog.paramTypes.get(2)?.name).toBe('House')
    expect(catalog.paramTypes.get(30)?.name).toBe('Waypoint')
  })

  it('skips events not marked used-in-RA2', () => {
    const catalog = parseFaData(`
[ParamTypes]
2=House,1
[EventsRA2]
0=Keep,0,0,0,0,desc,0,1,0
1=Skip,0,0,0,0,desc,1,0,1
[ActionsRA2]
0=KeepAct,0,0,0,0,0,0,0,0,0,desc,0,1,0
1=SkipAct,0,0,0,0,0,0,0,0,0,desc,1,0,1
`)
    expect(catalog.events.map((item) => item.id)).toEqual([0])
    expect(catalog.actions.map((item) => item.id)).toEqual([0])
  })
})
