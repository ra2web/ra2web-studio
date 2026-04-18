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
