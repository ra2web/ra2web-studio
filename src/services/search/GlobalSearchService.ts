import { MixParser, type MixFileInfo } from '../MixParser'
import { FileSystemUtil } from '../gameRes/FileSystemUtil'
import { getResourcePathBasename, getResourcePathExtension, isMixLikeFile } from '../gameRes/patterns'
import { ProjectService } from '../projects/ProjectService'
import type { GlobalSearchResult, SearchScope } from '../../types/studio'
import type { VirtualFile } from '../../data/vfs/VirtualFile'

type SearchArchiveSource = {
  scope: SearchScope
  projectName?: string
  topLevelOwner: string
  owningProjectPath?: string
  info: MixFileInfo
  fileObj: File | VirtualFile
}

function buildResultId(
  scope: SearchScope,
  projectName: string | undefined,
  resultKind: GlobalSearchResult['resultKind'],
  path: string,
): string {
  return `${scope}:${projectName ?? 'base'}:${resultKind}:${path.toLowerCase()}`
}

export class GlobalSearchService {
  static async buildIndex(): Promise<GlobalSearchResult[]> {
    const results: GlobalSearchResult[] = []

    const baseFiles = await FileSystemUtil.listImportedFiles('base')
    for (const file of baseFiles) {
      results.push({
        id: buildResultId('base', undefined, 'project-file', file.name),
        scope: 'base',
        resultKind: 'project-file',
        topLevelOwner: file.name,
        path: file.name,
        containerChain: [],
        isNestedMixHit: false,
        extension: getResourcePathExtension(file.name),
        size: file.size,
        displayName: getResourcePathBasename(file.name),
      })

      if (!isMixLikeFile(file.name)) continue
      const source = await FileSystemUtil.readImportedFile('base', file.name)
      try {
        const info = await MixParser.parseFile(source)
        await this.collectArchiveResults(results, {
          scope: 'base',
          topLevelOwner: file.name,
          info,
          fileObj: source,
        })
      } catch {
        // Skip broken archives while keeping search usable.
      }
    }

    const projects = await ProjectService.listProjects()
    for (const project of projects) {
      const projectFiles = await ProjectService.listProjectFiles(project.name)
      for (const file of projectFiles) {
        results.push({
          id: buildResultId('project', project.name, 'project-file', file.relativePath),
          scope: 'project',
          resultKind: 'project-file',
          projectName: project.name,
          topLevelOwner: file.relativePath,
          path: file.relativePath,
          containerChain: [],
          isNestedMixHit: false,
          extension: file.extension ?? '',
          size: file.size,
          displayName: file.name,
          owningProjectPath: file.relativePath,
        })
      }

      const mixFiles = await ProjectService.listProjectMixFiles(project.name)
      for (const mixFile of mixFiles) {
        await this.collectArchiveResults(results, {
          scope: 'project',
          projectName: project.name,
          topLevelOwner: mixFile.relativePath,
          owningProjectPath: mixFile.relativePath,
          info: mixFile.info,
          fileObj: mixFile.file,
        })
      }
    }

    results.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
    return results
  }

  static filterIndex(index: GlobalSearchResult[], query: string): GlobalSearchResult[] {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return index
    return index.filter((item) => {
      const scopeText = item.scope === 'project' ? item.projectName ?? '' : 'base'
      const nestedText = item.containerChain.join(' ')
      const haystack = `${item.displayName} ${item.path} ${scopeText} ${nestedText} ${item.owningProjectPath ?? ''}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }

  private static async collectArchiveResults(
    output: GlobalSearchResult[],
    archive: SearchArchiveSource,
    containerChain: string[] = [],
  ): Promise<void> {
    for (const entry of archive.info.files) {
      const rootPath = archive.owningProjectPath ?? archive.topLevelOwner
      const fullPath = [rootPath, ...containerChain, entry.filename].join('/')
      output.push({
        id: buildResultId(archive.scope, archive.projectName, 'mix-entry', fullPath),
        scope: archive.scope,
        resultKind: 'mix-entry',
        projectName: archive.projectName,
        topLevelOwner: archive.topLevelOwner,
        path: fullPath,
        containerChain,
        isNestedMixHit: containerChain.length > 0,
        extension: entry.extension.toLowerCase(),
        size: entry.length,
        displayName: entry.filename,
        owningProjectPath: archive.owningProjectPath,
      })

      if (!isMixLikeFile(entry.filename)) continue
      try {
        const nested = await MixParser.extractFile(
          archive.fileObj instanceof File
            ? archive.fileObj
            : new File([archive.fileObj.getBytes().slice().buffer], entry.filename),
          entry.filename,
        )
        if (!nested) continue
        const nestedInfo = await MixParser.parseVirtualFile(nested, entry.filename)
        await this.collectArchiveResults(output, {
          ...archive,
          info: nestedInfo,
          fileObj: nested,
        }, [...containerChain, entry.filename])
      } catch {
        // Ignore unreadable nested archives.
      }
    }
  }
}
