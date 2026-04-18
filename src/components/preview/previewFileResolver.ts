import { MixParser } from '../../services/MixParser'
import { FileSystemUtil } from '../../services/gameRes/FileSystemUtil'
import {
  getResourcePathBasename,
  getResourcePathExtension,
} from '../../services/gameRes/patterns'
import { ProjectService } from '../../services/projects/ProjectService'
import type { PreviewResolvedFile, PreviewTarget } from './types'

async function readBaseMixEntryBytes(target: Extract<PreviewTarget, { kind: 'base-mix-entry' }>): Promise<Uint8Array> {
  const topFile = await FileSystemUtil.readImportedFile('base', target.topLevelOwner)
  const nestedPath = [...target.containerChain, target.entryName].join('/')
  const vf = await MixParser.extractFile(topFile, nestedPath)
  if (!vf) {
    throw new Error('未找到基座 MIX 条目')
  }
  return vf.getBytes()
}

async function readProjectMixEntryBytes(target: Extract<PreviewTarget, { kind: 'mix-entry' }>): Promise<Uint8Array> {
  const topFile = await ProjectService.readProjectFile(target.projectName, target.owningMixPath)
  const nestedPath = [...target.containerChain, target.entryName].join('/')
  const vf = await MixParser.extractFile(topFile, nestedPath)
  if (!vf) {
    throw new Error('未找到项目 MIX 条目')
  }
  return vf.getBytes()
}

async function readProjectFileBytes(target: Extract<PreviewTarget, { kind: 'project-file' }>): Promise<Uint8Array> {
  const file = await ProjectService.readProjectFile(target.projectName, target.relativePath)
  return new Uint8Array(await file.arrayBuffer())
}

export async function resolvePreviewFile(target: PreviewTarget): Promise<PreviewResolvedFile> {
  if (target.kind === 'base-mix-entry') {
    return {
      displayPath: target.displayPath,
      name: target.entryName,
      extension: target.extension,
      readBytes: () => readBaseMixEntryBytes(target),
      readText: async () => {
        const bytes = await readBaseMixEntryBytes(target)
        return new TextDecoder().decode(bytes)
      },
    }
  }

  if (target.kind === 'mix-entry') {
    return {
      displayPath: target.displayPath,
      name: target.entryName,
      extension: target.extension,
      readBytes: () => readProjectMixEntryBytes(target),
      readText: async () => {
        const bytes = await readProjectMixEntryBytes(target)
        return new TextDecoder().decode(bytes)
      },
    }
  }

  return {
    displayPath: target.displayPath,
    name: getResourcePathBasename(target.relativePath),
    extension: target.extension || getResourcePathExtension(target.relativePath),
    readBytes: () => readProjectFileBytes(target),
    readText: async () => {
      const bytes = await readProjectFileBytes(target)
      return new TextDecoder().decode(bytes)
    },
  }
}
