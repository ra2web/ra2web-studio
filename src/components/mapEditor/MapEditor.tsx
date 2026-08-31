import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Loader2, Map as MapIcon, Redo2, Save, Undo2, X,
} from 'lucide-react'
import { EMPTY_OVERLAY } from '../../data/map/constants'
import { applyShoreAt, placeCliffLine } from '../../data/map/cliffShore'
import { copyRegion, normalizeCopyRect, pasteRegion, type MapClipboard, type MapCopyRect } from '../../data/map/copyPaste'
import { applyLatAt } from '../../data/map/lat'
import { MapCommandStack, flattenHeight, paintHeight, paintTile } from '../../data/map/MapCommandStack'
import { MapDocument, createMapObjectId } from '../../data/map/MapDocument'
import { applyOreBrush, clearOverlay, OBJECT_TOOLS, type MapEditorTool } from '../../data/map/mapTools'
import { validateMap } from '../../data/map/mapValidate'
import { resizeMap } from '../../data/map/resizeMap'
import { emptyRulesObjectLists, parseRulesObjectLists, type RulesObjectLists } from '../../data/map/rulesObjects'
import { TheaterArt } from '../../data/map/TheaterArt'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import MapMiniMap from './MapMiniMap'
import MapViewport, { type MapViewportPick } from './MapViewport'
import ObjectInspector from './ObjectInspector'
import TriggerLogicPanel from './TriggerLogicPanel'

export type MapEditorSession = {
  filePath: string
  original: string
  document: MapDocument
  loading: boolean
  error: string | null
}

type LogicTab = 'houses' | 'triggers' | 'teams' | 'ai' | 'lighting' | 'tubes' | 'basic'

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
  { id: 'cliff', labelKey: 'mapEditor.toolCliff' },
  { id: 'shore', labelKey: 'mapEditor.toolShore' },
  { id: 'basenode', labelKey: 'mapEditor.toolBaseNode' },
  { id: 'copy', labelKey: 'mapEditor.toolCopy' },
  { id: 'paste', labelKey: 'mapEditor.toolPaste' },
]

type MapEditorProps = {
  session: MapEditorSession
  onChange: (document: MapDocument) => void
  onSave: () => void | Promise<void>
  onExit: () => void
  saving?: boolean
  resourceContext?: ResourceContext | null
}

const MapEditor: React.FC<MapEditorProps> = ({ session, onChange, onSave, onExit, saving, resourceContext }) => {
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
  const [autoLat, setAutoLat] = useState(true)
  const [theaterArt, setTheaterArt] = useState<TheaterArt | null>(null)
  const [artRevision, setArtRevision] = useState(0)
  const [rulesLists, setRulesLists] = useState<RulesObjectLists>(emptyRulesObjectLists)
  const [mapWidth, setMapWidth] = useState(session.document.width)
  const [mapHeight, setMapHeight] = useState(session.document.height)
  const [marbleMadness, setMarbleMadness] = useState(false)
  const [selectionRect, setSelectionRect] = useState<MapCopyRect | null>(null)
  const [viewSize, setViewSize] = useState({ w: 800, h: 600 })
  const viewRef = useRef<HTMLDivElement | null>(null)
  const tubeStartRef = useRef<{ rx: number; ry: number } | null>(null)
  const cliffStartRef = useRef<{ rx: number; ry: number } | null>(null)
  const copyRangeRef = useRef<{ start: { rx: number; ry: number }; end: { rx: number; ry: number } } | null>(null)
  const clipboardRef = useRef<MapClipboard | null>(null)
  const pasteOnceRef = useRef(false)
  const doc = session.document

  const bump = useCallback((next: MapDocument) => {
    onChange(next)
    setRevision((value) => value + 1)
  }, [onChange])

  useEffect(() => {
    let cancelled = false
    if (!resourceContext) {
      setTheaterArt(null)
      return
    }
    void TheaterArt.load(resourceContext, doc.theater).then((art) => {
      if (cancelled) return
      if (art) art.onUpdate = () => setArtRevision((value) => value + 1)
      setTheaterArt(art)
    })
    return () => { cancelled = true }
  }, [doc.theater, resourceContext])

  useEffect(() => {
    let cancelled = false
    if (!resourceContext) {
      setRulesLists(emptyRulesObjectLists())
      return
    }
    void (async () => {
      const file = await resourceContext.resolveFileFromOverlay('rulesmd.ini')
        ?? await resourceContext.resolveFileFromOverlay('rules.ini')
      if (cancelled || !file) return
      setRulesLists(parseRulesObjectLists(file.readAsString()))
    })()
    return () => { cancelled = true }
  }, [resourceContext])

  useEffect(() => {
    if (theaterArt) theaterArt.overlayNames = rulesLists.overlays
  }, [rulesLists.overlays, theaterArt])

  useEffect(() => {
    const el = viewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setViewSize({ w: el.clientWidth, h: el.clientHeight })
    })
    observer.observe(el)
    setViewSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 })
    return () => observer.disconnect()
  }, [])

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
        if (autoLat && theaterArt?.index) applyLatAt(working, rx, ry, theaterArt.index, brush + 1)
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
      case 'cliff':
        if (!cliffStartRef.current) {
          cliffStartRef.current = { rx, ry }
        } else if (theaterArt?.index) {
          placeCliffLine(working, cliffStartRef.current, { rx, ry }, theaterArt.index)
          cliffStartRef.current = null
        }
        break
      case 'shore':
        if (theaterArt?.index) applyShoreAt(working, rx, ry, theaterArt.index)
        break
      case 'basenode': {
        const house = working.houses.find((item) => item.name === owner)
        house?.nodes.push({ type: objectName, rx, ry })
        break
      }
      case 'copy': {
        if (!copyRangeRef.current) copyRangeRef.current = { start: { rx, ry }, end: { rx, ry } }
        else copyRangeRef.current.end = { rx, ry }
        setSelectionRect(normalizeCopyRect(copyRangeRef.current.start, copyRangeRef.current.end))
        setSelected({ rx, ry })
        return
      }
      case 'paste': {
        if (pasteOnceRef.current) return
        pasteOnceRef.current = true
        if (clipboardRef.current) pasteRegion(working, clipboardRef.current, rx, ry)
        break
      }
      default:
        break
    }
    setSelected({ rx, ry })
    bump(working)
  }, [autoLat, brush, bump, doc, objectName, overlayId, owner, theaterArt, tileNum, tool])

  const strokeRef = useRef<{ commit: () => void } | null>(null)
  const handleStrokeStart = useCallback(() => {
    pasteOnceRef.current = false
    if (tool === 'copy') {
      copyRangeRef.current = null
      strokeRef.current = {
        commit: () => {
          const range = copyRangeRef.current
          if (!range) return
          clipboardRef.current = copyRegion(doc, normalizeCopyRect(range.start, range.end))
        },
      }
      return
    }
    if (OBJECT_TOOLS.includes(tool) || tool === 'tube' || tool === 'cliff' || tool === 'basenode' || tool === 'paste') {
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
    doc.rebuildPreview()
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
            <input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" list="map-object-names" value={objectName} onChange={(event) => setObjectName(event.target.value)} />
            <datalist id="map-object-names">
              {(
                tool === 'infantry' ? rulesLists.infantry
                  : tool === 'unit' ? rulesLists.units
                    : tool === 'aircraft' ? rulesLists.aircraft
                      : tool === 'structure' ? rulesLists.structures
                        : tool === 'terrain' ? rulesLists.terrain
                          : tool === 'smudge' ? rulesLists.smudges
                            : [...rulesLists.infantry, ...rulesLists.units, ...rulesLists.structures]
              ).map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
          <label className="mt-2 block text-xs text-gray-400">
            {t('mapEditor.tileId')}
            <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={tileNum} onChange={(event) => setTileNum(Number(event.target.value))} />
          </label>
          <label className="mt-2 block text-xs text-gray-400">
            {t('mapEditor.overlayId')}
            <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={overlayId} onChange={(event) => setOverlayId(Number(event.target.value))} />
            {rulesLists.overlays.length > 0 && (
              <select className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={overlayId} onChange={(event) => setOverlayId(Number(event.target.value))}>
                {rulesLists.overlays.map((name, index) => <option key={`${index}-${name}`} value={index}>{index} {name}</option>)}
              </select>
            )}
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={autoLat} onChange={(event) => setAutoLat(event.target.checked)} />
            {t('mapEditor.autoLat')}
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={marbleMadness} onChange={(event) => setMarbleMadness(event.target.checked)} data-testid="map-marble-toggle" />
            {t('mapEditor.marbleMadness')}
          </label>
          <div className="mt-3 text-xs text-gray-400">{t('mapEditor.tileSets')}</div>
          <div className="mt-1 max-h-48 overflow-y-auto rounded border border-gray-800" data-testid="map-tileset-browser">
            {theaterArt?.index?.sets.map((set) => (
              <button
                key={set.setIndex}
                type="button"
                className={`block w-full truncate px-2 py-1 text-left text-[11px] ${tileNum >= set.startTileNum && tileNum < set.startTileNum + set.tilesInSet ? 'bg-blue-700' : 'hover:bg-gray-800'}`}
                onClick={() => {
                  setTileNum(set.startTileNum)
                  setTool('tile')
                }}
              >
                {set.setIndex} {set.setName}
              </button>
            ))}
            {!theaterArt && <p className="px-2 py-2 text-[11px] text-gray-500">{t('mapEditor.theaterMissing')}</p>}
          </div>
        </aside>

        <div className="relative min-w-0 flex-1" ref={viewRef}>
          <MapViewport
            document={doc}
            tool={tool}
            brush={brush}
            panX={panX}
            panY={panY}
            scale={scale}
            selected={selected}
            selectionRect={selectionRect}
            marbleMadness={marbleMadness}
            theaterArt={theaterArt}
            artRevision={artRevision}
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
          <MapMiniMap
            document={doc}
            revision={revision}
            panX={panX}
            panY={panY}
            scale={scale}
            viewWidth={viewSize.w}
            viewHeight={viewSize.h}
            onPanChange={(nextX, nextY) => {
              setPanX(nextX)
              setPanY(nextY)
            }}
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
            {(['basic', 'houses', 'triggers', 'teams', 'ai', 'lighting', 'tubes'] as LogicTab[]).map((tab) => (
              <button key={tab} type="button" className={`rounded px-2 py-1 text-xs ${logicTab === tab ? 'bg-blue-600' : 'bg-gray-800'}`} onClick={() => setLogicTab(tab)}>
                {t(`mapEditor.tab_${tab}` as never)}
              </button>
            ))}
          </div>
          {logicTab === 'basic' && (
            <div className="space-y-2 text-sm">
              <label className="block">{t('mapEditor.mapName')}<input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.basic.name} onChange={(event) => { doc.basic.name = event.target.value; bump(doc) }} /></label>
              <label className="block">{t('mapEditor.player')}<input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.basic.player} onChange={(event) => { doc.basic.player = event.target.value; bump(doc) }} /></label>
              <div className="flex gap-2">
                <label className="block flex-1">{t('mapEditor.width')}<input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={mapWidth} onChange={(event) => setMapWidth(Number(event.target.value))} /></label>
                <label className="block flex-1">{t('mapEditor.height')}<input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={mapHeight} onChange={(event) => setMapHeight(Number(event.target.value))} /></label>
              </div>
              <button type="button" className="rounded bg-gray-800 px-2 py-1" onClick={() => {
                const error = resizeMap(doc, mapWidth, mapHeight)
                if (!error) bump(doc)
              }}>{t('mapEditor.resize')}</button>
              <div className="text-xs text-gray-400">{t('mapEditor.validate')}</div>
              <ul className="max-h-32 overflow-y-auto text-[11px] text-amber-300" data-testid="map-validate">
                {validateMap(doc).map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>)}
              </ul>
              <div className="text-xs font-medium text-gray-300">{t('mapEditor.objectProps')}</div>
              <ObjectInspector doc={doc} selected={selected} bump={bump} />
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
              <div className="pt-2 text-xs font-medium text-gray-300">{t('mapEditor.specialFlags')}</div>
              <div className="space-y-1" data-testid="map-special-flags">
                {(Object.keys(doc.specialFlags) as Array<keyof typeof doc.specialFlags>).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-[11px] text-gray-400">
                    <input
                      type="checkbox"
                      checked={doc.specialFlags[key]}
                      onChange={(event) => { doc.specialFlags[key] = event.target.checked; bump(doc) }}
                    />
                    {key}
                  </label>
                ))}
              </div>
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
                  <label className="mt-1 block text-xs">TechLevel
                    <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={house.techLevel} onChange={(event) => { doc.houses[index].techLevel = Number(event.target.value); bump(doc) }} />
                  </label>
                  <div className="mt-1 text-[11px] text-gray-400">Nodes: {house.nodes.length}</div>
                  {house.nodes.map((node, nodeIndex) => (
                    <div key={`${house.name}-${nodeIndex}`} className="mt-1 flex gap-1 text-[11px]">
                      <input className="w-16 rounded bg-gray-800 px-1" value={node.type} onChange={(event) => { node.type = event.target.value; bump(doc) }} />
                      <span>{node.rx},{node.ry}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {logicTab === 'triggers' && (
            <TriggerLogicPanel doc={doc} owner={owner} bump={bump} />
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
                <div key={team.id} className="rounded border border-gray-800 p-2 space-y-1">
                  <input className="w-full rounded bg-gray-800 px-2 py-1" value={team.name} onChange={(event) => { team.name = event.target.value; bump(doc) }} />
                  <label className="block text-[11px] text-gray-400">House
                    <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.houseName} onChange={(event) => { team.houseName = event.target.value; bump(doc) }}>
                      {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] text-gray-400">Script
                    <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.script} onChange={(event) => { team.script = event.target.value; bump(doc) }}>
                      {doc.scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] text-gray-400">TaskForce
                    <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.taskForce} onChange={(event) => { team.taskForce = event.target.value; bump(doc) }}>
                      {doc.taskForces.map((force) => <option key={force.id} value={force.id}>{force.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] text-gray-400">Waypoint
                    <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.waypoint} onChange={(event) => { team.waypoint = Number(event.target.value); bump(doc) }} />
                  </label>
                  {(['aggressive', 'autocreate', 'reinforce', 'suicide', 'recruiter'] as const).map((flag) => (
                    <label key={flag} className="mr-2 inline-flex items-center gap-1 text-[11px] text-gray-400">
                      <input type="checkbox" checked={team[flag]} onChange={(event) => { team[flag] = event.target.checked; bump(doc) }} />
                      {flag}
                    </label>
                  ))}
                  <div className="text-[11px] text-gray-500">{team.id}</div>
                </div>
              ))}
              {doc.scripts.map((script) => (
                <div key={script.id} className="rounded border border-gray-800 p-2 text-xs">
                  <div className="font-medium">Script {script.name}</div>
                  {script.actions.map((action, actionIndex) => (
                    <div key={actionIndex} className="mt-1 flex gap-1">
                      <input type="number" className="w-16 rounded bg-gray-800 px-1" value={action.type} onChange={(event) => { action.type = Number(event.target.value); bump(doc) }} />
                      <input className="flex-1 rounded bg-gray-800 px-1" value={action.argument} onChange={(event) => { action.argument = event.target.value; bump(doc) }} />
                    </div>
                  ))}
                  <button type="button" className="mt-1 text-sky-400" onClick={() => { script.actions.push({ type: 0, argument: '0' }); bump(doc) }}>+ action</button>
                </div>
              ))}
              {doc.taskForces.map((force) => (
                <div key={force.id} className="rounded border border-gray-800 p-2 text-xs">
                  <div className="font-medium">TaskForce {force.name}</div>
                  {force.entries.map((entry, entryIndex) => (
                    <div key={entryIndex} className="mt-1 flex gap-1">
                      <input type="number" className="w-12 rounded bg-gray-800 px-1" value={entry.count} onChange={(event) => { entry.count = Number(event.target.value); bump(doc) }} />
                      <input className="flex-1 rounded bg-gray-800 px-1" value={entry.objectName} onChange={(event) => { entry.objectName = event.target.value; bump(doc) }} />
                    </div>
                  ))}
                  <button type="button" className="mt-1 text-sky-400" onClick={() => { force.entries.push({ count: 1, objectName: 'E1' }); bump(doc) }}>+ unit</button>
                </div>
              ))}
            </div>
          )}
          {logicTab === 'ai' && (
            <div className="space-y-2 text-sm" data-testid="map-ai-panel">
              <button type="button" className="rounded bg-gray-800 px-2 py-1" onClick={() => {
                doc.aiTriggers.push({
                  id: createMapObjectId(),
                  name: 'AI Trigger',
                  team1: doc.teams[0]?.id ?? '<none>',
                  ownerHouse: owner,
                  techLevel: 0,
                  conditionType: -1,
                  conditionObject: '<none>',
                  comparator: '0',
                  startingCredits: 0,
                  sideIndex: 0,
                  baseDefense: false,
                  team2: '<none>',
                  enabledEasy: true,
                  enabledMedium: true,
                  enabledHard: true,
                  raw: '',
                })
                bump(doc)
              }}>Add AITrigger</button>
              {doc.aiTriggers.map((trigger) => (
                <div key={trigger.id} className="rounded border border-gray-800 p-2 space-y-1">
                  <input className="w-full rounded bg-gray-800 px-2 py-1" value={trigger.name} onChange={(event) => { trigger.name = event.target.value; bump(doc) }} />
                  <label className="block text-[11px] text-gray-400">Team
                    <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.team1} onChange={(event) => { trigger.team1 = event.target.value; bump(doc) }}>
                      <option value="<none>">&lt;none&gt;</option>
                      {doc.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] text-gray-400">House
                    <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.ownerHouse} onChange={(event) => { trigger.ownerHouse = event.target.value; bump(doc) }}>
                      {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] text-gray-400">Credits
                    <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.startingCredits} onChange={(event) => { trigger.startingCredits = Number(event.target.value); bump(doc) }} />
                  </label>
                </div>
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
              <p className="text-xs text-gray-400">{t('mapEditor.cliffHint')}</p>
              <p className="text-xs text-gray-400">{t('mapEditor.copyHint')}</p>
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
