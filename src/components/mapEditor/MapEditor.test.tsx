import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapDocument } from '../../data/map/MapDocument'
import { VirtualFile } from '../../data/vfs/VirtualFile'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { renderWithProviders } from '../../test/render'
import MapEditor, { type MapEditorSession } from './MapEditor'
import NewMapDialog from './NewMapDialog'

vi.mock('./MapViewport', () => ({
  default: ({ onPaint, onPick, onMoveObject }: {
    onPaint: (rx: number, ry: number, extra?: { subCell?: number }) => void
    onPick: (pick: { rx: number; ry: number; clientX: number; clientY: number; longPress: boolean; doubleClick?: boolean; subCell?: number }) => void
    onMoveObject?: (move: { kind: string; id: string; rx: number; ry: number; toRx: number; toRy: number; copy: boolean }) => void
  }) => (
    <div>
      <button type="button" data-testid="map-viewport" onClick={() => onPaint(12, 12)}>viewport</button>
      <button type="button" data-testid="map-viewport-end" onClick={() => onPaint(18, 12)}>end</button>
      <button type="button" data-testid="map-viewport-pick" onClick={() => onPick({ rx: 12, ry: 12, clientX: 0, clientY: 0, longPress: false, subCell: 0 })}>pick</button>
      <button type="button" data-testid="map-viewport-dblclick" onClick={() => onPick({ rx: 12, ry: 12, clientX: 0, clientY: 0, longPress: false, doubleClick: true, subCell: 0 })}>dblclick</button>
      <button type="button" data-testid="map-viewport-longpress" onClick={() => onPick({ rx: 12, ry: 12, clientX: 0, clientY: 0, longPress: true })}>longpress</button>
      <button
        type="button"
        data-testid="map-viewport-drag"
        onClick={() => onMoveObject?.({ kind: 'unit', id: 'u1', rx: 8, ry: 8, toRx: 9, toRy: 10, copy: false })}
      >
        drag
      </button>
    </div>
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

function rulesContext(): ResourceContext {
  const text = (value: string, name: string) => VirtualFile.fromBytes(new TextEncoder().encode(value), name)
  const rules = text(`[InfantryTypes]
0=E1
[BuildingTypes]
0=GAPOWR
[GAPOWR]
Image=GAPOWR
`, 'rules.ini')
  const art = text(`[GAPOWR]
Foundation=2x3
BibShape=GAPOWRB
`, 'art.ini')
  return {
    resolveFileFromOverlay: async (name: string) => {
      const lower = name.toLowerCase()
      if (lower.includes('rules')) return rules
      if (lower.includes('art')) return art
      return null
    },
  } as ResourceContext
}

describe('MapEditor', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  })

  it('renders FA2 tools and logic tabs', () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    expect(screen.getByTestId('map-editor')).toHaveAttribute('data-suppress-studio-context-menu', 'true')
    expect(fireEvent.contextMenu(screen.getByTestId('map-editor'))).toBe(false)
    expect(screen.getByTestId('map-theater-missing')).toBeInTheDocument()
    expect(screen.getByText(/抬高地形|Raise ground/)).toBeInTheDocument()
    expect(screen.getByText(/抬高单格|Raise tile/)).toBeInTheDocument()
    expect(screen.getByText(/降低单格|Lower tile/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /触发器|Triggers/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /阵营|Houses/ })).toBeInTheDocument()
    expect(screen.getByTestId('map-minimap')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /基本|Basic/ }))
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
    expect(screen.getByRole('button', { name: /触发位置|Trigger location/ })).toBeInTheDocument()
    expect(screen.getByTestId('map-brush-bar')).toBeInTheDocument()
    expect(screen.getByTestId('map-tileset-preview')).toBeInTheDocument()
    expect(screen.getByTestId('map-brush-size')).toBeDisabled()
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
    expect(screen.getByText(/搜索触发位置|Search trigger location/)).toBeInTheDocument()
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

  it('exposes FA2 bridge ends, connect, and repair hut as separate actions', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByText(/^桥$|^Bridge$/))
    fireEvent.click(screen.getByRole('button', { name: /高架坡道|High ramps/ }))
    expect(screen.getByTestId('map-tileset-preview')).toBeInTheDocument()
    expect(screen.getByTestId('map-tileset-resize')).toBeInTheDocument()
    expect(screen.getByTestId('map-bridge-connect-hint').textContent).toMatch(/底部|facing|browser|rotate|朝向/)
    fireEvent.click(screen.getByRole('button', { name: /小桥|Small bridge/ }))
    expect(screen.getByTestId('map-bridge-kind')).toHaveValue('small')
    expect(screen.getByTestId('map-bridge-connect-hint').textContent).toMatch(/Overlay/)
    fireEvent.click(screen.getByRole('button', { name: /大桥|Big bridge/ }))
    expect(screen.getByTestId('map-bridge-connect-hint').textContent).toMatch(/高架|High ramps/)
    fireEvent.click(screen.getByTestId('map-viewport'))
    fireEvent.click(screen.getByTestId('map-viewport-end'))
    expect(session.document.getOverlay(12, 12).id).not.toBe(255)
    fireEvent.click(screen.getByRole('button', { name: /桥梁维修小屋|Bridge repair hut/ }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.structures.some((item) => item.name === 'CAARMR')).toBe(true)
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
    fireEvent.click(screen.getByTestId('map-add-ai-trigger'))
    expect(screen.getByTestId('map-ai-enable')).toBeInTheDocument()
    expect(screen.getByTestId('map-ai-type')).toBeInTheDocument()
    expect(Object.values(session.document.aiTriggerEnable).some(Boolean)).toBe(true)
    const line = session.document.toIniString().split('\n').find((item) => item.includes('New AI Trigger'))
    expect(line?.split(',').length).toBe(18)
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
    expect(screen.getByTestId('map-raise-tile-hint')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.getCell(12, 12).height).toBe(origin + 1)
    expect(session.document.getCell(12, 12).tileNum).toBe(77)
  })

  it('does not open the map-name panel on brush long-press', () => {
    renderWithProviders(
      <MapEditor session={makeSession()} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId('map-viewport-longpress'))
    expect(screen.getByTestId('map-logic-panel')).toHaveAttribute('data-open', '0')
    expect(screen.queryByTestId('map-object-props')).not.toBeInTheDocument()
  })

  it('keeps object properties collapsed until a double-click', () => {
    const session = makeSession()
    session.document.infantry.push({
      id: '1', owner: 'Americans', name: 'E1', health: 256, rx: 12, ry: 12,
      direction: 64, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
      onBridge: false, recruitable: false, aiRecruitable: false, subCell: 0, extra: [],
    })
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId('map-viewport-pick'))
    expect(screen.getByTestId('map-object-props')).toBeInTheDocument()
    expect(screen.getByTestId('map-object-props').querySelector('[data-testid="map-object-inspector"]')).toBeNull()
    fireEvent.click(screen.getByTestId('map-viewport-dblclick'))
    expect(screen.getByTestId('map-logic-panel')).toHaveAttribute('data-open', '0')
    const owner = screen.getByTestId('map-object-props').querySelector('select')
    expect(owner).toBeTruthy()
    fireEvent.change(owner as HTMLSelectElement, { target: { value: 'Russians' } })
    expect(session.document.infantry[0].owner).toBe('Russians')
    const facing = screen.getByTestId('map-object-props').querySelectorAll('select')[1]
    fireEvent.change(facing, { target: { value: '128' } })
    expect(session.document.infantry[0].direction).toBe(128)
    const overlay = screen.getByTestId('map-object-props')
    fireEvent.click(screen.getByTestId('map-object-props-collapse'))
    expect(overlay.querySelector('[data-testid="map-object-inspector"]')).toBeNull()
    fireEvent.click(screen.getByTestId('map-object-props-collapse'))
    expect(overlay.querySelector('[data-testid="map-object-inspector"]')).not.toBeNull()
    fireEvent.click(screen.getByTestId('map-object-props-close'))
    expect(screen.queryByTestId('map-object-props')).not.toBeInTheDocument()
  })

  it('places three infantry in one cell and rejects a fourth', async () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} resourceContext={rulesContext()} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'E1' }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(screen.getByTestId('map-object-props').querySelector('[data-testid="map-object-inspector"]')).toBeNull()
    fireEvent.click(screen.getByTestId('map-viewport'))
    fireEvent.click(screen.getByTestId('map-viewport'))
    fireEvent.click(screen.getByTestId('map-viewport'))
    const here = session.document.infantry.filter((item) => item.rx === 12 && item.ry === 12)
    expect(here).toHaveLength(3)
    expect(new Set(here.map((item) => item.subCell)).size).toBe(3)
    expect(here.every((item) => item.direction === 128)).toBe(true)
    expect(here.every((item) => item.owner === 'Neutral')).toBe(true)
  })

  it('rejects overlapping building foundations', async () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} resourceContext={rulesContext()} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'GAPOWR' }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    fireEvent.click(screen.getByTestId('map-viewport'))
    const placed = session.document.structures.filter((item) => item.name === 'GAPOWR')
    expect(placed).toHaveLength(1)
    expect(placed[0].owner).toBe('Neutral')
    expect(placed[0].direction).toBe(128)
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
    fireEvent.click(screen.getByRole('button', { name: /基本|Basic/ }))
    fireEvent.change(screen.getByTestId('map-basic-nextScenario'), { target: { value: 'map02.md' } })
    expect(session.document.basic.nextScenario).toBe('map02.md')
  })

  it('writes remaining Basic/LocalSize fields and adds a house', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /基本|Basic/ }))
    fireEvent.change(screen.getByTestId('map-basic-fillSilos'), { target: { value: 'yes' } })
    fireEvent.change(screen.getByTestId('map-localWidth'), { target: { value: '10' } })
    expect(session.document.basic.fillSilos).toBe('yes')
    expect(session.document.localWidth).toBe(10)
    fireEvent.click(screen.getByRole('button', { name: /阵营|Houses/ }))
    fireEvent.change(screen.getByTestId('map-house-name'), { target: { value: 'CustomAI' } })
    fireEvent.click(screen.getByTestId('map-add-house'))
    expect(session.document.houses.some((house) => house.name === 'CustomAI')).toBe(true)
    expect(screen.getByTestId('map-building-outline')).toBeInTheDocument()
    expect(screen.getByTestId('map-mobile-logic-toggle')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('map-mobile-logic-close'))
    expect(screen.getByTestId('map-logic-panel')).toHaveAttribute('data-open', '0')
    fireEvent.click(screen.getByTestId('map-mobile-logic-toggle'))
    expect(screen.getByTestId('map-logic-panel')).toHaveAttribute('data-open', '1')
  })

  it('moves FA2 start waypoint 0-7 instead of appending a trigger location', () => {
    const session = makeSession()
    const before = session.document.waypoints.find((item) => item.number === 3)
    expect(before).toBeTruthy()
    expect(before?.rx).not.toBe(12)
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /玩家 4|Player 4/ }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.waypoints).toHaveLength(8)
    expect(session.document.waypoints.filter((item) => item.number === 3)).toHaveLength(1)
    expect(session.document.waypoints.find((item) => item.number === 3)).toMatchObject({ rx: 12, ry: 12 })
    expect(session.document.waypoints.some((item) => item.number === 8)).toBe(false)
  })

  it('creates the next free waypoint from the waypoint tool', () => {
    const session = makeSession()
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /触发位置|Trigger location/ }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.waypoints.some((item) => item.number === 8 && item.rx === 12 && item.ry === 12)).toBe(true)
  })

  it('deletes only the waypoint when using start-point erase', () => {
    const session = makeSession()
    session.document.waypoints.find((item) => item.number === 3)!.rx = 12
    session.document.waypoints.find((item) => item.number === 3)!.ry = 12
    session.document.infantry.push({
      id: 'i1', owner: 'Americans', name: 'E1', health: 256, rx: 12, ry: 12,
      direction: 64, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
      onBridge: false, recruitable: false, aiRecruitable: false, subCell: 0, extra: [],
    })
    renderWithProviders(
      <MapEditor session={session} onChange={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /删除出生点|Delete start point/ }))
    fireEvent.click(screen.getByTestId('map-viewport'))
    expect(session.document.waypoints.some((item) => item.number === 3)).toBe(false)
    expect(session.document.infantry).toHaveLength(1)
  })

  it('moves a unit when the select tool finishes a drag', () => {
    const session = makeSession()
    session.document.units.push({
      id: 'u1',
      owner: 'Americans',
      name: 'MTNK',
      health: 256,
      rx: 8,
      ry: 8,
      direction: 64,
      mission: 'Guard',
      tag: 'none',
      veterancy: 0,
      group: -1,
      onBridge: false,
      recruitable: false,
      aiRecruitable: false,
      extra: [],
    })
    const onChange = vi.fn()
    renderWithProviders(
      <MapEditor session={session} onChange={onChange} onSave={vi.fn()} onExit={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId('map-viewport-drag'))
    expect(session.document.units[0]).toMatchObject({ id: 'u1', rx: 9, ry: 10 })
    expect(onChange).toHaveBeenCalled()
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
