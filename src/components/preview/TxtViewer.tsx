import React, { useCallback, useEffect, useState } from 'react'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { vscodeEditorOptions } from './monacoOptions'
import type { PreviewEditorHandle, PreviewTarget } from './types'
import { usePreviewSourceFile } from './usePreviewSourceFile'

const TxtViewer: React.FC<{
  selectedFile?: string
  mixFiles?: Array<{ file: File; info: any }>
  target?: PreviewTarget | null
  resourceContext?: ResourceContext | null
  value?: string
  loadingOverride?: boolean
  errorOverride?: string | null
  onChange?: (next: string) => void
  readOnly?: boolean
  onEditorReady?: (handle: PreviewEditorHandle | null) => void
}> = ({
  selectedFile,
  mixFiles,
  target,
  value,
  loadingOverride,
  errorOverride,
  onChange,
  readOnly = true,
  onEditorReady,
}) => {
  const [content, setContent] = useState('')
  const [Monaco, setMonaco] = useState<React.ComponentType<any> | null>(null)
  const externallyManaged = value !== undefined || loadingOverride !== undefined || errorOverride !== undefined
  const source = usePreviewSourceFile({
    target,
    selectedFile,
    mixFiles,
  })

  useEffect(() => {
    let mounted = true
    import('@monaco-editor/react')
      .then(mod => { if (mounted) setMonaco(() => mod.default as any) })
      .catch(() => setMonaco(null))
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    return () => {
      onEditorReady?.(null)
    }
  }, [onEditorReady])

  useEffect(() => {
    if (externallyManaged) return
    let cancelled = false
    async function load() {
      setContent('')
      try {
        if (!source.resolved) return
        const text = await source.resolved.readText()
        if (!cancelled) setContent(text)
      } catch {
        // error is handled by source hook
      }
    }
    if (source.resolved) {
      void load()
    }
    return () => { cancelled = true }
  }, [externallyManaged, source.resolved])

  const effectiveContent = value ?? content
  const effectiveLoading = loadingOverride ?? (!externallyManaged ? source.loading : false)
  const effectiveError = errorOverride ?? (!externallyManaged ? source.error : null)

  const handleEditorMount = useCallback((editor: any) => {
    const handle: PreviewEditorHandle = {
      focus: () => editor.focus(),
      undo: () => editor.trigger('ra2web-context-menu', 'undo', null),
      redo: () => editor.trigger('ra2web-context-menu', 'redo', null),
      cut: () => editor.trigger('ra2web-context-menu', 'editor.action.clipboardCutAction', null),
      copy: () => editor.trigger('ra2web-context-menu', 'editor.action.clipboardCopyAction', null),
      paste: () => editor.trigger('ra2web-context-menu', 'editor.action.clipboardPasteAction', null),
      selectAll: () => editor.trigger('ra2web-context-menu', 'editor.action.selectAll', null),
      hasSelection: () => {
        const selections = editor.getSelections?.()
        if (Array.isArray(selections) && selections.length > 0) {
          return selections.some((selection: { isEmpty: () => boolean }) => !selection.isEmpty())
        }
        const selection = editor.getSelection?.()
        return !!selection && !selection.isEmpty()
      },
      canEdit: () => !readOnly,
    }
    onEditorReady?.(handle)
  }, [onEditorReady, readOnly])

  if (effectiveLoading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (effectiveError) return <div className="p-3 text-red-400 text-sm">{effectiveError}</div>

  if (Monaco) {
    const Editor = Monaco
    return (
      <div
        className="vscode-editor-shell"
        data-context-kind="editable-text"
        data-editable-kind="monaco"
      >
        <Editor
          height="100%"
          path={source.resolved?.displayPath ?? selectedFile ?? ''}
          defaultLanguage="plaintext"
          value={effectiveContent || ''}
          onChange={(next: string | undefined) => onChange?.(next ?? '')}
          onMount={handleEditorMount}
          options={{
            ...vscodeEditorOptions,
            readOnly,
          }}
          theme="vs-dark"
        />
      </div>
    )
  }

  return (
    <div className="vscode-editor-fallback">
      <pre className="vscode-editor-fallback__content">{effectiveContent}</pre>
    </div>
  )
}

export default TxtViewer
