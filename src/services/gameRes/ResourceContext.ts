import { VirtualFileSystem, type VfsArchive } from '../../data/vfs/VirtualFileSystem'
import type { MixFileInfo } from '../MixParser'
import { MixParser } from '../MixParser'
import { FileSystemUtil } from './FileSystemUtil'
import { GameResConfig } from './GameResConfig'
import { getArchivePriority, isMixLikeFile, isStandaloneIniLikeFile } from './patterns'
import type { ImportedResourceFile, ResourceBucket, ResourceReadiness } from './types'

export type ResourceLoadProgressPhase =
  | 'scan'
  | 'read'
  | 'parse'
  | 'loaded'
  | 'finalize'
  | 'done'
  | 'skip'

export interface ResourceLoadProgressEvent {
  phase: ResourceLoadProgressPhase
  itemName?: string
  itemKind?: 'archive' | 'standalone'
  loadedCount: number
  totalCount: number
}

export interface ResourceMixFile {
  bucket: ResourceBucket
  priority: number
  modName?: string
  file: File
  info: MixFileInfo
}

export interface ResourceStandaloneFile {
  bucket: ResourceBucket
  priority: number
  modName?: string
  filename: string
  file: File
}

export class ResourceContext {
  public readonly activeProjectName: string | null
  public readonly importedFiles: ImportedResourceFile[]
  public readonly archives: ResourceMixFile[]
  public readonly standaloneFiles: ResourceStandaloneFile[]
  public readonly discoveredPalettePaths: string[]
  public readonly vfs: VirtualFileSystem
  public readonly readiness: ResourceReadiness
  private readonly discoveredPalettePathSet: Set<string>
  private nestedPaletteWarmupPromise: Promise<void> | null = null

  constructor(args: {
    activeProjectName: string | null
    importedFiles: ImportedResourceFile[]
    archives: ResourceMixFile[]
    standaloneFiles: ResourceStandaloneFile[]
    discoveredPalettePaths: string[]
  }) {
    this.activeProjectName = args.activeProjectName
    this.importedFiles = args.importedFiles
    this.archives = [...args.archives].sort((a, b) => b.priority - a.priority)
    this.standaloneFiles = [...args.standaloneFiles].sort((a, b) => b.priority - a.priority)
    this.discoveredPalettePaths = [...args.discoveredPalettePaths]
    this.discoveredPalettePathSet = new Set(this.discoveredPalettePaths.map((path) => path.toLowerCase()))
    this.readiness = GameResConfig.checkReadiness(this.importedFiles)

    const vfsArchives: VfsArchive[] = this.archives.map((item) => ({
      name: item.info.name,
      file: item.file,
      info: item.info,
      priority: item.priority,
    }))
    this.vfs = new VirtualFileSystem(
      vfsArchives,
      this.standaloneFiles.map((item) => ({
        filename: item.filename,
        file: item.file,
        priority: item.priority,
      })),
    )
    this.ensureNestedPaletteWarmup()
  }

  private static async discoverPalettePaths(archives: ResourceMixFile[]): Promise<string[]> {
    const result = new Set<string>()
    const sortedArchives = [...archives].sort((a, b) => b.priority - a.priority)

    for (const archive of sortedArchives) {
      const rootPath = archive.info.name

      for (const entry of archive.info.files) {
        if (entry.extension.toLowerCase() !== 'pal') continue
        result.add(`${rootPath}/${entry.filename}`)
      }
    }

    return [...result]
  }

  private ensureNestedPaletteWarmup(): void {
    if (this.nestedPaletteWarmupPromise) return
    this.nestedPaletteWarmupPromise = this.warmNestedPalettePaths()
      .catch(() => undefined)
      .finally(() => {
        this.nestedPaletteWarmupPromise = null
      })
  }

  private async warmNestedPalettePaths(): Promise<void> {
    const mixLikeExts = new Set(['mix', 'mmx', 'yro'])
    for (const archive of this.archives) {
      const rootPath = archive.info.name
      for (const entry of archive.info.files) {
        if (!mixLikeExts.has(entry.extension.toLowerCase())) continue
        const nestedContainerPath = `${rootPath}/${entry.filename}`
        try {
          const nestedVf = await MixParser.extractFile(archive.file, entry.filename)
          if (!nestedVf) continue
          const nestedInfo = await MixParser.parseVirtualFile(nestedVf, entry.filename)
          for (const nestedEntry of nestedInfo.files) {
            if (nestedEntry.extension.toLowerCase() !== 'pal') continue
            this.addPalettePath(`${nestedContainerPath}/${nestedEntry.filename}`)
          }
        } catch {
          // Ignore unreadable nested MIX while keeping other palettes available.
        }
      }
    }
  }

  private addPalettePath(path: string): void {
    const key = path.toLowerCase()
    if (this.discoveredPalettePathSet.has(key)) return
    this.discoveredPalettePathSet.add(key)
    this.discoveredPalettePaths.push(path)
  }

  static async load(
    activeProjectName: string | null,
    onProgress?: (event: ResourceLoadProgressEvent) => void,
  ): Promise<ResourceContext> {
    const importedFiles = await FileSystemUtil.listAllImportedFiles(activeProjectName)
    const archives: ResourceMixFile[] = []
    const standaloneFiles: ResourceStandaloneFile[] = []
    const totalCount = importedFiles.length
    let loadedCount = 0
    onProgress?.({
      phase: 'scan',
      loadedCount,
      totalCount,
    })
    for (const item of importedFiles) {
      onProgress?.({
        phase: 'read',
        itemName: item.name,
        loadedCount,
        totalCount,
      })
      const file = await FileSystemUtil.readImportedFile(item.bucket, item.name, item.modName ?? null)
      if (isMixLikeFile(item.name)) {
        onProgress?.({
          phase: 'parse',
          itemName: item.name,
          loadedCount,
          totalCount,
        })
        let info: MixFileInfo
        try {
          info = await MixParser.parseFile(file)
        } catch (e: any) {
          onProgress?.({
            phase: 'skip',
            itemName: item.name,
            loadedCount,
            totalCount,
          })
          continue
        }
        archives.push({
          bucket: item.bucket,
          priority: getArchivePriority(item.name, item.bucket),
          modName: item.modName,
          file,
          info: {
            ...info,
            name: item.name,
          },
        })
        loadedCount++
        onProgress?.({
          phase: 'loaded',
          itemName: item.name,
          itemKind: 'archive',
          loadedCount,
          totalCount,
        })
      } else if (isStandaloneIniLikeFile(item.name)) {
        standaloneFiles.push({
          bucket: item.bucket,
          priority: getArchivePriority(item.name, item.bucket),
          modName: item.modName,
          filename: item.name,
          file,
        })
        loadedCount++
        onProgress?.({
          phase: 'loaded',
          itemName: item.name,
          itemKind: 'standalone',
          loadedCount,
          totalCount,
        })
      } else {
        onProgress?.({
          phase: 'skip',
          itemName: item.name,
          loadedCount,
          totalCount,
        })
      }
    }
    onProgress?.({
      phase: 'finalize',
      loadedCount,
      totalCount,
    })
    const discoveredPalettePaths = await this.discoverPalettePaths(archives)
    onProgress?.({
      phase: 'done',
      loadedCount,
      totalCount,
    })
    return new ResourceContext({
      activeProjectName,
      importedFiles,
      archives,
      standaloneFiles,
      discoveredPalettePaths,
    })
  }

  toMixFileData(): Array<{ file: File; info: MixFileInfo }> {
    return this.archives.map((a) => ({ file: a.file, info: a.info }))
  }

  async resolveFileFromOverlay(filename: string) {
    return this.vfs.openFile(filename)
  }

  listAllPalettePaths(): string[] {
    return [...this.discoveredPalettePaths]
  }

  resolvePalettePathByName(filename: string): string | null {
    const lower = filename.toLowerCase()
    const nested = this.discoveredPalettePaths.find((path) => {
      const base = path.split('/').pop() ?? path
      return base.toLowerCase() === lower
    })
    if (nested) return nested
    const owner = this.vfs.resolveOwner(filename)
    if (!owner) return null
    return `${owner.name}/${filename}`
  }
}
