import React, { useRef } from 'react'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH, EMPTY_OVERLAY } from '../../data/map/constants'
import { forEachIsoCell, hitTestDiamond, isValidIsoCell, projectCell } from '../../data/map/isoCoords'
import { buildingBlitPosition, objectBlitPosition, overlayBlitPosition, tmpBlitPosition } from '../../data/map/isoDraw'
import { houseRgbFromColorName } from '../../data/map/fa2HouseColor'
import { infantrySubPosOffset } from '../../data/map/fa2Infantry'
import { MapDocument } from '../../data/map/MapDocument'
import { walkTubeCells } from '../../data/map/fa2Tube'
import { outerDiamondEdges } from '../../data/map/fa2Brush'
import { drawTriggerLocation } from './drawTriggerLocation'
import type { MapEditorTool } from '../../data/map/mapTools'
import type { TheaterArt, TilePixels } from '../../data/map/TheaterArt'
import type { ObjectSpriteKind } from '../../data/map/fa2Facing'
import type { BuildingFoundation } from '../../data/map/rulesObjects'
import { emptyHideView, isCellHidden, type MapHideView } from '../../data/map/fa2Hide'
import { followWorldAtClient, worldFromCanvasClient, zoomAroundClient } from '../../data/map/viewportZoom'

export type MapViewportPick = {
  rx: number
  ry: number
  clientX: number
  clientY: number
  longPress: boolean
}

type PointerState = {
  id: number
  x: number
  y: number
}

type MapViewportProps = {
  document: MapDocument
  tool: MapEditorTool
  brush: number
  panX: number
  panY: number
  scale: number
  selected?: { rx: number; ry: number } | null
  brushCells?: Array<{ rx: number; ry: number }>
  selectionRect?: { minRx: number; minRy: number; maxRx: number; maxRy: number } | null
  marbleMadness?: boolean
  showBuildingOutline?: boolean
  foundations?: Record<string, BuildingFoundation>
  theaterArt?: TheaterArt | null
  artRevision?: number
  hideView?: MapHideView
  onPanChange: (panX: number, panY: number) => void
  onScaleChange: (scale: number) => void
  onPaint: (rx: number, ry: number) => void
  onPick: (pick: MapViewportPick) => void
  onHover?: (cell: { rx: number; ry: number } | null) => void
  onStrokeStart?: () => void
  onStrokeEnd?: () => void
  revision?: number
}

function canvasLocal(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

function worldFromClient(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  panX: number,
  panY: number,
  scale: number,
): { x: number; y: number } {
  const local = canvasLocal(canvas, clientX, clientY)
  return worldFromCanvasClient(local.x, local.y, panX, panY, scale)
}

function pinchMidpoint(pointers: Iterable<PointerState>, canvas: HTMLCanvasElement): { x: number; y: number } {
  const points = [...pointers]
  const midX = (points[0].x + points[1].x) / 2
  const midY = (points[0].y + points[1].y) / 2
  return canvasLocal(canvas, midX, midY)
}

function pickCell(doc: MapDocument, worldX: number, worldY: number): { rx: number; ry: number } | null {
  let bestRx = -1
  let bestRy = -1
  let bestZ = -1
  forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
    const cell = doc.getCell(rx, ry)
    if (hitTestDiamond(worldX, worldY, rx, ry, cell.height, doc.isoSize) && cell.height >= bestZ) {
      bestRx = rx
      bestRy = ry
      bestZ = cell.height
    }
  })
  return bestZ >= 0 ? { rx: bestRx, ry: bestRy } : null
}

function tileCanvas(cache: Map<string, HTMLCanvasElement>, key: string, pixels: TilePixels): HTMLCanvasElement {
  const existing = cache.get(key)
  if (existing) return existing
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const data = new Uint8ClampedArray(pixels.rgba.length)
    data.set(pixels.rgba)
    ctx.putImageData(new ImageData(data, pixels.width, pixels.height), 0, 0)
  }
  cache.set(key, canvas)
  return canvas
}

function pathDiamond(ctx: CanvasRenderingContext2D, origin: { px: number; py: number }) {
  ctx.beginPath()
  ctx.moveTo(origin.px, origin.py)
  ctx.lineTo(origin.px + RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
  ctx.lineTo(origin.px, origin.py + RA2_ISO_TILE_HEIGHT)
  ctx.lineTo(origin.px - RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
  ctx.closePath()
}

function diamondVerts(origin: { px: number; py: number }): Array<{ x: number; y: number }> {
  const hw = RA2_ISO_TILE_WIDTH / 2
  const hh = RA2_ISO_TILE_HEIGHT / 2
  return [
    { x: origin.px, y: origin.py },
    { x: origin.px + hw, y: origin.py + hh },
    { x: origin.px, y: origin.py + hh * 2 },
    { x: origin.px - hw, y: origin.py + hh },
  ]
}

function strokeBrushOutline(
  ctx: CanvasRenderingContext2D,
  cells: Array<{ rx: number; ry: number }>,
  doc: MapDocument,
  scale: number,
) {
  if (cells.length === 0) return
  ctx.strokeStyle = '#38bdf8'
  ctx.lineWidth = 2 / scale
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (const item of outerDiamondEdges(cells)) {
    if (!isValidIsoCell(item.rx, item.ry, doc.width, doc.height)) continue
    const origin = projectCell(item.rx, item.ry, doc.getCell(item.rx, item.ry).height, doc.isoSize)
    const verts = diamondVerts(origin)
    const a = verts[item.edge]
    const b = verts[(item.edge + 1) % 4]
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()
}

function drawBuildingOutline(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  z: number,
  isoSize: number,
  w: number,
  h: number,
  scale: number,
) {
  const origin = projectCell(rx, ry, z, isoSize)
  const hx = RA2_ISO_TILE_WIDTH / 2
  const hy = RA2_ISO_TILE_HEIGHT / 2
  ctx.beginPath()
  ctx.moveTo(origin.px, origin.py)
  ctx.lineTo(origin.px + w * hx, origin.py + w * hy)
  ctx.lineTo(origin.px + (w - h) * hx, origin.py + (w + h) * hy)
  ctx.lineTo(origin.px - h * hx, origin.py + h * hy)
  ctx.closePath()
  ctx.strokeStyle = 'rgba(251,113,133,0.95)'
  ctx.lineWidth = 2 / scale
  ctx.stroke()
}

const MapViewport: React.FC<MapViewportProps> = ({
  document: doc,
  tool,
  panX,
  panY,
  scale,
  selected,
  brushCells = [],
  selectionRect,
  marbleMadness = false,
  showBuildingOutline = true,
  foundations = {},
  theaterArt,
  artRevision = 0,
  hideView = emptyHideView(),
  onPanChange,
  onScaleChange,
  onPaint,
  onPick,
  onHover,
  onStrokeStart,
  onStrokeEnd,
  revision = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointersRef = useRef<Map<number, PointerState>>(new Map())
  const pinchRef = useRef<{
    distance: number
    scale: number
    worldX: number
    worldY: number
  } | null>(null)
  const transformRef = useRef({ panX, panY, scale })
  transformRef.current = { panX, panY, scale }
  const paintingRef = useRef(false)
  const lastPaintRef = useRef<string | null>(null)
  const hoverKeyRef = useRef<string | null>(null)
  const tileCacheRef = useRef(new Map<string, HTMLCanvasElement>())
  const worldBufRef = useRef<HTMLCanvasElement | null>(null)
  const worldBlitRef = useRef({ bufX: 0, bufY: 0, bufW: 1, bufH: 1 })

  const paintWorld = React.useCallback(() => {
    void revision
    const canvas = canvasRef.current
    if (!canvas) return
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight

    const worldLeft = -panX / scale
    const worldTop = -panY / scale
    const worldRight = (cssW - panX) / scale
    const worldBottom = (cssH - panY) / scale
    const pad = 128
    const bufX = Math.floor(worldLeft) - pad
    const bufY = Math.floor(worldTop) - pad
    const bufW = Math.max(1, Math.ceil(worldRight) - bufX + pad)
    const bufH = Math.max(1, Math.ceil(worldBottom) - bufY + pad)
    let world = worldBufRef.current
    if (!world) {
      world = document.createElement('canvas')
      worldBufRef.current = world
    }
    if (world.width !== bufW || world.height !== bufH) {
      world.width = bufW
      world.height = bufH
    }
    const wctx = world.getContext('2d')
    if (!wctx) return
    wctx.imageSmoothingEnabled = false
    wctx.fillStyle = '#0f172a'
    wctx.fillRect(0, 0, bufW, bufH)
    wctx.save()
    wctx.translate(-bufX, -bufY)

    const cells: Array<{
      rx: number
      ry: number
      origin: { px: number; py: number }
      tileNum: number
      subTile: number
      overlayId: number
      overlayValue: number
      height: number
    }> = []
    forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
      const cell = doc.getCell(rx, ry)
      if (isCellHidden(rx, ry, cell.tileNum, hideView, theaterArt?.index)) return
      const tileNum = marbleMadness && theaterArt ? theaterArt.marbleTile(cell.tileNum) : cell.tileNum
      const overlay = doc.getOverlay(rx, ry)
      cells.push({
        rx,
        ry,
        origin: projectCell(rx, ry, cell.height, doc.isoSize),
        tileNum,
        subTile: cell.subTile,
        overlayId: overlay.id,
        overlayValue: overlay.value,
        height: cell.height,
      })
    })

    for (const item of cells) {
      const variant = theaterArt?.cellVariant(item.rx, item.ry, item.tileNum, item.subTile) ?? 0
      const key = `${item.tileNum}:${item.subTile}:${variant}`
      const pixels = theaterArt?.peek(item.tileNum, item.subTile, variant)
      if (pixels === undefined) theaterArt?.request(item.tileNum, item.subTile, variant)
      if (pixels) {
        const sprite = tileCanvas(tileCacheRef.current, key, pixels)
        const pos = tmpBlitPosition(item.origin, pixels)
        wctx.drawImage(sprite, pos.x, pos.y)
      } else {
        const shade = 50 + item.height * 12
        let fill = `rgb(${shade},${shade + 18},${shade - 8})`
        if (item.overlayId !== EMPTY_OVERLAY) {
          fill = item.overlayId >= 102 && item.overlayId <= 166 ? '#d4a017' : '#64748b'
        }
        pathDiamond(wctx, item.origin)
        wctx.fillStyle = fill
        wctx.fill()
      }
    }

    for (const item of cells) {
      if (item.overlayId === EMPTY_OVERLAY) continue
      const ovl = theaterArt?.peekOverlay(item.overlayId, item.overlayValue)
      if (ovl === undefined) theaterArt?.requestOverlay(item.overlayId, item.overlayValue)
      if (ovl) {
        const sprite = tileCanvas(tileCacheRef.current, `ovl:${item.overlayId}:${item.overlayValue}`, ovl)
        const pos = overlayBlitPosition(item.origin, ovl.width, ovl.height, item.overlayId)
        wctx.drawImage(sprite, pos.x, pos.y)
      } else if (theaterArt?.peek(item.tileNum, item.subTile, theaterArt.cellVariant(item.rx, item.ry, item.tileNum, item.subTile))) {
        wctx.fillStyle = item.overlayId >= 102 && item.overlayId <= 166 ? 'rgba(212,160,23,0.45)' : 'rgba(100,116,139,0.45)'
        pathDiamond(wctx, item.origin)
        wctx.fill()
      }
    }

    const houseRgbOf = (owner?: string) => {
      if (!owner) return undefined
      const house = doc.houses.find((item) => item.name === owner)
      return houseRgbFromColorName(house?.color, theaterArt?.houseColors)
    }

    const mark = (
      rx: number,
      ry: number,
      color: string,
      label?: string,
      objectName?: string,
      facing = 0,
      kind: ObjectSpriteKind = 'unit',
      owner?: string,
      subCell = 0,
    ) => {
      const cell = doc.getCell(rx, ry)
      if (isCellHidden(rx, ry, cell.tileNum, hideView, theaterArt?.index)) return
      let origin = projectCell(rx, ry, cell.height, doc.isoSize)
      if (kind === 'infantry') {
        const offset = infantrySubPosOffset(subCell)
        origin = { px: origin.px + offset.x, py: origin.py + offset.y }
      }
      if (objectName) {
        const house = houseRgbOf(owner)
        const sprite = theaterArt?.peekObject(objectName, 0, facing, house, kind)
        if (sprite === undefined) theaterArt?.requestObject(objectName, 0, facing, house, kind)
        if (sprite) {
          const canvasSprite = tileCanvas(
            tileCacheRef.current,
            `obj:${objectName}:${facing}:${house?.r ?? ''},${house?.g ?? ''},${house?.b ?? ''}:${subCell}:${kind}`,
            sprite,
          )
          const pos = kind === 'building'
            ? buildingBlitPosition(origin, sprite.width, sprite.height)
            : objectBlitPosition(origin, sprite.width, sprite.height)
          wctx.drawImage(canvasSprite, pos.x, pos.y)
          return
        }
      }
      wctx.fillStyle = color
      wctx.beginPath()
      wctx.arc(origin.px, origin.py + 10, 5, 0, Math.PI * 2)
      wctx.fill()
      if (label) {
        wctx.fillStyle = '#f8fafc'
        wctx.font = `${12 / scale}px sans-serif`
        wctx.textAlign = 'center'
        wctx.fillText(label, origin.px, origin.py + 4)
      }
    }

    for (const unit of doc.units) mark(unit.rx, unit.ry, '#60a5fa', unit.name, unit.name, unit.direction, 'unit', unit.owner)
    for (const inf of doc.infantry) mark(inf.rx, inf.ry, '#34d399', inf.name, inf.name, inf.direction, 'infantry', inf.owner, inf.subCell ?? 0)
    for (const air of doc.aircraft) mark(air.rx, air.ry, '#c084fc', air.name, air.name, air.direction, 'unit', air.owner)
    for (const building of doc.structures) {
      if (showBuildingOutline) {
        const size = foundations[building.name] ?? { w: 1, h: 1 }
        drawBuildingOutline(wctx, building.rx, building.ry, doc.getCell(building.rx, building.ry).height, doc.isoSize, size.w, size.h, scale)
      }
      mark(building.rx, building.ry, '#fb7185', building.name, building.name, building.direction, 'building', building.owner)
    }
    for (const terrain of doc.terrains) mark(terrain.rx, terrain.ry, '#4ade80', terrain.name, terrain.name)
    for (const smudge of doc.smudges) mark(smudge.rx, smudge.ry, '#a8a29e')
    for (const waypoint of doc.waypoints) {
      const cell = doc.getCell(waypoint.rx, waypoint.ry)
      if (isCellHidden(waypoint.rx, waypoint.ry, cell.tileNum, hideView, theaterArt?.index)) continue
      drawTriggerLocation(wctx, projectCell(waypoint.rx, waypoint.ry, cell.height, doc.isoSize), waypoint.number, scale)
    }
    for (const node of doc.houses.flatMap((house) => house.nodes.map((item) => ({ ...item, house: house.name })))) {
      mark(node.rx, node.ry, '#f97316', node.type)
    }
    for (const tube of doc.tubes) {
      wctx.strokeStyle = '#22d3ee'
      wctx.lineWidth = 2 / scale
      const cells = walkTubeCells(tube)
      if (cells.length === 0) continue
      wctx.beginPath()
      cells.forEach((cell, index) => {
        const point = projectCell(cell.x, cell.y, doc.getCell(cell.x, cell.y).height, doc.isoSize)
        if (index === 0) wctx.moveTo(point.px, point.py)
        else wctx.lineTo(point.px, point.py)
      })
      wctx.stroke()
    }

    wctx.restore()
    worldBlitRef.current = { bufX, bufY, bufW, bufH }
  }, [artRevision, doc, foundations, hideView, marbleMadness, panX, panY, revision, scale, showBuildingOutline, theaterArt])

  const paintFrame = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const world = worldBufRef.current
    if (!world) return
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const pixelW = Math.max(1, Math.round(cssW * dpr))
    const pixelH = Math.max(1, Math.round(cssH * dpr))
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW
      canvas.height = pixelH
    }
    const { bufX, bufY, bufW, bufH } = worldBlitRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.drawImage(world, bufX * scale + panX, bufY * scale + panY, bufW * scale, bufH * scale)
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(scale, scale)
    strokeBrushOutline(ctx, brushCells, doc, scale)
    if (selected && !brushCells.some((cell) => cell.rx === selected.rx && cell.ry === selected.ry)) {
      pathDiamond(ctx, projectCell(selected.rx, selected.ry, doc.getCell(selected.rx, selected.ry).height, doc.isoSize))
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2 / scale
      ctx.stroke()
    }
    if (selectionRect) {
      const rectCells: Array<{ rx: number; ry: number }> = []
      for (let rx = selectionRect.minRx; rx <= selectionRect.maxRx; rx++) {
        for (let ry = selectionRect.minRy; ry <= selectionRect.maxRy; ry++) {
          if (isValidIsoCell(rx, ry, doc.width, doc.height)) rectCells.push({ rx, ry })
        }
      }
      ctx.strokeStyle = 'rgba(250,204,21,0.85)'
      ctx.lineWidth = 1.5 / scale
      ctx.beginPath()
      for (const item of outerDiamondEdges(rectCells)) {
        const origin = projectCell(item.rx, item.ry, doc.getCell(item.rx, item.ry).height, doc.isoSize)
        const verts = diamondVerts(origin)
        const a = verts[item.edge]
        const b = verts[(item.edge + 1) % 4]
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }, [brushCells, doc, panX, panY, scale, selected, selectionRect])

  React.useEffect(() => {
    paintWorld()
  }, [paintWorld])

  React.useEffect(() => {
    paintFrame()
  }, [paintFrame, paintWorld])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const redraw = () => {
      paintWorld()
      paintFrame()
    }
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [paintFrame, paintWorld])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      /* jsdom / non-pointer hosts */
    }
    pointersRef.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = pinchMidpoint(pointersRef.current.values(), canvas)
      const view = transformRef.current
      const world = worldFromCanvasClient(mid.x, mid.y, view.panX, view.panY, view.scale)
      pinchRef.current = { distance, scale: view.scale, worldX: world.x, worldY: world.y }
      paintingRef.current = false
      return
    }
    const world = worldFromClient(canvas, event.clientX, event.clientY, panX, panY, scale)
    const cell = pickCell(doc, world.x, world.y)
    if (cell) {
      const hoverKey = `${cell.rx},${cell.ry}`
      if (hoverKeyRef.current !== hoverKey) {
        hoverKeyRef.current = hoverKey
        onHover?.(cell)
      }
    }
    if (tool === 'pan' || event.button === 1 || event.button === 2) return
    if (tool === 'select' && cell) {
      onPick({ rx: cell.rx, ry: cell.ry, clientX: event.clientX, clientY: event.clientY, longPress: false })
      return
    }
    if (cell) {
      paintingRef.current = true
      lastPaintRef.current = `${cell.rx},${cell.ry}`
      onStrokeStart?.()
      onPaint(cell.rx, cell.ry)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prev = event.buttons || pointersRef.current.has(event.pointerId)
      ? pointersRef.current.get(event.pointerId)
      : undefined
    if (event.buttons || pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY })
    }
    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const pinch = pinchRef.current
      if (pinch && pinch.distance > 0) {
        const mid = pinchMidpoint(pointersRef.current.values(), canvas)
        const next = followWorldAtClient(
          pinch.worldX,
          pinch.worldY,
          pinch.scale * (distance / pinch.distance),
          mid.x,
          mid.y,
        )
        onScaleChange(next.scale)
        onPanChange(next.panX, next.panY)
        transformRef.current = next
      }
      return
    }
    if (tool === 'pan' || event.buttons === 2 || event.buttons === 4) {
      if (prev) onPanChange(panX + (event.clientX - prev.x), panY + (event.clientY - prev.y))
      return
    }
    const world = worldFromClient(canvas, event.clientX, event.clientY, panX, panY, scale)
    const cell = pickCell(doc, world.x, world.y)
    const hoverKey = cell ? `${cell.rx},${cell.ry}` : ''
    if (hoverKeyRef.current !== hoverKey) {
      hoverKeyRef.current = hoverKey
      onHover?.(cell)
    }
    if (!paintingRef.current) return
    if (!cell) return
    const key = `${cell.rx},${cell.ry}`
    if (lastPaintRef.current === key) return
    lastPaintRef.current = key
    onPaint(cell.rx, cell.ry)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (paintingRef.current && pointersRef.current.size === 0) {
      paintingRef.current = false
      lastPaintRef.current = null
      onStrokeEnd?.()
    }
  }

  const handlePointerLeave = () => {
    if (hoverKeyRef.current === '') return
    hoverKeyRef.current = ''
    onHover?.(null)
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const view = transformRef.current
    const local = canvasLocal(canvas, event.clientX, event.clientY)
    const next = zoomAroundClient(
      view.panX,
      view.panY,
      view.scale,
      event.deltaY < 0 ? view.scale * 1.1 : view.scale / 1.1,
      local.x,
      local.y,
    )
    if (next.scale === view.scale && next.panX === view.panX && next.panY === view.panY) return
    onScaleChange(next.scale)
    onPanChange(next.panX, next.panY)
    transformRef.current = next
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none bg-slate-950"
      data-testid="map-viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={handleWheel}
    />
  )
}

export default MapViewport
