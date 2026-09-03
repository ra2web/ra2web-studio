import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EMPTY_OVERLAY } from '../../data/map/constants'
import { applyShoreAt, placeCliffLine } from '../../data/map/cliffShore'
import { copyRegion, copyWholeMap, normalizeCopyRect, pasteRegion, pasteWholeMap, type MapClipboard, type MapCopyRect } from '../../data/map/copyPaste'
import { manhattanDiamondOffsets } from '../../data/map/fa2Brush'
import { buildBrushGhosts, brushGhostCells, heightBrushCells } from '../../data/map/fa2BrushPreview'
import { autoCreateShores } from '../../data/map/fa2Shore'
import { createSlopesAround, changeMapHeight } from '../../data/map/fa2Slopes'
import { autoLevel, heightenGround, lookupFromTheater, lowerGround } from '../../data/map/fa2Height'
import { applyIniEdit, isPackedIniSection, listIniKeys, listIniSections } from '../../data/map/fa2IniEdit'
import { Fa2Tube, nextTubeId } from '../../data/map/fa2Tube'
import { runUserScript, createBrowserUserScriptUi } from '../../data/map/fa2UserScript'
import { formatFa2CellStatus } from '../../data/map/fa2CellCursor'
import { emptyHideView, hideFieldAt, hideTileSetAt, showAllFields, showAllTileSets } from '../../data/map/fa2Hide'
import { applyLatAt } from '../../data/map/lat'
import { addMapHouse, deleteMapHouse, prepareHouses } from '../../data/map/fa2Houses'
import { preferInfantrySubCell } from '../../data/map/fa2Infantry'
import { collectRulesObjectNames, emptyObjectNameLookup, formatObjectLabel, type ObjectNameLookup } from '../../data/map/fa2ObjectLabel'
import { CsfFile } from '../../data/CsfFile'
import { MapIni } from '../../data/map/MapIni'
import type { MapSelection } from '../../data/map/types'
import type { ObjectSpriteKind } from '../../data/map/fa2Facing'
import { canPlaceStructure, structureAt } from '../../data/map/fa2Occupy'
import { FA2_DEFAULT_FACING } from '../../data/map/fa2Facing'
import { deleteWaypointAt, placeFa2Waypoint } from '../../data/map/fa2Waypoint'
import { applyFa2Drag, pickFa2DragTarget, type Fa2DragMove } from '../../data/map/fa2DragObject'
import { MapCommandStack, flattenHeight, paintHeight, paintTile } from '../../data/map/MapCommandStack'
import { MapDocument, createMapObjectId } from '../../data/map/MapDocument'
import { applyOreBrush, clearOverlay, OBJECT_TOOLS, placeRandomTerrain, placeVeinhole, placeVeins, type MapEditorTool } from '../../data/map/mapTools'
import { FA2_WALL_OVERLAYS, handleTrail, placeBridgeLine, refreshTrailsAround, type BridgeKind } from '../../data/map/overlayTools'
import { placeFa2Tile, usesFa2PlaceTile } from '../../data/map/fa2PlaceTile'
import { validateMap } from '../../data/map/mapValidate'
import { resizeMap } from '../../data/map/resizeMap'
import { emptyRulesObjectLists, parseBuildingFoundations, parseRulesObjectLists, type BuildingFoundation, type RulesObjectLists } from '../../data/map/rulesObjects'
import { TheaterArt } from '../../data/map/TheaterArt'
import { projectCell } from '../../data/map/isoCoords'
import { DEFAULT_VIEWPORT_SCALE, panToCenterWorld, panToMapCenter } from '../../data/map/viewportZoom'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'
import AiTriggerPanel from './AiTriggerPanel'
import MapEditorToolbar, { type MapLogicTab } from './MapEditorToolbar'
import MapMiniMap from './MapMiniMap'
import MapViewport, { type MapViewportPick } from './MapViewport'
import ObjectInspector from './ObjectInspector'
import ObjectToolTree from './ObjectToolTree'
import TeamsLogicPanel from './TeamsLogicPanel'
import TileSetPreviewBar from './TileSetPreviewBar'
import TriggerLogicPanel from './TriggerLogicPanel'
import {
  BRIDGE_TOOLBAR_HINT_I18N,
  bridgeToolbarHintKey,
  brushSizeFromId,
  FA2_BRUSH_SIZES,
  resolveTreeTileNum,
  toolUsesBrush,
  type Fa2BrushSizeId,
  type ObjectTreeAction,
} from './fa2Layout'

export type MapEditorSession = {
  filePath: string
  original: string
  document: MapDocument
  loading: boolean
  error: string | null
}

type LogicTab = MapLogicTab

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
  const [tool, setTool] = useState<MapEditorTool>('select')
  const [brushSizeId, setBrushSizeId] = useState<Fa2BrushSizeId>('1x1')
  const [treeNodeId, setTreeNodeId] = useState<string>('nothing')
  const [previewSetIndex, setPreviewSetIndex] = useState(0)
  const [logicOpen, setLogicOpen] = useState(false)
  const [tileNum, setTileNum] = useState(0)
  const [overlayId, setOverlayId] = useState(102)
  const [overlayDataValue, setOverlayDataValue] = useState(0)
  const [owner, setOwner] = useState('Neutral')
  const [objectName, setObjectName] = useState('E1')
  const [scale, setScale] = useState(DEFAULT_VIEWPORT_SCALE)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [viewPlaced, setViewPlaced] = useState(false)
  const [selected, setSelected] = useState<MapSelection | null>(null)
  const [objectPropsCollapsed, setObjectPropsCollapsed] = useState(true)
  const [objectNames, setObjectNames] = useState<ObjectNameLookup>(emptyObjectNameLookup)
  const [hover, setHover] = useState<{ rx: number; ry: number; subCell?: number } | null>(null)
  const [logicTab, setLogicTab] = useState<LogicTab>('basic')
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [autoLat, setAutoLat] = useState(true)
  const [theaterArt, setTheaterArt] = useState<TheaterArt | null>(null)
  const [theaterArtReady, setTheaterArtReady] = useState(false)
  const [artRevision, setArtRevision] = useState(0)
  const [rulesLists, setRulesLists] = useState<RulesObjectLists>(emptyRulesObjectLists)
  const [mapWidth, setMapWidth] = useState(session.document.width)
  const [mapHeight, setMapHeight] = useState(session.document.height)
  const [marbleMadness, setMarbleMadness] = useState(false)
  const [showBuildingOutline, setShowBuildingOutline] = useState(true)
  const [foundations, setFoundations] = useState<Record<string, BuildingFoundation>>({})
  const [newHouseName, setNewHouseName] = useState('')
  const [hideView, setHideView] = useState(emptyHideView)
  const [bridgeKind, setBridgeKind] = useState<BridgeKind>('small')
  const [tubeBidirectional, setTubeBidirectional] = useState(true)
  const [oreRandom, setOreRandom] = useState(false)
  const [slopeCorrection, setSlopeCorrection] = useState(true)
  const [resizeLeft, setResizeLeft] = useState(0)
  const [resizeTop, setResizeTop] = useState(0)
  const [heightDelta, setHeightDelta] = useState(1)
  const [iniSection, setIniSection] = useState('Basic')
  const [iniKey, setIniKey] = useState('Name')
  const [iniValue, setIniValue] = useState('')
  const [toolsNote, setToolsNote] = useState('')
  const [scriptText, setScriptText] = useState('SetSafeMode("false","edit")\nAllowAdd("map")\nPrint("%Width%x%Height%")')
  const [scriptReport, setScriptReport] = useState('')
  const [waypointSearch, setWaypointSearch] = useState('')
  const [selectionRect, setSelectionRect] = useState<MapCopyRect | null>(null)
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 })
  const viewRef = useRef<HTMLDivElement | null>(null)
  const tubeStartRef = useRef<{ rx: number; ry: number } | null>(null)
  const cliffStartRef = useRef<{ rx: number; ry: number } | null>(null)
  const bridgeStartRef = useRef<{ rx: number; ry: number } | null>(null)
  const [bridgeStart, setBridgeStart] = useState<{ rx: number; ry: number } | null>(null)
  const copyRangeRef = useRef<{ start: { rx: number; ry: number }; end: { rx: number; ry: number } } | null>(null)
  const clipboardRef = useRef<MapClipboard | null>(null)
  const pasteOnceRef = useRef(false)
  const waypointNumberRef = useRef<number | null>(null)
  const waypointEraseRef = useRef(false)
  const [waypointErase, setWaypointErase] = useState(false)
  const doc = session.document

  const bump = useCallback((next: MapDocument) => {
    onChange(next)
    setRevision((value) => value + 1)
  }, [onChange])

  const commitEdit = useCallback((label: string, mutate: () => void) => {
    const before = doc.toIniString()
    mutate()
    const after = doc.toIniString()
    stackRef.current.push({
      label,
      apply: (target) => target.copyFrom(MapDocument.parse(after)),
      revert: (target) => target.copyFrom(MapDocument.parse(before)),
    })
    doc.rebuildPreview()
    bump(doc)
  }, [bump, doc])

  const jumpToCell = useCallback((rx: number, ry: number) => {
    const origin = projectCell(rx, ry, 0, doc.isoSize)
    const next = panToCenterWorld(origin.px, origin.py, viewSize.w, viewSize.h, scale)
    setPanX(next.panX)
    setPanY(next.panY)
    setSelected({ rx, ry })
  }, [doc.isoSize, scale, viewSize.h, viewSize.w])

  const viewPlacedRef = useRef(false)
  useLayoutEffect(() => {
    if (session.loading || viewPlacedRef.current) return
    const width = viewRef.current?.clientWidth ?? 0
    const height = viewRef.current?.clientHeight ?? 0
    if (width < 32 || height < 32) return
    const next = panToMapCenter(doc.isoSize, width, height, scale)
    setPanX(next.panX)
    setPanY(next.panY)
    setViewSize({ w: width, h: height })
    viewPlacedRef.current = true
    setViewPlaced(true)
  }, [session.loading, viewSize.h, viewSize.w, scale, doc.isoSize])

  useEffect(() => {
    const names = doc.houses.map((house) => house.name)
    const next = names.includes('Neutral') ? 'Neutral' : (names[0] ?? 'Neutral')
    setOwner(next)
  }, [session.filePath])

  useEffect(() => {
    let cancelled = false
    setTheaterArtReady(false)
    if (!resourceContext) {
      setTheaterArt(null)
      setTheaterArtReady(true)
      return
    }
    void TheaterArt.load(resourceContext, doc.theater).then((art) => {
      if (cancelled) return
      if (art) art.onUpdate = () => setArtRevision((value) => value + 1)
      setTheaterArt(art)
      setTheaterArtReady(true)
    })
    return () => { cancelled = true }
  }, [doc.theater, resourceContext])

  useEffect(() => {
    let cancelled = false
    if (!resourceContext) {
      setRulesLists(emptyRulesObjectLists())
      setFoundations({})
      return
    }
    void (async () => {
      const file = await resourceContext.resolveFileFromOverlay('rulesmd.ini')
        ?? await resourceContext.resolveFileFromOverlay('rules.ini')
      if (cancelled || !file) return
      const text = file.readAsString()
      const artFile = await resourceContext.resolveFileFromOverlay('artmd.ini')
        ?? await resourceContext.resolveFileFromOverlay('art.ini')
      setRulesLists(parseRulesObjectLists(text))
      setFoundations(parseBuildingFoundations(text, artFile?.readAsString()))
      const hints = collectRulesObjectNames(MapIni.parse(text))
      let csf: Record<string, string> = {}
      for (const name of ['ra2md.csf', 'ra2.csf']) {
        const csfFile = await resourceContext.resolveFileFromOverlay(name)
        if (!csfFile) continue
        try {
          csf = CsfFile.fromVirtualFile(csfFile).data
          break
        } catch {
          /* 坏 CSF 时退回 rules Name */
        }
      }
      if (!cancelled) setObjectNames({ csf, ...hints })
    })()
    return () => { cancelled = true }
  }, [resourceContext])

  useEffect(() => {
    if (!theaterArt) return
    theaterArt.overlayNames = rulesLists.overlays
    setArtRevision((value) => value + 1)
  }, [rulesLists.overlays, theaterArt])

  useEffect(() => {
    const el = viewRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const commitSize = (width: number, height: number) => {
      if (width < 32 || height < 32) return
      setViewSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
    }
    const observer = new ResizeObserver(() => {
      commitSize(el.clientWidth, el.clientHeight)
    })
    observer.observe(el)
    commitSize(el.clientWidth, el.clientHeight)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (tool === 'bridge') return
    bridgeStartRef.current = null
    setBridgeStart(null)
  }, [tool])

  const brushSize = brushSizeFromId(brushSizeId)
  const brushW = brushSize.w
  const brushH = brushSize.h
  const brush = brushSize.brush
  const brushGhosts = useMemo(() => buildBrushGhosts({
    tool,
    origin: hover ?? selected,
    doc,
    tileNum,
    overlayId,
    overlayData: overlayDataValue,
    objectName,
    owner,
    brushW,
    brushH,
    brush,
    oreRandom,
    bridgeKind,
    bridgeStart,
    waypointErase,
    theater: theaterArt?.index,
    tileShape: theaterArt?.tileShape(tileNum),
    shapeOf: (num) => theaterArt?.tileShape(num),
    terrainPool: rulesLists.terrain,
  }), [
    artRevision, bridgeKind, bridgeStart, brush, brushH, brushW, doc, foundations, hover, objectName,
    oreRandom, overlayDataValue, overlayId, owner, revision, rulesLists.terrain, selected,
    theaterArt, tileNum, tool, waypointErase,
  ])
  const brushPreviewCells = useMemo(() => {
    const origin = hover ?? selected
    if (!origin || tool === 'pan') return []
    if (tool === 'structure' || tool === 'basenode' || brushGhosts.length > 0) {
      return brushGhostCells(brushGhosts, tool, origin, foundations, objectName)
    }
    if (tool === 'raise' || tool === 'lower' || tool === 'flatten' || tool === 'raiseTile' || tool === 'lowerTile') {
      return heightBrushCells(origin, brushW, brushH)
    }
    const offsets = toolUsesBrush(tool)
      ? manhattanDiamondOffsets(brush)
      : [{ dx: 0, dy: 0 }]
    return offsets.map(({ dx, dy }) => ({ rx: origin.rx + dx, ry: origin.ry + dy }))
  }, [brush, brushGhosts, brushH, brushW, foundations, hover, objectName, selected, tool])

  const handlePaint = useCallback((rx: number, ry: number, extra?: { subCell?: number; ctrl?: boolean }) => {
    const working = doc
    const lockHeightStroke = () => {
      if (heightLockRef.current == null) heightLockRef.current = working.getCell(rx, ry).height
      return heightLockRef.current
    }
    switch (tool) {
      case 'raise': {
        const lockHeight = lockHeightStroke()
        if (theaterArt?.index) {
          heightenGround(working, rx, ry, lookupFromTheater(theaterArt.index, theaterArt.tileShapeMap()), theaterArt.index, {
            brushW,
            brushH,
            slopeCorrection,
            lockHeight,
          })
        } else {
          paintHeight(working, rx, ry, 1, { w: brushW, h: brushH }, lockHeight)
        }
        break
      }
      case 'lower': {
        const lockHeight = lockHeightStroke()
        if (theaterArt?.index) {
          lowerGround(working, rx, ry, lookupFromTheater(theaterArt.index, theaterArt.tileShapeMap()), theaterArt.index, {
            brushW,
            brushH,
            slopeCorrection,
            lockHeight,
          })
        } else {
          paintHeight(working, rx, ry, -1, { w: brushW, h: brushH }, lockHeight)
        }
        break
      }
      case 'raiseTile':
        paintHeight(working, rx, ry, 1, { w: brushW, h: brushH }, lockHeightStroke())
        if (extra?.ctrl && theaterArt?.index) {
          createSlopesAround(working, rx, ry, theaterArt.index, brushW, brushH, !slopeCorrection)
        }
        break
      case 'lowerTile':
        paintHeight(working, rx, ry, -1, { w: brushW, h: brushH }, lockHeightStroke())
        if (extra?.ctrl && theaterArt?.index) {
          createSlopesAround(working, rx, ry, theaterArt.index, brushW, brushH, !slopeCorrection)
        }
        break
      case 'flatten':
        flattenHeight(working, rx, ry, { w: brushW, h: brushH }, lockHeightStroke())
        if (slopeCorrection && theaterArt?.index) {
          createSlopesAround(working, rx, ry, theaterArt.index, brushW, brushH)
        }
        break
      case 'tile': {
        const shape = theaterArt?.tileShape(tileNum)
        if (usesFa2PlaceTile(shape, tileNum, theaterArt?.index) && shape) {
          placeFa2Tile(working, rx, ry, tileNum, shape, {
            brushW,
            brushH,
            shapeOf: (num) => theaterArt?.tileShape(num),
          })
        } else {
          paintTile(working, rx, ry, tileNum, { w: brushW, h: brushH })
        }
        if (autoLat && theaterArt?.index) {
          applyLatAt(working, rx, ry, theaterArt.index, Math.max(brushW, brushH) + 1, theaterArt.smoothLookup((cx, cy) => working.getCell(cx, cy)))
        }
        break
      }
      case 'ore':
        applyOreBrush(working, rx, ry, {
          kind: 'riparius',
          style: oreRandom ? 'random' : 'fixed',
          brush: brushW,
          brushH,
          theater: theaterArt?.index,
        })
        break
      case 'gems':
        applyOreBrush(working, rx, ry, {
          kind: 'gems',
          style: oreRandom ? 'random' : 'fixed',
          brush: brushW,
          brushH,
          theater: theaterArt?.index,
        })
        break
      case 'veinhole':
        placeVeinhole(working, rx, ry)
        break
      case 'veins':
        placeVeins(working, rx, ry, brushW, brushH)
        break
      case 'overlay':
      case 'wall':
        working.setOverlay(rx, ry, overlayId, overlayDataValue)
        handleTrail(working, rx, ry)
        break
      case 'eraseOverlay':
        clearOverlay(working, rx, ry, brush)
        refreshTrailsAround(working, rx, ry)
        break
      case 'infantry': {
        const here = working.infantry.filter((item) => item.rx === rx && item.ry === ry)
        const subCell = preferInfantrySubCell(here, extra?.subCell)
        if (subCell == null) break
        const id = createMapObjectId()
        working.infantry.push({
          id, owner, name: objectName, health: 256, rx, ry,
          direction: FA2_DEFAULT_FACING, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, subCell, extra: [],
        })
        setSelected({ rx, ry, subCell, objectId: id })
        setObjectPropsCollapsed(true)
        bump(working)
        return
      }
      case 'unit':
        if (working.units.some((item) => item.rx === rx && item.ry === ry)) break
        working.units.push({
          id: createMapObjectId(), owner, name: objectName, health: 256, rx, ry,
          direction: FA2_DEFAULT_FACING, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, extra: [],
        })
        break
      case 'aircraft':
        if (working.aircraft.some((item) => item.rx === rx && item.ry === ry)) break
        working.aircraft.push({
          id: createMapObjectId(), owner, name: objectName, health: 256, rx, ry,
          direction: FA2_DEFAULT_FACING, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, extra: [],
        })
        break
      case 'structure':
        if (!canPlaceStructure(working, rx, ry, objectName, foundations)) break
        working.structures.push({
          id: createMapObjectId(), owner, name: objectName, health: 256, rx, ry,
          direction: FA2_DEFAULT_FACING, mission: 'Guard', tag: 'none', veterancy: 0, group: -1,
          onBridge: false, recruitable: false, aiRecruitable: false, poweredOn: true,
          upgradeCount: 0, spotlight: '0', upgrade1: 'none', upgrade2: 'none', upgrade3: 'none', extra: [],
        })
        break
      case 'terrain':
        working.terrains.push({ id: createMapObjectId(), name: objectName, rx, ry })
        break
      case 'randomTerrain':
        placeRandomTerrain(working, rx, ry, rulesLists.terrain)
        break
      case 'smudge':
        working.smudges.push({ id: createMapObjectId(), name: objectName, rx, ry, extra: 0 })
        break
      case 'waypoint': {
        if (waypointEraseRef.current) {
          deleteWaypointAt(working, rx, ry)
          break
        }
        const requested = waypointNumberRef.current
        const result = placeFa2Waypoint(working, rx, ry, requested == null ? {} : { startNumber: requested })
        if (result.placed && requested != null && result.number != null) {
          waypointNumberRef.current = result.number
        }
        break
      }
      case 'celltag':
        if (working.tags[0]) working.cellTags.push({ rx, ry, tagId: working.tags[0].id })
        break
      case 'eraseObject': {
        const building = structureAt(working, rx, ry, foundations)
        working.units = working.units.filter((item) => !(item.rx === rx && item.ry === ry))
        working.infantry = working.infantry.filter((item) => !(item.rx === rx && item.ry === ry))
        working.aircraft = working.aircraft.filter((item) => !(item.rx === rx && item.ry === ry))
        working.structures = working.structures.filter((item) => (
          item !== building && !(item.rx === rx && item.ry === ry)
        ))
        working.terrains = working.terrains.filter((item) => !(item.rx === rx && item.ry === ry))
        working.smudges = working.smudges.filter((item) => !(item.rx === rx && item.ry === ry))
        working.waypoints = working.waypoints.filter((item) => !(item.rx === rx && item.ry === ry))
        working.cellTags = working.cellTags.filter((item) => !(item.rx === rx && item.ry === ry))
        break
      }
      case 'tube':
        if (!tubeStartRef.current) {
          tubeStartRef.current = { rx, ry }
        } else {
          const start = tubeStartRef.current
          const created = Fa2Tube.autocreate(start.rx, start.ry, rx, ry)
          if (created.isValid()) {
            working.tubes.push(created.toMapTube(nextTubeId(working.tubes)))
            if (tubeBidirectional) {
              working.tubes.push(created.reverse().toMapTube(nextTubeId(working.tubes)))
            }
          }
          tubeStartRef.current = null
        }
        break
      case 'bridge':
        if (!bridgeStartRef.current) {
          const start = { rx, ry }
          bridgeStartRef.current = start
          setBridgeStart(start)
          setSelected({ rx, ry, subCell: extra?.subCell })
          return
        }
        placeBridgeLine(working, bridgeStartRef.current, { rx, ry }, bridgeKind)
        bridgeStartRef.current = null
        setBridgeStart(null)
        break
      case 'cliff':
      case 'cliffFront':
      case 'cliffBack':
        if (!cliffStartRef.current) {
          cliffStartRef.current = { rx, ry }
        } else if (theaterArt?.index) {
          const face = tool === 'cliffBack' ? 'back' : 'front'
          placeCliffLine(
            working,
            cliffStartRef.current,
            { rx, ry },
            theaterArt.index,
            4,
            face,
            doc.theater,
            (tileInSet) => theaterArt.cliffShape(tileInSet),
          )
          cliffStartRef.current = null
        }
        break
      case 'shore':
        if (theaterArt?.index) applyShoreAt(working, rx, ry, theaterArt.index, theaterArt.shoreCatalog)
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
      case 'hideTileset': {
        setHideView((prev) => hideTileSetAt(prev, working.getCell(rx, ry).tileNum, theaterArt?.index))
        setSelected({ rx, ry })
        return
      }
      case 'hideField': {
        setHideView((prev) => hideFieldAt(prev, rx, ry))
        setSelected({ rx, ry })
        return
      }
      default:
        break
    }
    setObjectPropsCollapsed(true)
    setSelected({ rx, ry, subCell: extra?.subCell })
    bump(working)
  }, [autoLat, bridgeKind, brush, brushH, brushW, bump, doc, foundations, objectName, oreRandom, overlayDataValue, overlayId, owner, rulesLists.terrain, slopeCorrection, theaterArt, tileNum, tool, tubeBidirectional])

  const strokeRef = useRef<{ commit: () => void } | null>(null)
  const heightLockRef = useRef<number | null>(null)
  const handleStrokeStart = useCallback(() => {
    heightLockRef.current = null
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
    if (tool === 'hideTileset' || tool === 'hideField') {
      strokeRef.current = { commit: () => {} }
      return
    }
    if (OBJECT_TOOLS.includes(tool) || tool === 'tube' || tool === 'cliff' || tool === 'cliffFront' || tool === 'cliffBack' || tool === 'bridge' || tool === 'basenode' || tool === 'paste') {
      const before = doc.toIniString()
      strokeRef.current = {
        commit: () => {
          const after = doc.toIniString()
          if (after === before) return
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
    heightLockRef.current = null
    doc.rebuildPreview()
    bump(doc)
  }, [bump, doc])

  const handlePick = useCallback((pick: MapViewportPick) => {
    if (pick.longPress) return
    const target = pickFa2DragTarget(doc, pick.rx, pick.ry, foundations, pick.subCell)
    setSelected({
      rx: pick.rx,
      ry: pick.ry,
      subCell: pick.subCell,
      objectId: target?.id,
    })
    if (pick.doubleClick) setObjectPropsCollapsed(false)
  }, [doc, foundations])

  const handleMoveObject = useCallback((move: Fa2DragMove) => {
    const before = doc.toIniString()
    if (!applyFa2Drag(doc, move)) return
    const after = doc.toIniString()
    if (before === after) return
    stackRef.current.push({
      label: 'drag',
      apply: (target) => target.copyFrom(MapDocument.parse(after)),
      revert: (target) => target.copyFrom(MapDocument.parse(before)),
    })
    setSelected({ rx: move.toRx, ry: move.toRy })
    doc.rebuildPreview()
    bump(doc)
  }, [bump, doc])

  const iniSections = useMemo(
    () => (logicTab === 'maptools' ? listIniSections(doc) : []),
    [doc, logicTab, revision],
  )
  const iniEntries = useMemo(
    () => (logicTab === 'maptools' ? listIniKeys(doc, iniSection) : []),
    [doc, iniSection, logicTab, revision],
  )

  const undo = () => {
    if (stackRef.current.undo(doc)) bump(doc)
  }
  const redo = () => {
    if (stackRef.current.redo(doc)) bump(doc)
  }

  const applyBrushSize = (id: Fa2BrushSizeId) => {
    setBrushSizeId(id)
  }

  const handleTreeSelect = useCallback((id: string, action: ObjectTreeAction) => {
    setTreeNodeId(id)
    setTool(action.tool)
    waypointEraseRef.current = action.tool === 'waypoint' && Boolean(action.waypointErase)
    setWaypointErase(waypointEraseRef.current)
    waypointNumberRef.current = action.tool === 'waypoint' && action.waypointNumber != null && !action.waypointErase
      ? action.waypointNumber
      : null
    if (action.objectName) setObjectName(action.objectName)
    if (action.overlayId != null) setOverlayId(action.overlayId)
    if (action.overlayData != null) setOverlayDataValue(action.overlayData)
    if (action.bridgeKind) setBridgeKind(action.bridgeKind)
    if (action.brush != null) {
      const match = FA2_BRUSH_SIZES.find((item) => item.w === action.brush && item.h === action.brush)
        ?? FA2_BRUSH_SIZES.find((item) => item.brush === action.brush)
      if (match) applyBrushSize(match.id)
    }
    const nextTile = resolveTreeTileNum(theaterArt?.index, action.tileGeneral)
    if (nextTile != null) {
      setTileNum(nextTile)
      const set = theaterArt?.index?.sets.find((item) => nextTile >= item.startTileNum && nextTile < item.startTileNum + item.tilesInSet)
      if (set) setPreviewSetIndex(set.setIndex)
    }
    setMobileToolsOpen(false)
  }, [theaterArt])

  const openLogic = (tab: LogicTab) => {
    setLogicTab(tab)
    setLogicOpen(true)
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
    const focus = hover ?? selected
    if (!focus) return t('mapEditor.noSelection')
    const cell = doc.getCell(focus.rx, focus.ry)
    const status = formatFa2CellStatus(focus.rx, focus.ry, cell.height)
    if (!selected) return status
    const overlay = doc.getOverlay(focus.rx, focus.ry)
    return `${status}  tile=${cell.tileNum}  ov=${overlay.id === EMPTY_OVERLAY ? '-' : overlay.id}`
  }, [doc, hover, selected, t, revision])

  const bridgeHintKey = useMemo(() => bridgeToolbarHintKey({
    tool,
    treeNodeId,
    previewSetIndex,
    bridgeSetIndex: theaterArt?.index?.general.BridgeSet,
    bridgeKind,
    hasStart: Boolean(bridgeStart),
  }), [bridgeKind, bridgeStart, previewSetIndex, theaterArt, tool, treeNodeId])

  const selectedHasObject = useMemo(() => {
    if (!selected) return false
    if (doc.units.some((item) => item.rx === selected.rx && item.ry === selected.ry)) return true
    if (doc.infantry.some((item) => item.rx === selected.rx && item.ry === selected.ry)) return true
    if (doc.aircraft.some((item) => item.rx === selected.rx && item.ry === selected.ry)) return true
    if (doc.structures.some((item) => item.rx === selected.rx && item.ry === selected.ry)) return true
    if (doc.terrains.some((item) => item.rx === selected.rx && item.ry === selected.ry)) return true
    if (doc.waypoints.some((item) => item.rx === selected.rx && item.ry === selected.ry)) return true
    return Boolean(structureAt(doc, selected.rx, selected.ry, foundations))
  }, [doc, foundations, selected, revision])

  const formatPlacedName = useCallback((name: string, _kind: ObjectSpriteKind, missing: boolean) => (
    formatObjectLabel(name, objectNames, { missingArt: missing, missingText: t('mapEditor.missingArt') })
  ), [objectNames, t])

  const editor = (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-gray-950 text-gray-100"
      data-testid="map-editor"
      data-suppress-studio-context-menu="true"
      onContextMenu={(event) => event.preventDefault()}
    >
      <MapEditorToolbar
        filePath={session.filePath}
        saving={saving}
        tool={tool}
        brushSizeId={brushSizeId}
        marbleMadness={marbleMadness}
        logicTab={logicTab}
        logicOpen={logicOpen}
        onTool={setTool}
        onBrushSizeId={applyBrushSize}
        onMarbleMadness={setMarbleMadness}
        onShowAllTilesets={() => setHideView((prev) => showAllTileSets(prev))}
        onShowAllFields={() => setHideView((prev) => showAllFields(prev))}
        onAutoLevel={() => {
          const index = theaterArt?.index
          if (!index || !theaterArt) return
          commitEdit('autoLevel', () => {
            autoLevel(doc, lookupFromTheater(index, theaterArt.tileShapeMap()), index)
          })
        }}
        onAutoShore={() => {
          const index = theaterArt?.index
          if (!index || !theaterArt) return
          commitEdit('autoShore', () => autoCreateShores(doc, index, theaterArt.shoreCatalog))
        }}
        onOpenLogic={openLogic}
        onUndo={undo}
        onRedo={redo}
        onSave={() => { void onSave() }}
        onExit={onExit}
        extraOptions={(
          <>
            <label className="flex items-center gap-1 text-[11px] text-gray-400">
              {t('mapEditor.owner')}
              <select className="rounded bg-gray-800 px-1 py-0.5 text-gray-100" value={owner} onChange={(event) => setOwner(event.target.value)}>
                {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-gray-400">
              {t('mapEditor.objectName')}
              <input className="w-20 rounded bg-gray-800 px-1 py-0.5 text-gray-100" list="map-object-names" value={objectName} onChange={(event) => setObjectName(event.target.value)} />
              <datalist id="map-object-names">
                {(
                  tool === 'infantry' ? rulesLists.infantry
                    : tool === 'unit' ? rulesLists.units
                      : tool === 'aircraft' ? rulesLists.aircraft
                        : tool === 'structure' ? rulesLists.structures
                          : tool === 'terrain' || tool === 'randomTerrain' ? rulesLists.terrain
                            : tool === 'smudge' ? rulesLists.smudges
                              : [...rulesLists.infantry, ...rulesLists.units, ...rulesLists.structures]
                ).map((name) => <option key={name} value={name} />)}
              </datalist>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-gray-400">
              {t('mapEditor.overlayData')}
              <input type="number" className="w-16 rounded bg-gray-800 px-1 py-0.5 text-gray-100" value={overlayDataValue} onChange={(event) => setOverlayDataValue(Number(event.target.value))} data-testid="map-overlay-data" />
            </label>
            {tool === 'wall' && (
              <label className="flex items-center gap-1 text-[11px] text-gray-400">
                {t('mapEditor.toolWall')}
                <select className="rounded bg-gray-800 px-1 py-0.5" value={overlayId} onChange={(event) => setOverlayId(Number(event.target.value))} data-testid="map-wall-type">
                  {FA2_WALL_OVERLAYS.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
            )}
            {bridgeHintKey && (
              <span className="flex flex-wrap items-center gap-1 text-[11px] text-amber-200" data-testid="map-bridge-connect-hint">
                {tool === 'bridge' && (
                  <label className="flex items-center gap-1 text-gray-400">
                    {t('mapEditor.toolBridge')}
                    <select className="rounded bg-gray-800 px-1 py-0.5 text-gray-100" value={bridgeKind} onChange={(event) => setBridgeKind(event.target.value as BridgeKind)} data-testid="map-bridge-kind">
                      <option value="small">{t('mapEditor.bridgeSmall')}</option>
                      <option value="big">{t('mapEditor.bridgeBig')}</option>
                      <option value="track">{t('mapEditor.bridgeTrack')}</option>
                      <option value="concrete">{t('mapEditor.bridgeConcrete')}</option>
                    </select>
                  </label>
                )}
                {t(BRIDGE_TOOLBAR_HINT_I18N[bridgeHintKey])}
              </span>
            )}
            {tool === 'tube' && (
              <label className="flex items-center gap-1 text-[11px] text-gray-400">
                <input type="checkbox" checked={tubeBidirectional} onChange={(event) => setTubeBidirectional(event.target.checked)} data-testid="map-tube-bidirectional" />
                {t('mapEditor.tubeBidirectional')}
              </label>
            )}
            {(tool === 'raise' || tool === 'lower') && (
              <span className="text-[11px] text-amber-200">{t('mapEditor.raiseHint')}</span>
            )}
            {(tool === 'raiseTile' || tool === 'lowerTile') && (
              <span className="text-[11px] text-amber-200" data-testid="map-raise-tile-hint">{t('mapEditor.raiseTileHint')}</span>
            )}
            {(tool === 'ore' || tool === 'gems') && (
              <label className="flex items-center gap-1 text-[11px] text-gray-400">
                <input type="checkbox" checked={oreRandom} onChange={(event) => setOreRandom(event.target.checked)} data-testid="map-ore-random" />
                {t('mapEditor.oreRandom')}
              </label>
            )}
            <label className="flex items-center gap-1 text-[11px] text-gray-400">
              <input type="checkbox" checked={showBuildingOutline} onChange={(event) => setShowBuildingOutline(event.target.checked)} data-testid="map-building-outline" />
              {t('mapEditor.showBuildingOutline')}
            </label>
          </>
        )}
      />

      <div className="flex min-h-0 flex-1">
        <aside className={`${mobileToolsOpen ? 'absolute inset-y-0 left-0 z-[80] flex' : 'hidden'} w-56 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900 md:static md:flex`} data-testid={mobileToolsOpen ? 'map-mobile-tools' : 'map-object-tree'}>
          <ObjectToolTree
            theater={theaterArt?.index}
            theaterName={doc.theater}
            theaterArt={theaterArt}
            artRevision={artRevision}
            rulesLists={rulesLists}
            objectNames={objectNames}
            selectedId={treeNodeId}
            multiplayerOnly={doc.basic.multiplayerOnly}
            onSelect={handleTreeSelect}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 min-w-0 flex-1" ref={viewRef}>
          {viewPlaced && (
          <div className="h-full w-full">
          <MapViewport
            document={doc}
            tool={tool}
            brush={brush}
            brushCells={brushPreviewCells}
            brushGhosts={brushGhosts}
            panX={panX}
            panY={panY}
            scale={scale}
            selected={selected}
            hover={hover}
            objectLabel={formatPlacedName}
            selectionRect={selectionRect}
            marbleMadness={marbleMadness}
            showBuildingOutline={showBuildingOutline}
            foundations={foundations}
            hideView={hideView}
            theaterArt={theaterArt}
            artRevision={artRevision}
            revision={revision}
            onPanChange={(nextX, nextY) => {
              setPanX(nextX)
              setPanY(nextY)
            }}
            onScaleChange={setScale}
            onPaint={handlePaint}
            onPick={handlePick}
            onMoveObject={handleMoveObject}
            onHover={setHover}
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
            theaterArt={theaterArt}
            artRevision={artRevision}
            onPanChange={(nextX, nextY) => {
              setPanX(nextX)
              setPanY(nextY)
            }}
          />
          </div>
          )}
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs" data-testid="map-cell-status">{selectedInfo}</div>
          {selected && selectedHasObject && (
            <div className="absolute right-2 top-2 z-20 max-h-[70%] w-56 overflow-y-auto rounded border border-gray-700 bg-gray-900/95 p-2 shadow-lg" data-testid="map-object-props">
              <div className="mb-1 flex items-center gap-1">
                <div className="min-w-0 flex-1 text-[11px] font-medium text-gray-300">{t('mapEditor.objectProps')}</div>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
                  onClick={() => setObjectPropsCollapsed((open) => !open)}
                  data-testid="map-object-props-collapse"
                  aria-expanded={!objectPropsCollapsed}
                >
                  {objectPropsCollapsed ? t('mapEditor.objectPropsExpand') : t('mapEditor.objectPropsCollapse')}
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
                  onClick={() => setSelected(null)}
                  data-testid="map-object-props-close"
                  aria-label={t('mapEditor.objectPropsClose')}
                >
                  {t('mapEditor.objectPropsClose')}
                </button>
              </div>
              {!objectPropsCollapsed && (
                <ObjectInspector
                  doc={doc}
                  selected={selected}
                  bump={bump}
                  foundations={foundations}
                  objectNames={objectNames}
                  theaterArt={theaterArt}
                />
              )}
            </div>
          )}
          {theaterArtReady && !theaterArt && (
            <div
              className="pointer-events-none absolute left-2 top-10 max-w-sm rounded bg-amber-900/80 px-2 py-1 text-xs text-amber-100"
              data-testid="map-theater-missing"
            >
              {t('mapEditor.theaterMissing')}
            </div>
          )}
          <button
            type="button"
            className="absolute bottom-3 left-3 rounded bg-gray-900/90 px-3 py-2 text-sm md:hidden"
            onClick={() => setMobileToolsOpen((open) => !open)}
            data-testid="map-mobile-tools-toggle"
          >
            {t('mapEditor.tools')}
          </button>
          <button
            type="button"
            className="absolute bottom-3 right-3 rounded bg-gray-900/90 px-3 py-2 text-sm lg:hidden"
            onClick={() => setLogicOpen((open) => !open)}
            data-testid="map-mobile-logic-toggle"
          >
            {t('mapEditor.logicPanel')}
          </button>
        </div>
        <TileSetPreviewBar
          theaterArt={theaterArt}
          artRevision={artRevision}
          tileNum={tileNum}
          overlayId={overlayId}
          overlayNames={rulesLists.overlays}
          selectedSetIndex={previewSetIndex}
          onSelectedSetIndex={setPreviewSetIndex}
          onTileNum={(next) => {
            setTileNum(next)
            setTool('tile')
          }}
          onOverlayId={(next) => {
            setOverlayId(next)
            setTool('overlay')
          }}
        />
        </div>

        <aside
          className={`${logicOpen ? 'fixed inset-y-16 right-0 z-[80] flex w-[min(100%,22rem)] shadow-2xl' : 'hidden'} flex-col overflow-y-auto border-l border-gray-800 bg-gray-900 p-2`}
          data-testid="map-logic-panel"
          data-open={logicOpen ? '1' : '0'}
        >
          <button
            type="button"
            className="mb-2 self-end rounded bg-gray-800 px-2 py-1 text-xs"
            data-testid="map-mobile-logic-close"
            onClick={() => setLogicOpen(false)}
          >
            {t('mapEditor.exit')}
          </button>
          {logicTab === 'basic' && (
            <div className="space-y-2 text-sm">
              <label className="block">{t('mapEditor.mapName')}<input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.basic.name} onChange={(event) => { doc.basic.name = event.target.value; bump(doc) }} /></label>
              <label className="block">{t('mapEditor.player')}<input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.basic.player} onChange={(event) => { doc.basic.player = event.target.value; bump(doc) }} /></label>
              {([
                ['nextScenario', 'mapEditor.nextScenario'],
                ['altNextScenario', 'mapEditor.altNextScenario'],
                ['intro', 'mapEditor.intro'],
                ['brief', 'mapEditor.brief'],
                ['win', 'mapEditor.win'],
                ['lose', 'mapEditor.lose'],
                ['action', 'mapEditor.action'],
                ['postScore', 'mapEditor.postScore'],
                ['requiredAddOn', 'mapEditor.requiredAddOn'],
                ['preMapSelect', 'mapEditor.preMapSelect'],
                ['startingDropships', 'mapEditor.startingDropships'],
                ['timerInherit', 'mapEditor.timerInherit'],
                ['fillSilos', 'mapEditor.fillSilos'],
              ] as const).map(([key, labelKey]) => (
                <label key={key} className="block">{t(labelKey as never)}
                  <input
                    className="mt-1 w-full rounded bg-gray-800 px-2 py-1"
                    data-testid={`map-basic-${key}`}
                    value={doc.basic[key]}
                    onChange={(event) => { doc.basic[key] = event.target.value; bump(doc) }}
                  />
                </label>
              ))}
              <div className="flex gap-2">
                <label className="block flex-1">{t('mapEditor.width')}<input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={mapWidth} onChange={(event) => setMapWidth(Number(event.target.value))} /></label>
                <label className="block flex-1">{t('mapEditor.height')}<input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={mapHeight} onChange={(event) => setMapHeight(Number(event.target.value))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['localX', 'mapEditor.localX'],
                  ['localY', 'mapEditor.localY'],
                  ['localWidth', 'mapEditor.localWidth'],
                  ['localHeight', 'mapEditor.localHeight'],
                ] as const).map(([key, labelKey]) => (
                  <label key={key} className="block text-xs">{t(labelKey as never)}
                    <input
                      type="number"
                      className="mt-1 w-full rounded bg-gray-800 px-2 py-1"
                      data-testid={`map-${key}`}
                      value={doc[key]}
                      onChange={(event) => { doc[key] = Number(event.target.value); bump(doc) }}
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['percent', 'mapEditor.percent'],
                  ['carryOverMoney', 'mapEditor.carryOverMoney'],
                  ['carryOverCap', 'mapEditor.carryOverCap'],
                  ['initTime', 'mapEditor.initTime'],
                ] as const).map(([key, labelKey]) => (
                  <label key={key} className="block text-xs">{t(labelKey as never)}
                    <input
                      type="number"
                      className="mt-1 w-full rounded bg-gray-800 px-2 py-1"
                      value={doc.basic[key]}
                      onChange={(event) => { doc.basic[key] = Number(event.target.value); bump(doc) }}
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <label className="block flex-1">{t('mapEditor.resizeLeft')}<input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={resizeLeft} onChange={(event) => setResizeLeft(Number(event.target.value))} data-testid="map-resize-left" /></label>
                <label className="block flex-1">{t('mapEditor.resizeTop')}<input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={resizeTop} onChange={(event) => setResizeTop(Number(event.target.value))} data-testid="map-resize-top" /></label>
              </div>
              <button type="button" className="rounded bg-gray-800 px-2 py-1" onClick={() => {
                commitEdit('resize', () => {
                  const error = resizeMap(doc, mapWidth, mapHeight, { left: resizeLeft, top: resizeTop })
                  setToolsNote(error ?? '')
                })
              }}>{t('mapEditor.resize')}</button>
              {toolsNote && <p className="text-[11px] text-amber-300" data-testid="map-tools-note">{toolsNote}</p>}
              <div className="text-xs text-gray-400">{t('mapEditor.validate')}</div>
              <ul className="max-h-32 overflow-y-auto text-[11px] text-amber-300" data-testid="map-validate">
                {validateMap(doc).map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>)}
              </ul>
              <div className="text-xs font-medium text-gray-300">{t('mapEditor.objectProps')}</div>
              <ObjectInspector
                doc={doc}
                selected={selected}
                bump={bump}
                foundations={foundations}
                objectNames={objectNames}
                theaterArt={theaterArt}
              />
              <div className="pt-2 text-xs font-medium text-gray-300">Basic flags</div>
              {([
                'multiplayerOnly', 'official', 'skipScore', 'oneTimeOnly', 'skipMapSelect', 'endOfGame',
                'truckCrate', 'trainCrate', 'tiberiumGrowthEnabled', 'veinGrowthEnabled', 'iceGrowthEnabled',
                'tiberiumDeathToVisceroid', 'freeRadar', 'ignoreGlobalAITriggers',
              ] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-[11px] text-gray-400">
                  <input type="checkbox" checked={doc.basic[key]} onChange={(event) => { doc.basic[key] = event.target.checked; bump(doc) }} />
                  {key}
                </label>
              ))}
            </div>
          )}
          {logicTab === 'lighting' && (
            <div className="space-y-2 text-sm">
              <div className="text-xs font-medium text-gray-300">Lighting</div>
              {(['ambient', 'level', 'red', 'green', 'blue', 'ground'] as const).map((key) => (
                <label key={key} className="block capitalize">
                  {key}
                  <input type="number" step="0.01" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.lighting[key]} onChange={(event) => { doc.lighting[key] = Number(event.target.value); bump(doc) }} />
                </label>
              ))}
              <div className="pt-2 text-xs font-medium text-gray-300">IonLighting</div>
              {(['ambient', 'level', 'red', 'green', 'blue', 'ground'] as const).map((key) => (
                <label key={`ion-${key}`} className="block capitalize">
                  Ion {key}
                  <input type="number" step="0.01" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.ionLighting[key]} onChange={(event) => { doc.ionLighting[key] = Number(event.target.value); bump(doc) }} />
                </label>
              ))}
              <div className="pt-2 text-xs font-medium text-gray-300">DominatorLighting</div>
              {(['ambient', 'level', 'red', 'green', 'blue', 'ground'] as const).map((key) => (
                <label key={`dom-${key}`} className="block capitalize">
                  Dominator {key}
                  <input type="number" step="0.01" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.dominatorLighting[key]} onChange={(event) => { doc.dominatorLighting[key] = Number(event.target.value); bump(doc) }} />
                </label>
              ))}
              <label className="block text-xs">DominatorAmbientChangeRate
                <input type="number" step="0.001" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={doc.dominatorAmbientChangeRate} onChange={(event) => { doc.dominatorAmbientChangeRate = Number(event.target.value); bump(doc) }} />
              </label>
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
            <div className="space-y-2 text-sm" data-testid="map-houses-panel">
              <label className="block text-xs">{t('mapEditor.player')}
                <select
                  className="mt-1 w-full rounded bg-gray-800 px-2 py-1"
                  data-testid="map-human-player"
                  value={doc.basic.player}
                  onChange={(event) => { doc.basic.player = event.target.value; bump(doc) }}
                >
                  <option value="">&lt;none&gt;</option>
                  {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
                </select>
              </label>
              <div className="flex gap-1">
                <input
                  className="min-w-0 flex-1 rounded bg-gray-800 px-2 py-1 text-xs"
                  data-testid="map-house-name"
                  value={newHouseName}
                  onChange={(event) => setNewHouseName(event.target.value)}
                  placeholder={t('mapEditor.addHouse')}
                />
                <button
                  type="button"
                  className="rounded bg-gray-800 px-2 py-1 text-xs"
                  data-testid="map-add-house"
                  onClick={() => {
                    const error = addMapHouse(doc, newHouseName)
                    setToolsNote(error ?? '')
                    if (!error) setNewHouseName('')
                    bump(doc)
                  }}
                >
                  {t('mapEditor.addHouse')}
                </button>
              </div>
              <button
                type="button"
                className="rounded bg-gray-800 px-2 py-1 text-xs"
                data-testid="map-prepare-houses"
                onClick={() => {
                  const error = prepareHouses(doc)
                  setToolsNote(error ?? '')
                  bump(doc)
                }}
              >
                {t('mapEditor.prepareHouses')}
              </button>
              {doc.houses.map((house, index) => (
                <div key={house.name} className="rounded border border-gray-800 p-2">
                  <div className="font-medium">{house.name}</div>
                  {(['credits', 'iq', 'techLevel', 'actsLike', 'percentBuilt'] as const).map((key) => (
                    <label key={key} className="mt-1 block text-xs capitalize">{key}
                      <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={house[key]} onChange={(event) => { doc.houses[index][key] = Number(event.target.value); bump(doc) }} />
                    </label>
                  ))}
                  {(['color', 'allies', 'edge', 'country', 'parentCountry'] as const).map((key) => (
                    <label key={key} className="mt-1 block text-xs capitalize">{key}
                      <input className="mt-1 w-full rounded bg-gray-800 px-2 py-1" value={house[key]} onChange={(event) => { doc.houses[index][key] = event.target.value; bump(doc) }} />
                    </label>
                  ))}
                  <label className="mt-1 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={house.playerControl} onChange={(event) => { house.playerControl = event.target.checked; bump(doc) }} />
                    PlayerControl
                  </label>
                  <label className="mt-1 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={house.smartAI} onChange={(event) => { house.smartAI = event.target.checked; bump(doc) }} />
                    SmartAI
                  </label>
                  <div className="mt-1 text-[11px] text-gray-400">Nodes: {house.nodes.length}</div>
                  {house.nodes.map((node, nodeIndex) => (
                    <div key={`${house.name}-${nodeIndex}`} className="mt-1 flex gap-1 text-[11px]">
                      <input className="w-16 rounded bg-gray-800 px-1" value={node.type} onChange={(event) => { node.type = event.target.value; bump(doc) }} />
                      <span>{node.rx},{node.ry}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-red-400"
                    onClick={() => {
                      deleteMapHouse(doc, house.name)
                      bump(doc)
                    }}
                  >
                    {t('mapEditor.deleteHouse')}
                  </button>
                </div>
              ))}
            </div>
          )}
          {logicTab === 'triggers' && (
            <TriggerLogicPanel doc={doc} owner={owner} bump={bump} />
          )}
          {logicTab === 'teams' && (
            <TeamsLogicPanel doc={doc} owner={owner} bump={bump} />
          )}
          {logicTab === 'ai' && (
            <AiTriggerPanel
              doc={doc}
              bump={bump}
              objectNames={[...rulesLists.infantry, ...rulesLists.units, ...rulesLists.aircraft, ...rulesLists.structures]}
            />
          )}
          {logicTab === 'maptools' && (
            <div className="space-y-3 text-sm" data-testid="map-maptools-panel">
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <input type="checkbox" checked={autoLat} onChange={(event) => setAutoLat(event.target.checked)} />
                {t('mapEditor.autoLat')}
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input type="checkbox" checked={slopeCorrection} onChange={(event) => setSlopeCorrection(event.target.checked)} data-testid="map-slope-correction" />
                {t('mapEditor.slopeCorrection')}
              </label>
              <button
                type="button"
                className="w-full rounded bg-gray-800 px-2 py-1 text-left text-xs text-gray-300"
                data-testid="map-copy-whole"
                onClick={() => { clipboardRef.current = copyWholeMap(doc) }}
              >
                {t('mapEditor.copyWholeMap')}
              </button>
              <button
                type="button"
                className="w-full rounded bg-gray-800 px-2 py-1 text-left text-xs text-gray-300"
                data-testid="map-paste-whole"
                onClick={() => {
                  const clip = clipboardRef.current
                  if (!clip) return
                  commitEdit('pasteWhole', () => {
                    pasteWholeMap(doc, clip, selected?.rx, selected?.ry)
                  })
                }}
              >
                {t('mapEditor.pasteWholeMap')}
              </button>
              <div className="text-xs font-medium text-gray-300">{t('mapEditor.globals')}</div>
              <div className="space-y-1" data-testid="map-globals-panel">
                {doc.variables.map((item, index) => (
                  <div key={`${item.index}-${index}`} className="flex gap-1">
                    <input className="w-10 rounded bg-gray-800 px-1 py-1 text-[11px]" value={item.index} onChange={(event) => { item.index = Number(event.target.value) || 0; bump(doc) }} />
                    <input className="min-w-0 flex-1 rounded bg-gray-800 px-1 py-1 text-[11px]" value={item.name} onChange={(event) => { item.name = event.target.value.replace(/,/g, ''); bump(doc) }} />
                    <input type="number" className="w-14 rounded bg-gray-800 px-1 py-1 text-[11px]" value={item.value} onChange={(event) => { item.value = Number(event.target.value) || 0; bump(doc) }} />
                  </div>
                ))}
                <button
                  type="button"
                  className="rounded bg-gray-800 px-2 py-1 text-xs"
                  onClick={() => {
                    const index = doc.variables.reduce((max, item) => Math.max(max, item.index), -1) + 1
                    doc.variables.push({ index, name: `Global${index}`, value: 0 })
                    bump(doc)
                  }}
                >
                  {t('mapEditor.addGlobal')}
                </button>
              </div>
              <div className="text-xs font-medium text-gray-300">{t('mapEditor.searchWaypoint')}</div>
              <div className="flex gap-1">
                <input
                  className="min-w-0 flex-1 rounded bg-gray-800 px-2 py-1 text-xs"
                  data-testid="map-search-waypoint"
                  value={waypointSearch}
                  onChange={(event) => setWaypointSearch(event.target.value)}
                  placeholder="0"
                />
                <button
                  type="button"
                  className="rounded bg-gray-800 px-2 py-1 text-xs"
                  onClick={() => {
                    const needle = waypointSearch.trim()
                    const found = doc.waypoints.find((item) => String(item.number) === needle)
                    if (found) jumpToCell(found.rx, found.ry)
                  }}
                >
                  {t('mapEditor.jumpWaypoint')}
                </button>
              </div>
              <div className="max-h-24 overflow-y-auto text-[11px] text-gray-400">
                {doc.waypoints.map((item) => (
                  <button
                    key={item.number}
                    type="button"
                    className="block w-full truncate px-1 py-0.5 text-left hover:bg-gray-800"
                    onClick={() => jumpToCell(item.rx, item.ry)}
                  >
                    {item.number}: {item.rx},{item.ry}
                  </button>
                ))}
              </div>
              <div className="text-xs font-medium text-gray-300">{t('mapEditor.changeMapHeight')}</div>
              <div className="flex gap-1">
                <input type="number" className="min-w-0 flex-1 rounded bg-gray-800 px-2 py-1 text-xs" value={heightDelta} onChange={(event) => setHeightDelta(Number(event.target.value))} data-testid="map-height-delta" />
                <button
                  type="button"
                  className="rounded bg-gray-800 px-2 py-1 text-xs"
                  data-testid="map-change-height"
                  onClick={() => {
                    commitEdit('changeHeight', () => {
                      const error = changeMapHeight(doc, heightDelta)
                      setToolsNote(error ?? '')
                    })
                  }}
                >
                  {t('mapEditor.applyHeight')}
                </button>
              </div>
              <div className="text-xs font-medium text-gray-300">{t('mapEditor.iniEditor')}</div>
              <select
                className="w-full rounded bg-gray-800 px-2 py-1 text-xs"
                data-testid="map-ini-section"
                value={iniSection}
                onChange={(event) => {
                  setIniSection(event.target.value)
                  const first = listIniKeys(doc, event.target.value)[0]
                  setIniKey(first?.key ?? '')
                  setIniValue(first?.value ?? '')
                }}
              >
                {iniSections.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <input className="w-full rounded bg-gray-800 px-2 py-1 text-xs" value={iniSection} onChange={(event) => setIniSection(event.target.value)} placeholder="Section" />
              <div className="max-h-20 overflow-y-auto text-[11px]">
                {iniEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`block w-full truncate px-1 py-0.5 text-left ${entry.key === iniKey ? 'bg-blue-800' : 'hover:bg-gray-800'}`}
                    onClick={() => { setIniKey(entry.key); setIniValue(entry.value) }}
                  >
                    {entry.key}={entry.value}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <input className="min-w-0 flex-1 rounded bg-gray-800 px-2 py-1 text-xs" value={iniKey} onChange={(event) => setIniKey(event.target.value)} placeholder="Key" data-testid="map-ini-key" />
                <input className="min-w-0 flex-1 rounded bg-gray-800 px-2 py-1 text-xs" value={iniValue} onChange={(event) => setIniValue(event.target.value)} placeholder="Value" data-testid="map-ini-value" />
              </div>
              <button
                type="button"
                className="rounded bg-gray-800 px-2 py-1 text-xs"
                data-testid="map-ini-set"
                onClick={() => {
                  if (!iniSection.trim() || !iniKey.trim() || isPackedIniSection(iniSection)) return
                  commitEdit('ini', () => {
                    applyIniEdit(doc, (ini) => { ini.setValue(iniSection.trim(), iniKey.trim(), iniValue) })
                  })
                }}
              >
                {t('mapEditor.setIniKey')}
              </button>
              <div className="text-xs font-medium text-gray-300">{t('mapEditor.userScript')}</div>
              <p className="text-[11px] text-gray-400">{t('mapEditor.scriptHint')}</p>
              <textarea
                className="h-28 w-full rounded bg-gray-800 px-2 py-1 font-mono text-[11px]"
                data-testid="map-user-script"
                value={scriptText}
                onChange={(event) => setScriptText(event.target.value)}
              />
              <button
                type="button"
                className="rounded bg-blue-700 px-2 py-1 text-xs"
                data-testid="map-run-script"
                onClick={() => {
                  commitEdit('userScript', () => {
                    const result = runUserScript(doc, scriptText, { ui: createBrowserUserScriptUi() })
                    setScriptReport(result.report || result.error || '')
                  })
                }}
              >
                {t('mapEditor.runScript')}
              </button>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-amber-200" data-testid="map-script-report">{scriptReport || toolsNote}</pre>
            </div>
          )}
          {logicTab === 'tubes' && (
            <div className="space-y-2 text-sm">
              {doc.tubes.map((tube) => (
                <div key={tube.id} className="rounded border border-gray-800 p-2 text-xs">
                  {tube.startX},{tube.startY} → {tube.endX},{tube.endY} dir={tube.startDir} parts={tube.parts.join(',')}
                </div>
              ))}
              <p className="text-xs text-gray-400">{t('mapEditor.tubeHint')}</p>
              <p className="text-xs text-gray-400">{t('mapEditor.bridgeHint')}</p>
              <p className="text-xs text-gray-400">{t('mapEditor.cliffHint')}</p>
              <p className="text-xs text-gray-400">{t('mapEditor.shoreHint')}</p>
              <p className="text-xs text-gray-400">{t('mapEditor.oreHint')}</p>
              <p className="text-xs text-gray-400">{t('mapEditor.copyHint')}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )

  return createPortal(editor, document.body)
}

export default MapEditor
