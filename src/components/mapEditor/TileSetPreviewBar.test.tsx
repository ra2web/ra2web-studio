import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TheaterArt } from '../../data/map/TheaterArt'
import { renderWithProviders } from '../../test/render'
import TileSetPreviewBar, {
  clampTilePreviewHeight,
  TILE_PREVIEW_DEFAULT_HEIGHT,
  TILE_PREVIEW_MAX_HEIGHT,
  TILE_PREVIEW_MIN_HEIGHT,
} from './TileSetPreviewBar'

const PREVIEW_HEIGHT_KEY = 'ra2web.mapEditor.tilePreviewHeight'

function bridgeArt(): TheaterArt {
  return {
    theater: 'TEMPERATE',
    index: {
      general: { BridgeSet: 80 },
      sets: [{
        setIndex: 80,
        fileName: 'BRIDGE',
        setName: 'Bridges',
        tilesInSet: 16,
        startTileNum: 800,
        marbleMadnessSet: -1,
        allowTiberium: false,
        morphable: false,
      }],
      tileCount: 16,
    },
    peekTilePreview: () => null,
    requestTilePreview: () => {},
  } as unknown as TheaterArt
}

function renderBar(onTileNum = vi.fn()) {
  return {
    onTileNum,
    ...renderWithProviders(
      <TileSetPreviewBar
        theaterArt={bridgeArt()}
        artRevision={0}
        tileNum={800}
        overlayId={102}
        overlayNames={[]}
        selectedSetIndex={80}
        onSelectedSetIndex={vi.fn()}
        onTileNum={onTileNum}
        onOverlayId={vi.fn()}
      />,
    ),
  }
}

describe('TileSetPreviewBar', () => {
  beforeEach(() => {
    sessionStorage.removeItem(PREVIEW_HEIGHT_KEY)
  })

  it('lists BridgeSet tiles except 10 and 15 and selects the second piece', () => {
    const { onTileNum } = renderBar()
    const thumbs = screen.getByTestId('map-tile-thumbs').querySelectorAll('button')
    expect(thumbs).toHaveLength(14)
    expect(screen.queryByRole('button', { name: 'Bridges #10' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bridges #15' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bridges #1' }))
    expect(onTileNum).toHaveBeenCalledWith(801)
  })

  it('starts tall enough to show tiles and can be dragged taller', () => {
    renderBar()
    const bar = screen.getByTestId('map-tileset-preview')
    expect(bar).toHaveStyle({ height: `${TILE_PREVIEW_DEFAULT_HEIGHT}px` })
    expect(clampTilePreviewHeight(TILE_PREVIEW_DEFAULT_HEIGHT + 280)).toBe(TILE_PREVIEW_MAX_HEIGHT)
    expect(clampTilePreviewHeight(0)).toBe(TILE_PREVIEW_MIN_HEIGHT)
    const handle = screen.getByTestId('map-tileset-resize')
    fireEvent.mouseDown(handle, { clientY: 400 })
    expect(bar).toHaveAttribute('data-dragging', '1')
    const move = new MouseEvent('mousemove', { bubbles: true })
    Object.defineProperty(move, 'clientY', { configurable: true, value: 120 })
    const up = new MouseEvent('mouseup', { bubbles: true })
    Object.defineProperty(up, 'clientY', { configurable: true, value: 120 })
    act(() => {
      window.dispatchEvent(move)
      window.dispatchEvent(up)
    })
    expect(bar).toHaveStyle({ height: `${TILE_PREVIEW_MAX_HEIGHT}px` })
  })
})
