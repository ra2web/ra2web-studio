import type { MixFile } from '../MixFile'
import type { MixFileInfo } from '../../services/MixParser'
import { MixParser } from '../../services/MixParser'
import { VirtualFile } from './VirtualFile'

export interface VfsArchive {
  name: string
  file: File
  info: MixFileInfo
  priority: number
}

export interface VfsStandaloneFile {
  filename: string
  file: File
  priority: number
}

type NestedMixArchive = {
  archive: VfsArchive
  name: string
  mix: MixFile
  info: MixFileInfo
}

function isMixContainerName(filename: string, extension?: string): boolean {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.mix') || lower.endsWith('.mmx') || lower.endsWith('.yro')) return true
  const ext = (extension ?? '').toLowerCase()
  return ext === 'mix' || ext === 'mmx' || ext === 'yro'
}

/** Prefer YR/md nested mixes over vanilla when both live in the same parent archive. */
function nestedMixPriority(filename: string): number {
  return filename.toLowerCase().includes('md') ? 1 : 0
}

export class VirtualFileSystem {
  private archivesByPriority: VfsArchive[] = []
  private standaloneByPriority: VfsStandaloneFile[] = []
  private fileOwnersCache = new Map<string, VfsArchive[]>()
  private nestedMixes: NestedMixArchive[] = []
  private nestedLoad: Promise<void> | null = null

  constructor(archives: VfsArchive[] = [], standaloneFiles: VfsStandaloneFile[] = []) {
    this.resetArchives(archives, standaloneFiles)
  }

  resetArchives(archives: VfsArchive[], standaloneFiles: VfsStandaloneFile[] = []): void {
    this.archivesByPriority = [...archives].sort((a, b) => b.priority - a.priority)
    this.standaloneByPriority = [...standaloneFiles].sort((a, b) => b.priority - a.priority)
    this.fileOwnersCache.clear()
    this.nestedMixes = []
    this.nestedLoad = null
  }

  listArchives(): VfsArchive[] {
    return [...this.archivesByPriority]
  }

  /**
   * RA2 theater TMP / INI / palettes live in nested mixes (isotemp.mix, temperat.mix)
   * inside ra2.mix. Index them once so openFile('clear01.tem') works like the game VFS.
   */
  ensureNestedMixes(): Promise<void> {
    if (!this.nestedLoad) this.nestedLoad = this.loadNestedMixes()
    return this.nestedLoad
  }

  listNestedFilePaths(extension: string): string[] {
    const ext = extension.toLowerCase()
    const result: string[] = []
    for (const nested of this.nestedMixes) {
      for (const entry of nested.info.files) {
        if (entry.extension.toLowerCase() !== ext) continue
        result.push(`${nested.archive.name}/${nested.name}/${entry.filename}`)
      }
    }
    return result
  }

  private async loadNestedMixes(): Promise<void> {
    for (const archive of this.archivesByPriority) {
      const nestedEntries = archive.info.files
        .filter((entry) => isMixContainerName(entry.filename, entry.extension))
        .sort((a, b) => nestedMixPriority(b.filename) - nestedMixPriority(a.filename))
      for (const entry of nestedEntries) {
        try {
          const vf = await MixParser.extractFile(archive.file, entry.filename)
          if (!vf) continue
          const loaded = await MixParser.loadMixFromVirtualFile(vf, entry.filename)
          if (!loaded || loaded.info.files.length === 0) continue
          this.nestedMixes.push({
            archive,
            name: entry.filename,
            mix: loaded.mix,
            info: loaded.info,
          })
        } catch {
          // Skip unreadable nested MIX (placeholder movies, truncated headers).
        }
      }
    }
  }

  private getOwners(filename: string): VfsArchive[] {
    const key = filename.toLowerCase()
    const cached = this.fileOwnersCache.get(key)
    if (cached) return cached
    const result = this.archivesByPriority.filter((archive) =>
      archive.info.files.some((entry) => entry.filename.toLowerCase() === key),
    )
    this.fileOwnersCache.set(key, result)
    return result
  }

  containsFile(filename: string): boolean {
    if (this.getOwners(filename).length > 0) return true
    const key = filename.toLowerCase()
    if (this.standaloneByPriority.some((f) => f.filename.toLowerCase() === key)) return true
    return this.nestedMixes.some((nested) => nested.mix.containsFile(filename))
  }

  resolveOwner(filename: string): VfsArchive | null {
    const owners = this.getOwners(filename)
    if (owners.length) return owners[0]
    const nested = this.nestedMixes.find((item) => item.mix.containsFile(filename))
    return nested?.archive ?? null
  }

  async openFile(filename: string): Promise<VirtualFile | null> {
    const owners = this.getOwners(filename)
    for (const owner of owners) {
      const vf = await MixParser.extractFile(owner.file, filename)
      if (vf) return vf
    }
    const key = filename.toLowerCase()
    for (const standalone of this.standaloneByPriority) {
      if (standalone.filename.toLowerCase() !== key) continue
      return VirtualFile.fromRealFile(standalone.file)
    }
    await this.ensureNestedMixes()
    for (const nested of this.nestedMixes) {
      if (!nested.mix.containsFile(filename)) continue
      return nested.mix.openFile(filename)
    }
    return null
  }

  listOverlayFiles(): string[] {
    const all = new Set<string>()
    for (const archive of this.archivesByPriority) {
      for (const entry of archive.info.files) {
        const lower = entry.filename.toLowerCase()
        if (!all.has(lower)) all.add(lower)
      }
    }
    for (const standalone of this.standaloneByPriority) {
      const lower = standalone.filename.toLowerCase()
      if (!all.has(lower)) all.add(lower)
    }
    for (const nested of this.nestedMixes) {
      for (const entry of nested.info.files) {
        const lower = entry.filename.toLowerCase()
        if (!all.has(lower)) all.add(lower)
      }
    }
    return [...all].sort((a, b) => a.localeCompare(b))
  }
}
