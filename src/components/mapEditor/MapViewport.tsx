import React, { useRef } from 'react'
import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH, EMPTY_OVERLAY } from '../../data/map/constants'
import { forEachIsoCell, hitTestDiamond, projectCell } from '../../data/map/isoCoords'
import { MapDocument } from '../../data/map/MapDocument'
import { walkTubeCells } from '../../data/map/fa2Tube'
import type { MapEditorTool } from '../../data/map/mapTools'
import type { TheaterArt, TilePixels } from '../../data/map/TheaterArt'

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
  theaterArt?: TheaterArt | null
  artRevision?: number
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

const MapViewport: React.FC<MapViewportProps> = ({
  document: doc,
  tool,
  panX,
  panY,
  scale,
  selected,
  selectionRect,
  marbleMadness = false,
  theaterArt,
  artRevision = 0,
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

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(scale, scale)
    ctx.imageSmoothingEnabled = false

    forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
      const cell = doc.getCell(rx, ry)
      const tileNum = marbleMadness && theaterArt ? theaterArt.marbleTile(cell.tileNum) : cell.tileNum
      const origin = projectCell(rx, ry, cell.height, doc.isoSize)
      const overlay = doc.getOverlay(rx, ry)
      const key = `${tileNum}:${cell.subTile}`
      const pixels = theaterArt?.peek(tileNum, cell.subTile)
      if (pixels === undefined) theaterArt?.request(tileNum, cell.subTile)
      if (pixels) {
        const sprite = tileCanvas(tileCacheRef.current, key, pixels)
        ctx.drawImage(sprite, origin.px - pixels.width / 2, origin.py)
      } else {
        const shade = 50 + cell.height * 12
        let fill = `rgb(${shade},${shade + 18},${shade - 8})`
        if (overlay.id !== EMPTY_OVERLAY) {
          fill = overlay.id >= 102 && overlay.id <= 166 ? '#d4a017' : '#64748b'
        }
        ctx.beginPath()
        ctx.moveTo(origin.px, origin.py)
        ctx.lineTo(origin.px + RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
        ctx.lineTo(origin.px, origin.py + RA2_ISO_TILE_HEIGHT)
        ctx.lineTo(origin.px - RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
        ctx.closePath()
        ctx.fillStyle = fill
        ctx.fill()
      }
      if (overlay.id !== EMPTY_OVERLAY) {
        const ovl = theaterArt?.peekOverlay(overlay.id, overlay.value)
        if (ovl === undefined) theaterArt?.requestOverlay(overlay.id, overlay.value)
        if (ovl) {
          const sprite = tileCanvas(tileCacheRef.current, `ovl:${overlay.id}:${overlay.value}`, ovl)
          ctx.drawImage(sprite, origin.px - ovl.width / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2 - ovl.height)
        } else if (pixels) {
          ctx.fillStyle = overlay.id >= 102 && overlay.id <= 166 ? 'rgba(212,160,23,0.45)' : 'rgba(100,116,139,0.45)'
          ctx.beginPath()
          ctx.moveTo(origin.px, origin.py)
          ctx.lineTo(origin.px + RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
          ctx.lineTo(origin.px, origin.py + RA2_ISO_TILE_HEIGHT)
          ctx.lineTo(origin.px - RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
          ctx.closePath()
          ctx.fill()
        }
      }
      if (selected && selected.rx === rx && selected.ry === ry) {
        ctx.beginPath()
        ctx.moveTo(origin.px, origin.py)
        ctx.lineTo(origin.px + RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
        ctx.lineTo(origin.px, origin.py + RA2_ISO_TILE_HEIGHT)
        ctx.lineTo(origin.px - RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
        ctx.closePath()
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 2 / scale
        ctx.stroke()
      }
      if (
        selectionRect
        && rx >= selectionRect.minRx && rx <= selectionRect.maxRx
        && ry >= selectionRect.minRy && ry <= selectionRect.maxRy
      ) {
        ctx.beginPath()
        ctx.moveTo(origin.px, origin.py)
        ctx.lineTo(origin.px + RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
        ctx.lineTo(origin.px, origin.py + RA2_ISO_TILE_HEIGHT)
        ctx.lineTo(origin.px - RA2_ISO_TILE_WIDTH / 2, origin.py + RA2_ISO_TILE_HEIGHT / 2)
        ctx.closePath()
        ctx.strokeStyle = 'rgba(250,204,21,0.85)'
        ctx.lineWidth = 1.5 / scale
        ctx.stroke()
      }
    })

    const mark = (rx: number, ry: number, color: string, label?: string, objectName?: string) => {
      const cell = doc.getCell(rx, ry)
      const origin = projectCell(rx, ry, cell.height, doc.isoSize)
      if (objectName) {
        const sprite = theaterArt?.peekObject(objectName)
        if (sprite === undefined) theaterArt?.requestObject(objectName)
        if (sprite) {
          const canvasSprite = tileCanvas(tileCacheRef.current, `obj:${objectName}`, sprite)
          ctx.drawImage(canvasSprite, origin.px - sprite.width / 2, origin.py + 16 - sprite.height)
          return
        }
      }
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(origin.px, origin.py + 10, 5, 0, Math.PI * 2)
      ctx.fill()
      if (label) {
        ctx.fillStyle = '#f8fafc'
        ctx.font = `${12 / scale}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(label, origin.px, origin.py + 4)
      }
    }

    for (const unit of doc.units) mark(unit.rx, unit.ry, '#60a5fa', unit.name, unit.name)
    for (const inf of doc.infantry) mark(inf.rx, inf.ry, '#34d399', inf.name, inf.name)
    for (const air of doc.aircraft) mark(air.rx, air.ry, '#c084fc', air.name, air.name)
    for (const building of doc.structures) mark(building.rx, building.ry, '#fb7185', building.name, building.name)
    for (const terrain of doc.terrains) mark(terrain.rx, terrain.ry, '#4ade80', terrain.name, terrain.name)
    for (const smudge of doc.smudges) mark(smudge.rx, smudge.ry, '#a8a29e')
    for (const waypoint of doc.waypoints) {
      mark(waypoint.rx, waypoint.ry, '#facc15', String(waypoint.number))
    }
    for (const node of doc.houses.flatMap((house) => house.nodes.map((item) => ({ ...item, house: house.name })))) {
      mark(node.rx, node.ry, '#f97316', node.type)
    }
    for (const tube of doc.tubes) {
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2 / scale
      const cells = walkTubeCells(tube)
      if (cells.length === 0) continue
      ctx.beginPath()
      cells.forEach((cell, index) => {
        const point = projectCell(cell.x, cell.y, doc.getCell(cell.x, cell.y).height, doc.isoSize)
        if (index === 0) ctx.moveTo(point.px, point.py)
        else ctx.lineTo(point.px, point.py)
      })
      ctx.stroke()
    }

    ctx.restore()
  }, [artRevision, doc, marbleMadness, panX, panY, scale, selected, selectionRect, theaterArt])

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
    canvas.setPointerCapture(event.pointerId)
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
