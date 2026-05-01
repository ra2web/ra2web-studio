import JSZip from 'jszip'
import sevenZipWasmUrl from '7z-wasm/7zz.wasm?url'
import { FileSystemUtil } from './FileSystemUtil'
import {
  isMixLikeFile,
  isStandaloneIniLikeFile,
  normalizeResourceFilename,
  normalizeResourcePath,
} from './patterns'
import { GAME_RES_IMPORT_STAGE_LABELS } from './types'
import type { GameResImportProgressEvent, GameResImportResult, ResourceBucket } from './types'

export interface ImportOptions {
  modName?: string | null
  onProgress?: (message: string) => void
  onProgressEvent?: (event: GameResImportProgressEvent) => void
  preservePaths?: boolean
  allowAllFiles?: boolean
}

function createResult(): GameResImportResult {
  return {
    imported: 0,
    skipped: 0,
    errors: [],
    importedNames: [],
  }
}

function normalizeImportedEntryName(name: string, options: ImportOptions): string {
  return options.preservePaths ? normalizeResourcePath(name) : normalizeResourceFilename(name)
}

function shouldImport(name: string, options: ImportOptions): boolean {
  if (options.allowAllFiles) return true
  return isMixLikeFile(name) || isStandaloneIniLikeFile(name)
}

function toPercent(processed: number, total: number): number | undefined {
  if (total <= 0) return undefined
  const percent = Math.round((processed / total) * 100)
  return Math.max(0, Math.min(100, percent))
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function formatBytes(byteCount: number): string {
  if (!Number.isFinite(byteCount) || byteCount <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = byteCount
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unitIndex]}`
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

function stripHeaderQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function decodeHeaderFilename(value: string): string {
  const unquoted = stripHeaderQuotes(value)
  const encodedPart = unquoted.includes("''") ? unquoted.split("''").slice(1).join("''") : unquoted
  try {
    return decodeURIComponent(encodedPart)
  } catch {
    return encodedPart
  }
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  const extendedMatch = header.match(/filename\*\s*=\s*([^;]+)/i)
  if (extendedMatch?.[1]) return decodeHeaderFilename(extendedMatch[1])
  const quotedMatch = header.match(/filename\s*=\s*"([^"]+)"/i)
  if (quotedMatch?.[1]) return quotedMatch[1]
  const unquotedMatch = header.match(/filename\s*=\s*([^;]+)/i)
  if (unquotedMatch?.[1]) return stripHeaderQuotes(unquotedMatch[1])
  return null
}

function sanitizeDownloadedFilename(filename: string): string {
  const cleaned = filename
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  return cleaned || 'online-archive.7z'
}

function hasImportableArchiveExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return (
    lower.endsWith('.zip')
    || lower.endsWith('.7z')
    || lower.endsWith('.exe')
    || lower.endsWith('.tgz')
    || lower.endsWith('.tar.gz')
    || lower.endsWith('.mix')
    || lower.endsWith('.mmx')
    || lower.endsWith('.yro')
  )
}

function filenameFromUrl(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, '')
  const lastSegment = pathname.split('/').pop() || ''
  if (!lastSegment) return 'online-archive.7z'
  try {
    return decodeURIComponent(lastSegment)
  } catch {
    return lastSegment
  }
}

function deriveDownloadedArchiveFilename(url: URL, headers: Headers): string {
  const headerName = filenameFromContentDisposition(headers.get('content-disposition'))
  const filename = sanitizeDownloadedFilename(headerName || filenameFromUrl(url))
  return hasImportableArchiveExtension(filename) ? filename : `${filename}.7z`
}

async function readResponseBytes(
  response: Response,
  sourceUrl: URL,
  options: ImportOptions,
): Promise<Uint8Array> {
  const totalBytes = Number(response.headers.get('content-length') || 0)
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    emitProgress(options, {
      stage: 'load_archive',
      message: `在线归档下载完成：${formatBytes(bytes.byteLength)}`,
      currentItem: sourceUrl.toString(),
      percentage: 100,
    })
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loadedBytes = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loadedBytes += value.byteLength
    emitProgress(options, {
      stage: 'load_archive',
      message: totalBytes > 0
        ? `正在下载在线归档：${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
        : `正在下载在线归档：${formatBytes(loadedBytes)}`,
      currentItem: sourceUrl.toString(),
      percentage: toPercent(loadedBytes, totalBytes),
    })
  }

  const output = new Uint8Array(loadedBytes)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  emitProgress(options, {
    stage: 'load_archive',
    message: `在线归档下载完成：${formatBytes(loadedBytes)}`,
    currentItem: sourceUrl.toString(),
    percentage: 100,
  })
  return output
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
    const conflictMessage = options.preservePaths
      ? `${entry.normalizedName}: 目标路径冲突，已跳过 (${entry.sourcePath} 与 ${conflictWith} 冲突)`
      : `${entry.normalizedName}: 路径扁平化后文件名冲突，已跳过 (${entry.sourcePath} 与 ${conflictWith} 冲突)`
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
        normalizedName: normalizeImportedEntryName(entryPath, options),
      }))
      .filter((entry): entry is { sourcePath: string; normalizedName: string } => (
        !!entry.normalizedName && entry.normalizedName.toLowerCase() !== archiveNameKey
      ))

    const importableCandidates = extractedEntries.filter((entry) => shouldImport(entry.normalizedName, options))
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
  const normalized = normalizeImportedEntryName(forceName ?? sourceFile.name, options)
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

  if (!shouldImport(normalized, options)) {
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
  static async downloadArchiveFromUrl(
    archiveUrl: URL,
    options: ImportOptions = {},
  ): Promise<File> {
    emitProgress(options, {
      stage: 'prepare',
      message: `准备在线导入 ${archiveUrl.toString()}...`,
      currentItem: archiveUrl.toString(),
    })
    emitProgress(options, {
      stage: 'load_archive',
      message: `正在连接在线归档 ${archiveUrl.toString()}...`,
      currentItem: archiveUrl.toString(),
    })

    let response: Response
    try {
      response = await fetch(archiveUrl.toString(), { cache: 'no-cache' })
    } catch (e: any) {
      const errMsg = e?.message ?? String(e)
      emitProgress(options, {
        stage: 'error',
        message: '在线归档下载失败',
        currentItem: archiveUrl.toString(),
        errorMessage: errMsg,
      })
      throw new Error(`在线归档下载失败：${errMsg}`)
    }

    if (!response.ok) {
      const message = `在线归档下载失败：HTTP ${response.status} ${response.statusText}`.trim()
      emitProgress(options, {
        stage: 'error',
        message,
        currentItem: archiveUrl.toString(),
        errorMessage: message,
      })
      throw new Error(message)
    }

    const filename = deriveDownloadedArchiveFilename(archiveUrl, response.headers)
    const bytes = await readResponseBytes(response, archiveUrl, options)
    return new File([toOwnedArrayBuffer(bytes)], filename)
  }

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
          normalizedName: normalizeImportedEntryName(entry.entryName, options),
        }))
        .filter((entry) => shouldImport(entry.normalizedName, options))
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
          sourcePath: file.webkitRelativePath || file.name,
          normalizedName: normalizeImportedEntryName(file.webkitRelativePath || file.name, options),
        }))
        .filter((entry) => shouldImport(entry.normalizedName, options))
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

      if (options.allowAllFiles || isMixLikeFile(lowerName) || isStandaloneIniLikeFile(lowerName)) {
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
          normalizedName: normalizeImportedEntryName(entry.name, options),
        }))
        .filter((entry) => shouldImport(entry.normalizedName, options))
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
