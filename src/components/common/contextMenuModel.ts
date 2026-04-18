import type { SearchResultKind, SearchScope, StudioMode } from '../../types/studio'

export type ContextMenuTargetKind =
  | 'import-shell'
  | 'global-shell'
  | 'file-tree-row'
  | 'file-tree-empty'
  | 'preview-selection'
  | 'metadata-drawer'
  | 'editable-text'
  | 'search-result'

export type ContextMenuEditableKind = 'input' | 'monaco'

export type ContextMenuCommandId =
  | 'selectArchive'
  | 'selectGameDirectory'
  | 'createProject'
  | 'renameProject'
  | 'deleteProject'
  | 'importProjectFiles'
  | 'importToCurrentMix'
  | 'exportTopMix'
  | 'exportCurrentMix'
  | 'exportProjectZip'
  | 'reimportBaseDirectory'
  | 'reimportBaseArchives'
  | 'switchToBase'
  | 'switchToProjects'
  | 'switchToSearch'
  | 'navigateUp'
  | 'rawExport'
  | 'imageGifExport'
  | 'enterCurrentMix'
  | 'renameFile'
  | 'deleteFile'
  | 'openMetadata'
  | 'closeMetadata'
  | 'saveFile'
  | 'discardChanges'
  | 'addToProject'
  | 'openSearchResult'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'

export type ContextMenuIconName =
  | 'archive'
  | 'copy'
  | 'download'
  | 'folder'
  | 'folder-plus'
  | 'image'
  | 'info'
  | 'paste'
  | 'pencil'
  | 'redo'
  | 'rotate-ccw'
  | 'save'
  | 'scissors'
  | 'trash'
  | 'undo'
  | 'upload'
  | 'arrow-up'
  | 'panel'
  | 'search'
  | 'box'

export type ContextMenuEntry =
  | {
      kind: 'item'
      id: ContextMenuCommandId
      label: string
      icon: ContextMenuIconName
      danger?: boolean
      disabled?: boolean
      hint?: string
    }
  | {
      kind: 'separator'
      id: string
    }

export interface ContextMenuTarget {
  kind: ContextMenuTargetKind
  clientX: number
  clientY: number
  filePath?: string
  mixName?: string
  isMixFile?: boolean
  editableKind?: ContextMenuEditableKind
  inputElement?: HTMLInputElement | HTMLTextAreaElement
  searchScope?: SearchScope
  resultKind?: SearchResultKind
  projectName?: string
  topLevelOwner?: string
  containerChain?: string[]
}

export interface ContextMenuBuildState {
  studioMode: StudioMode
  resourceReady: boolean
  loading: boolean
  hasMixFiles: boolean
  hasFileSelection: boolean
  fileExtension: string
  canEnterMixTarget: boolean
  canModifyTarget: boolean
  canSaveTarget: boolean
  hasUnsavedChanges: boolean
  metadataDrawerOpen: boolean
  canNavigateUp: boolean
  editableReadOnly: boolean
  editableHasSelection: boolean
  editableHasValue: boolean
  editableCanCopyWithoutSelection: boolean
  hasProjects: boolean
  hasActiveProject: boolean
  canAddToProject: boolean
}

type TranslateFn = (key: string) => string

type ContextMenuPositionArgs = {
  anchorX: number
  anchorY: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  padding?: number
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'hidden',
  'image',
  'month',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'week',
])

function appendItem(
  items: ContextMenuEntry[],
  item: Omit<Extract<ContextMenuEntry, { kind: 'item' }>, 'kind'>,
) {
  items.push({ kind: 'item', ...item })
}

function appendSeparator(items: ContextMenuEntry[]) {
  if (!items.length) return
  if (items[items.length - 1]?.kind === 'separator') return
  items.push({
    kind: 'separator',
    id: `separator-${items.length}`,
  })
}

function isEditableInputElement(element: HTMLElement | null): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type.toLowerCase())
  }
  return false
}

function findEditableInputElement(
  element: HTMLElement | null,
): HTMLInputElement | HTMLTextAreaElement | null {
  let current: HTMLElement | null = element
  while (current) {
    if (isEditableInputElement(current)) return current
    current = current.parentElement
  }
  return null
}

function parseContainerChain(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    return undefined
  }
  return undefined
}

export function resolveContextMenuTarget(
  element: HTMLElement | null,
  pointer: Pick<ContextMenuTarget, 'clientX' | 'clientY'>,
  fallbackKind: ContextMenuTargetKind,
): ContextMenuTarget {
  const editableRoot = element?.closest('[data-context-kind="editable-text"]') as HTMLElement | null
  if (editableRoot) {
    return {
      kind: 'editable-text',
      editableKind: (editableRoot.dataset.editableKind as ContextMenuEditableKind | undefined) ?? 'monaco',
      clientX: pointer.clientX,
      clientY: pointer.clientY,
    }
  }

  const inputElement = findEditableInputElement(element)
  if (inputElement) {
    return {
      kind: 'editable-text',
      editableKind: 'input',
      inputElement,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
    }
  }

  const contextRoot = element?.closest('[data-context-kind]') as HTMLElement | null
  return {
    kind: (contextRoot?.dataset.contextKind as ContextMenuTargetKind | undefined) ?? fallbackKind,
    filePath: contextRoot?.dataset.filePath,
    mixName: contextRoot?.dataset.mixName,
    isMixFile: contextRoot?.dataset.isMixFile === 'true' || contextRoot?.dataset.isMixFile === '1',
    searchScope: contextRoot?.dataset.searchScope as SearchScope | undefined,
    resultKind: contextRoot?.dataset.resultKind as SearchResultKind | undefined,
    projectName: contextRoot?.dataset.projectName,
    topLevelOwner: contextRoot?.dataset.topLevelOwner,
    containerChain: parseContainerChain(contextRoot?.dataset.containerChain),
    clientX: pointer.clientX,
    clientY: pointer.clientY,
  }
}

export function computeContextMenuPosition({
  anchorX,
  anchorY,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  padding = 12,
}: ContextMenuPositionArgs): { left: number; top: number } {
  const maxLeft = Math.max(padding, viewportWidth - menuWidth - padding)
  const maxTop = Math.max(padding, viewportHeight - menuHeight - padding)
  return {
    left: Math.min(Math.max(anchorX, padding), maxLeft),
    top: Math.min(Math.max(anchorY, padding), maxTop),
  }
}

export function buildContextMenuItems(args: {
  t: TranslateFn
  target: ContextMenuTarget
  state: ContextMenuBuildState
  isMac: boolean
}): ContextMenuEntry[] {
  const { t, target, state, isMac } = args
  const items: ContextMenuEntry[] = []
  const modKey = isMac ? 'Cmd' : 'Ctrl'

  const appendModeSwitches = () => {
    appendItem(items, {
      id: 'switchToBase',
      label: t('contextMenu.switchToBase'),
      icon: 'archive',
      disabled: state.loading || state.studioMode === 'base',
    })
    appendItem(items, {
      id: 'switchToProjects',
      label: t('contextMenu.switchToProjects'),
      icon: 'box',
      disabled: state.loading || state.studioMode === 'projects',
    })
    appendItem(items, {
      id: 'switchToSearch',
      label: t('contextMenu.switchToSearch'),
      icon: 'search',
      disabled: state.loading || state.studioMode === 'search',
    })
  }

  const appendBaseGlobalEntries = () => {
    appendItem(items, {
      id: 'reimportBaseDirectory',
      label: t('contextMenu.reimportBaseDirectory'),
      icon: 'folder',
      disabled: state.loading,
    })
    appendItem(items, {
      id: 'reimportBaseArchives',
      label: t('contextMenu.reimportBaseArchives'),
      icon: 'upload',
      disabled: state.loading,
    })
    appendSeparator(items)
    appendItem(items, {
      id: 'exportTopMix',
      label: t('contextMenu.exportTopMix'),
      icon: 'download',
      disabled: state.loading || !state.hasMixFiles,
    })
    appendItem(items, {
      id: 'exportCurrentMix',
      label: t('contextMenu.exportCurrentMix'),
      icon: 'archive',
      disabled: state.loading || !state.hasMixFiles,
    })
    appendItem(items, {
      id: 'addToProject',
      label: t('contextMenu.addToProject'),
      icon: 'folder-plus',
      disabled: state.loading || !state.canAddToProject,
    })
  }

  const appendProjectGlobalEntries = () => {
    appendItem(items, {
      id: 'createProject',
      label: t('contextMenu.createProject'),
      icon: 'folder-plus',
      disabled: state.loading,
    })
    appendItem(items, {
      id: 'renameProject',
      label: t('contextMenu.renameProject'),
      icon: 'pencil',
      disabled: state.loading || !state.hasActiveProject,
    })
    appendItem(items, {
      id: 'deleteProject',
      label: t('contextMenu.deleteProject'),
      icon: 'trash',
      disabled: state.loading || !state.hasActiveProject,
      danger: true,
    })
    appendSeparator(items)
    appendItem(items, {
      id: 'importProjectFiles',
      label: t('contextMenu.importProjectFiles'),
      icon: 'upload',
      disabled: state.loading || !state.hasActiveProject,
    })
    appendItem(items, {
      id: 'importToCurrentMix',
      label: t('contextMenu.importToCurrentMix'),
      icon: 'folder-plus',
      disabled: state.loading || !state.hasActiveProject || !state.hasMixFiles,
    })
    appendItem(items, {
      id: 'exportProjectZip',
      label: t('contextMenu.exportProjectZip'),
      icon: 'download',
      disabled: state.loading || !state.hasActiveProject,
    })
    appendSeparator(items)
    appendItem(items, {
      id: 'exportTopMix',
      label: t('contextMenu.exportTopMix'),
      icon: 'download',
      disabled: state.loading || !state.hasMixFiles,
    })
    appendItem(items, {
      id: 'exportCurrentMix',
      label: t('contextMenu.exportCurrentMix'),
      icon: 'archive',
      disabled: state.loading || !state.hasMixFiles,
    })
  }

  switch (target.kind) {
    case 'import-shell': {
      appendItem(items, {
        id: 'selectArchive',
        label: t('contextMenu.selectArchive'),
        icon: 'upload',
        disabled: state.loading,
      })
      appendItem(items, {
        id: 'selectGameDirectory',
        label: t('contextMenu.selectGameDirectory'),
        icon: 'folder',
        disabled: state.loading,
      })
      return items
    }
    case 'global-shell':
    case 'file-tree-empty': {
      appendModeSwitches()
      if (state.canNavigateUp) {
        appendSeparator(items)
        appendItem(items, {
          id: 'navigateUp',
          label: t('contextMenu.navigateUp'),
          icon: 'arrow-up',
          disabled: state.loading,
        })
      }
      appendSeparator(items)
      if (state.studioMode === 'projects') {
        appendProjectGlobalEntries()
      } else if (state.studioMode === 'base') {
        appendBaseGlobalEntries()
      }
      return items
    }
    case 'search-result': {
      appendItem(items, {
        id: 'openSearchResult',
        label: t('contextMenu.openSearchResult'),
        icon: 'search',
        disabled: state.loading,
      })
      if (target.searchScope === 'base') {
        appendSeparator(items)
        appendItem(items, {
          id: 'addToProject',
          label: t('contextMenu.addToProject'),
          icon: 'folder-plus',
          disabled: state.loading || !state.hasProjects,
        })
      }
      return items
    }
    case 'file-tree-row':
    case 'preview-selection':
    case 'metadata-drawer': {
      if (target.kind === 'metadata-drawer') {
        appendItem(items, {
          id: 'closeMetadata',
          label: t('contextMenu.closeMetadata'),
          icon: 'info',
        })
        appendSeparator(items)
      }

      appendItem(items, {
        id: 'rawExport',
        label: t('contextMenu.rawExport'),
        icon: 'download',
        disabled: state.loading || !state.hasFileSelection,
      })
      if (state.fileExtension === 'shp') {
        appendItem(items, {
          id: 'imageGifExport',
          label: t('contextMenu.imageGifExport'),
          icon: 'image',
          disabled: state.loading || !state.hasFileSelection,
        })
      }
      if (state.canEnterMixTarget) {
        appendItem(items, {
          id: 'enterCurrentMix',
          label: t('contextMenu.enterCurrentMix'),
          icon: 'archive',
          disabled: state.loading,
        })
      }
      if (target.kind !== 'metadata-drawer') {
        appendItem(items, {
          id: state.metadataDrawerOpen ? 'closeMetadata' : 'openMetadata',
          label: state.metadataDrawerOpen ? t('contextMenu.closeMetadata') : t('contextMenu.openMetadata'),
          icon: 'info',
          disabled: state.loading || !state.hasFileSelection,
        })
      }

      if (state.studioMode === 'base') {
        appendSeparator(items)
        appendItem(items, {
          id: 'addToProject',
          label: t('contextMenu.addToProject'),
          icon: 'folder-plus',
          disabled: state.loading || !state.canAddToProject,
        })
        return items
      }

      appendSeparator(items)
      if (state.canSaveTarget && state.hasUnsavedChanges) {
        appendItem(items, {
          id: 'saveFile',
          label: t('contextMenu.saveFile'),
          icon: 'save',
          disabled: state.loading,
          hint: `${modKey}+S`,
        })
        appendItem(items, {
          id: 'discardChanges',
          label: t('contextMenu.discardChanges'),
          icon: 'rotate-ccw',
          disabled: state.loading,
        })
        appendSeparator(items)
      }
      appendItem(items, {
        id: 'renameFile',
        label: t('contextMenu.renameFile'),
        icon: 'pencil',
        disabled: state.loading || !state.canModifyTarget,
      })
      appendItem(items, {
        id: 'deleteFile',
        label: t('contextMenu.deleteFile'),
        icon: 'trash',
        disabled: state.loading || !state.canModifyTarget,
        danger: true,
      })
      return items
    }
    case 'editable-text': {
      appendItem(items, {
        id: 'undo',
        label: t('contextMenu.undo'),
        icon: 'undo',
        disabled: state.editableReadOnly,
        hint: `${modKey}+Z`,
      })
      appendItem(items, {
        id: 'redo',
        label: t('contextMenu.redo'),
        icon: 'redo',
        disabled: state.editableReadOnly,
        hint: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y',
      })
      appendSeparator(items)
      appendItem(items, {
        id: 'cut',
        label: t('contextMenu.cut'),
        icon: 'scissors',
        disabled: state.editableReadOnly || !state.editableHasSelection,
        hint: `${modKey}+X`,
      })
      appendItem(items, {
        id: 'copy',
        label: t('contextMenu.copy'),
        icon: 'copy',
        disabled: !state.editableHasSelection && !state.editableCanCopyWithoutSelection,
        hint: `${modKey}+C`,
      })
      appendItem(items, {
        id: 'paste',
        label: t('contextMenu.paste'),
        icon: 'paste',
        disabled: state.editableReadOnly,
        hint: `${modKey}+V`,
      })
      appendSeparator(items)
      appendItem(items, {
        id: 'selectAll',
        label: t('contextMenu.selectAll'),
        icon: 'panel',
        disabled: !state.editableHasValue,
        hint: `${modKey}+A`,
      })
      return items
    }
    default:
      return items
  }
}

export function getCommandIds(entries: ContextMenuEntry[]): string[] {
  return entries
    .filter((entry): entry is Extract<ContextMenuEntry, { kind: 'item' }> => entry.kind === 'item')
    .map((entry) => entry.id)
}
