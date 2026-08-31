import React, { useEffect, useRef } from 'react'
import { projectCell, unprojectCell } from '../../data/map/isoCoords'
import { MapDocument } from '../../data/map/MapDocument'

type MapMiniMapProps = {
  document: MapDocument
  revision: number
  panX: number
  panY: number
  scale: number
  viewWidth: number
  viewHeight: number
  onPanChange: (panX: number, panY: number) => void
}

const MapMiniMap: React.FC<MapMiniMapProps> = ({
  document: doc,
  revision,
  panX,
  panY,
  scale,
  viewWidth,
  viewHeight,
  onPanChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = canvas.width
    const height = canvas.height
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, width, height)
    const rgb = doc.previewRgb
    const pw = doc.previewWidth
    const ph = doc.previewHeight
    if (rgb && pw > 0 && ph > 0) {
      const image = ctx.createImageData(pw, ph)
      for (let i = 0, p = 0; i < pw * ph; i++) {
        image.data[p++] = rgb[i * 3] ?? 0
        image.data[p++] = rgb[i * 3 + 1] ?? 0
        image.data[p++] = rgb[i * 3 + 2] ?? 0
        image.data[p++] = 255
      }
      const off = document.createElement('canvas')
      off.width = pw
      off.height = ph
      off.getContext('2d')?.putImageData(image, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(off, 0, 0, width, height)
    }

    const worldLeft = -panX / scale
    const worldTop = -panY / scale
    const worldRight = (viewWidth - panX) / scale
    const worldBottom = (viewHeight - panY) / scale
    const corners = [
      unprojectCell(worldLeft, worldTop, 0, doc.isoSize),
      unprojectCell(worldRight, worldTop, 0, doc.isoSize),
      unprojectCell(worldRight, worldBottom, 0, doc.isoSize),
      unprojectCell(worldLeft, worldBottom, 0, doc.isoSize),
    ]
    const rxs = corners.map((item) => item.rx)
    const rys = corners.map((item) => item.ry)
    const toX = (rx: number) => ((rx - 1) / Math.max(1, doc.width)) * width
    const toY = (ry: number) => ((ry - 1) / Math.max(1, doc.height)) * height
    const x = toX(Math.min(...rxs))
    const y = toY(Math.min(...rys))
    const w = toX(Math.max(...rxs)) - x
    const h = toY(Math.max(...rys)) - y
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, Math.max(8, w), Math.max(8, h))
  }, [doc, panX, panY, revision, scale, viewHeight, viewWidth])

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    const rx = 1 + x * doc.width
    const ry = 1 + y * doc.height
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
