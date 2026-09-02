import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from '../../i18n/LocaleContext'
import type { TheaterArt, TilePixels } from '../../data/map/TheaterArt'
import type { TheaterTileSetInfo } from '../../data/map/theaterIndex'
import { listFa2TileSetThumbs } from '../../data/map/fa2Bridge'

type TileSetPreviewBarProps = {
  theaterArt?: TheaterArt | null
  artRevision: number
  tileNum: number
  overlayId: number
  overlayNames: string[]
  onTileNum: (tileNum: number) => void
  onOverlayId: (overlayId: number) => void
  selectedSetIndex: number
  onSelectedSetIndex: (index: number) => void
}

const PREVIEW_HEIGHT_KEY = 'ra2web.mapEditor.tilePreviewHeight'
export const TILE_PREVIEW_DEFAULT_HEIGHT = 240
export const TILE_PREVIEW_MIN_HEIGHT = 140
export const TILE_PREVIEW_MAX_HEIGHT = 480

export function clampTilePreviewHeight(value: number): number {
  if (!Number.isFinite(value)) return TILE_PREVIEW_DEFAULT_HEIGHT
  return Math.min(TILE_PREVIEW_MAX_HEIGHT, Math.max(TILE_PREVIEW_MIN_HEIGHT, Math.round(value)))
}

function readStoredPreviewHeight(): number {
  try {
    const raw = globalThis.sessionStorage?.getItem(PREVIEW_HEIGHT_KEY)
    if (raw == null || raw === '') return TILE_PREVIEW_DEFAULT_HEIGHT
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return TILE_PREVIEW_DEFAULT_HEIGHT
    return clampTilePreviewHeight(parsed)
  } catch {
    return TILE_PREVIEW_DEFAULT_HEIGHT
  }
}

function persistPreviewHeight(value: number): void {
  try {
    globalThis.sessionStorage?.setItem(PREVIEW_HEIGHT_KEY, String(clampTilePreviewHeight(value)))
  } catch {
    /* ignore quota / private mode */
  }
}

function drawPixels(canvas: HTMLCanvasElement, pixels: TilePixels) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = pixels.width
  canvas.height = pixels.height
  const image = ctx.createImageData(pixels.width, pixels.height)
  image.data.set(pixels.rgba)
  ctx.putImageData(image, 0, 0)
}

const TileThumb: React.FC<{
  art: TheaterArt
  tileNum: number
  tileInSet: number
  setName: string
  selected: boolean
  artRevision: number
  onClick: () => void
}> = ({ art, tileNum, tileInSet, setName, selected, artRevision, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    art.requestTilePreview(tileNum)
    const pixels = art.peekTilePreview(tileNum)
    const canvas = canvasRef.current
    if (canvas && pixels) drawPixels(canvas, pixels)
  }, [art, artRevision, tileNum])
  const label = `${setName} #${tileInSet}`
  return (
    <button
      type="button"
      className={`flex h-20 min-w-[5rem] flex-shrink-0 items-center justify-center overflow-hidden rounded border px-1 ${selected ? 'border-blue-400 bg-blue-950' : 'border-gray-600 bg-black/50'}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      data-tile-num={tileNum}
    >
      <canvas ref={canvasRef} className="max-h-full max-w-full" />
    </button>
  )
}

const TileSetPreviewBar: React.FC<TileSetPreviewBarProps> = ({
  theaterArt,
  artRevision,
  tileNum,
  overlayId,
  overlayNames,
  onTileNum,
  onOverlayId,
  selectedSetIndex,
  onSelectedSetIndex,
}) => {
  const { t } = useLocale()
  const [height, setHeight] = useState(readStoredPreviewHeight)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const sets: TheaterTileSetInfo[] = theaterArt?.index?.sets ?? []
  const selectedSet = sets.find((set) => set.setIndex === selectedSetIndex)
    ?? sets.find((set) => tileNum >= set.startTileNum && tileNum < set.startTileNum + set.tilesInSet)
    ?? sets[0]
  const thumbs = selectedSet
    ? listFa2TileSetThumbs(
      selectedSet.tilesInSet,
      selectedSet.startTileNum,
      selectedSet.setIndex,
      theaterArt?.theater,
      theaterArt?.index?.general.BridgeSet ?? -1,
    )
    : []

  useEffect(() => {
    if (!dragging) return undefined
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setHeight(clampTilePreviewHeight(drag.startHeight + (drag.startY - event.clientY)))
    }
    const onUp = (event: MouseEvent) => {
      const drag = dragRef.current
      dragRef.current = null
      setDragging(false)
      if (!drag) return
      const next = clampTilePreviewHeight(drag.startHeight + (drag.startY - event.clientY))
      setHeight(next)
      persistPreviewHeight(next)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging])

  const onResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    dragRef.current = { startY: event.clientY, startHeight: height }
    setDragging(true)
  }, [height])

  return (
    <div
      className={`flex min-h-0 flex-shrink-0 flex-col border-t border-gray-700 bg-gray-900 ${dragging ? 'select-none' : ''}`}
      data-testid="map-tileset-preview"
      data-dragging={dragging ? '1' : '0'}
      style={{ height }}
    >
      <button
        type="button"
        className="flex h-2 w-full flex-shrink-0 cursor-ns-resize items-center justify-center border-b border-gray-800 bg-gray-800 hover:bg-gray-700"
        data-testid="map-tileset-resize"
        aria-label={t('mapEditor.tileBrowserResize')}
        title={t('mapEditor.tileBrowserResize')}
        onPointerDown={onResizePointerDown}
        onMouseDown={onResizePointerDown}
      >
        <span className="h-0.5 w-10 rounded bg-gray-500" aria-hidden />
      </button>
      <div className="mb-1 flex flex-shrink-0 flex-wrap items-center gap-2 px-2 pt-1 text-[11px] text-gray-400">
        <span className="font-medium text-gray-300">{t('mapEditor.tileBrowser')}</span>
        <label className="flex items-center gap-1">
          {t('mapEditor.terrainGround')}
          <select
            className="max-w-[16rem] rounded bg-gray-800 px-1 py-0.5 text-gray-100"
            data-testid="map-tileset-browser"
            value={selectedSet?.setIndex ?? 0}
            onChange={(event) => {
              const index = Number(event.target.value)
              onSelectedSetIndex(index)
              const set = sets.find((item) => item.setIndex === index)
              if (set) onTileNum(set.startTileNum)
            }}
          >
            {sets.map((set) => (
              <option key={set.setIndex} value={set.setIndex}>{set.setIndex} {set.setName}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          {t('mapEditor.overlaySpecial')}
          <select
            className="max-w-[16rem] rounded bg-gray-800 px-1 py-0.5 text-gray-100"
            data-testid="map-overlay-browser"
            value={overlayId}
            onChange={(event) => onOverlayId(Number(event.target.value))}
          >
            {overlayNames.length === 0 && <option value={overlayId}>{overlayId}</option>}
            {overlayNames.map((name, index) => (
              <option key={`${index}-${name}`} value={index}>{index} {name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" data-testid="map-tile-thumbs">
        <div className="flex flex-wrap gap-1">
          {theaterArt && thumbs.map((num) => (
            <TileThumb
              key={num}
              art={theaterArt}
              tileNum={num}
              tileInSet={num - (selectedSet?.startTileNum ?? 0)}
              setName={selectedSet?.setName ?? ''}
              selected={num === tileNum}
              artRevision={artRevision}
              onClick={() => onTileNum(num)}
            />
          ))}
          {!theaterArt && <p className="px-2 py-2 text-[11px] text-gray-500">{t('mapEditor.theaterMissing')}</p>}
        </div>
      </div>
    </div>
  )
}

export default TileSetPreviewBar
