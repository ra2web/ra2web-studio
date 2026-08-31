import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapDocument } from '../../data/map/MapDocument'
import { renderWithProviders } from '../../test/render'
import MapEditor, { type MapEditorSession } from './MapEditor'
import NewMapDialog from './NewMapDialog'

vi.mock('./MapViewport', () => ({
  default: ({ onPaint }: { onPaint: (rx: number, ry: number) => void }) => (
    <button type="button" data-testid="map-viewport" onClick={() => onPaint(12, 12)}>viewport</button>
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
    expect(screen.getByText(/抬高单格|Raise tile/)).toBeInTheDocument()
    expect(screen.getByText(/降低单格|Lower tile/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /触发器|Triggers/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /阵营|Houses/ })).toBeInTheDocument()
    expect(screen.getByTestId('map-minimap')).toBeInTheDocument()
    expect(screen.getByTestId('map-resize-left')).toBeInTheDocument()
    expect(screen.getByTestId('map-resize-top')).toBeInTheDocument()
    expect(screen.getByText(/复制区域|Copy region/)).toBeInTheDocument()
    expect(screen.getByText(/^桥$|^Bridge$/)).toBeInTheDocument()
    expect(screen.getByText(/^墙$|^Wall$/)).toBeInTheDocument()
    expect(screen.getByText(/随机地形物|Random terrain/)).toBeInTheDocument()
    expect(screen.getByText(/隐藏瓦片集|Hide tileset/)).toBeInTheDocument()
    expect(screen.getByText(/隐藏格子|Hide field/)).toBeInTheDocument()
    expect(screen.getByTestId('map-show-tilesets')).toBeInTheDocument()
    expect(screen.getByText(/^宝石$|^Gems$/)).toBeInTheDocument()
    expect(screen.getByText(/矿脉洞|Veinhole/)).toBeInTheDocument()
  })

  it('exposes FA2 map tools, globals and user scripts', () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /地图工具|Map tools/ }))
    expect(screen.getByTestId('map-maptools-panel')).toBeInTheDocument()
    expect(screen.getByTestId('map-globals-panel')).toBeInTheDocument()
    expect(screen.getByTestId('map-user-script')).toBeInTheDocument()
    expect(screen.getByTestId('map-search-waypoint')).toBeInTheDocument()
    expect(screen.getByTestId('map-height-rect')).toBeInTheDocument()
    expect(screen.getByTestId('map-auto-shore')).toBeInTheDocument()
    expect(screen.getByTestId('map-auto-level')).toBeInTheDocument()
    expect(screen.getByTestId('map-copy-whole')).toBeInTheDocument()
    expect(screen.getByTestId('map-overlay-data')).toBeInTheDocument()
    expect(screen.getByTestId('map-ini-section')).toBeInTheDocument()
    expect(screen.getByTestId('map-change-height')).toBeInTheDocument()
    expect(screen.getByTestId('map-slope-correction')).toBeInTheDocument()
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
    const overlay = session.document.getOverlay(12, 12)
    expect(overlay.id).not.toBe(255)
  })

  it('writes Basic.Name through the INI editor', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /地图工具|Map tools/ }))
    fireEvent.change(screen.getByTestId('map-ini-key'), { target: { value: 'Name' } })
    fireEvent.change(screen.getByTestId('map-ini-value'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByTestId('map-ini-set'))
    expect(session.document.basic.name).toBe('Renamed')
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

  it('writes overlay data onto the painted cell', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Overlay$/ }))
    fireEvent.change(screen.getByTestId('map-overlay-data'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.getOverlay(12, 12).value).toBe(5)
  })

  it('enables AITriggerTypesEnable when adding an AI trigger', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /AI 触发|AI triggers/ }))
    fireEvent.click(screen.getByText(/Add AITrigger/))
    expect(screen.getByTestId('map-ai-enable')).toBeInTheDocument()
    expect(Object.values(session.document.aiTriggerEnable).some(Boolean)).toBe(true)
  })

  it('exposes FAData event types after adding a trigger', async () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /触发器|Triggers/ }))
    fireEvent.click(screen.getByText(/添加触发器|Add trigger/))
    expect(await screen.findByTestId('map-event-type')).toBeInTheDocument()
    expect(screen.getByTestId('map-tags-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('map-add-tag'))
    expect(screen.getAllByDisplayValue('New Tag').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('map-tileset-browser')).toBeInTheDocument()
  })

  it('hides a field without writing map INI', () => {
    const session = makeSession()
    const before = session.document.toIniString()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /隐藏格子|Hide field/ }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.toIniString()).toBe(before)
  })

  it('runs a user script after confirming FA2 INI protection prompt', () => {
    const session = makeSession()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /地图工具|Map tools/ }))
    fireEvent.click(screen.getByTestId('map-run-script'))
    expect(screen.getByTestId('map-script-report').textContent).toMatch(/16x16/)
  })

  it('raises a single tile without changing its tileNum', () => {
    const session = makeSession()
    const cell = session.document.getCell(12, 12)
    cell.tileNum = 77
    session.document.setCell(cell)
    const origin = cell.height
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /抬高单格|Raise tile/ }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.getCell(12, 12).height).toBe(origin + 1)
    expect(session.document.getCell(12, 12).tileNum).toBe(77)
  })

  it('creates a FA2 teamtype with Whiner/Autocreate and TMissions', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /队伍|Teams/ }))
    fireEvent.click(screen.getByTestId('map-add-script'))
    fireEvent.click(screen.getByTestId('map-add-team'))
    expect(screen.getByTestId('map-teams-panel').textContent).toMatch(/whiner/i)
    expect(screen.getByTestId('map-teams-panel').textContent).toMatch(/isBaseDefense/)
    expect(screen.getByTestId('map-script-mission')).toBeInTheDocument()
    expect(session.document.teams[0]?.autocreate).toBe(true)
    expect(session.document.teams[0]?.full).toBe(true)
    expect(session.document.teams[0]?.max).toBe(5)
    expect(session.document.toIniString()).toMatch(/Whiner=no/)
    expect(session.document.toIniString()).toMatch(/New teamtype/)
  })

  it('edits FA2 single-player NextScenario', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.change(screen.getByTestId('map-basic-nextScenario'), { target: { value: 'map02.md' } })
    expect(session.document.basic.nextScenario).toBe('map02.md')
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
