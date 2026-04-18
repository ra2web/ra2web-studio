import React, { useCallback, useEffect, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { vscodeEditorOptions } from './monacoOptions'
import type { PreviewEditorHandle } from './types'

type MixFileData = { file: File; info: MixFileInfo }

interface IniViewerProps {
  selectedFile: string
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
  value?: string
  loadingOverride?: boolean
  errorOverride?: string | null
  onChange?: (next: string) => void
  readOnly?: boolean
  onEditorReady?: (handle: PreviewEditorHandle | null) => void
}

const IniViewer: React.FC<IniViewerProps> = ({
  selectedFile,
  mixFiles,
  value,
  loadingOverride,
  errorOverride,
  onChange,
  readOnly = true,
  onEditorReady,
}) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [Monaco, setMonaco] = useState<React.ComponentType<any> | null>(null)
  const externallyManaged = value !== undefined || loadingOverride !== undefined || errorOverride !== undefined

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
      setLoading(true)
      setError(null)
      setContent('')
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')
        const text = vf.readAsString()
        if (!cancelled) setContent(text)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load INI')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [externallyManaged, selectedFile, mixFiles])

  const effectiveContent = value ?? content
  const effectiveLoading = loadingOverride ?? (!externallyManaged ? loading : false)
  const effectiveError = errorOverride ?? (!externallyManaged ? error : null)

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
          path={selectedFile}
          defaultLanguage="ini"
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

export default IniViewer
