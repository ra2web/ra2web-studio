import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Loader2, Map as MapIcon, Redo2, Save, Undo2, X,
} from 'lucide-react'
import { EMPTY_OVERLAY } from '../../data/map/constants'
import { MapCommandStack, flattenHeight, paintHeight, paintTile } from '../../data/map/MapCommandStack'
import { MapDocument, createMapObjectId } from '../../data/map/MapDocument'
import { applyOreBrush, clearOverlay, OBJECT_TOOLS, type MapEditorTool } from '../../data/map/mapTools'
import { useLocale } from '../../i18n/LocaleContext'
import MapViewport, { type MapViewportPick } from './MapViewport'

export type MapEditorSession = {
  filePath: string
  original: string
  document: MapDocument
  loading: boolean
  error: string | null
}

type LogicTab = 'houses' | 'triggers' | 'teams' | 'lighting' | 'tubes' | 'basic'

const TOOLS: { id: MapEditorTool; labelKey: string }[] = [
  { id: 'pan', labelKey: 'mapEditor.toolPan' },
  { id: 'select', labelKey: 'mapEditor.toolSelect' },
  { id: 'raise', labelKey: 'mapEditor.toolRaise' },
  { id: 'lower', labelKey: 'mapEditor.toolLower' },
  { id: 'flatten', labelKey: 'mapEditor.toolFlatten' },
  { id: 'tile', labelKey: 'mapEditor.toolTile' },
  { id: 'ore', labelKey: 'mapEditor.toolOre' },
  { id: 'overlay', labelKey: 'mapEditor.toolOverlay' },
  { id: 'eraseOverlay', labelKey: 'mapEditor.toolEraseOverlay' },
  { id: 'infantry', labelKey: 'mapEditor.toolInfantry' },
  { id: 'unit', labelKey: 'mapEditor.toolUnit' },
  { id: 'aircraft', labelKey: 'mapEditor.toolAircraft' },
  { id: 'structure', labelKey: 'mapEditor.toolStructure' },
  { id: 'terrain', labelKey: 'mapEditor.toolTerrain' },
  { id: 'smudge', labelKey: 'mapEditor.toolSmudge' },
  { id: 'waypoint', labelKey: 'mapEditor.toolWaypoint' },
  { id: 'celltag', labelKey: 'mapEditor.toolCellTag' },
  { id: 'eraseObject', labelKey: 'mapEditor.toolEraseObject' },
  { id: 'tube', labelKey: 'mapEditor.toolTube' },
]

type MapEditorProps = {
  session: MapEditorSession
  onChange: (document: MapDocument) => void
  onSave: () => void | Promise<void>
  onExit: () => void
  saving?: boolean
}

const MapEditor: React.FC<MapEditorProps> = ({ session, onChange, onSave, onExit, saving }) => {
  const { t } = useLocale()
  const stackRef = useRef(new MapCommandStack())
  const [tool, setTool] = useState<MapEditorTool>('raise')
  const [brush, setBrush] = useState(1)
  const [tileNum, setTileNum] = useState(0)
  const [overlayId, setOverlayId] = useState(102)
  const [owner, setOwner] = useState('Americans')
  const [objectName, setObjectName] = useState('E1')
  const [panX, setPanX] = useState(80)
  const [panY, setPanY] = useState(40)
  const [scale, setScale] = useState(0.45)
  const [selected, setSelected] = useState<{ rx: number; ry: number } | null>(null)
  const [logicTab, setLogicTab] = useState<LogicTab>('basic')
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const tubeStartRef = useRef<{ rx: number; ry: number } | null>(null)
  const doc = session.document

  const bump = useCallback((next: MapDocument) => {
    onChange(next)
    setRevision((value) => value + 1)
  }, [onChange])

  const handlePaint = useCallback((rx: number, ry: number) => {
    const working = doc
    switch (tool) {
      case 'raise':
        paintHeight(working, rx, ry, 1, brush)
        break
      case 'lower':
        paintHeight(working, rx, ry, -1, brush)
        break
      case 'flatten':
        flattenHeight(working, rx, ry, brush)
        break
      case 'tile':
        paintTile(working, rx, ry, tileNum, brush)
        break
      case 'ore':
        applyOreBrush(working, rx, ry)
        break
      case 'overlay':
        working.setOverlay(rx, ry, overlayId, 0)
        break
      case 'eraseOverlay':
        clearOverlay(working, rx, ry)
        break
      case 'infantry':
        working.infantry.push({
          id: createMapObjectId(), owner, name: objectName, health: 256, rx, ry,
          direction: 0, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, subCell: 0, extra: [],
        })
        break
      case 'unit':
        working.units.push({
          id: createMapObjectId(), owner, name: objectName, health: 256, rx, ry,
          direction: 64, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, extra: [],
        })
        break
      case 'aircraft':
        working.aircraft.push({
          id: createMapObjectId(), owner, name: objectName, health: 256, rx, ry,
          direction: 64, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, extra: [],
        })
        break
      case 'structure':
        working.structures.push({
          id: createMapObjectId(), owner, name: objectName, health: 256, rx, ry,
          direction: 0, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, poweredOn: true, extra: [],
        })
        break
      case 'terrain':
        working.terrains.push({ id: createMapObjectId(), name: objectName, rx, ry })
        break
      case 'smudge':
        working.smudges.push({ id: createMapObjectId(), name: objectName, rx, ry, extra: 0 })
        break
      case 'waypoint': {
        const nextNumber = working.waypoints.reduce((max, item) => Math.max(max, item.number), -1) + 1
        working.waypoints.push({ number: nextNumber, rx, ry })
        break
      }
      case 'celltag':
        if (working.tags[0]) working.cellTags.push({ rx, ry, tagId: working.tags[0].id })
        break
      case 'eraseObject':
        working.units = working.units.filter((item) => !(item.rx === rx && item.ry === ry))
        working.infantry = working.infantry.filter((item) => !(item.rx === rx && item.ry === ry))
        working.aircraft = working.aircraft.filter((item) => !(item.rx === rx && item.ry === ry))
        working.structures = working.structures.filter((item) => !(item.rx === rx && item.ry === ry))
        working.terrains = working.terrains.filter((item) => !(item.rx === rx && item.ry === ry))
        working.smudges = working.smudges.filter((item) => !(item.rx === rx && item.ry === ry))
        working.waypoints = working.waypoints.filter((item) => !(item.rx === rx && item.ry === ry))
        working.cellTags = working.cellTags.filter((item) => !(item.rx === rx && item.ry === ry))
        break
      case 'tube':
        if (!tubeStartRef.current) {
          tubeStartRef.current = { rx, ry }
        } else {
          const start = tubeStartRef.current
          working.tubes.push({
            id: String(working.tubes.length),
            startX: start.rx,
            startY: start.ry,
            startDir: 0,
            endX: rx,
            endY: ry,
            parts: [0],
          })
          tubeStartRef.current = null
        }
        break
      default:
        break
    }
    setSelected({ rx, ry })
    bump(working)
  }, [brush, bump, doc, objectName, overlayId, owner, tileNum, tool])

  const strokeRef = useRef<{ commit: () => void } | null>(null)
  const handleStrokeStart = useCallback(() => {
    if (OBJECT_TOOLS.includes(tool) || tool === 'tube') {
      const before = doc.toIniString()
      strokeRef.current = {
        commit: () => {
          const after = doc.toIniString()
          stackRef.current.push({
            label: tool,
            apply: (target) => target.copyFrom(MapDocument.parse(after)),
            revert: (target) => target.copyFrom(MapDocument.parse(before)),
          })
        },
      }
      return
    }
    strokeRef.current = stackRef.current.beginTerrain(doc, tool)
  }, [doc, tool])
  const handleStrokeEnd = useCallback(() => {
    strokeRef.current?.commit()
    strokeRef.current = null
    bump(doc)
  }, [bump, doc])

  const handlePick = useCallback((pick: MapViewportPick) => {
    setSelected({ rx: pick.rx, ry: pick.ry })
    if (pick.longPress) setLogicTab('basic')
  }, [])

  const undo = () => {
    if (stackRef.current.undo(doc)) bump(doc)
  }
  const redo = () => {
    if (stackRef.current.redo(doc)) bump(doc)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selectedInfo = useMemo(() => {
    if (!selected) return t('mapEditor.noSelection')
    const cell = doc.getCell(selected.rx, selected.ry)
    const overlay = doc.getOverlay(selected.rx, selected.ry)
    return `${selected.rx},${selected.ry}  h=${cell.height}  tile=${cell.tileNum}  ov=${overlay.id === EMPTY_OVERLAY ? '-' : overlay.id}`
  }, [doc, selected, t, revision])

  const editor = (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-gray-100" data-testid="map-editor">
      <header className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900 px-2">
        <MapIcon size={16} />
        <div className="min-w-0 flex-1 truncate text-sm">{session.filePath}</div>
        <button type="button" className="rounded p-2 hover:bg-gray-800" onClick={undo} title={t('mapEditor.undo')} aria-label={t('mapEditor.undo')}><Undo2 size={16} /></button>
        <button type="button" className="rounded p-2 hover:bg-gray-800" onClick={redo} title={t('mapEditor.redo')} aria-label={t('mapEditor.redo')}><Redo2 size={16} /></button>
        <button type="button" className="rounded bg-blue-600 px-3 py-1 text-sm disabled:opacity-50" onClick={() => { void onSave() }} disabled={saving}>
          {saving ? <Loader2 className="inline animate-spin" size={14} /> : <Save className="mr-1 inline" size={14} />}
          {t('mapEditor.save')}
        </button>
        <button type="button" className="rounded p-2 hover:bg-gray-800" onClick={onExit} aria-label={t('mapEditor.exit')}><X size={16} /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 flex-shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-900 p-2 md:block" data-testid="map-tool-rail">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mb-1 block w-full rounded px-2 py-2 text-left text-sm ${tool === item.id ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
              onClick={() => setTool(item.id)}
            >
              {t(item.labelKey as never)}
            </button>
          ))}
          <label className="mt-3 block text-xs text-gray-400">
            {t('mapEditor.brush')}
            <input type="range" min={1} max={5} value={brush} onChange={(event) => setBrush(Number(event.target.value))} className="w-full" />
          </label>
          <label className="mt-2 block text-xs text-gray-400">
            {t('mapEditor.owner')}
            <select className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={owner} onChange={(event) => setOwner(event.target.value)}>
              {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
            </select>
          </label>
          <label className="mt-2 block text-xs text-gray-400">
            {t('mapEditor.objectName')}
            <input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={objectName} onChange={(event) => setObjectName(event.target.value)} />
          </label>
          <label className="mt-2 block text-xs text-gray-400">
            {t('mapEditor.tileId')}
            <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={tileNum} onChange={(event) => setTileNum(Number(event.target.value))} />
          </label>
          <label className="mt-2 block text-xs text-gray-400">
            {t('mapEditor.overlayId')}
            <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={overlayId} onChange={(event) => setOverlayId(Number(event.target.value))} />
          </label>
        </aside>

        <div className="relative min-w-0 flex-1">
          <MapViewport
            document={doc}
            tool={tool}
            brush={brush}
            panX={panX}
            panY={panY}
            scale={scale}
            selected={selected}
            onPanChange={(nextX, nextY) => {
              setPanX(nextX)
              setPanY(nextY)
            }}
            onScaleChange={setScale}
            onPaint={handlePaint}
            onPick={handlePick}
            onStrokeStart={handleStrokeStart}
            onStrokeEnd={handleStrokeEnd}
          />
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs">{selectedInfo}</div>
          <button
            type="button"
            className="absolute bottom-3 left-3 rounded bg-gray-900/90 px-3 py-2 text-sm md:hidden"
            onClick={() => setMobileToolsOpen((open) => !open)}
            data-testid="map-mobile-tools-toggle"
          >
            {t('mapEditor.tools')}
          </button>
        </div>

        <aside className="hidden w-72 flex-shrink-0 overflow-y-auto border-l border-gray-800 bg-gray-900 p-2 lg:block" data-testid="map-logic-panel">
          <div className="mb-2 flex flex-wrap gap-1">
            {(['basic', 'houses', 'triggers', 'teams', 'lighting', 'tubes'] as LogicTab[]).map((tab) => (
              <button key={tab} type="button" className={`rounded px-2 py-1 text-xs ${logicTab === tab ? 'bg-blue-600' : 'bg-gray-800'}`} onClick={() => setLogicTab(tab)}>
                {t(`mapEditor.tab_${tab}` as never)}
              </button>
            ))}
          </div>
          {logicTab === 'basic' && (
            <div className="space-y-2 text-sm">
              <label className="block">{t('mapEditor.mapName')}<input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.basic.name} onChange={(event) => { doc.basic.name = event.target.value; bump(doc) }} /></label>
              <label className="block">{t('mapEditor.player')}<input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.basic.player} onChange={(event) => { doc.basic.player = event.target.value; bump(doc) }} /></label>
            </div>
          )}
          {logicTab === 'lighting' && (
            <div className="space-y-2 text-sm">
              {(['ambient', 'level', 'red', 'green', 'blue'] as const).map((key) => (
                <label key={key} className="block capitalize">
                  {key}
                  <input type="number" step="0.01" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.lighting[key]} onChange={(event) => { doc.lighting[key] = Number(event.target.value); bump(doc) }} />
                </label>
              ))}
            </div>
          )}
          {logicTab === 'houses' && (
            <div className="space-y-2 text-sm">
              {doc.houses.map((house, index) => (
                <div key={house.name} className="rounded border border-gray-800 p-2">
                  <div className="font-medium">{house.name}</div>
                  <label className="mt-1 block text-xs">Credits
                    <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={house.credits} onChange={(event) => { doc.houses[index].credits = Number(event.target.value); bump(doc) }} />
                  </label>
                  <label className="mt-1 block text-xs">IQ
                    <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={house.iq} onChange={(event) => { doc.houses[index].iq = Number(event.target.value); bump(doc) }} />
                  </label>
                </div>
              ))}
            </div>
          )}
          {logicTab === 'triggers' && (
            <div className="space-y-2 text-sm">
              <button type="button" className="rounded bg-gray-800 px-2 py-1" onClick={() => {
                const id = createMapObjectId()
                doc.triggers.push({
                  id, houseName: owner, attachedTriggerId: '<none>', name: 'New Trigger',
                  disabled: false, easy: true, medium: true, hard: true,
                  events: [{ type: 13, paramKind: 0, params: ['10'] }],
                  actions: [{ type: 11, params: ['0', '0', '0', '0', '0', '0', '0'] }],
                })
                doc.tags.push({ id: createMapObjectId(), repeatType: 2, name: 'New Tag', triggerId: id })
                bump(doc)
              }}>{t('mapEditor.addTrigger')}</button>
              {doc.triggers.map((trigger, index) => (
                <div key={trigger.id} className="rounded border border-gray-800 p-2">
                  <input className="w-full rounded bg-gray-800 px-2 py-1" value={trigger.name} onChange={(event) => { doc.triggers[index].name = event.target.value; bump(doc) }} />
                  <div className="mt-1 text-xs text-gray-400">{trigger.id} / events {trigger.events.length} / actions {trigger.actions.length}</div>
                </div>
              ))}
            </div>
          )}
          {logicTab === 'teams' && (
            <div className="space-y-2 text-sm">
              <button type="button" className="rounded bg-gray-800 px-2 py-1" onClick={() => {
                const scriptId = createMapObjectId()
                const taskId = createMapObjectId()
                const teamId = createMapObjectId()
                doc.scripts.push({ id: scriptId, name: 'Script', actions: [{ type: 0, argument: '0' }] })
                doc.taskForces.push({ id: taskId, name: 'Force', group: -1, entries: [{ count: 1, objectName: 'E1' }] })
                doc.teams.push({
                  id: teamId, name: 'Team', houseName: owner, script: scriptId, taskForce: taskId, tag: '<none>',
                  waypoint: -1, transportWaypoint: -1, veteranLevel: 1, max: 1, priority: 5, techLevel: 0, group: -1,
                  aggressive: false, annoyance: false, autocreate: false, droppod: false, full: false, guardSlower: false,
                  loadable: false, looseRecruit: false, onTransOnly: false, prebuild: false, recruiter: false, reinforce: false,
                  suicide: false, transportsReturnOnUnload: false, useTransportOrigin: false, areTeamMembersRecruitable: false,
                  onlyTargetHouseEnemy: false,
                })
                bump(doc)
              }}>{t('mapEditor.addTeam')}</button>
              {doc.teams.map((team) => (
                <div key={team.id} className="rounded border border-gray-800 p-2">{team.name} ({team.houseName})</div>
              ))}
            </div>
          )}
          {logicTab === 'tubes' && (
            <div className="space-y-2 text-sm">
              {doc.tubes.map((tube) => (
                <div key={tube.id} className="rounded border border-gray-800 p-2 text-xs">
                  {tube.startX},{tube.startY} → {tube.endX},{tube.endY}
                </div>
              ))}
              <p className="text-xs text-gray-400">{t('mapEditor.tubeHint')}</p>
            </div>
          )}
        </aside>
      </div>

      {mobileToolsOpen && (
        <div className="max-h-[40vh] overflow-y-auto border-t border-gray-800 bg-gray-900 p-2 md:hidden" data-testid="map-mobile-tools">
          <div className="flex flex-wrap gap-1">
            {TOOLS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded px-2 py-2 text-xs ${tool === item.id ? 'bg-blue-600' : 'bg-gray-800'}`}
                onClick={() => { setTool(item.id); setMobileToolsOpen(false) }}
              >
                {t(item.labelKey as never)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(editor, document.body)
}

export default MapEditor
