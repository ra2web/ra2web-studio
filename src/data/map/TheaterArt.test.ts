import { describe, expect, it } from 'vitest'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { MixParser } from '../../services/MixParser'
import { MixArchiveBuilder } from '../../services/mixEdit/MixArchiveBuilder'
import { TheaterArt } from './TheaterArt'
import { VirtualFileSystem } from '../vfs/VirtualFileSystem'

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

describe('TheaterArt', () => {
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
})
