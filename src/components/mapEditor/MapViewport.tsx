import React, { useRef } from 'react'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH, EMPTY_OVERLAY } from '../../data/map/constants'
import { forEachIsoCell, hitTestDiamond, projectCell } from '../../data/map/isoCoords'
import { objectBlitPosition, overlayBlitPosition, tmpBlitPosition } from '../../data/map/isoDraw'
import { MapDocument } from '../../data/map/MapDocument'
import { walkTubeCells } from '../../data/map/fa2Tube'
import { drawTriggerLocation } from './drawTriggerLocation'
import type { MapEditorTool } from '../../data/map/mapTools'
import type { TheaterArt, TilePixels } from '../../data/map/TheaterArt'
import type { BuildingFoundation } from '../../data/map/rulesObjects'
import { emptyHideView, isCellHidden, type MapHideView } from '../../data/map/fa2Hide'

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
  onStrokeStart?: () => void
  onStrokeEnd?: () => void
}

function worldFromClient(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  panX: number,
  panY: number,
  scale: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (clientX - rect.left - panX) / scale,
    y: (clientY - rect.top - panY) / scale,
  }
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
  onStrokeStart,
  onStrokeEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointersRef = useRef<Map<number, PointerState>>(new Map())
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)
  const longPressRef = useRef<number | null>(null)
  const paintingRef = useRef(false)
  const lastPaintRef = useRef<string | null>(null)
  const tileCacheRef = useRef(new Map<string, HTMLCanvasElement>())
  const worldBufRef = useRef<HTMLCanvasElement | null>(null)

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const pixelW = Math.max(1, Math.round(cssW * dpr))
    const pixelH = Math.max(1, Math.round(cssH * dpr))
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW
      canvas.height = pixelH
    }

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

    for (const item of cells) {
      if (selected && selected.rx === item.rx && selected.ry === item.ry) {
        pathDiamond(wctx, item.origin)
        wctx.strokeStyle = '#38bdf8'
        wctx.lineWidth = 2 / scale
        wctx.stroke()
      }
      if (
        selectionRect
        && item.rx >= selectionRect.minRx && item.rx <= selectionRect.maxRx
        && item.ry >= selectionRect.minRy && item.ry <= selectionRect.maxRy
      ) {
        pathDiamond(wctx, item.origin)
        wctx.strokeStyle = 'rgba(250,204,21,0.85)'
        wctx.lineWidth = 1.5 / scale
        wctx.stroke()
      }
    }

    const mark = (rx: number, ry: number, color: string, label?: string, objectName?: string, facing = 0) => {
      const cell = doc.getCell(rx, ry)
      if (isCellHidden(rx, ry, cell.tileNum, hideView, theaterArt?.index)) return
      const origin = projectCell(rx, ry, cell.height, doc.isoSize)
      if (objectName) {
        const sprite = theaterArt?.peekObject(objectName, 0, facing)
        if (sprite === undefined) theaterArt?.requestObject(objectName, 0, facing)
        if (sprite) {
          const canvasSprite = tileCanvas(tileCacheRef.current, `obj:${objectName}:${facing}`, sprite)
          const pos = objectBlitPosition(origin, sprite.width, sprite.height)
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

    for (const unit of doc.units) mark(unit.rx, unit.ry, '#60a5fa', unit.name, unit.name, unit.direction)
    for (const inf of doc.infantry) mark(inf.rx, inf.ry, '#34d399', inf.name, inf.name, inf.direction)
    for (const air of doc.aircraft) mark(air.rx, air.ry, '#c084fc', air.name, air.name, air.direction)
    for (const building of doc.structures) {
      mark(building.rx, building.ry, '#fb7185', building.name, building.name, building.direction)
      if (showBuildingOutline) {
        const size = foundations[building.name] ?? { w: 1, h: 1 }
        drawBuildingOutline(wctx, building.rx, building.ry, doc.getCell(building.rx, building.ry).height, doc.isoSize, size.w, size.h, scale)
      }
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.drawImage(world, bufX * scale + panX, bufY * scale + panY, bufW * scale, bufH * scale)
  }, [artRevision, doc, foundations, hideView, marbleMadness, panX, panY, scale, selected, selectionRect, showBuildingOutline, theaterArt])

  React.useEffect(() => {
    draw()
  }, [draw])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  const clearLongPress = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

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
      pinchRef.current = { distance, scale }
      paintingRef.current = false
      clearLongPress()
      return
    }
    const world = worldFromClient(canvas, event.clientX, event.clientY, panX, panY, scale)
    const cell = pickCell(doc, world.x, world.y)
    if (tool === 'pan' || event.button === 1 || event.button === 2) return
    longPressRef.current = window.setTimeout(() => {
      if (!cell) return
      onPick({ rx: cell.rx, ry: cell.ry, clientX: event.clientX, clientY: event.clientY, longPress: true })
    }, 480)
    if (tool !== 'select' && cell) {
      paintingRef.current = true
      lastPaintRef.current = `${cell.rx},${cell.ry}`
      onStrokeStart?.()
      onPaint(cell.rx, cell.ry)
    } else if (cell) {
      onPick({ rx: cell.rx, ry: cell.ry, clientX: event.clientX, clientY: event.clientY, longPress: false })
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prev = pointersRef.current.get(event.pointerId)
    pointersRef.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY })
    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchRef.current && pinchRef.current.distance > 0) {
        const nextScale = Math.min(4, Math.max(0.25, pinchRef.current.scale * (distance / pinchRef.current.distance)))
        onScaleChange(nextScale)
      }
      if (prev) {
        onPanChange(panX + (event.clientX - prev.x), panY + (event.clientY - prev.y))
      }
      return
    }
    if (tool === 'pan' || event.buttons === 2 || event.buttons === 4) {
      if (prev) onPanChange(panX + (event.clientX - prev.x), panY + (event.clientY - prev.y))
      return
    }
    if (Math.hypot((prev?.x ?? event.clientX) - event.clientX, (prev?.y ?? event.clientY) - event.clientY) > 8) {
      clearLongPress()
    }
    if (!paintingRef.current) return
    const world = worldFromClient(canvas, event.clientX, event.clientY, panX, panY, scale)
    const cell = pickCell(doc, world.x, world.y)
    if (!cell) return
    const key = `${cell.rx},${cell.ry}`
    if (lastPaintRef.current === key) return
    lastPaintRef.current = key
    onPaint(cell.rx, cell.ry)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    clearLongPress()
    if (paintingRef.current && pointersRef.current.size === 0) {
      paintingRef.current = false
      lastPaintRef.current = null
      onStrokeEnd?.()
    }
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const next = event.deltaY < 0 ? scale * 1.1 : scale / 1.1
    onScaleChange(Math.min(4, Math.max(0.25, next)))
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
      onContextMenu={(event) => event.preventDefault()}
      onWheel={handleWheel}
    />
  )
}

export default MapViewport
