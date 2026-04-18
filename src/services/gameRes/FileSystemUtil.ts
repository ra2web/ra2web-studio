import type { ImportedResourceFile, ImportedResourceTreeEntry, ResourceBucket } from './types'
import {
  getResourcePathBasename,
  getResourcePathDirname,
  normalizeResourceFilename,
  normalizeResourcePath,
} from './patterns'

type AnyDirectoryHandle = any
type AnyFileHandle = any

const WORKSPACE_DIR = 'ra2web-studio-resources'
const BASE_DIR = 'base'
const PATCH_DIR = 'patch'
const MODS_DIR = 'mods'

function ensureSupported(): void {
  const storageAny = navigator.storage as any
  if (!storageAny || typeof storageAny.getDirectory !== 'function') {
    throw new Error('当前浏览器不支持 OPFS（navigator.storage.getDirectory）')
  }
}

async function getOpfsRoot(): Promise<AnyDirectoryHandle> {
  ensureSupported()
  const storageAny = navigator.storage as any
  return storageAny.getDirectory()
}

async function getOrCreateDirectory(parent: AnyDirectoryHandle, name: string): Promise<AnyDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true })
}

async function resolveBucketDir(
  bucket: ResourceBucket,
  modName: string | null = null,
): Promise<AnyDirectoryHandle> {
  const root = await getOpfsRoot()
  const workspace = await getOrCreateDirectory(root, WORKSPACE_DIR)
  if (bucket === 'base') {
    return getOrCreateDirectory(workspace, BASE_DIR)
  }
  if (bucket === 'patch') {
    return getOrCreateDirectory(workspace, PATCH_DIR)
  }
  const modsRoot = await getOrCreateDirectory(workspace, MODS_DIR)
  if (!modName) {
    throw new Error('mod bucket 需要 modName')
  }
  return getOrCreateDirectory(modsRoot, modName)
}

async function tryGetDirectory(parent: AnyDirectoryHandle, name: string): Promise<AnyDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name)
  } catch {
    return null
  }
}

async function tryGetFile(parent: AnyDirectoryHandle, name: string): Promise<AnyFileHandle | null> {
  try {
    return await parent.getFileHandle(name)
  } catch {
    return null
  }
}

function splitRelativePath(pathLike: string): string[] {
  const normalized = normalizeResourcePath(pathLike)
  return normalized ? normalized.split('/') : []
}

async function resolveNestedDirectory(
  bucket: ResourceBucket,
  modName: string | null,
  relativeDirPath: string,
  create: boolean,
): Promise<AnyDirectoryHandle> {
  let current = await resolveBucketDir(bucket, modName)
  const parts = splitRelativePath(relativeDirPath)
  for (const part of parts) {
    current = create
      ? await current.getDirectoryHandle(part, { create: true })
      : await current.getDirectoryHandle(part)
  }
  return current
}

async function resolveParentDirectoryForFile(
  bucket: ResourceBucket,
  modName: string | null,
  relativePath: string,
  create: boolean,
): Promise<{ dir: AnyDirectoryHandle; basename: string; normalizedPath: string }> {
  const normalizedPath = normalizeResourcePath(relativePath)
  const basename = getResourcePathBasename(normalizedPath)
  if (!basename) {
    throw new Error('文件路径不能为空')
  }
  const dirname = getResourcePathDirname(normalizedPath)
  const dir = dirname
    ? await resolveNestedDirectory(bucket, modName, dirname, create)
    : await resolveBucketDir(bucket, modName)
  return { dir, basename, normalizedPath }
}

async function collectTreeEntries(
  dir: AnyDirectoryHandle,
  bucket: ResourceBucket,
  modName: string | null,
  prefix: string,
  output: ImportedResourceTreeEntry[],
): Promise<void> {
  const pending: Array<Promise<void>> = []
  for await (const [entryName, handle] of dir.entries()) {
    const entryPath = prefix ? `${prefix}/${entryName}` : entryName
    if (handle.kind === 'file') {
      pending.push((async () => {
        const file = await handle.getFile()
        output.push({
          bucket,
          kind: 'file',
          path: entryPath,
          name: entryName,
          size: file.size,
          lastModified: file.lastModified,
          modName: bucket === 'mod' ? (modName ?? undefined) : undefined,
        })
      })())
      continue
    }

    output.push({
      bucket,
      kind: 'directory',
      path: entryPath,
      name: entryName,
      size: 0,
      lastModified: 0,
      modName: bucket === 'mod' ? (modName ?? undefined) : undefined,
    })
    pending.push(collectTreeEntries(handle, bucket, modName, entryPath, output))
  }
  await Promise.all(pending)
}

export class FileSystemUtil {
  static isOpfsSupported(): boolean {
    const storageAny = navigator.storage as any
    return !!storageAny && typeof storageAny.getDirectory === 'function'
  }

  static async showDirectoryPicker(): Promise<AnyDirectoryHandle> {
    const picker = (window as any).showDirectoryPicker
    if (typeof picker !== 'function') {
      throw new Error('当前浏览器不支持目录选择器 showDirectoryPicker')
    }
    return picker()
  }

  static async writeImportedFile(
    bucket: ResourceBucket,
    source: File,
    modName: string | null = null,
    forceName?: string,
  ): Promise<string> {
    const requestedPath = forceName ?? source.name
    const normalizedPath = bucket === 'mod'
      ? normalizeResourcePath(requestedPath)
      : normalizeResourceFilename(requestedPath)
    const { dir, basename } = await resolveParentDirectoryForFile(bucket, modName, normalizedPath, true)
    const fileHandle: AnyFileHandle = await dir.getFileHandle(basename, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(await source.arrayBuffer())
      await writable.close()
    } catch (error) {
      try {
        await writable.abort()
      } catch {
        // ignore abort failure
      }
      throw error
    }
    return normalizedPath
  }

  static async ensureBucket(bucket: ResourceBucket, modName: string | null = null): Promise<void> {
    await resolveBucketDir(bucket, modName)
  }

  static async ensureDirectory(
    bucket: ResourceBucket,
    relativeDirPath: string,
    modName: string | null = null,
  ): Promise<string> {
    const normalized = normalizeResourcePath(relativeDirPath)
    if (!normalized) return ''
    await resolveNestedDirectory(bucket, modName, normalized, true)
    return normalized
  }

  static async readImportedFile(
    bucket: ResourceBucket,
    filename: string,
    modName: string | null = null,
  ): Promise<File> {
    const normalized = bucket === 'mod'
      ? normalizeResourcePath(filename)
      : normalizeResourceFilename(filename)
    const { dir, basename } = await resolveParentDirectoryForFile(bucket, modName, normalized, false)
    const fileHandle: AnyFileHandle = await dir.getFileHandle(basename)
    return fileHandle.getFile()
  }

  static async copyImportedFile(args: {
    sourceBucket: ResourceBucket
    sourceFilename: string
    targetBucket: ResourceBucket
    sourceModName?: string | null
    targetModName?: string | null
    targetFilename?: string
  }): Promise<string> {
    const sourceFile = await this.readImportedFile(
      args.sourceBucket,
      args.sourceFilename,
      args.sourceModName ?? null,
    )
    const normalizedTargetFilename = args.targetFilename ?? args.sourceFilename
    const copy = new File([await sourceFile.arrayBuffer()], getResourcePathBasename(normalizedTargetFilename), {
      type: sourceFile.type || 'application/octet-stream',
      lastModified: sourceFile.lastModified,
    })
    return this.writeImportedFile(
      args.targetBucket,
      copy,
      args.targetModName ?? null,
      normalizedTargetFilename,
    )
  }

  static async listImportedFiles(
    bucket: ResourceBucket,
    modName: string | null = null,
  ): Promise<ImportedResourceFile[]> {
    const entries = await this.listImportedTree(bucket, modName)
    return entries
      .filter((entry): entry is ImportedResourceTreeEntry & { kind: 'file' } => entry.kind === 'file')
      .map((entry) => ({
        bucket: entry.bucket,
        name: entry.path,
        size: entry.size,
        lastModified: entry.lastModified,
        modName: entry.modName,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  static async listImportedTree(
    bucket: ResourceBucket,
    modName: string | null = null,
  ): Promise<ImportedResourceTreeEntry[]> {
    const dir = await resolveBucketDir(bucket, modName)
    const result: ImportedResourceTreeEntry[] = []
    await collectTreeEntries(dir, bucket, modName, '', result)
    result.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
    return result
  }

  static async listImportedModNames(): Promise<string[]> {
    const root = await getOpfsRoot()
    const workspace = await tryGetDirectory(root, WORKSPACE_DIR)
    if (!workspace) return []
    const modsRoot = await tryGetDirectory(workspace, MODS_DIR)
    if (!modsRoot) return []
    const result: string[] = []
    for await (const [entryName, handle] of modsRoot.entries()) {
      if (handle.kind === 'directory') result.push(entryName)
    }
    result.sort((a, b) => a.localeCompare(b))
    return result
  }

  static async listAllImportedFiles(activeModName: string | null): Promise<ImportedResourceFile[]> {
    const base = await this.listImportedFiles('base')
    const mod = activeModName ? await this.listImportedFiles('mod', activeModName) : []
    return [...base, ...mod]
  }

  static async removeImportedEntry(
    bucket: ResourceBucket,
    relativePath: string,
    modName: string | null = null,
    recursive: boolean = true,
  ): Promise<void> {
    const normalized = normalizeResourcePath(relativePath)
    if (!normalized) {
      throw new Error('路径不能为空')
    }
    const dirname = getResourcePathDirname(normalized)
    const basename = getResourcePathBasename(normalized)
    const parentDir = dirname
      ? await resolveNestedDirectory(bucket, modName, dirname, false)
      : await resolveBucketDir(bucket, modName)
    await parentDir.removeEntry(basename, { recursive })
  }

  static async readImportedDirectoryHandle(
    bucket: ResourceBucket,
    relativePath: string,
    modName: string | null = null,
  ): Promise<AnyDirectoryHandle> {
    const normalized = normalizeResourcePath(relativePath)
    if (!normalized) {
      return resolveBucketDir(bucket, modName)
    }
    return resolveNestedDirectory(bucket, modName, normalized, false)
  }

  static async importedEntryExists(
    bucket: ResourceBucket,
    relativePath: string,
    modName: string | null = null,
  ): Promise<boolean> {
    const normalized = normalizeResourcePath(relativePath)
    if (!normalized) return true
    const dirname = getResourcePathDirname(normalized)
    const basename = getResourcePathBasename(normalized)
    const parentDir = dirname
      ? await resolveNestedDirectory(bucket, modName, dirname, false)
      : await resolveBucketDir(bucket, modName)
    const fileHandle = await tryGetFile(parentDir, basename)
    if (fileHandle) return true
    const dirHandle = await tryGetDirectory(parentDir, basename)
    return Boolean(dirHandle)
  }

  static async clearWorkspace(): Promise<void> {
    const root = await getOpfsRoot()
    try {
      await root.removeEntry(WORKSPACE_DIR, { recursive: true })
    } catch {
      // ignore when workspace is missing
    }
  }

  static async clearBucket(bucket: ResourceBucket, modName: string | null = null): Promise<void> {
    const root = await getOpfsRoot()
    const workspace = await tryGetDirectory(root, WORKSPACE_DIR)
    if (!workspace) return
    if (bucket === 'base') {
      try {
        await workspace.removeEntry(BASE_DIR, { recursive: true })
      } catch {
        // ignore
      }
      return
    }
    if (bucket === 'patch') {
      try {
        await workspace.removeEntry(PATCH_DIR, { recursive: true })
      } catch {
        // ignore
      }
      return
    }
    if (!modName) return
    const modsRoot = await tryGetDirectory(workspace, MODS_DIR)
    if (!modsRoot) return
    try {
      await modsRoot.removeEntry(modName, { recursive: true })
    } catch {
      // ignore
    }
  }
}
