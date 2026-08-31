import { describe, expect, it } from 'vitest'
import { Fa2Tube, TubeDir } from './fa2Tube'
import { MapDocument } from './MapDocument'

const XX = TubeDir.Undefined
const TC = TubeDir.Top
const TR = TubeDir.TopRight
const CR = TubeDir.Right
const BR = TubeDir.BottomRight
const BC = TubeDir.Bottom
const BL = TubeDir.BottomLeft
const CL = TubeDir.Left
const TL = TubeDir.TopLeft

function tube(
  startX: number,
  startY: number,
  dir: number,
  endX: number,
  endY: number,
  parts: number[],
): Fa2Tube {
  return Fa2Tube.fromFields(startX, startY, dir, endX, endY, parts)
}

describe('FA2 CTube::autocreate', () => {
  it('matches MissionEditor/tests.cpp test_tube_create', () => {
    expect(Fa2Tube.autocreate(50, 50, 50, 50).equals(tube(50, 50, XX, 50, 50, [XX]))).toBe(true)
    expect(Fa2Tube.autocreate(50, 50, 55, 50).equals(tube(50, 50, BC, 55, 50, [BC, BC, BC, BC, BC, XX]))).toBe(true)
    expect(Fa2Tube.autocreate(50, 50, 45, 50).equals(tube(50, 50, TC, 45, 50, [TC, TC, TC, TC, TC, XX]))).toBe(true)
    expect(Fa2Tube.autocreate(50, 50, 45, 45, 0).equals(tube(50, 50, CL, 45, 45, [TL, TL, TL, TL, TL, XX]))).toBe(true)
    expect(Fa2Tube.autocreate(50, 50, 45, 45).equals(tube(50, 50, CL, 45, 45, [CL, TL, TL, TL, TL, TC, XX]))).toBe(true)
    expect(Fa2Tube.autocreate(50, 50, 45, 46, 0).equals(tube(50, 50, TC, 45, 46, [TL, TL, TL, TL, TC, XX]))).toBe(true)
    expect(Fa2Tube.autocreate(50, 50, 45, 46, 1).equals(tube(50, 50, TC, 45, 46, [TC, TL, TL, TL, TL, XX]))).toBe(true)
    expect(Fa2Tube.autocreate(50, 50, 46, 45, 1).equals(tube(50, 50, CL, 46, 45, [CL, TL, TL, TL, TL, XX]))).toBe(true)
  })
})

describe('FA2 CTube::reverse', () => {
  it('matches MissionEditor/tests.cpp test_tube_reverse', () => {
    expect(
      tube(50, 50, BC, 55, 50, [BC, BC, BC, BC, BC, XX]).reverse()
        .equals(tube(55, 50, TC, 50, 50, [TC, TC, TC, TC, TC, XX])),
    ).toBe(true)
    expect(
      tube(50, 50, TC, 45, 46, [TC, TL, TL, TL, TL, XX]).reverse()
        .equals(tube(45, 46, BR, 50, 50, [BR, BR, BR, BR, BC, XX])),
    ).toBe(true)
    expect(
      tube(50, 50, BC, 51, 50, [BC, XX]).reverse()
        .equals(tube(51, 50, TC, 50, 50, [TC, XX])),
    ).toBe(true)
    expect(
      tube(50, 50, BC, 52, 50, [BC, BC, XX]).reverse()
        .equals(tube(52, 50, TC, 50, 50, [TC, TC, XX])),
    ).toBe(true)
  })
})

describe('FA2 CTube::append', () => {
  it('matches MissionEditor/tests.cpp test_tube_append', () => {
    const tubeToBottom = tube(50, 50, BC, 53, 50, [BC, BC, BC, XX])
    tubeToBottom.append(55, 50)
    expect(tubeToBottom.equals(tube(50, 50, BC, 55, 50, [BC, BC, BC, BC, BC, XX]))).toBe(true)

    const tubeToTL = tube(50, 50, TC, 49, 49, [TL, XX])
    tubeToTL.append(49, 47)
    expect(tubeToTL.equals(tube(50, 50, TC, 49, 47, [TL, CL, CL, XX]))).toBe(true)

    const nullLen = tube(50, 50, XX, 50, 50, [XX])
    nullLen.append(55, 50)
    expect(nullLen.equals(tube(50, 50, BC, 55, 50, [BC, BC, BC, BC, BC, XX]))).toBe(true)

    const nullLenYMajor = tube(50, 50, XX, 50, 50, [XX])
    nullLenYMajor.append(51, 53)
    expect(nullLenYMajor.equals(tube(50, 50, CR, 51, 53, [CR, BR, CR, XX]))).toBe(true)

    const nullAppend = tube(50, 50, BC, 52, 50, [BC, BC, XX])
    nullAppend.append(52, 50)
    expect(nullAppend.equals(tube(50, 50, BC, 52, 50, [BC, BC, XX]))).toBe(true)

    const zeroTube = tube(50, 50, XX, 50, 50, [])
    zeroTube.append(55, 50)
    expect(zeroTube.equals(tube(50, 50, BC, 55, 50, [BC, BC, BC, BC, BC, XX]))).toBe(true)

    const tubeWithIntersection = tube(50, 50, TC, 49, 49, [TL, XX])
    tubeWithIntersection.append(51, 51)
    expect(tubeWithIntersection.equals(tube(50, 50, TC, 51, 51, [TL, BR, BR, XX]))).toBe(true)

    const tubeShorten = tube(50, 50, TC, 47, 47, [TL, TL, TL, XX])
    tubeShorten.append(48, 48)
    expect(tubeShorten.equals(tube(50, 50, TC, 48, 48, [TL, TL, XX]))).toBe(true)
  })
})

describe('FA2 CTube delimiter', () => {
  it('adds trailing -1 so TS/RA2 will not crash', () => {
    expect(Fa2Tube.fromIni('50, 50, -1, 50, 50').toString()).toBe('50,50,-1,50,50,-1')
    expect(Fa2Tube.fromIni('50, 50, -1, 50, 50').equals(tube(50, 50, XX, 50, 50, [XX]))).toBe(true)
  })

  it('writes MapTube without duplicating the terminator', () => {
    const created = Fa2Tube.autocreate(50, 50, 55, 50)
    const mapped = created.toMapTube('0')
    expect(mapped.startDir).toBe(BC)
    expect(mapped.parts).toEqual([BC, BC, BC, BC, BC])
    expect(mapped.parts.includes(XX)).toBe(false)
  })

  it('round-trips autocreate tubes through Map INI', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const created = Fa2Tube.autocreate(10, 12, 14, 12)
    doc.tubes.push(created.toMapTube('0'))
    doc.tubes.push(created.reverse().toMapTube('1'))
    const again = MapDocument.parse(doc.toIniString())
    expect(again.tubes).toHaveLength(2)
    expect(again.tubes[0]?.startDir).toBe(TubeDir.Bottom)
    expect(again.tubes[0]?.parts).toEqual([TubeDir.Bottom, TubeDir.Bottom, TubeDir.Bottom, TubeDir.Bottom])
    expect(again.tubes[1]?.startDir).toBe(TubeDir.Top)
  })
})

describe('unused FA2 dirs stay mapped', () => {
  it('maps diagonal enter directions', () => {
    expect(TR).toBe(1)
    expect(BL).toBe(5)
  })
})
