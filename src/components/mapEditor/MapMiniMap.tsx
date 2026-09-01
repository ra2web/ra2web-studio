import React, { useEffect, useRef } from 'react'
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

type MiniFit = {
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

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = fitRef.current
    const rect = canvas.getBoundingClientRect()
    const canvasX = ((event.clientX - rect.left) / rect.width) * canvas.width
    const canvasY = ((event.clientY - rect.top) / rect.height) * canvas.height
    let rx: number
    let ry: number
    if (fit && fit.fit > 0) {
      const isoX = (canvasX - fit.ox) / fit.fit + fit.minX
      const isoY = (canvasY - fit.oy) / fit.fit + fit.minY
      const cell = unprojectMiniMapIso(isoX, isoY, doc.isoSize)
      rx = cell.rx
      ry = cell.ry
    } else {
      rx = 1 + (canvasX / canvas.width) * doc.width
      ry = 1 + (canvasY / canvas.height) * doc.height
    }
    const origin = projectCell(Math.floor(rx), Math.floor(ry), 0, doc.isoSize)
    onPanChange(viewWidth / 2 - origin.px * scale, viewHeight / 2 - origin.py * scale)
  }

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={160}
      data-testid="map-minimap"
      className="absolute right-2 top-2 h-28 w-28 cursor-pointer rounded border border-cyan-700/80 bg-slate-950 shadow-lg sm:h-40 sm:w-40"
      onPointerDown={handlePointer}
    />
  )
}

export default MapMiniMap
