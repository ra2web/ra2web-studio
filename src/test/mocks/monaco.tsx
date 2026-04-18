import React from 'react'

type MonacoEditorMockProps = {
  value?: string
  onChange?: (value?: string) => void
  onMount?: (editor: any) => void
  readOnly?: boolean
}

export const MonacoEditorMock: React.FC<MonacoEditorMockProps> = ({
  value = '',
  onChange,
  onMount,
  readOnly = false,
}) => {
  React.useEffect(() => {
    onMount?.({
      focus() {},
      trigger() {},
      getSelection() {
        return {
          isEmpty: () => value.length === 0,
        }
      },
    })
  }, [onMount, value])

  return (
    <textarea
      data-context-kind="editable-text"
      data-editable-kind="monaco"
      readOnly={readOnly}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  )
}
