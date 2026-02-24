import JSZip from 'jszip'
import sevenZipWasmUrl from '7z-wasm/7zz.wasm?url'
import { FileSystemUtil } from './FileSystemUtil'
import { isMixLikeFile, isStandaloneIniLikeFile, normalizeResourceFilename } from './patterns'
import { GAME_RES_IMPORT_STAGE_LABELS } from './types'
import type { GameResImportProgressEvent, GameResImportResult, ResourceBucket } from './types'

export interface ImportOptions {
  modName?: string | null
  onProgress?: (message: string) => void
  onProgressEvent?: (event: GameResImportProgressEvent) => void
}

function createResult(): GameResImportResult {
  return {
    imported: 0,
    skipped: 0,
    errors: [],
    importedNames: [],
  }
}

function shouldImport(name: string): boolean {
  return isMixLikeFile(name) || isStandaloneIniLikeFile(name)
}

function toPercent(processed: number, total: number): number | undefined {
  if (total <= 0) return undefined
  const percent = Math.round((processed / total) * 100)
  return Math.max(0, Math.min(100, percent))
}

function emitProgress(
  options: ImportOptions,
  event: Omit<GameResImportProgressEvent, 'stageLabel'>,
): void {
  const fullEvent: GameResImportProgressEvent = {
    stageLabel: GAME_RES_IMPORT_STAGE_LABELS[event.stage],
    ...event,
  }
  options.onProgressEvent?.(fullEvent)
  options.onProgress?.(fullEvent.message)
}

function walkEmFsFiles(fs: any, dir: string, output: string[]): void {
  let entries: string[]
  try {
    entries = fs.readdir(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry === '.' || entry === '..') continue
    const full = dir === '/' ? `/${entry}` : `${dir}/${entry}`
    try {
      const stat = fs.stat(full)
      if (fs.isDir(stat.mode)) {
        walkEmFsFiles(fs, full, output)
      } else {
        output.push(full)
      }
    } catch {
      // ignore unreadable paths in emscripten FS
    }
  }
}

async function walkDirectoryFiles(
  dirHandle: any,
  output: Array<{ entryName: string; file: File }>,
  prefix: string = '',
): Promise<void> {
  for await (const [entryName, handle] of dirHandle.entries()) {
    const fullName = prefix ? `${prefix}/${entryName}` : entryName
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      output.push({ entryName: fullName, file })
      continue
    }
    if (handle.kind === 'directory') {
      await walkDirectoryFiles(handle, output, fullName)
    }
  }
}

type DedupableImportEntry = {
  normalizedName: string
  sourcePath: string
}

function dedupeFlattenedEntries<T extends DedupableImportEntry>(
  entries: T[],
  result: GameResImportResult,
  options: ImportOptions,
): T[] {
  const deduped: T[] = []
  const seenByName = new Map<string, string>()
  for (const entry of entries) {
    const key = entry.normalizedName.toLowerCase()
    const conflictWith = seenByName.get(key)
    if (!conflictWith) {
      seenByName.set(key, entry.sourcePath)
      deduped.push(entry)
      continue
    }
    result.skipped++
    const conflictMessage = `${entry.normalizedName}: 路径扁平化后文件名冲突，已跳过 (${entry.sourcePath} 与 ${conflictWith} 冲突)`
    result.errors.push(conflictMessage)
    emitProgress(options, {
      stage: 'import',
      message: `已跳过重名文件 ${entry.normalizedName}`,
      currentItem: entry.normalizedName,
      importedCount: result.imported,
      skippedCount: result.skipped,
      totalCount: entries.length,
      errorMessage: conflictMessage,
    })
  }
  return deduped
}

interface ImportProgressMeta {
  currentIndex: number
  totalCount: number
}

async function importFrom7zArchive(
  archiveFile: File,
  bucket: ResourceBucket,
  options: ImportOptions,
): Promise<GameResImportResult> {
  const result = createResult()
  try {
    emitProgress(options, {
      stage: 'load_archive',
      message: `正在加载 7z 引擎并读取归档 ${archiveFile.name}...`,
      currentItem: archiveFile.name,
    })

    const sevenZipWasmModule = await import('7z-wasm')
    const sevenZipFactory = sevenZipWasmModule.default as any
    const sevenZip = await sevenZipFactory({
      locateFile: (path: string) => {
        if (path === '7zz.wasm') return sevenZipWasmUrl
        return path
      },
      print: () => undefined,
      printErr: () => undefined,
    })

    const archiveName = normalizeResourceFilename(archiveFile.name) || 'archive.7z'
    const bytes = new Uint8Array(await archiveFile.arrayBuffer())
    const stream = sevenZip.FS.open(archiveName, 'w+')
    sevenZip.FS.write(stream, bytes, 0, bytes.length, 0, true)
    sevenZip.FS.close(stream)

    emitProgress(options, {
      stage: 'extract',
      message: `正在解压归档 ${archiveFile.name}...`,
      currentItem: archiveFile.name,
    })

    sevenZip.callMain(['x', '-ssc-', '-aoa', archiveName])

    const extractedFiles: string[] = []
    walkEmFsFiles(sevenZip.FS, '/', extractedFiles)

    const archiveNameKey = archiveName.toLowerCase()
    const extractedEntries = extractedFiles
      .map((entryPath) => ({
        sourcePath: entryPath,
        normalizedName: normalizeResourceFilename(entryPath),
      }))
      .filter((entry): entry is { sourcePath: string; normalizedName: string } => (
        !!entry.normalizedName && entry.normalizedName.toLowerCase() !== archiveNameKey
      ))

    const importableCandidates = extractedEntries.filter((entry) => shouldImport(entry.normalizedName))
    result.skipped += extractedEntries.length - importableCandidates.length
    const importableEntries = dedupeFlattenedEntries(importableCandidates, result, options)

    for (let i = 0; i < importableEntries.length; i++) {
      const entry = importableEntries[i]
      emitProgress(options, {
        stage: 'extract',
        message: `正在解析归档条目 ${entry.normalizedName}...`,
        currentItem: entry.normalizedName,
        percentage: toPercent(i + 1, importableEntries.length),
      })

      try {
        const entryData = sevenZip.FS.readFile(entry.sourcePath)
        const imported = new File([entryData], entry.normalizedName)
        await importOneFile(imported, bucket, options, result, entry.normalizedName, {
          currentIndex: i + 1,
          totalCount: importableEntries.length,
        })
      } catch (e: any) {
        const errMsg = e?.message ?? String(e)
        result.errors.push(`${entry.normalizedName}: ${errMsg}`)
        emitProgress(options, {
          stage: 'import',
          message: `导入 ${entry.normalizedName} 失败`,
          currentItem: entry.normalizedName,
          percentage: toPercent(i + 1, importableEntries.length),
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: importableEntries.length,
          errorMessage: errMsg,
        })
      }
    }

    try {
      sevenZip.FS.unlink(archiveName)
    } catch {
      // ignore cleanup failures
    }

    emitProgress(options, {
      stage: 'finalize',
      message: `归档导入收尾：成功 ${result.imported}，跳过 ${result.skipped}`,
      importedCount: result.imported,
      skippedCount: result.skipped,
      totalCount: importableEntries.length,
      percentage: 100,
    })

    if (result.errors.length > 0) {
      emitProgress(options, {
        stage: 'error',
        message: `归档导入完成，但有 ${result.errors.length} 个错误`,
        errorMessage: result.errors[0],
        importedCount: result.imported,
        skippedCount: result.skipped,
        totalCount: importableEntries.length,
      })
    } else {
      emitProgress(options, {
        stage: 'done',
        message: `归档导入完成：成功 ${result.imported}，跳过 ${result.skipped}`,
        importedCount: result.imported,
        skippedCount: result.skipped,
        totalCount: importableEntries.length,
        percentage: 100,
      })
    }

    return result
  } catch (e: any) {
    const errMsg = e?.message ?? String(e)
    result.errors.push(`${archiveFile.name}: 7z 解压失败 (${errMsg})`)
    emitProgress(options, {
      stage: 'error',
      message: `7z 归档解析失败：${archiveFile.name}`,
      currentItem: archiveFile.name,
      errorMessage: errMsg,
    })
    return result
  }
}

async function importOneFile(
  sourceFile: File,
  bucket: ResourceBucket,
  options: ImportOptions,
  result: GameResImportResult,
  forceName?: string,
  progressMeta?: ImportProgressMeta,
): Promise<void> {
  const normalized = normalizeResourceFilename(forceName ?? sourceFile.name)
  const totalCount = progressMeta?.totalCount ?? 0
  const currentIndex = progressMeta?.currentIndex ?? 0

  if (progressMeta) {
    emitProgress(options, {
      stage: 'import',
      message: `正在导入 ${normalized}（${currentIndex}/${totalCount}）`,
      currentItem: normalized,
      percentage: toPercent(currentIndex - 1, totalCount),
      importedCount: result.imported,
      skippedCount: result.skipped,
      totalCount,
    })
  }

  if (!shouldImport(normalized)) {
    result.skipped++
    if (progressMeta) {
      emitProgress(options, {
        stage: 'import',
        message: `已跳过 ${normalized}`,
        currentItem: normalized,
        percentage: toPercent(currentIndex, totalCount),
        importedCount: result.imported,
        skippedCount: result.skipped,
        totalCount,
      })
    }
    return
  }

  if (isMixLikeFile(normalized) && sourceFile.size === 0) {
    result.skipped++
    emitProgress(options, {
      stage: 'import',
      message: `已跳过空 MIX ${normalized}`,
      currentItem: normalized,
      percentage: toPercent(currentIndex || result.imported + result.skipped, totalCount),
      importedCount: result.imported,
      skippedCount: result.skipped,
      totalCount: totalCount || result.imported + result.skipped,
    })
    return
  }

  try {
    await FileSystemUtil.writeImportedFile(bucket, sourceFile, options.modName ?? null, normalized)
    result.imported++
    result.importedNames.push(normalized)
    emitProgress(options, {
      stage: 'import',
      message: `已导入 ${normalized}`,
      currentItem: normalized,
      percentage: toPercent(currentIndex || result.imported + result.skipped, totalCount),
      importedCount: result.imported,
      skippedCount: result.skipped,
      totalCount: totalCount || result.imported + result.skipped,
    })
  } catch (e: any) {
    const errMsg = e?.message ?? String(e)
    result.errors.push(`${normalized}: ${errMsg}`)
    emitProgress(options, {
      stage: 'import',
      message: `导入 ${normalized} 失败`,
      currentItem: normalized,
      percentage: toPercent(currentIndex || result.imported + result.skipped, totalCount),
      importedCount: result.imported,
      skippedCount: result.skipped,
      totalCount: totalCount || result.imported + result.skipped,
      errorMessage: errMsg,
    })
  }
}

export class GameResImporter {
  static async importDirectory(
    dirHandle: any,
    bucket: ResourceBucket,
    options: ImportOptions = {},
  ): Promise<GameResImportResult> {
    const result = createResult()
    try {
      emitProgress(options, {
        stage: 'prepare',
        message: '准备导入目录资源...',
      })
      emitProgress(options, {
        stage: 'load_archive',
        message: '正在扫描目录条目...',
      })

      const fileEntries: Array<{ entryName: string; file: File }> = []
      await walkDirectoryFiles(dirHandle, fileEntries)

      emitProgress(options, {
        stage: 'extract',
        message: '目录导入无需解压，跳过解压步骤',
      })

      const importableCandidates = fileEntries
        .map((entry) => ({
          ...entry,
          sourcePath: entry.entryName,
          normalizedName: normalizeResourceFilename(entry.entryName),
        }))
        .filter((entry) => shouldImport(entry.normalizedName))
      result.skipped += fileEntries.length - importableCandidates.length
      const importableEntries = dedupeFlattenedEntries(importableCandidates, result, options)

      for (let i = 0; i < importableEntries.length; i++) {
        const entry = importableEntries[i]
        await importOneFile(entry.file, bucket, options, result, entry.normalizedName, {
          currentIndex: i + 1,
          totalCount: importableEntries.length,
        })
      }

      emitProgress(options, {
        stage: 'finalize',
        message: `目录导入收尾：成功 ${result.imported}，跳过 ${result.skipped}`,
        importedCount: result.imported,
        skippedCount: result.skipped,
        totalCount: importableEntries.length,
        percentage: 100,
      })

      if (result.errors.length > 0) {
        emitProgress(options, {
          stage: 'error',
          message: `目录导入完成，但有 ${result.errors.length} 个错误`,
          errorMessage: result.errors[0],
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: importableEntries.length,
        })
      } else {
        emitProgress(options, {
          stage: 'done',
          message: `目录导入完成：成功 ${result.imported}，跳过 ${result.skipped}`,
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: importableEntries.length,
          percentage: 100,
        })
      }
    } catch (e: any) {
      const errMsg = e?.message ?? String(e)
      result.errors.push(`目录导入失败: ${errMsg}`)
      emitProgress(options, {
        stage: 'error',
        message: '目录导入失败',
        errorMessage: errMsg,
      })
    }
    return result
  }

  static async importFiles(
    files: File[],
    bucket: ResourceBucket,
    options: ImportOptions = {},
  ): Promise<GameResImportResult> {
    const result = createResult()
    try {
      emitProgress(options, {
        stage: 'prepare',
        message: '准备导入文件列表...',
      })
      emitProgress(options, {
        stage: 'load_archive',
        message: '读取文件列表...',
      })
      emitProgress(options, {
        stage: 'extract',
        message: '文件导入无需解压，跳过解压步骤',
      })

      const importableCandidates = files
        .map((file) => ({
          file,
          sourcePath: file.name,
          normalizedName: normalizeResourceFilename(file.name),
        }))
        .filter((entry) => shouldImport(entry.normalizedName))
      result.skipped += files.length - importableCandidates.length
      const importableFiles = dedupeFlattenedEntries(importableCandidates, result, options)

      for (let i = 0; i < importableFiles.length; i++) {
        const file = importableFiles[i]
        await importOneFile(file.file, bucket, options, result, file.normalizedName, {
          currentIndex: i + 1,
          totalCount: importableFiles.length,
        })
      }

      emitProgress(options, {
        stage: 'finalize',
        message: `文件导入收尾：成功 ${result.imported}，跳过 ${result.skipped}`,
        importedCount: result.imported,
        skippedCount: result.skipped,
        totalCount: importableFiles.length,
        percentage: 100,
      })

      if (result.errors.length > 0) {
        emitProgress(options, {
          stage: 'error',
          message: `文件导入完成，但有 ${result.errors.length} 个错误`,
          errorMessage: result.errors[0],
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: importableFiles.length,
        })
      } else {
        emitProgress(options, {
          stage: 'done',
          message: `文件导入完成：成功 ${result.imported}，跳过 ${result.skipped}`,
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: importableFiles.length,
          percentage: 100,
        })
      }
    } catch (e: any) {
      const errMsg = e?.message ?? String(e)
      result.errors.push(`文件导入失败: ${errMsg}`)
      emitProgress(options, {
        stage: 'error',
        message: '文件导入失败',
        errorMessage: errMsg,
      })
    }
    return result
  }

  static async importArchive(
    archiveFile: File,
    bucket: ResourceBucket,
    options: ImportOptions = {},
  ): Promise<GameResImportResult> {
    const result = createResult()
    try {
      const lowerName = archiveFile.name.toLowerCase()
      emitProgress(options, {
        stage: 'prepare',
        message: `准备导入归档 ${archiveFile.name}...`,
        currentItem: archiveFile.name,
      })

      if (isMixLikeFile(lowerName) || isStandaloneIniLikeFile(lowerName)) {
        emitProgress(options, {
          stage: 'load_archive',
          message: '检测到单文件资源，跳过归档加载',
          currentItem: archiveFile.name,
        })
        emitProgress(options, {
          stage: 'extract',
          message: '单文件导入无需解压',
          currentItem: archiveFile.name,
        })
        await importOneFile(archiveFile, bucket, options, result, undefined, {
          currentIndex: 1,
          totalCount: 1,
        })
        emitProgress(options, {
          stage: 'finalize',
          message: `单文件导入收尾：成功 ${result.imported}，跳过 ${result.skipped}`,
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: 1,
          percentage: 100,
        })
        if (result.errors.length > 0) {
          emitProgress(options, {
            stage: 'error',
            message: `单文件导入完成，但有 ${result.errors.length} 个错误`,
            errorMessage: result.errors[0],
            importedCount: result.imported,
            skippedCount: result.skipped,
            totalCount: 1,
          })
        } else {
          emitProgress(options, {
            stage: 'done',
            message: `单文件导入完成：成功 ${result.imported}，跳过 ${result.skipped}`,
            importedCount: result.imported,
            skippedCount: result.skipped,
            totalCount: 1,
            percentage: 100,
          })
        }
        return result
      }

      if (
        lowerName.endsWith('.7z')
        || lowerName.endsWith('.exe')
        || lowerName.endsWith('.tar.gz')
        || lowerName.endsWith('.tgz')
      ) {
        return importFrom7zArchive(archiveFile, bucket, options)
      }

      if (!lowerName.endsWith('.zip')) {
        const message = `${archiveFile.name}: 不支持的归档格式，仅支持 .zip/.7z/.exe/.tar.gz/.mix`
        result.errors.push(message)
        emitProgress(options, {
          stage: 'error',
          message,
          currentItem: archiveFile.name,
          errorMessage: message,
        })
        return result
      }

      emitProgress(options, {
        stage: 'load_archive',
        message: `正在加载 ZIP 归档 ${archiveFile.name}...`,
        currentItem: archiveFile.name,
      })
      const zip = await JSZip.loadAsync(await archiveFile.arrayBuffer())
      const entries = Object.values(zip.files).filter((entry) => !entry.dir)
      const importableCandidates = entries
        .map((entry) => ({
          entry,
          sourcePath: entry.name,
          normalizedName: normalizeResourceFilename(entry.name),
        }))
        .filter((entry) => shouldImport(entry.normalizedName))
      result.skipped += entries.length - importableCandidates.length
      const importableEntries = dedupeFlattenedEntries(importableCandidates, result, options)

      for (let i = 0; i < importableEntries.length; i++) {
        const entry = importableEntries[i]
        const normalized = entry.normalizedName
        emitProgress(options, {
          stage: 'extract',
          message: `正在解压 ${normalized}...`,
          currentItem: normalized,
          percentage: toPercent(i + 1, importableEntries.length),
        })
        try {
          const blob = await entry.entry.async('blob')
          const importedFile = new File([blob], normalized)
          await importOneFile(importedFile, bucket, options, result, normalized, {
            currentIndex: i + 1,
            totalCount: importableEntries.length,
          })
        } catch (e: any) {
          const errMsg = e?.message ?? String(e)
          result.errors.push(`${normalized}: ${errMsg}`)
          emitProgress(options, {
            stage: 'import',
            message: `导入 ${normalized} 失败`,
            currentItem: normalized,
            percentage: toPercent(i + 1, importableEntries.length),
            importedCount: result.imported,
            skippedCount: result.skipped,
            totalCount: importableEntries.length,
            errorMessage: errMsg,
          })
        }
      }

      emitProgress(options, {
        stage: 'finalize',
        message: `归档导入收尾：成功 ${result.imported}，跳过 ${result.skipped}`,
        importedCount: result.imported,
        skippedCount: result.skipped,
        totalCount: importableEntries.length,
        percentage: 100,
      })

      if (result.errors.length > 0) {
        emitProgress(options, {
          stage: 'error',
          message: `归档导入完成，但有 ${result.errors.length} 个错误`,
          errorMessage: result.errors[0],
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: importableEntries.length,
        })
      } else {
        emitProgress(options, {
          stage: 'done',
          message: `归档导入完成：成功 ${result.imported}，跳过 ${result.skipped}`,
          importedCount: result.imported,
          skippedCount: result.skipped,
          totalCount: importableEntries.length,
          percentage: 100,
        })
      }
      return result
    } catch (e: any) {
      const errMsg = e?.message ?? String(e)
      result.errors.push(`${archiveFile.name}: ${errMsg}`)
      emitProgress(options, {
        stage: 'error',
        message: `归档导入失败：${archiveFile.name}`,
        currentItem: archiveFile.name,
        errorMessage: errMsg,
      })
      return result
    }
  }
}
