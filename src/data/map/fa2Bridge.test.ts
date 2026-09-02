import { describe, expect, it } from 'vitest'
import {
  FA2_BRIDGE_REPAIR_HUT,
  fa2BridgeConnectKinds,
  isFa2HiddenBridgeSetTile,
  listFa2TileSetThumbs,
  resolveBridgeRepairHut,
} from './fa2Bridge'

describe('FA2 bridge tools', () => {
  it('lists connect kinds the same way ViewObjects gates theaters', () => {
    expect(fa2BridgeConnectKinds('TEMPERATE')).toEqual(['small', 'big', 'track', 'concrete'])
    expect(fa2BridgeConnectKinds('DESERT')).toEqual(['small', 'concrete'])
    expect(fa2BridgeConnectKinds('LUNAR')).toEqual([])
  })

  it('hides BridgeSet tiles 10 and 15 on TEM/SNO/URB', () => {
    expect(isFa2HiddenBridgeSetTile('TEMPERATE', 80, 10, 80)).toBe(true)
    expect(isFa2HiddenBridgeSetTile('TEMPERATE', 80, 0, 80)).toBe(false)
    expect(isFa2HiddenBridgeSetTile('DESERT', 80, 10, 80)).toBe(false)
    expect(isFa2HiddenBridgeSetTile('TEMPERATE', 3, 10, 80)).toBe(false)
  })

  it('lists every BridgeSet piece except FA2 hidden 10/15 and does not cap at 48', () => {
    expect(listFa2TileSetThumbs(16, 800, 80, 'TEMPERATE', 80)).toEqual(
      Array.from({ length: 16 }, (_, index) => 800 + index).filter((_, index) => index !== 10 && index !== 15),
    )
    expect(listFa2TileSetThumbs(50, 0, 3, 'TEMPERATE', 80)).toHaveLength(50)
  })

  it('resolves the repair hut as CAARMR', () => {
    expect(resolveBridgeRepairHut(['GACNST', 'CAARMR'])).toBe('CAARMR')
    expect(resolveBridgeRepairHut([])).toBe(FA2_BRIDGE_REPAIR_HUT)
  })
})
