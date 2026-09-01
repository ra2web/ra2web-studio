import { describe, expect, it } from 'vitest'
import { MixParser } from '../../services/MixParser'
import { MixArchiveBuilder } from '../../services/mixEdit/MixArchiveBuilder'
import { VirtualFileSystem } from './VirtualFileSystem'

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

async function vfsFromRoot(root: File): Promise<VirtualFileSystem> {
  const info = await MixParser.parseFile(root)
  return new VirtualFileSystem([{ name: root.name, file: root, info, priority: 1 }])
}

describe('VirtualFileSystem nested MIX', () => {
  it('opens theater files stored inside nested mixes like ra2.mix/isotemp.mix', async () => {
    const nested = buildMixBytes([
      { filename: 'temperat.ini', bytes: encodeText('[TileSet0000]\nFileName=CLEAR\nTilesInSet=1\n') },
      { filename: 'clear01.tem', bytes: encodeText('tmp-bytes') },
      { filename: 'isotem.pal', bytes: new Uint8Array(768) },
    ])
    const root = buildMixFile('ra2.mix', [
      { filename: 'isotemp.mix', bytes: nested },
    ])
    const vfs = await vfsFromRoot(root)

    const ini = await vfs.openFile('temperat.ini')
    expect(ini).not.toBeNull()
    expect(ini?.readAsString()).toContain('FileName=CLEAR')
    expect((await vfs.openFile('clear01.tem'))?.readAsString()).toBe('tmp-bytes')
    expect(await vfs.openFile('missing.tem')).toBeNull()
  })

  it('prefers md nested mixes over vanilla mixes in the same parent archive', async () => {
    const vanilla = buildMixBytes([
      { filename: 'isotem.pal', bytes: encodeText('vanilla-pal') },
    ])
    const md = buildMixBytes([
      { filename: 'isotem.pal', bytes: encodeText('yr-pal') },
    ])
    const root = buildMixFile('ra2.mix', [
      { filename: 'isotemp.mix', bytes: vanilla },
      { filename: 'isotemmd.mix', bytes: md },
    ])
    const vfs = await vfsFromRoot(root)
    expect((await vfs.openFile('isotem.pal'))?.readAsString()).toBe('yr-pal')
  })
})
