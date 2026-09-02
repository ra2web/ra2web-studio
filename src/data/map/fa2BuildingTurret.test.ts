import { describe, expect, it } from 'vitest'
import { MapIni } from './MapIni'
import {
  buildingVoxelTurretOffset,
  fa2BuildingTurretShpFrame,
  readBuildingTurret,
} from './fa2BuildingTurret'

describe('readBuildingTurret', () => {
  it('skips Tesla coils that have Turret=no (the ball is ActiveAnim)', () => {
    const rules = MapIni.parse('[TESLA]\nImage=NATSLA\nTurret=no\nTurretAnimZAdjust=-100\n')
    expect(readBuildingTurret(rules, 'TESLA', 'NATSLA')).toBeNull()
  })

  it('reads voxel turret name and rules XY like GTGCAN', () => {
    const rules = MapIni.parse([
      '[GTGCAN]',
      'Turret=yes',
      'TurretAnim=GTGCANTUR',
      'TurretAnimIsVoxel=true',
      'TurretAnimX=3',
      'TurretAnimY=28',
    ].join('\n'))
    expect(readBuildingTurret(rules, 'GTGCAN')).toEqual({
      anim: 'GTGCANTUR',
      voxel: true,
      x: 3,
      y: 28,
      offsetX: -2,
      offsetY: 2,
    })
  })

  it('reads SHP turrets when TurretAnimIsVoxel is not true', () => {
    const rules = MapIni.parse('[GUN]\nTurret=yes\nTurretAnim=GATGUN\nTurretAnimX=4\nTurretAnimY=6\n')
    expect(readBuildingTurret(rules, 'GUN')).toMatchObject({
      anim: 'GATGUN',
      voxel: false,
      x: 4,
      y: 6,
    })
  })
})

describe('fa2BuildingTurretShpFrame', () => {
  it('uses 4 frames per facing like FA2 wAnimCount', () => {
    expect(fa2BuildingTurretShpFrame(64)).toBe(20)
    expect(fa2BuildingTurretShpFrame(0)).toBe(28)
  })
})

describe('buildingVoxelTurretOffset', () => {
  it('uses the last FAData BuildingVoxelTurretsRA2 GTGCAN XY', () => {
    expect(buildingVoxelTurretOffset('GTGCAN')).toEqual({ offsetX: -2, offsetY: 2 })
  })
})
