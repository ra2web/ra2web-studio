import type { ProjectSelectionTarget } from '../../types/studio'

export interface PreviewEditorHandle {
  focus: () => void
  undo: () => void
  redo: () => void
  cut: () => void
  copy: () => void
  paste: () => void
  selectAll: () => void
  hasSelection: () => boolean
  canEdit: () => boolean
}

export type PreviewTarget =
  | {
      kind: 'base-mix-entry'
      displayPath: string
      topLevelOwner: string
      containerChain: string[]
      entryName: string
      extension: string
    }
  | Extract<ProjectSelectionTarget, { kind: 'project-file' | 'mix-entry' }>

export interface PreviewResolvedFile {
  displayPath: string
  name: string
  extension: string
  readBytes: () => Promise<Uint8Array>
  readText: () => Promise<string>
}
