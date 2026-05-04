import { MixEntry } from '../../data/MixEntry'

export interface MixArchiveBuilderEntry {
  filename: string
  bytes: Uint8Array
  hash?: number
}

export interface MixArchiveLmdSummary {
  fileNameCount: number
  replacedExisting: boolean
  skippedByHashMismatch: number
}

export interface MixArchiveLmdUpsertResult {
  entries: MixArchiveBuilderEntry[]
  summary: MixArchiveLmdSummary
}

type FinalizedEntry = {
  filename: string
  bytes: Uint8Array
  hash: number
}

const LOCAL_MIX_DATABASE_FILENAME = 'local mix database.dat'

function normalizeMixEntryName(filename: string): string {
  return filename.trim().replace(/\//g, '\\')
}

function normalizeMixEntryKey(filename: string): string {
  return normalizeMixEntryName(filename).toLowerCase()
}

function isLocalMixDatabaseFilename(filename: string): boolean {
  return normalizeMixEntryKey(filename) === LOCAL_MIX_DATABASE_FILENAME
}

function createLocalMixDatabaseBytes(
  fileNames: string[],
  gameType: number,
): { bytes: Uint8Array; fileNameCount: number } {
  const normalized = fileNames.map((name) => normalizeMixEntryName(name).toLowerCase())
  const uniqueNames: string[] = []
  const seen = new Set<string>()
  for (const name of normalized) {
    if (!name || isLocalMixDatabaseFilename(name)) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    uniqueNames.push(name)
  }

  const namesByteSize = uniqueNames.reduce((sum, name) => sum + name.length + 1, 0)
  // XCC-compatible LMD layout:
  // [id:32][size:4][type:4][version:4][game:4][count:4][name\0...]
  const totalSize = 32 + 4 + 4 + 4 + 4 + 4 + namesByteSize
  const bytes = new Uint8Array(totalSize)
  const view = new DataView(bytes.buffer)

  const id = 'XCC by Olaf van der Spek'
  for (let i = 0; i < id.length && i < 32; i++) {
    bytes[i] = id.charCodeAt(i)
  }

  let offset = 32
  view.setUint32(offset, totalSize >>> 0, true)
  offset += 4
  view.setUint32(offset, 0, true) // type: xcc_ft_lmd
  offset += 4
  view.setUint32(offset, 0, true) // version: 0
  offset += 4
  view.setUint32(offset, gameType >>> 0, true)
  offset += 4
  view.setUint32(offset, uniqueNames.length >>> 0, true)
  offset += 4

  for (const name of uniqueNames) {
    for (let i = 0; i < name.length; i++) {
      bytes[offset++] = name.charCodeAt(i)
    }
    bytes[offset++] = 0
  }
  return { bytes, fileNameCount: uniqueNames.length }
}

function finalizeEntries(entries: MixArchiveBuilderEntry[]): FinalizedEntry[] {
  const hashSeen = new Set<number>()
  const finalized: FinalizedEntry[] = []
  for (const entry of entries) {
    const normalizedName = normalizeMixEntryName(entry.filename)
    if (!normalizedName) {
      throw new Error('MIX build failed: empty filename detected')
    }
    const hash = (entry.hash ?? MixEntry.hashFilename(normalizedName)) >>> 0
    if (hashSeen.has(hash)) {
      throw new Error(`MIX build failed: duplicate entry hash (${normalizedName})`)
    }
    hashSeen.add(hash)
    finalized.push({ filename: normalizedName, bytes: entry.bytes, hash })
  }
  return finalized
}

export class MixArchiveBuilder {
  static build(entries: MixArchiveBuilderEntry[]): Uint8Array {
    const finalized = finalizeEntries(entries)
    if (finalized.length > 0xffff) {
      throw new Error(`MIX build failed: entry count exceeded (${finalized.length})`)
    }

    let dataSize = 0
    for (const item of finalized) {
      dataSize += item.bytes.length
      if (dataSize > 0xffffffff) {
        throw new Error('MIX build failed: data section exceeds 32-bit limit')
      }
    }

    const fileCount = finalized.length
    const headerSize = 2 + 4 + fileCount * 12
    const totalSize = headerSize + dataSize
    const output = new Uint8Array(totalSize)
    const view = new DataView(output.buffer)

    let cursor = 0
    view.setUint16(cursor, fileCount, true)
    cursor += 2
    view.setUint32(cursor, dataSize >>> 0, true)
    cursor += 4

    let relativeOffset = 0
    for (const item of finalized) {
      view.setUint32(cursor, item.hash >>> 0, true)
      cursor += 4
      view.setUint32(cursor, relativeOffset >>> 0, true)
      cursor += 4
      view.setUint32(cursor, item.bytes.length >>> 0, true)
      cursor += 4
      relativeOffset += item.bytes.length
    }

    let dataCursor = headerSize
    for (const item of finalized) {
      output.set(item.bytes, dataCursor)
      dataCursor += item.bytes.length
    }

    return output
  }

  static hashFilename(filename: string): number {
    return MixEntry.hashFilename(normalizeMixEntryName(filename)) >>> 0
  }

  static upsertLocalMixDatabase(
    entries: MixArchiveBuilderEntry[],
    gameType: number = 3,
  ): MixArchiveBuilderEntry[] {
    return this.upsertLocalMixDatabaseWithSummary(entries, gameType).entries
  }

  static upsertLocalMixDatabaseWithSummary(
    entries: MixArchiveBuilderEntry[],
    gameType: number = 3,
  ): MixArchiveLmdUpsertResult {
    const next: MixArchiveBuilderEntry[] = []
    const fileNamesForLmd: string[] = []
    const replacedExisting = entries.some((entry) => isLocalMixDatabaseFilename(entry.filename))
    let skippedByHashMismatch = 0

    for (const entry of entries) {
      if (isLocalMixDatabaseFilename(entry.filename)) {
        continue
      }
      next.push(entry)
      const computedHash = this.hashFilename(entry.filename)
      const providedHash = entry.hash == null ? computedHash : (entry.hash >>> 0)
      // Avoid writing placeholder names (e.g. hash-derived fallbacks) into LMD.
      if (providedHash !== computedHash) {
        skippedByHashMismatch++
        continue
      }
      fileNamesForLmd.push(entry.filename)
    }

    const lmd = createLocalMixDatabaseBytes(fileNamesForLmd, gameType)
    next.push({
      filename: LOCAL_MIX_DATABASE_FILENAME,
      hash: this.hashFilename(LOCAL_MIX_DATABASE_FILENAME),
      bytes: lmd.bytes,
    })
    return {
      entries: next,
      summary: {
        fileNameCount: lmd.fileNameCount,
        replacedExisting,
        skippedByHashMismatch,
      },
    }
  }
}
