import React, { useCallback, useEffect, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { vscodeEditorOptions } from './monacoOptions'
import type { PreviewEditorHandle } from './types'

type MixFileData = { file: File; info: MixFileInfo }

const TxtViewer: React.FC<{
  selectedFile: string
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
  onEditorReady?: (handle: PreviewEditorHandle | null) => void
}> = ({ selectedFile, mixFiles, onEditorReady }) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [Monaco, setMonaco] = useState<React.ComponentType<any> | null>(null)

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
        if (!cancelled) setError(e?.message || 'Failed to load TXT')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles])

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>

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
      canEdit: () => false,
    }
    onEditorReady?.(handle)
  }, [onEditorReady])

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
          defaultLanguage="plaintext"
          value={content || ''}
          onMount={handleEditorMount}
          options={{
            ...vscodeEditorOptions,
            readOnly: true,
          }}
          theme="vs-dark"
        />
      </div>
    )
  }

  return (
    <div className="vscode-editor-fallback">
      <pre className="vscode-editor-fallback__content">{content}</pre>
    </div>
  )
}

export default TxtViewer
