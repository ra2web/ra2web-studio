import {
  buildContextMenuItems,
  computeContextMenuPosition,
  getCommandIds,
  resolveContextMenuTarget,
  type ContextMenuBuildState,
} from './contextMenuModel'

const t = (key: string) => key

const defaultState: ContextMenuBuildState = {
  studioMode: 'base',
  resourceReady: true,
  loading: false,
  hasMixFiles: true,
  hasFileSelection: true,
  fileExtension: 'pkt',
  canEnterMixTarget: false,
  canModifyTarget: true,
  canCopyTarget: true,
  canSaveTarget: true,
  hasUnsavedChanges: true,
  metadataDrawerOpen: false,
  canNavigateUp: false,
  editableReadOnly: false,
  editableHasSelection: true,
  editableHasValue: true,
  editableCanCopyWithoutSelection: false,
  hasProjects: true,
  hasActiveProject: true,
  canAddToProject: true,
}

describe('contextMenuModel', () => {
  it('clamps menu position into the viewport', () => {
    expect(
      computeContextMenuPosition({
        anchorX: 980,
        anchorY: 760,
        menuWidth: 240,
        menuHeight: 200,
        viewportWidth: 1024,
        viewportHeight: 768,
      }),
    ).toEqual({ left: 772, top: 556 })
  })

  it('resolves editable input targets before preview containers', () => {
    const root = document.createElement('div')
    root.dataset.contextKind = 'preview-selection'
    const input = document.createElement('input')
    input.type = 'text'
    root.appendChild(input)

    const target = resolveContextMenuTarget(
      input,
      { clientX: 12, clientY: 18 },
      'global-shell',
    )

    expect(target.kind).toBe('editable-text')
    expect(target.editableKind).toBe('input')
    expect(target.inputElement).toBe(input)
  })

  it('builds base-mode file menu entries for mix-like rows', () => {
    const items = buildContextMenuItems({
      t,
      target: {
        kind: 'file-tree-row',
        clientX: 20,
        clientY: 30,
        filePath: 'ra2.mix/nested.mix',
        isMixFile: true,
      },
      state: {
        ...defaultState,
        studioMode: 'base',
        fileExtension: 'mix',
        canEnterMixTarget: true,
        canSaveTarget: false,
        hasUnsavedChanges: false,
      },
      isMac: false,
    })

    expect(getCommandIds(items)).toEqual([
      'rawExport',
      'enterCurrentMix',
      'openMetadata',
      'addToProject',
    ])
  })

  it('adds project commands for empty tree regions in project mode', () => {
    const items = buildContextMenuItems({
      t,
      target: {
        kind: 'file-tree-empty',
        clientX: 12,
        clientY: 24,
      },
      state: {
        ...defaultState,
        studioMode: 'projects',
        canNavigateUp: true,
      },
      isMac: false,
    })

    expect(getCommandIds(items)).toEqual([
      'switchToBase',
      'switchToProjects',
      'switchToSearch',
      'navigateUp',
      'createProject',
      'renameProject',
      'deleteProject',
      'importProjectFiles',
      'importToCurrentMix',
      'exportProjectZip',
      'exportTopMix',
      'exportCurrentMix',
    ])
  })

  it('shows pkt save and discard actions when the preview target is dirty in project mode', () => {
    const items = buildContextMenuItems({
      t,
      target: {
        kind: 'preview-selection',
        clientX: 30,
        clientY: 45,
        filePath: 'ra2.mix/sample.pkt',
      },
      state: {
        ...defaultState,
        studioMode: 'projects',
        fileExtension: 'pkt',
        canEnterMixTarget: false,
        canSaveTarget: true,
        hasUnsavedChanges: true,
        metadataDrawerOpen: true,
      },
      isMac: true,
    })

    expect(getCommandIds(items)).toEqual([
      'rawExport',
      'closeMetadata',
      'saveFile',
      'discardChanges',
      'renameFile',
      'copyFile',
      'deleteFile',
    ])

    const saveItem = items.find((item) => item.kind === 'item' && item.id === 'saveFile')
    expect(saveItem).toMatchObject({
      kind: 'item',
      hint: 'Cmd+S',
    })
  })

  it('builds search-result menu entries for base hits', () => {
    const items = buildContextMenuItems({
      t,
      target: {
        kind: 'search-result',
        clientX: 18,
        clientY: 24,
        filePath: 'ra2.mix/nested.mix/inside.txt',
        searchScope: 'base',
      },
      state: {
        ...defaultState,
        studioMode: 'search',
      },
      isMac: false,
    })

    expect(getCommandIds(items)).toEqual([
      'openSearchResult',
      'addToProject',
    ])
  })

  it('builds editable menu entries with keyboard hints', () => {
    const items = buildContextMenuItems({
      t,
      target: {
        kind: 'editable-text',
        clientX: 4,
        clientY: 9,
        editableKind: 'monaco',
      },
      state: defaultState,
      isMac: false,
    })

    expect(getCommandIds(items)).toEqual([
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'selectAll',
    ])

    const copyItem = items.find((item) => item.kind === 'item' && item.id === 'copy')
    expect(copyItem).toMatchObject({
      kind: 'item',
      hint: 'Ctrl+C',
    })
  })

  it('disables edit-only commands for read-only editable targets', () => {
    const items = buildContextMenuItems({
      t,
      target: {
        kind: 'editable-text',
        clientX: 8,
        clientY: 12,
        editableKind: 'input',
      },
      state: {
        ...defaultState,
        editableReadOnly: true,
        editableHasSelection: false,
        editableHasValue: false,
        editableCanCopyWithoutSelection: false,
      },
      isMac: false,
    })

    expect(items).toEqual([
      { kind: 'item', id: 'undo', label: 'contextMenu.undo', icon: 'undo', disabled: true, hint: 'Ctrl+Z' },
      { kind: 'item', id: 'redo', label: 'contextMenu.redo', icon: 'redo', disabled: true, hint: 'Ctrl+Y' },
      { kind: 'separator', id: 'separator-2' },
      { kind: 'item', id: 'cut', label: 'contextMenu.cut', icon: 'scissors', disabled: true, hint: 'Ctrl+X' },
      { kind: 'item', id: 'copy', label: 'contextMenu.copy', icon: 'copy', disabled: true, hint: 'Ctrl+C' },
      { kind: 'item', id: 'paste', label: 'contextMenu.paste', icon: 'paste', disabled: true, hint: 'Ctrl+V' },
      { kind: 'separator', id: 'separator-6' },
      { kind: 'item', id: 'selectAll', label: 'contextMenu.selectAll', icon: 'panel', disabled: true, hint: 'Ctrl+A' },
    ])
  })
})
