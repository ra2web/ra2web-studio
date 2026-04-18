import {
  buildContextMenuItems,
  computeContextMenuPosition,
  getCommandIds,
  resolveContextMenuTarget,
  type ContextMenuBuildState,
} from './contextMenuModel'

const t = (key: string) => key

const defaultState: ContextMenuBuildState = {
  browserMode: 'workspace',
  resourceReady: true,
  loading: false,
  hasMixFiles: true,
  hasFileSelection: true,
  fileExtension: 'pkt',
  canEnterMixTarget: false,
  canModifyTarget: true,
  canSaveTarget: true,
  hasUnsavedChanges: true,
  metadataDrawerOpen: false,
  canNavigateUp: false,
  targetMixIsActive: false,
  editableReadOnly: false,
  editableHasSelection: true,
  editableHasValue: true,
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

  it('builds file menu entries for mix-like rows', () => {
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
      'renameFile',
      'deleteFile',
    ])
  })

  it('adds navigation and global commands for empty tree regions', () => {
    const items = buildContextMenuItems({
      t,
      target: {
        kind: 'file-tree-empty',
        clientX: 12,
        clientY: 24,
      },
      state: {
        ...defaultState,
        browserMode: 'repository',
        canNavigateUp: true,
      },
      isMac: false,
    })

    expect(getCommandIds(items)).toEqual([
      'switchToWorkspace',
      'navigateUp',
      'importPatchMix',
      'importToCurrentMix',
      'exportTopMix',
      'exportCurrentMix',
      'reimportBaseDirectory',
      'reimportBaseArchives',
      'clearPatches',
    ])
  })

  it('shows pkt save and discard actions when the preview target is dirty', () => {
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
      'deleteFile',
    ])

    const saveItem = items.find((item) => item.kind === 'item' && item.id === 'saveFile')
    expect(saveItem).toMatchObject({
      kind: 'item',
      hint: 'Cmd+S',
    })
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
