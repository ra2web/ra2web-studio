import React, { useEffect, useRef } from 'react'
import { useLocale } from '../../i18n/LocaleContext'
import type { TheaterArt, TilePixels } from '../../data/map/TheaterArt'
import type { TheaterTileSetInfo } from '../../data/map/theaterIndex'

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
  selected: boolean
  artRevision: number
  onClick: () => void
}> = ({ art, tileNum, selected, artRevision, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    art.request(tileNum, 0)
    const pixels = art.peek(tileNum, 0)
    const canvas = canvasRef.current
    if (canvas && pixels) drawPixels(canvas, pixels)
  }, [art, artRevision, tileNum])
  return (
    <button
      type="button"
      className={`flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded border ${selected ? 'border-blue-400 bg-blue-950' : 'border-gray-700 bg-black/40'}`}
      onClick={onClick}
      title={String(tileNum)}
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
  const sets: TheaterTileSetInfo[] = theaterArt?.index?.sets ?? []
  const selectedSet = sets.find((set) => set.setIndex === selectedSetIndex)
    ?? sets.find((set) => tileNum >= set.startTileNum && tileNum < set.startTileNum + set.tilesInSet)
    ?? sets[0]
  const thumbs = selectedSet
    ? Array.from({ length: Math.min(selectedSet.tilesInSet, 48) }, (_, index) => selectedSet.startTileNum + index)
    : []

  return (
    <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-2 py-1" data-testid="map-tileset-preview">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
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
      <div className="flex gap-1 overflow-x-auto pb-1" data-testid="map-tile-thumbs">
        {theaterArt && thumbs.map((num) => (
          <TileThumb
            key={num}
            art={theaterArt}
            tileNum={num}
            selected={num === tileNum}
            artRevision={artRevision}
            onClick={() => onTileNum(num)}
          />
        ))}
        {!theaterArt && <p className="px-2 py-2 text-[11px] text-gray-500">{t('mapEditor.theaterMissing')}</p>}
      </div>
    </div>
  )
}

export default TileSetPreviewBar
