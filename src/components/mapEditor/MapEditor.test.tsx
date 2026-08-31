import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapDocument } from '../../data/map/MapDocument'
import { renderWithProviders } from '../../test/render'
import MapEditor, { type MapEditorSession } from './MapEditor'
import NewMapDialog from './NewMapDialog'

vi.mock('./MapViewport', () => ({
  default: ({ onPaint }: { onPaint: (rx: number, ry: number) => void }) => (
    <button type="button" data-testid="map-viewport" onClick={() => onPaint(8, 8)}>viewport</button>
  ),
}))

vi.mock('./MapMiniMap', () => ({
  default: () => <canvas data-testid="map-minimap" />,
}))

function makeSession(): MapEditorSession {
  const document = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
  return {
    filePath: 'maps/test.map',
    original: document.toIniString(),
    document,
    loading: false,
    error: null,
  }
}

describe('MapEditor', () => {
  it('renders FA2 tools and logic tabs', () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    expect(screen.getByTestId('map-editor')).toBeInTheDocument()
    expect(screen.getByText(/抬高地形|Raise ground/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /触发器|Triggers/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /阵营|Houses/ })).toBeInTheDocument()
    expect(screen.getByTestId('map-minimap')).toBeInTheDocument()
    expect(screen.getByText(/复制区域|Copy region/)).toBeInTheDocument()
  })

  it('paints ore through the viewport and keeps overlay', () => {
    const session = makeSession()
    const onChange = vi.fn()
    renderWithProviders(
      <MapEditor session={session} onChange={onChange} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByText(/矿石|Ore/))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(onChange).toHaveBeenCalled()
    const overlay = session.document.getOverlay(8, 8)
    expect(overlay.id).not.toBe(255)
  })

  it('exposes house color and playerControl', () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /阵营|Houses/ }))
    expect(screen.getByTestId('map-houses-panel').textContent).toMatch(/PlayerControl/)
    expect(screen.getByTestId('map-houses-panel').textContent).toMatch(/color/i)
  })

  it('exposes SpecialFlags under lighting', () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /光照|Lighting/ }))
    expect(screen.getByTestId('map-special-flags')).toBeInTheDocument()
  })

  it('exposes FAData event types after adding a trigger', async () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /触发器|Triggers/ }))
    fireEvent.click(screen.getByText(/添加触发器|Add trigger/))
    expect(await screen.findByTestId('map-event-type')).toBeInTheDocument()
    expect(screen.getByTestId('map-tileset-browser')).toBeInTheDocument()
  })
})

describe('NewMapDialog', () => {
  it('emits FA2 new-map options', () => {
    const onCreate = vi.fn()
    renderWithProviders(<NewMapDialog open onCancel={vi.fn()} onCreate={onCreate} />)
    fireEvent.click(screen.getByText(/^确定$|^OK$/))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      width: 50,
      height: 50,
      theater: 'TEMPERATE',
      multiplayer: true,
      yuriRevenge: true,
    }))
  })
})
