import React, { useCallback, useEffect, useRef } from 'react'
import { forEachIsoCell, projectCell, unprojectCell } from '../../data/map/isoCoords'
import { miniMapIso, unprojectMiniMapIso } from '../../data/map/isoDraw'
import { cellMiniMapColor, rgbCss } from '../../data/map/miniMapColor'
import { MapDocument } from '../../data/map/MapDocument'
import type { TheaterArt } from '../../data/map/TheaterArt'

type MapMiniMapProps = {
  document: MapDocument
  revision: number
  panX: number
  panY: number
  scale: number
  viewWidth: number
  viewHeight: number
  theaterArt?: TheaterArt | null
  artRevision?: number
  onPanChange: (panX: number, panY: number) => void
}

export type MiniFit = {
  minX: number
  minY: number
  fit: number
  ox: number
  oy: number
}

function computeFit(doc: MapDocument, width: number, height: number): MiniFit | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
    const point = miniMapIso(rx, ry, doc.isoSize)
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x + 1)
    maxY = Math.max(maxY, point.y)
  })
  if (!Number.isFinite(minX)) return null
  const pad = 4
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const fit = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)
  return {
    minX,
    minY,
    fit,
    ox: pad + (width - pad * 2 - spanX * fit) / 2,
    oy: pad + (height - pad * 2 - spanY * fit) / 2,
  }
}

function toCanvas(fit: MiniFit, x: number, y: number): { x: number; y: number } {
  return {
    x: fit.ox + (x - fit.minX) * fit.fit,
    y: fit.oy + (y - fit.minY) * fit.fit,
  }
}

/** FA2 MiniMap：指针位置对应的格作为视口中心，左键按下或拖动都会 SetScroll。 */
export function panFromMiniMapPointer(args: {
  canvasX: number
  canvasY: number
  canvasWidth: number
  canvasHeight: number
  fit: MiniFit | null
  isoSize: number
  mapWidth: number
  mapHeight: number
  viewWidth: number
  viewHeight: number
  scale: number
}): { panX: number; panY: number } {
  let rx: number
  let ry: number
  if (args.fit && args.fit.fit > 0) {
    const isoX = (args.canvasX - args.fit.ox) / args.fit.fit + args.fit.minX
    const isoY = (args.canvasY - args.fit.oy) / args.fit.fit + args.fit.minY
    const cell = unprojectMiniMapIso(isoX, isoY, args.isoSize)
    rx = cell.rx
    ry = cell.ry
  } else {
    rx = 1 + (args.canvasX / args.canvasWidth) * args.mapWidth
    ry = 1 + (args.canvasY / args.canvasHeight) * args.mapHeight
  }
  const origin = projectCell(Math.floor(rx), Math.floor(ry), 0, args.isoSize)
  return {
    panX: args.viewWidth / 2 - origin.px * args.scale,
    panY: args.viewHeight / 2 - origin.py * args.scale,
  }
}

const MapMiniMap: React.FC<MapMiniMapProps> = ({
  document: doc,
  revision,
  panX,
  panY,
  scale,
  viewWidth,
  viewHeight,
  theaterArt,
  artRevision = 0,
  onPanChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fitRef = useRef<MiniFit | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = canvas.width
    const height = canvas.height
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = false
    const fit = computeFit(doc, width, height)
    fitRef.current = fit
    if (!fit) return

    forEachIsoCell(doc.width, doc.height, ({ rx, ry }) => {
      const cell = doc.getCell(rx, ry)
      const overlay = doc.getOverlay(rx, ry)
      const radar = theaterArt?.peekRadar(cell.tileNum, cell.subTile)
      if (radar === undefined) theaterArt?.request(cell.tileNum, cell.subTile)
      const painted = cellMiniMapColor({
        overlayId: overlay.id,
        radar: radar ?? null,
        height: cell.height,
      })
      const iso = miniMapIso(rx, ry, doc.isoSize)
      const point = toCanvas(fit, iso.x, iso.y)
      const size = Math.max(1, fit.fit)
      ctx.fillStyle = rgbCss(painted.color)
      ctx.fillRect(point.x, point.y, size + 0.5, size + 0.5)
    })

    const worldLeft = -panX / scale
    const worldTop = -panY / scale
    const worldRight = (viewWidth - panX) / scale
    const worldBottom = (viewHeight - panY) / scale
    const corners = [
      unprojectCell(worldLeft, worldTop, 0, doc.isoSize),
      unprojectCell(worldRight, worldTop, 0, doc.isoSize),
      unprojectCell(worldRight, worldBottom, 0, doc.isoSize),
      unprojectCell(worldLeft, worldBottom, 0, doc.isoSize),
    ].map((cell) => {
      const iso = miniMapIso(cell.rx, cell.ry, doc.isoSize)
      return toCanvas(fit, iso.x, iso.y)
    })
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1
    ctx.beginPath()
    corners.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.stroke()
  }, [artRevision, doc, panX, panY, revision, scale, theaterArt, viewHeight, viewWidth])

  const jumpToPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width
    const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height
    const next = panFromMiniMapPointer({
      canvasX,
      canvasY,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      fit: fitRef.current,
      isoSize: doc.isoSize,
      mapWidth: doc.width,
      mapHeight: doc.height,
      viewWidth,
      viewHeight,
      scale,
    })
    onPanChange(next.panX, next.panY)
  }, [doc.height, doc.isoSize, doc.width, onPanChange, scale, viewHeight, viewWidth])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    draggingRef.current = true
    const canvas = canvasRef.current
    try {
      canvas?.setPointerCapture(event.pointerId)
    } catch {
      /* jsdom / non-pointer hosts */
    }
    jumpToPointer(event)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current && event.buttons !== 1) return
    draggingRef.current = true
    jumpToPointer(event)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    const canvas = canvasRef.current
    try {
      canvas?.releasePointerCapture(event.pointerId)
    } catch {
      /* jsdom / non-pointer hosts */
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={160}
      data-testid="map-minimap"
      className="absolute right-2 top-2 h-28 w-28 touch-none cursor-grab rounded border border-cyan-700/80 bg-slate-950 shadow-lg active:cursor-grabbing sm:h-40 sm:w-40"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  )
}

export default MapMiniMap
