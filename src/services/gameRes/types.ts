export type ResourceBucket = 'base' | 'patch' | 'mod'

export type GameResImportStageId =
  | 'prepare'
  | 'load_archive'
  | 'extract'
  | 'import'
  | 'finalize'
  | 'done'
  | 'error'

export type GameResImportStageStatus = 'pending' | 'active' | 'completed' | 'error'

export interface GameResImportProgressEvent {
  stage: GameResImportStageId
  stageLabel: string
  message: string
  currentItem?: string
  percentage?: number
  importedCount?: number
  skippedCount?: number
  totalCount?: number
  errorMessage?: string
}

export interface GameResImportStepState {
  id: GameResImportStageId
  label: string
  status: GameResImportStageStatus
}

export const GAME_RES_IMPORT_STAGE_ORDER: GameResImportStageId[] = [
  'prepare',
  'load_archive',
  'extract',
  'import',
  'finalize',
  'done',
  'error',
]

export const GAME_RES_IMPORT_STAGE_LABELS: Record<GameResImportStageId, string> = {
  prepare: '准备导入',
  load_archive: '加载归档',
  extract: '解压条目',
  import: '写入资源',
  finalize: '校验与收尾',
  done: '导入完成',
  error: '导入失败',
}

export function createInitialGameResImportSteps(): GameResImportStepState[] {
  return GAME_RES_IMPORT_STAGE_ORDER.map((stageId) => ({
    id: stageId,
    label: GAME_RES_IMPORT_STAGE_LABELS[stageId],
    status: 'pending',
  }))
}

export interface ImportedResourceFile {
  bucket: ResourceBucket
  name: string
  size: number
  lastModified: number
  modName?: string
}

export interface ImportedResourceTreeEntry {
  bucket: ResourceBucket
  kind: 'file' | 'directory'
  path: string
  name: string
  size: number
  lastModified: number
  modName?: string
}

export interface GameResImportResult {
  imported: number
  skipped: number
  errors: string[]
  importedNames: string[]
}

export interface ResourceReadiness {
  ready: boolean
  missingRequiredFiles: string[]
}

export interface GameResPersistedConfig {
  activeProjectName: string | null
  lastImportAt: number | null
}
