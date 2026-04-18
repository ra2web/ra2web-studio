import { afterEach, describe, expect, it, vi } from 'vitest'
import { MixParser, type MixFileInfo } from '../MixParser'
import { FileSystemUtil } from '../gameRes/FileSystemUtil'
import { ProjectService } from '../projects/ProjectService'
import { GlobalSearchService } from './GlobalSearchService'

function createMixInfo(name: string, files: Array<{ filename: string; extension: string; length: number }>): MixFileInfo {
  return {
    name,
    size: files.reduce((sum, file) => sum + file.length, 0),
    files: files.map((file, index) => ({
      filename: file.filename,
      extension: file.extension,
      length: file.length,
      hash: index + 1,
      offset: index * 8,
    })),
  }
}

describe('GlobalSearchService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds an index across base and project files and recurses into nested MIX files', async () => {
    const baseInfo = createMixInfo('ra2.mix', [
      { filename: 'notes.txt', extension: 'txt', length: 9 },
      { filename: 'nested.mix', extension: 'mix', length: 12 },
    ])
    const nestedInfo = createMixInfo('nested.mix', [
      { filename: 'inside.txt', extension: 'txt', length: 6 },
    ])
    const projectInfo = createMixInfo('demo.mix', [
      { filename: 'project.txt', extension: 'txt', length: 7 },
    ])

    vi.spyOn(FileSystemUtil, 'listImportedFiles').mockResolvedValue([
      { bucket: 'base', name: 'ra2.mix', size: 21, lastModified: 1 },
    ])
    vi.spyOn(FileSystemUtil, 'readImportedFile').mockResolvedValue(new File(['base'], 'ra2.mix'))
    vi.spyOn(ProjectService, 'listProjects').mockResolvedValue([
      { name: 'Demo', fileCount: 1, lastModified: 1 },
    ])
    vi.spyOn(ProjectService, 'listProjectFiles').mockResolvedValue([
      {
        relativePath: 'demo.mix',
        name: 'demo.mix',
        kind: 'file',
        size: 21,
        lastModified: 1,
        extension: 'mix',
      },
    ])
    vi.spyOn(ProjectService, 'listProjectMixFiles').mockResolvedValue([
      { relativePath: 'demo.mix', file: new File(['project'], 'demo.mix'), info: projectInfo },
    ])
    vi.spyOn(MixParser, 'parseFile').mockResolvedValue(baseInfo)
    vi.spyOn(MixParser, 'extractFile').mockImplementation(async (_file, filename) => {
      if (filename === 'nested.mix') {
        return {
          getBytes: () => new Uint8Array([1, 2, 3]),
        } as any
      }
      return null
    })
    vi.spyOn(MixParser, 'parseVirtualFile').mockResolvedValue(nestedInfo)

    const index = await GlobalSearchService.buildIndex()

    expect(index).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'base',
        path: 'ra2.mix/notes.txt',
        displayName: 'notes.txt',
      }),
      expect.objectContaining({
        scope: 'base',
        path: 'ra2.mix/nested.mix/inside.txt',
        isNestedMixHit: true,
      }),
      expect.objectContaining({
        scope: 'project',
        projectName: 'Demo',
        path: 'demo.mix/project.txt',
        resultKind: 'mix-entry',
        owningProjectPath: 'demo.mix',
      }),
    ]))

    expect(GlobalSearchService.filterIndex(index, 'inside')).toEqual([
      expect.objectContaining({ path: 'ra2.mix/nested.mix/inside.txt' }),
    ])
  })
})
