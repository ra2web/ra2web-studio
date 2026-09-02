import { describe, expect, it } from 'vitest'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { MixParser } from '../../services/MixParser'
import { MixArchiveBuilder } from '../../services/mixEdit/MixArchiveBuilder'
import { ShpEncoder } from '../../services/shp/ShpEncoder'
import { TheaterArt } from './TheaterArt'
import { rgbaHasOpaque } from './shpBlit'
import { VirtualFileSystem } from '../vfs/VirtualFileSystem'
import { THEATER_ASSETS } from './theaterIndex'
import { VxlEncoder } from '../VxlEncoder'
import { Section } from '../vxl/Section'
import * as THREE from 'three'

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function buildMixBytes(entries: Array<{ filename: string; bytes: Uint8Array }>): Uint8Array {
  return MixArchiveBuilder.build(MixArchiveBuilder.upsertLocalMixDatabase(entries))
}

function buildMixFile(name: string, entries: Array<{ filename: string; bytes: Uint8Array }>): File {
  const bytes = buildMixBytes(entries)
  const file = new File([bytes], name)
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  Object.defineProperty(file, 'size', { value: bytes.byteLength })
  return file
}

const THEATER_INI = `[General]
ClearTile=0

[TileSet0000]
FileName=CLEAR
SetName=Clear
TilesInSet=1
`

function paletteWithIndex(index: number, r: number, g: number, b: number): Uint8Array {
  const pal = new Uint8Array(768)
  pal[index * 3] = r
  pal[index * 3 + 1] = g
  pal[index * 3 + 2] = b
  return pal
}

function encodeTinyShp(colorIndex: number): Uint8Array {
  return encodeShp(new Uint8Array([colorIndex]), 1, 1)
}

function encodeShp(indexed: Uint8Array, width: number, height: number): Uint8Array {
  return ShpEncoder.encodeType0({
    canvasWidth: width,
    canvasHeight: height,
    frames: [{ width, height, indexedPixels: indexed }],
  })
}

function encodeShpFrames(frames: Uint8Array[], width = 1, height = 1): Uint8Array {
  return ShpEncoder.encodeType0({
    canvasWidth: width,
    canvasHeight: height,
    frames: frames.map((indexedPixels) => ({ width, height, indexedPixels })),
  })
}

function encodeTinyVxl(colorIndex: number, r: number, g: number, b: number): Uint8Array {
  const palette = new Uint8Array(768)
  palette[colorIndex * 3] = r
  palette[colorIndex * 3 + 1] = g
  palette[colorIndex * 3 + 2] = b
  const section = new Section()
  section.name = 'BODY'
  section.normalsMode = 2
  section.sizeX = 2
  section.sizeY = 2
  section.sizeZ = 2
  section.hvaMultiplier = 1
  section.transfMatrix = new THREE.Matrix4().identity()
  section.minBounds = new THREE.Vector3(0, 0, 0)
  section.maxBounds = new THREE.Vector3(2, 2, 2)
  section.spans = []
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      section.spans.push({
        x,
        y,
        voxels: x === 0 && y === 0 ? [{ x, y, z: 0, colorIndex, normalIndex: 1 }] : [],
      })
    }
  }
  return VxlEncoder.encode({ embeddedPalette: palette, sections: [section] })
}

async function waitPeek<T>(get: () => T | null | undefined, timeoutMs = 1000): Promise<T | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = get()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('timed out waiting for art pixels')
}

async function loadTheater(entries: Array<{ filename: string; bytes: Uint8Array }>): Promise<TheaterArt> {
  const nested = buildMixBytes([
    { filename: 'temperat.ini', bytes: encodeText(THEATER_INI) },
    ...entries,
  ])
  const root = buildMixFile('ra2.mix', [
    { filename: 'temperat.mix', bytes: nested },
  ])
  const info = await MixParser.parseFile(root)
  const vfs = new VirtualFileSystem([{ name: 'ra2.mix', file: root, info, priority: 1 }])
  const resourceContext = {
    resolveFileFromOverlay: (filename: string) => vfs.openFile(filename),
  } as ResourceContext
  const art = await TheaterArt.load(resourceContext, 'TEMPERATE')
  if (!art) throw new Error('TheaterArt.load returned null')
  return art
}

describe('TheaterArt', () => {
  it('parses rules [Colors] HSV for house remaps', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: new Uint8Array(768) },
      { filename: 'rules.ini', bytes: encodeText('[Colors]\nDarkRed=0,230,255\n') },
    ])
    expect(art.houseColors.darkred).toEqual({ r: 255, g: 25, b: 25 })
  })
  it('loads theater.ini from a nested mix inside ra2.mix', async () => {
    const nested = buildMixBytes([
      { filename: 'temperat.ini', bytes: encodeText(THEATER_INI) },
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
    ])
    const root = buildMixFile('ra2.mix', [
      { filename: 'temperat.mix', bytes: nested },
    ])
    const info = await MixParser.parseFile(root)
    const vfs = new VirtualFileSystem([{ name: 'ra2.mix', file: root, info, priority: 1 }])
    const resourceContext = {
      resolveFileFromOverlay: (filename: string) => vfs.openFile(filename),
    } as ResourceContext

    const art = await TheaterArt.load(resourceContext, 'TEMPERATE')
    expect(art).not.toBeNull()
    expect(art?.index?.sets[0].fileName).toBe('CLEAR')
  })

  it('prefers temperatmd.ini when both vanilla and YR theater ini exist', async () => {
    const nested = buildMixBytes([
      { filename: 'temperat.ini', bytes: encodeText(`${THEATER_INI}\nSetName=Vanilla\n`) },
      { filename: 'temperatmd.ini', bytes: encodeText(`[TileSet0000]\nFileName=CLEARM\nSetName=Yuri\nTilesInSet=1\n`) },
    ])
    const root = buildMixFile('ra2.mix', [
      { filename: 'temperat.mix', bytes: nested },
    ])
    const info = await MixParser.parseFile(root)
    const vfs = new VirtualFileSystem([{ name: 'ra2.mix', file: root, info, priority: 1 }])
    const resourceContext = {
      resolveFileFromOverlay: (filename: string) => vfs.openFile(filename),
    } as ResourceContext

    const art = await TheaterArt.load(resourceContext, 'TEMPERATE')
    expect(art?.index?.sets[0].fileName).toBe('CLEARM')
  })

  it('does not cache overlay misses before OverlayTypes names are loaded', () => {
    const art = new TheaterArt(async () => null, 'TEMPERATE')
    art.requestOverlay(126, 0)
    expect(art.peekOverlay(126, 0)).toBeUndefined()
    art.overlayNames = Array.from({ length: 127 }, (_, index) => (index === 126 ? 'VEINS' : ''))
    art.requestOverlay(126, 0)
    expect(art.peekOverlay(126, 0)).toBeUndefined()
  })

  it('uses the theater overlay palette (temperat.pal) for Tiberium overlays', async () => {
    expect(THEATER_ASSETS.TEMPERATE.overlayPal).toBe('temperat.pal')
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: paletteWithIndex(16, 0, 200, 0) },
      { filename: 'temperat.pal', bytes: paletteWithIndex(16, 212, 160, 23) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(1, 255, 0, 0) },
      { filename: 'rules.ini', bytes: encodeText('[Riparius]\nTiberium=yes\n') },
      { filename: 'art.ini', bytes: encodeText('[Riparius]\nImage=GOLD01\nTheater=yes\n') },
      { filename: 'gold01.tem', bytes: encodeTinyShp(16) },
    ])
    art.overlayNames = Array.from({ length: 103 }, (_, index) => (index === 102 ? 'Riparius' : ''))
    art.requestOverlay(102, 0)
    const pixels = await waitPeek(() => art.peekOverlay(102, 0))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[0]).toBe(212)
    expect(pixels?.rgba[1]).toBe(160)
    expect(pixels?.rgba[2]).toBe(23)
    expect(pixels?.rgba[3]).toBe(255)
  })

  it('uses iso pal for bridge overlays loaded from .tem', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: paletteWithIndex(16, 0, 200, 0) },
      { filename: 'temperat.pal', bytes: paletteWithIndex(16, 212, 160, 23) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(1, 255, 0, 0) },
      { filename: 'art.ini', bytes: encodeText('[BRIDGE1]\nTheater=yes\n') },
      { filename: 'bridge1.tem', bytes: encodeTinyShp(16) },
    ])
    art.overlayNames = Array.from({ length: 25 }, (_, index) => (index === 24 ? 'BRIDGE1' : ''))
    art.requestOverlay(24, 0)
    const pixels = await waitPeek(() => art.peekOverlay(24, 0))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[0]).toBe(0)
    expect(pixels?.rgba[1]).toBe(200)
    expect(pixels?.rgba[2]).toBe(0)
  })

  it('does not blit empty overlay data frames as another SHP frame', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: paletteWithIndex(16, 0, 200, 0) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(1, 255, 0, 0) },
      { filename: 'art.ini', bytes: encodeText('[LOBRDG23]\nTheater=yes\n') },
      { filename: 'lobrdg23.tem', bytes: encodeShpFrames([new Uint8Array([0]), new Uint8Array([16]), new Uint8Array([0])]) },
    ])
    art.overlayNames = Array.from({ length: 84 }, (_, index) => (index === 83 ? 'LOBRDG23' : ''))
    art.requestOverlay(83, 0)
    art.requestOverlay(83, 1)
    art.requestOverlay(83, 2)
    const empty0 = await waitPeek(() => art.peekOverlay(83, 0))
    const filled = await waitPeek(() => art.peekOverlay(83, 1))
    const empty2 = await waitPeek(() => art.peekOverlay(83, 2))
    expect(rgbaHasOpaque(empty0)).toBe(false)
    expect(rgbaHasOpaque(filled)).toBe(true)
    expect(rgbaHasOpaque(empty2)).toBe(false)
  })

  it('loads smudge CR1.tem with iso pal even without TerrainPalette', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: paletteWithIndex(16, 10, 200, 30) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(16, 255, 0, 0) },
      { filename: 'art.ini', bytes: encodeText('[CRATER1]\nImage=CR1\nTheater=yes\n') },
      { filename: 'cr1.tem', bytes: encodeTinyShp(16) },
    ])
    art.requestObject('CRATER1', 0, 0, undefined, 'smudge')
    const pixels = await waitPeek(() => art.peekObject('CRATER1', 0, 0, undefined, 'smudge'))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[0]).toBe(10)
    expect(pixels?.rgba[1]).toBe(200)
    expect(pixels?.rgba[2]).toBe(30)
  })

  it('loads TREE01.tem terrain with iso pal', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: paletteWithIndex(16, 4, 80, 12) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(16, 255, 0, 0) },
      { filename: 'art.ini', bytes: encodeText('[TREE01]\nTheater=yes\nShouldUseCellDrawer=yes\n') },
      { filename: 'tree01.tem', bytes: encodeTinyShp(16) },
    ])
    art.requestObject('TREE01', 0, 0, undefined, 'terrain')
    const pixels = await waitPeek(() => art.peekObject('TREE01', 0, 0, undefined, 'terrain'))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[0]).toBe(4)
    expect(pixels?.rgba[1]).toBe(80)
    expect(pixels?.rgba[2]).toBe(12)
  })

  it('loads infantry SHP via rules Image=CONSCR instead of e1.shp', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(1, 255, 0, 0) },
      { filename: 'rules.ini', bytes: encodeText('[E1]\nImage=CONSCR\n') },
      { filename: 'art.ini', bytes: encodeText('[CONSCR]\nCameo=E1ICON\n') },
      { filename: 'conscr.shp', bytes: encodeTinyShp(1) },
    ])
    art.requestObject('E1', 0, 0)
    const pixels = await waitPeek(() => art.peekObject('E1', 0, 0))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[0]).toBe(255)
    expect(pixels?.rgba[3]).toBe(255)
  })

  it('loads NewTheater building SHP (gtcnst.shp) for GACNST', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(1, 0, 0, 255) },
      { filename: 'art.ini', bytes: encodeText('[GACNST]\nNewTheater=yes\n') },
      { filename: 'gtcnst.shp', bytes: encodeTinyShp(1) },
    ])
    art.requestObject('GACNST', 0, 0)
    const pixels = await waitPeek(() => art.peekObject('GACNST', 0, 0))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[2]).toBe(255)
  })

  it('falls back to SHP when Voxel=yes but the vxl is missing', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(1, 0, 255, 0) },
      { filename: 'art.ini', bytes: encodeText('[MTNK]\nVoxel=yes\n') },
      { filename: 'mtnk.shp', bytes: encodeTinyShp(1) },
    ])
    art.requestObject('MTNK', 0, 0)
    const pixels = await waitPeek(() => art.peekObject('MTNK', 0, 0))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[1]).toBe(255)
  })

  it('loads voxel vehicles from .vxl when Voxel=yes', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: new Uint8Array(768) },
      { filename: 'art.ini', bytes: encodeText('[MTNK]\nVoxel=yes\n') },
      { filename: 'mtnk.vxl', bytes: encodeTinyVxl(7, 240, 80, 16) },
    ])
    art.requestObject('MTNK', 0, 0)
    const pixels = await waitPeek(() => art.peekObject('MTNK', 0, 0))
    expect(pixels).not.toBeNull()
    const seen = [...(pixels?.rgba ?? [])].some((value, index) => (
      index % 4 === 0 && value === 240 && pixels?.rgba[index + 1] === 80 && pixels?.rgba[index + 2] === 16
    ))
    expect(seen).toBe(true)
  })

  it('remaps VXL house colors even when the file embeds a palette', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: new Uint8Array(768) },
      { filename: 'art.ini', bytes: encodeText('[MTNK]\nVoxel=yes\n') },
      { filename: 'mtnk.vxl', bytes: encodeTinyVxl(0x10, 255, 0, 0) },
    ])
    const house = { r: 240, g: 240, b: 240 }
    art.requestObject('MTNK', 0, 64, house, 'unit')
    const pixels = await waitPeek(() => art.peekObject('MTNK', 0, 64, house, 'unit'))
    expect(pixels).not.toBeNull()
    const seen = [...(pixels?.rgba ?? [])].some((value, index) => (
      index % 4 === 0 && value === 240 && pixels?.rgba[index + 1] === 240 && pixels?.rgba[index + 2] === 240
    ))
    expect(seen).toBe(true)
  })

  it('composites a vehicle turret VXL onto the hull like FA2', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: new Uint8Array(768) },
      { filename: 'rules.ini', bytes: encodeText('[MTNK]\nTurret=yes\n') },
      { filename: 'art.ini', bytes: encodeText('[MTNK]\nVoxel=yes\n') },
      { filename: 'mtnk.vxl', bytes: encodeTinyVxl(7, 240, 80, 16) },
      { filename: 'mtnktur.vxl', bytes: encodeTinyVxl(8, 16, 200, 16) },
    ])
    art.requestObject('MTNK', 0, 0, undefined, 'unit')
    const pixels = await waitPeek(() => art.peekObject('MTNK', 0, 0, undefined, 'unit'))
    expect(pixels).not.toBeNull()
    const seenTurret = [...(pixels?.rgba ?? [])].some((value, index) => (
      index % 4 === 0 && value === 16 && pixels?.rgba[index + 1] === 200
    ))
    expect(seenTurret).toBe(true)
  })

  it('overlays BibShape onto the building SHP like FA2 LoadBuildingSubGraphic', async () => {
    const pal = new Uint8Array(768)
    pal[3] = 255
    pal[6] = 0
    pal[7] = 255
    pal[9] = 0
    pal[10] = 0
    pal[11] = 255
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: pal },
      {
        filename: 'rules.ini',
        bytes: encodeText('[BuildingTypes]\n0=GAPOWR\n[GAPOWR]\nImage=GAPOWR\n'),
      },
      {
        filename: 'art.ini',
        bytes: encodeText('[GAPOWR]\nFoundation=2x3\nBibShape=GAPOWRB\nActiveAnim=GAPOWRA\n'),
      },
      { filename: 'gtpowr.shp', bytes: encodeShp(new Uint8Array([1, 0, 0, 0]), 2, 2) },
      { filename: 'gtpowrb.shp', bytes: encodeShp(new Uint8Array([0, 2, 0, 0]), 2, 2) },
      { filename: 'gtpowra.shp', bytes: encodeShp(new Uint8Array([0, 0, 3, 0]), 2, 2) },
    ])
    expect(art.foundations.GAPOWR).toEqual({ w: 2, h: 3 })
    art.requestObject('GAPOWR', 0, 0, undefined, 'building')
    const pixels = await waitPeek(() => art.peekObject('GAPOWR', 0, 0, undefined, 'building'))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[0]).toBe(255)
    expect(pixels?.rgba[5]).toBe(255)
    expect(pixels?.rgba[10]).toBe(255)
  })

  it('uses infantry WalkFrames so facing 64 is not the south walk cycle', async () => {
    const pal = paletteWithIndex(1, 0, 255, 0)
    pal[6] = 255
    pal[7] = 0
    pal[8] = 0
    const frames = Array.from({ length: 57 }, (_, index) => (
      new Uint8Array([index === 40 ? 1 : index === 56 ? 2 : 0])
    ))
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: pal },
      { filename: 'rules.ini', bytes: encodeText('[InfantryTypes]\n0=E1\n[E1]\nImage=CONSCR\n') },
      { filename: 'art.ini', bytes: encodeText('[CONSCR]\nWalkFrames=8\nStartWalkFrame=0\n') },
      { filename: 'conscr.shp', bytes: encodeShpFrames(frames) },
    ])
    art.requestObject('E1', 0, 64, undefined, 'infantry')
    const pixels = await waitPeek(() => art.peekObject('E1', 0, 64, undefined, 'infantry'))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[1]).toBe(255)
    art.requestObject('E1', 0, 0, undefined, 'infantry')
    const south = await waitPeek(() => art.peekObject('E1', 0, 0, undefined, 'infantry'))
    expect(south?.rgba[0]).toBe(255)
    expect(south?.rgba[1]).toBe(0)
  })

  it('remaps unit pal 0x10-0x1F to the house color for flags', async () => {
    const pal = new Uint8Array(768)
    pal[16 * 3] = 1
    pal[16 * 3 + 1] = 2
    pal[16 * 3 + 2] = 3
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: pal },
      { filename: 'art.ini', bytes: encodeText('[GAPOWR]\nCameo=GAPOWRICON\n') },
      { filename: 'gtpowr.shp', bytes: encodeTinyShp(16) },
    ])
    const house = { r: 240, g: 20, b: 20 }
    art.requestObject('GAPOWR', 0, 0, house, 'building')
    const pixels = await waitPeek(() => art.peekObject('GAPOWR', 0, 0, house, 'building'))
    expect(pixels?.rgba[0]).toBe(240)
    expect(pixels?.rgba[1]).toBe(20)
    expect(pixels?.rgba[2]).toBe(20)
  })

  it('still composites GARADR ActiveAnim when the main SHP frame is empty', async () => {
    const pal = paletteWithIndex(1, 0, 180, 255)
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: pal },
      { filename: 'art.ini', bytes: encodeText('[GARADR]\nNewTheater=yes\nActiveAnim=GARADR_A\nFoundation=2x2\n') },
      { filename: 'gtradr.shp', bytes: encodeShp(new Uint8Array([0, 0, 0, 0]), 2, 2) },
      { filename: 'gtradr_a.shp', bytes: encodeShp(new Uint8Array([0, 1, 0, 0]), 2, 2) },
    ])
    art.requestObject('GARADR', 0, 0, undefined, 'building')
    const pixels = await waitPeek(() => art.peekObject('GARADR', 0, 0, undefined, 'building'))
    expect(pixels).not.toBeNull()
    expect(pixels?.rgba[4]).toBe(0)
    expect(pixels?.rgba[5]).toBe(180)
    expect(pixels?.rgba[6]).toBe(255)
    expect(pixels?.rgba[7]).toBe(255)
  })

  it('does not treat GAPADR as a vanilla radar id; GARADR is the Allied Radar', async () => {
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: paletteWithIndex(1, 255, 255, 255) },
      { filename: 'art.ini', bytes: encodeText('[GARADR]\nNewTheater=yes\n') },
      { filename: 'gtradr.shp', bytes: encodeTinyShp(1) },
    ])
    art.requestObject('GAPADR', 0, 0, undefined, 'building')
    const pixels = await waitPeek(() => art.peekObject('GAPADR', 0, 0, undefined, 'building'))
    expect(pixels).toBeNull()
  })

  it('overlays a voxel TurretAnim onto the building SHP like FA2', async () => {
    const pal = paletteWithIndex(1, 40, 40, 40)
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: pal },
      {
        filename: 'rules.ini',
        bytes: encodeText('[GTGCAN]\nTurret=yes\nTurretAnim=GTGCANTUR\nTurretAnimIsVoxel=true\nTurretAnimX=0\nTurretAnimY=0\n'),
      },
      { filename: 'art.ini', bytes: encodeText('[GTGCAN]\nFoundation=3x3\n') },
      { filename: 'gtgcan.shp', bytes: encodeShp(new Uint8Array(64).fill(1), 8, 8) },
      { filename: 'gtgcantur.vxl', bytes: encodeTinyVxl(7, 0, 255, 0) },
    ])
    art.requestObject('GTGCAN', 0, 0, undefined, 'building')
    const pixels = await waitPeek(() => art.peekObject('GTGCAN', 0, 0, undefined, 'building'))
    expect(pixels).not.toBeNull()
    const seenTurret = [...(pixels?.rgba ?? [])].some((value, index) => (
      index % 4 === 0 && pixels?.rgba[index + 1] === 255 && pixels?.rgba[index + 2] === 0 && pixels?.rgba[index + 3] === 255
    ))
    expect(seenTurret).toBe(true)
  })

  it('overlays Tesla ActiveAnim even when Turret=no', async () => {
    const pal = new Uint8Array(768)
    pal[3] = 10
    pal[6] = 255
    pal[7] = 255
    pal[8] = 0
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: pal },
      { filename: 'rules.ini', bytes: encodeText('[TESLA]\nImage=NATSLA\nTurret=no\n') },
      { filename: 'art.ini', bytes: encodeText('[NATSLA]\nNewTheater=yes\nActiveAnim=NATSLA_A\n') },
      { filename: 'nttsla.shp', bytes: encodeShp(new Uint8Array([1, 0, 0, 0]), 2, 2) },
      { filename: 'nttsla_a.shp', bytes: encodeShp(new Uint8Array([0, 2, 0, 0]), 2, 2) },
    ])
    art.requestObject('TESLA', 0, 0, undefined, 'building')
    const pixels = await waitPeek(() => art.peekObject('TESLA', 0, 0, undefined, 'building'))
    expect(pixels?.rgba[0]).toBe(10)
    expect(pixels?.rgba[4]).toBe(255)
    expect(pixels?.rgba[5]).toBe(255)
  })

  it('clips Chronosphere SuperAnimTwo to the main SHP so the globe does not split off', async () => {
    const pal = new Uint8Array(768)
    pal[3] = 40
    pal[6] = 0
    pal[7] = 180
    pal[8] = 255
    pal[9] = 255
    pal[10] = 0
    pal[11] = 0
    const far = new Uint8Array(16)
    far[15] = 3
    const art = await loadTheater([
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
      { filename: 'unittem.pal', bytes: pal },
      { filename: 'art.ini', bytes: encodeText('[GACSPH]\nNewTheater=yes\nSuperAnim=GACSPH_E\nSuperAnimTwo=GACSPH_F\nFoundation=4x3\n') },
      { filename: 'gtcsph.shp', bytes: encodeShp(new Uint8Array([1, 0, 0, 0]), 2, 2) },
      { filename: 'gtcsph_e.shp', bytes: encodeShp(new Uint8Array([0, 2, 0, 0]), 2, 2) },
      { filename: 'gtcsph_f.shp', bytes: encodeShp(far, 4, 4) },
    ])
    art.requestObject('GACSPH', 0, 0, undefined, 'building')
    const pixels = await waitPeek(() => art.peekObject('GACSPH', 0, 0, undefined, 'building'))
    expect(pixels?.width).toBe(2)
    expect(pixels?.height).toBe(2)
    expect(pixels?.rgba[0]).toBe(40)
    expect(pixels?.rgba[4]).toBe(0)
    expect(pixels?.rgba[5]).toBe(180)
    expect(pixels?.rgba[6]).toBe(255)
    expect([...pixels?.rgba ?? []].some((value, index) => index % 4 === 0 && value === 255 && pixels?.rgba[index + 1] === 0)).toBe(false)
  })
})
