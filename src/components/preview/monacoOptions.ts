export const vscodeEditorOptions = {
  wordWrap: 'on' as const,
  minimap: { enabled: false },
  // Let the app-level context menu fully own default right-click handling.
  contextmenu: false,
  scrollBeyondLastLine: false,
  lineNumbers: 'on' as const,
  renderWhitespace: 'selection' as const,
  automaticLayout: true,
  fontFamily: "'Cascadia Code', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', monospace",
  fontSize: 14,
  lineHeight: 22,
  tabSize: 2,
  padding: {
    top: 14,
    bottom: 14,
  },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    verticalScrollbarSize: 12,
    horizontalScrollbarSize: 12,
    useShadows: false,
    alwaysConsumeMouseWheel: false,
  },
  smoothScrolling: true,
  cursorBlinking: 'smooth' as const,
  renderLineHighlight: 'gutter' as const,
  guides: {
    indentation: true,
  },
  roundedSelection: false,
}
