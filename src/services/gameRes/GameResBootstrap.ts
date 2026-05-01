import { FileSystemUtil } from './FileSystemUtil'
import { GameResConfig } from './GameResConfig'
import { GameResImporter, type ImportOptions } from './GameResImporter'
import { ResourceContext, type ResourceLoadProgressEvent } from './ResourceContext'
import type { GameResImportProgressEvent, GameResImportResult } from './types'

export class GameResBootstrap {
  private static isArchiveSource(filename: string): boolean {
    const lower = filename.toLowerCase()
    return (
      lower.endsWith('.zip')
      || lower.endsWith('.7z')
      || lower.endsWith('.exe')
      || lower.endsWith('.tgz')
      || lower.endsWith('.tar.gz')
    )
  }

  static loadConfig() {
    return GameResConfig.load()
  }

  static async loadContext(
    activeProjectName: string | null,
    onProgress?: (event: ResourceLoadProgressEvent) => void,
  ): Promise<ResourceContext> {
    return ResourceContext.load(activeProjectName, onProgress)
  }

  static async reimportBaseFromDirectory(
    dirHandle: any,
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    await FileSystemUtil.clearBucket('base')
    const options: ImportOptions = { onProgress, onProgressEvent, modName: null }
    const result = await GameResImporter.importDirectory(dirHandle, 'base', options)
    if (result.imported > 0) {
      GameResConfig.markImported(null)
    }
    return result
  }

  static async reimportBaseFromArchives(
    archiveFiles: File[],
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    const merged: GameResImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      importedNames: [],
    }
    if (!archiveFiles.length) return merged

    await FileSystemUtil.clearBucket('base')
    for (const archiveFile of archiveFiles) {
      const options: ImportOptions = { onProgress, onProgressEvent, modName: null }
      const result = await GameResImporter.importArchive(archiveFile, 'base', options)
      merged.imported += result.imported
      merged.skipped += result.skipped
      merged.errors.push(...result.errors)
      merged.importedNames.push(...result.importedNames)
    }
    if (merged.imported > 0) {
      GameResConfig.markImported(null)
    }
    return merged
  }

  static async reimportBaseFromOnlineArchive(
    archiveUrl: URL,
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    const options: ImportOptions = { onProgress, onProgressEvent, modName: null }
    const archiveFile = await GameResImporter.downloadArchiveFromUrl(archiveUrl, options)
    await FileSystemUtil.clearBucket('base')
    const result = await GameResImporter.importArchive(archiveFile, 'base', options)
    if (result.imported > 0) {
      GameResConfig.markImported(null)
    }
    return result
  }

  static async importPatchFiles(
    files: File[],
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    return GameResImporter.importFiles(files, 'patch', { onProgress, onProgressEvent, modName: null })
  }

  static async importProjectFiles(
    files: File[],
    projectName: string,
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    const merged: GameResImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      importedNames: [],
    }
    for (const file of files) {
      const options: ImportOptions = {
        onProgress,
        onProgressEvent,
        modName: projectName,
        preservePaths: true,
        allowAllFiles: true,
      }
      const result = this.isArchiveSource(file.name)
        ? await GameResImporter.importArchive(file, 'mod', options)
        : await GameResImporter.importFiles([file], 'mod', options)
      merged.imported += result.imported
      merged.skipped += result.skipped
      merged.errors.push(...result.errors)
      merged.importedNames.push(...result.importedNames)
    }
    return merged
  }

  static async importProjectDirectory(
    dirHandle: any,
    projectName: string,
    onProgress?: (message: string) => void,
    onProgressEvent?: (event: GameResImportProgressEvent) => void,
  ): Promise<GameResImportResult> {
    return GameResImporter.importDirectory(dirHandle, 'mod', {
      onProgress,
      onProgressEvent,
      modName: projectName,
      preservePaths: true,
      allowAllFiles: true,
    })
  }

  static async clearNonBaseResources(activeProjectName: string | null): Promise<void> {
    await FileSystemUtil.clearBucket('patch')
    if (activeProjectName) {
      await FileSystemUtil.clearBucket('mod', activeProjectName)
    }
  }
}
