import { vscodeEditorOptions } from './monacoOptions'

describe('monacoOptions', () => {
  it('disables the built-in Monaco context menu', () => {
    expect(vscodeEditorOptions.contextmenu).toBe(false)
  })
})
