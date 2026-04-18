import type { Page } from '@playwright/test'
import { MixArchiveBuilder } from '../../../src/services/mixEdit/MixArchiveBuilder'

type FileFixture = {
  name: string
  bytes: Uint8Array
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function buildMix(name: string, entries: Array<{ filename: string; bytes: Uint8Array }>): FileFixture {
  const normalizedEntries = MixArchiveBuilder.upsertLocalMixDatabase(entries)
  return {
    name,
    bytes: MixArchiveBuilder.build(normalizedEntries),
  }
}

export function buildStudioBaseFixtures(): FileFixture[] {
  const nestedMix = buildMix('nested.mix', [
    {
      filename: 'inside.txt',
      bytes: encodeText('nested resource'),
    },
  ])

  const topMix = buildMix('ra2.mix', [
    {
      filename: 'sample.pkt',
      bytes: encodeText('[Maps]\n0=TestMap\n'),
    },
    {
      filename: 'notes.txt',
      bytes: encodeText('hello from ra2web studio'),
    },
    {
      filename: 'unit.shp',
      bytes: new Uint8Array([0, 0, 0, 0]),
    },
    {
      filename: nestedMix.name,
      bytes: nestedMix.bytes,
    },
  ])

  return [
    topMix,
    buildMix('language.mix', []),
    buildMix('multi.mix', []),
  ]
}

export async function seedStudioWorkspace(page: Page) {
  const files = buildStudioBaseFixtures().map((file) => ({
    name: file.name,
    bytes: Array.from(file.bytes),
  }))

  await page.goto('/')
  await page.evaluate(async (fixtures: Array<{ name: string; bytes: number[] }>) => {
    const root = await navigator.storage.getDirectory()
    try {
      await root.removeEntry('ra2web-studio-resources', { recursive: true })
    } catch {
      // ignore missing workspace
    }
    const workspace = await root.getDirectoryHandle('ra2web-studio-resources', { create: true })
    const base = await workspace.getDirectoryHandle('base', { create: true })

    for (const fixture of fixtures) {
      const handle = await base.getFileHandle(fixture.name, { create: true })
      const writable = await handle.createWritable()
      await writable.write(new Uint8Array(fixture.bytes))
      await writable.close()
    }

    localStorage.setItem('ra2web-studio.gameResConfig', JSON.stringify({
      activeProjectName: null,
      lastImportAt: Date.now(),
    }))
  }, files)
  await page.reload({ waitUntil: 'networkidle' })
}
