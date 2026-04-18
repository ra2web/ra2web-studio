import { fireEvent, screen } from '@testing-library/react'
import AppContextMenu from './AppContextMenu'
import { renderWithProviders } from '../../test/render'

describe('AppContextMenu', () => {
  it('renders commands and dispatches clicks', () => {
    const onCommand = vi.fn()

    renderWithProviders(
      <AppContextMenu
        open
        target={{ kind: 'global-shell', clientX: 40, clientY: 60 }}
        onClose={() => {}}
        onCommand={onCommand}
        entries={[
          {
            kind: 'item',
            id: 'exportTopMix',
            label: 'Export Top MIX',
            icon: 'download',
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export Top MIX' }))

    expect(onCommand).toHaveBeenCalledWith('exportTopMix')
  })

  it('closes on escape', () => {
    const onClose = vi.fn()

    renderWithProviders(
      <AppContextMenu
        open
        target={{ kind: 'global-shell', clientX: 10, clientY: 10 }}
        onClose={onClose}
        onCommand={() => {}}
        entries={[
          {
            kind: 'item',
            id: 'exportCurrentMix',
            label: 'Export Current MIX',
            icon: 'archive',
          },
        ]}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('closes on outside pointer down', () => {
    const onClose = vi.fn()

    renderWithProviders(
      <div>
        <button type="button">Outside</button>
        <AppContextMenu
          open
          target={{ kind: 'global-shell', clientX: 10, clientY: 10 }}
          onClose={onClose}
          onCommand={() => {}}
          entries={[
            {
              kind: 'item',
              id: 'exportCurrentMix',
              label: 'Export Current MIX',
              icon: 'archive',
            },
          ]}
        />
      </div>,
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }))

    expect(onClose).toHaveBeenCalled()
  })
})
