import JSZip from 'jszip'
import type { MixFileInfo } from '../MixParser'
import { MixParser } from '../MixParser'
import { DataStream } from '../../data/DataStream'
import { MixFile as MixFileDataStream } from '../../data/MixFile'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import { triggerBrowserDownload } from '../export/utils'
import { FileSystemUtil } from '../gameRes/FileSystemUtil'
import {
  getResourcePathBasename,
  getResourcePathDirname,
  getResourcePathExtension,
  isMixLikeFile,
  normalizeResourceFilename,
  normalizeResourcePath,
} from '../gameRes/patterns'
import {
  MixArchiveBuilder,
  type MixArchiveBuilderEntry,
} from '../mixEdit/MixArchiveBuilder'
import type {
  ProjectDestinationTarget,
  ProjectFileEntry,
  ProjectSummary,
  ProjectTreeNode,
} from '../../types/studio'

type ProjectMixFile = {
  relativePath: string
  file: File
  info: MixFileInfo
}

type MixContainerNode = {
  name: string
  info: MixFileInfo
  fileObj: File | VirtualFile
}

type ProjectMixWriteItem = {
  sourceFile?: File
  targetFilename?: string
  bytes?: Uint8Array
}

function normalizeProjectName(name: string): string {
  return name.trim()
}

function validateProjectName(name: string): string {
  const normalized = normalizeProjectName(name)
  if (!normalized) throw new Error('项目名称不能为空')
  if (/[\\/]/.test(normalized)) {
    throw new Error('项目名称不能包含路径分隔符')
  }
  if (normalized === '.' || normalized === '..') {
    throw new Error('项目名称无效')
  }
  return normalized
}

function sameProjectName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
    || a.toLowerCase() === b.toLowerCase()
}

function normalizeMixEntryName(name: string): string {
  return name.replace(/\\/g, '/').trim().toLowerCase()
}

function sameMixEntryName(a: string, b: string): boolean {
  return normalizeMixEntryName(a) === normalizeMixEntryName(b)
}

function buildTreeFromEntries(entries: ProjectFileEntry[]): ProjectTreeNode[] {
  const byPath = new Map<string, ProjectTreeNode>()
  const roots: ProjectTreeNode[] = []

  const ensureNode = (entry: ProjectFileEntry): ProjectTreeNode => {
    const existing = byPath.get(entry.relativePath)
    if (existing) return existing
    const created: ProjectTreeNode = {
      path: entry.relativePath,
      name: entry.name,
      kind: entry.kind,
      size: entry.size,
      lastModified: entry.lastModified,
      extension: entry.extension,
      children: entry.kind === 'directory' ? [] : undefined,
    }
    byPath.set(entry.relativePath, created)
    return created
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.relativePath === b.relativePath) return 0
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' })
  })

  for (const entry of sorted) {
    const node = ensureNode(entry)
    const parentPath = entry.parentPath ?? null
    if (!parentPath) {
      roots.push(node)
      continue
    }
    const parent = byPath.get(parentPath)
    if (!parent) {
      roots.push(node)
      continue
    }
    if (!parent.children) parent.children = []
    parent.children.push(node)
  }

  return roots
}

async function createMixReaderFromFileObj(fileObj: File | VirtualFile) {
  if (fileObj instanceof File) {
    const buffer = await fileObj.arrayBuffer()
    return new MixFileDataStream(new DataStream(buffer))
  }
  const stream = fileObj.stream as DataStream
  stream.seek(0)
  return new MixFileDataStream(stream)
}

async function openContainerEntry(
  container: MixContainerNode,
  entry: MixFileInfo['files'][number],
): Promise<VirtualFile | null> {
  const mix = await createMixReaderFromFileObj(container.fileObj)
  const hash = entry.hash >>> 0
  if (mix.containsId(hash)) return mix.openById(hash, entry.filename)
  if (mix.containsFile(entry.filename)) return mix.openFile(entry.filename)
  return null
}

async function readContainerEntries(container: MixContainerNode): Promise<MixArchiveBuilderEntry[]> {
  const mix = await createMixReaderFromFileObj(container.fileObj)
  const entries: MixArchiveBuilderEntry[] = []
  for (const entry of container.info.files) {
    const hash = entry.hash >>> 0
    let vf: VirtualFile | null = null
    if (mix.containsId(hash)) {
      vf = mix.openById(hash, entry.filename)
    } else if (mix.containsFile(entry.filename)) {
      vf = mix.openFile(entry.filename)
    }
    if (!vf) {
      throw new Error(`Cannot read container entry: ${entry.filename}`)
    }
    entries.push({
      filename: entry.filename,
      hash,
      bytes: vf.getBytes(),
    })
  }
  return entries
}

async function buildMixNavStack(
  topFile: File,
  topInfo: MixFileInfo,
  containerChain: string[],
): Promise<MixContainerNode[]> {
  const stack: MixContainerNode[] = [{ name: topInfo.name, info: topInfo, fileObj: topFile }]
  let current = stack[0]
  for (const segment of containerChain) {
    const entry = current.info.files.find((item) => sameMixEntryName(item.filename, segment))
    if (!entry) {
      throw new Error(`未找到 MIX 容器 ${segment}`)
    }
    const child = await openContainerEntry(current, entry)
    if (!child) {
      throw new Error(`无法读取 MIX 容器 ${segment}`)
    }
    const parsed = await MixParser.parseVirtualFile(child, entry.filename)
    current = { name: entry.filename, info: parsed, fileObj: child }
    stack.push(current)
  }
  return stack
}

async function rebuildAncestorMixes(
  navStack: MixContainerNode[],
  currentMixBytes: Uint8Array,
): Promise<Uint8Array> {
  if (!navStack.length) {
    throw new Error('No MIX container to write back')
  }
  let replacementBytes = currentMixBytes
  let replacementName = navStack[navStack.length - 1].name
  for (let depth = navStack.length - 2; depth >= 0; depth--) {
    const parent = navStack[depth]
    const parentEntries = await readContainerEntries(parent)
    const targetIndex = parentEntries.findIndex((entry) => sameMixEntryName(entry.filename, replacementName))
    if (targetIndex < 0) {
      throw new Error(`Cannot locate sub-container in parent MIX: ${replacementName}`)
    }
    parentEntries[targetIndex] = {
      ...parentEntries[targetIndex],
      bytes: replacementBytes,
    }
    replacementBytes = MixArchiveBuilder.build(
      MixArchiveBuilder.upsertLocalMixDatabase(parentEntries),
    )
    replacementName = parent.name
  }
  return replacementBytes
}

export class ProjectService {
  static async listProjects(): Promise<ProjectSummary[]> {
    const names = await FileSystemUtil.listImportedModNames()
    const summaries = await Promise.all(names.map(async (name) => {
      const files = await FileSystemUtil.listImportedFiles('mod', name)
      const lastModified = files.reduce<number | null>((max, file) => {
        if (max == null || file.lastModified > max) return file.lastModified
        return max
      }, null)
      return {
        name,
        fileCount: files.length,
        lastModified,
      }
    }))
    summaries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return summaries
  }

  static async createProject(name: string): Promise<string> {
    const normalized = validateProjectName(name)
    const projects = await this.listProjects()
    const conflict = projects.find((project) => sameProjectName(project.name, normalized))
    if (conflict) {
      throw new Error(`项目 ${conflict.name} 已存在`)
    }
    await FileSystemUtil.ensureBucket('mod', normalized)
    return normalized
  }

  static async renameProject(currentName: string, nextName: string): Promise<string> {
    const current = validateProjectName(currentName)
    const next = validateProjectName(nextName)
    if (sameProjectName(current, next)) {
      if (current === next) return next
      await this.copyProjectFiles(current, next)
      await FileSystemUtil.clearBucket('mod', current)
      return next
    }

    const projects = await this.listProjects()
    const conflict = projects.find((project) => sameProjectName(project.name, next))
    if (conflict) {
      throw new Error(`项目 ${conflict.name} 已存在`)
    }
    await this.copyProjectFiles(current, next)
    await FileSystemUtil.clearBucket('mod', current)
    return next
  }

  static async deleteProject(name: string): Promise<void> {
    const normalized = validateProjectName(name)
    await FileSystemUtil.clearBucket('mod', normalized)
  }

  static async listProjectFiles(projectName: string): Promise<ProjectFileEntry[]> {
    const normalized = validateProjectName(projectName)
    const files = await FileSystemUtil.listImportedFiles('mod', normalized)
    return files.map((file) => {
      const parentPath = getResourcePathDirname(file.name)
      const relativePath = normalizeResourcePath(file.name)
      return {
        relativePath,
        name: getResourcePathBasename(relativePath),
        kind: 'file',
        size: file.size,
        lastModified: file.lastModified,
        extension: getResourcePathExtension(relativePath),
        depth: relativePath ? relativePath.split('/').length - 1 : 0,
        parentPath: parentPath || null,
      }
    })
  }

  static async listProjectEntries(projectName: string): Promise<ProjectFileEntry[]> {
    const normalized = validateProjectName(projectName)
    const tree = await FileSystemUtil.listImportedTree('mod', normalized)
    return tree.map((entry) => {
      const relativePath = normalizeResourcePath(entry.path)
      const parentPath = getResourcePathDirname(relativePath)
      return {
        relativePath,
        name: entry.name,
        kind: entry.kind,
        size: entry.size,
        lastModified: entry.lastModified,
        extension: entry.kind === 'file' ? getResourcePathExtension(relativePath) : undefined,
        depth: relativePath ? relativePath.split('/').length - 1 : 0,
        parentPath: parentPath || null,
      }
    })
  }

  static async listProjectTree(projectName: string): Promise<ProjectTreeNode[]> {
    const entries = await this.listProjectEntries(projectName)
    return buildTreeFromEntries(entries)
  }

  static async readProjectFile(projectName: string, relativePath: string): Promise<File> {
    const normalizedProject = validateProjectName(projectName)
    const normalizedPath = normalizeResourcePath(relativePath)
    return FileSystemUtil.readImportedFile('mod', normalizedPath, normalizedProject)
  }

  static async writeProjectFile(
    projectName: string,
    relativePath: string,
    sourceFile: File,
  ): Promise<string> {
    const normalizedProject = validateProjectName(projectName)
    const normalizedPath = normalizeResourcePath(relativePath)
    return FileSystemUtil.writeImportedFile('mod', sourceFile, normalizedProject, normalizedPath)
  }

  static async ensureProjectDirectory(projectName: string, relativePath: string): Promise<string> {
    const normalizedProject = validateProjectName(projectName)
    return FileSystemUtil.ensureDirectory('mod', relativePath, normalizedProject)
  }

  static async deleteProjectEntry(projectName: string, relativePath: string): Promise<void> {
    const normalizedProject = validateProjectName(projectName)
    const normalizedPath = normalizeResourcePath(relativePath)
    await FileSystemUtil.removeImportedEntry('mod', normalizedPath, normalizedProject, true)
  }

  static async renameProjectEntry(
    projectName: string,
    sourcePath: string,
    targetPath: string,
  ): Promise<string> {
    const normalizedProject = validateProjectName(projectName)
    const normalizedSource = normalizeResourcePath(sourcePath)
    const normalizedTarget = normalizeResourcePath(targetPath)
    if (!normalizedSource || !normalizedTarget) {
      throw new Error('项目路径不能为空')
    }
    if (normalizedSource === normalizedTarget) return normalizedTarget
    if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
      throw new Error('不能把目录移动到其自身内部')
    }
    if (await FileSystemUtil.importedEntryExists('mod', normalizedTarget, normalizedProject)) {
      throw new Error('目标路径已存在')
    }

    const entries = await FileSystemUtil.listImportedTree('mod', normalizedProject)
    const sourceEntry = entries.find((entry) => entry.path === normalizedSource)
    if (!sourceEntry) {
      throw new Error('未找到要重命名的项目条目')
    }

    if (sourceEntry.kind === 'file') {
      const sourceFile = await this.readProjectFile(normalizedProject, normalizedSource)
      await this.writeProjectFile(
        normalizedProject,
        normalizedTarget,
        new File([await sourceFile.arrayBuffer()], getResourcePathBasename(normalizedTarget), {
          type: sourceFile.type || 'application/octet-stream',
          lastModified: sourceFile.lastModified,
        }),
      )
      await this.deleteProjectEntry(normalizedProject, normalizedSource)
      return normalizedTarget
    }

    await this.ensureProjectDirectory(normalizedProject, normalizedTarget)
    const descendants = entries
      .filter((entry) => entry.path === normalizedSource || entry.path.startsWith(`${normalizedSource}/`))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))

    for (const entry of descendants) {
      if (entry.path === normalizedSource) continue
      const suffix = entry.path.slice(normalizedSource.length + 1)
      const nextPath = `${normalizedTarget}/${suffix}`
      if (entry.kind === 'directory') {
        await this.ensureProjectDirectory(normalizedProject, nextPath)
      } else {
        const sourceFile = await this.readProjectFile(normalizedProject, entry.path)
        await this.writeProjectFile(
          normalizedProject,
          nextPath,
          new File([await sourceFile.arrayBuffer()], entry.name, {
            type: sourceFile.type || 'application/octet-stream',
            lastModified: sourceFile.lastModified,
          }),
        )
      }
    }

    await this.deleteProjectEntry(normalizedProject, normalizedSource)
    return normalizedTarget
  }

  static async listProjectMixFiles(projectName: string): Promise<ProjectMixFile[]> {
    const normalized = validateProjectName(projectName)
    const files = await FileSystemUtil.listImportedFiles('mod', normalized)
    const archiveEntries = files.filter((file) => isMixLikeFile(file.name))
    const mixFiles = await Promise.all(archiveEntries.map(async (entry) => {
      const file = await FileSystemUtil.readImportedFile('mod', entry.name, normalized)
      const info = await MixParser.parseFile(file)
      return {
        relativePath: entry.name,
        file,
        info: {
          ...info,
          name: entry.name,
        },
      }
    }))
    mixFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }))
    return mixFiles
  }

  static async copyBaseFileToProject(
    projectName: string,
    topLevelOwner: string,
    targetRelativePath: string = topLevelOwner,
  ): Promise<string> {
    const normalizedProjectName = validateProjectName(projectName)
    const normalizedOwner = normalizeResourceFilename(topLevelOwner)
    if (!normalizedOwner) {
      throw new Error('无法识别要加入项目的基座文件')
    }
    const normalizedTargetPath = normalizeResourcePath(targetRelativePath)
    await FileSystemUtil.ensureBucket('mod', normalizedProjectName)
    return FileSystemUtil.copyImportedFile({
      sourceBucket: 'base',
      sourceFilename: normalizedOwner,
      targetBucket: 'mod',
      targetModName: normalizedProjectName,
      targetFilename: normalizedTargetPath,
    })
  }

  static async writeFileIntoProjectMix(args: {
    projectName: string
    owningMixPath: string
    containerChain?: string[]
    sourceFile: File
    targetFilename?: string
  }): Promise<void> {
    await this.writeFilesIntoProjectMix({
      projectName: args.projectName,
      owningMixPath: args.owningMixPath,
      containerChain: args.containerChain,
      files: [{
        sourceFile: args.sourceFile,
        targetFilename: args.targetFilename,
      }],
    })
  }

  static async writeFilesIntoProjectMix(args: {
    projectName: string
    owningMixPath: string
    containerChain?: string[]
    files: ProjectMixWriteItem[]
  }): Promise<void> {
    if (!args.files.length) return
    const normalizedProject = validateProjectName(args.projectName)
    const owningMixPath = normalizeResourcePath(args.owningMixPath)
    const containerChain = [...(args.containerChain ?? [])]
    const topFile = await this.readProjectFile(normalizedProject, owningMixPath)
    const topInfo = await MixParser.parseFile(topFile)
    const navStack = await buildMixNavStack(topFile, topInfo, containerChain)
    const currentContainer = navStack[navStack.length - 1]
    const currentEntries = await readContainerEntries(currentContainer)

    for (const item of args.files) {
      const targetFilename = normalizeResourceFilename(item.targetFilename ?? item.sourceFile?.name ?? '')
      if (!targetFilename) {
        throw new Error('目标文件名不能为空')
      }
      const nextBytes = item.bytes ?? (
        item.sourceFile ? new Uint8Array(await item.sourceFile.arrayBuffer()) : null
      )
      if (!nextBytes) {
        throw new Error(`目标文件 ${targetFilename} 缺少写入数据`)
      }

      const existingIndex = currentEntries.findIndex((entry) => sameMixEntryName(entry.filename, targetFilename))
      if (existingIndex >= 0) {
        currentEntries[existingIndex] = {
          ...currentEntries[existingIndex],
          filename: targetFilename,
          bytes: nextBytes,
        }
      } else {
        currentEntries.push({
          filename: targetFilename,
          bytes: nextBytes,
        })
      }
    }

    const rebuiltCurrent = MixArchiveBuilder.build(MixArchiveBuilder.upsertLocalMixDatabase(currentEntries))
    const rebuiltTop = await rebuildAncestorMixes(navStack, rebuiltCurrent)
    const rebuiltTopBuffer = new ArrayBuffer(rebuiltTop.length)
    new Uint8Array(rebuiltTopBuffer).set(rebuiltTop)
    await this.writeProjectFile(
      normalizedProject,
      owningMixPath,
      new File([rebuiltTopBuffer], getResourcePathBasename(owningMixPath), { type: 'application/octet-stream' }),
    )
  }

  /**
   * 把项目内一个普通文件复制到同项目的另一个位置（目录或顶层 MIX 容器）。
   * 不静默覆盖：目标已存在同名文件 → 抛错让上层提示用户改名。
   *
   * @returns 新文件的相对路径（mix 分支返回的是 owningMixPath，因为新条目存在 MIX 内部）
   */
  static async copyProjectFile(
    projectName: string,
    sourceRelativePath: string,
    destination: ProjectDestinationTarget,
    newName: string,
  ): Promise<string> {
    const normalizedProject = validateProjectName(projectName)
    const normalizedSource = normalizeResourcePath(sourceRelativePath)
    if (!normalizedSource) {
      throw new Error('源路径不能为空')
    }
    const trimmedNewName = (newName ?? '').trim()
    if (!trimmedNewName) {
      throw new Error('新文件名不能为空')
    }
    const normalizedNewName = normalizeResourceFilename(trimmedNewName)
    if (!normalizedNewName) {
      throw new Error('新文件名不合法')
    }
    if (/[\\/]/.test(trimmedNewName)) {
      throw new Error('新文件名不能包含路径分隔符')
    }

    const sourceFile = await this.readProjectFile(normalizedProject, normalizedSource)

    if (destination.kind === 'directory') {
      const normalizedDir = normalizeResourcePath(destination.relativePath)
      const targetPath = normalizedDir
        ? `${normalizedDir}/${normalizedNewName}`
        : normalizedNewName
      if (targetPath === normalizedSource) {
        throw new Error('目标路径与源路径相同')
      }
      if (await FileSystemUtil.importedEntryExists('mod', targetPath, normalizedProject)) {
        throw new Error('目标位置已存在同名文件')
      }
      if (normalizedDir) {
        await this.ensureProjectDirectory(normalizedProject, normalizedDir)
      }
      const buffer = await sourceFile.arrayBuffer()
      const copy = new File([buffer], normalizedNewName, {
        type: sourceFile.type || 'application/octet-stream',
        lastModified: sourceFile.lastModified,
      })
      await this.writeProjectFile(normalizedProject, targetPath, copy)
      return targetPath
    }

    // mix 分支：写入项目中某个 MIX 文件（containerChain 决定深度，本期一般为 []）
    const owningMixPath = normalizeResourcePath(destination.owningMixPath)
    if (!owningMixPath) {
      throw new Error('目标 MIX 路径无效')
    }
    if (owningMixPath === normalizedSource && (destination.containerChain ?? []).length === 0) {
      // 把文件复制到自己里？不允许，避免源文件成为自己 MIX 的成员
      throw new Error('不能把文件复制到自身')
    }
    // 冲突检测：先打开 MIX，确认目标 MIX 内部不存在同名条目
    const topFile = await this.readProjectFile(normalizedProject, owningMixPath)
    const topInfo = await MixParser.parseFile(topFile)
    const navStack = await buildMixNavStack(topFile, topInfo, destination.containerChain ?? [])
    const currentContainer = navStack[navStack.length - 1]
    const conflict = currentContainer.info.files.some((entry) =>
      sameMixEntryName(entry.filename, normalizedNewName),
    )
    if (conflict) {
      throw new Error('目标 MIX 内已存在同名条目')
    }
    const buffer = await sourceFile.arrayBuffer()
    const copy = new File([buffer], normalizedNewName, {
      type: sourceFile.type || 'application/octet-stream',
      lastModified: sourceFile.lastModified,
    })
    await this.writeFileIntoProjectMix({
      projectName: normalizedProject,
      owningMixPath,
      containerChain: destination.containerChain ?? [],
      sourceFile: copy,
      targetFilename: normalizedNewName,
    })
    return owningMixPath
  }

  static async exportProjectZip(projectName: string): Promise<{ blob: Blob; filename: string }> {
    const normalized = validateProjectName(projectName)
    const files = await FileSystemUtil.listImportedFiles('mod', normalized)
    const zip = new JSZip()
    for (const file of files) {
      const source = await FileSystemUtil.readImportedFile('mod', file.name, normalized)
      zip.file(file.name, new Uint8Array(await source.arrayBuffer()))
    }
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const arrayBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(arrayBuffer).set(bytes)
    const blob = new Blob([arrayBuffer], { type: 'application/zip' })
    return {
      blob,
      filename: `${normalized}.zip`,
    }
  }

  static async downloadProjectZip(projectName: string): Promise<void> {
    const { blob, filename } = await this.exportProjectZip(projectName)
    triggerBrowserDownload(blob, filename)
  }

  private static async copyProjectFiles(sourceProjectName: string, targetProjectName: string): Promise<void> {
    const source = validateProjectName(sourceProjectName)
    const target = validateProjectName(targetProjectName)
    await FileSystemUtil.ensureBucket('mod', target)
    const files = await FileSystemUtil.listImportedFiles('mod', source)
    for (const file of files) {
      await FileSystemUtil.copyImportedFile({
        sourceBucket: 'mod',
        sourceFilename: file.name,
        sourceModName: source,
        targetBucket: 'mod',
        targetModName: target,
        targetFilename: file.name,
      })
    }
  }
}
