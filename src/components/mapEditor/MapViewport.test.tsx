import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapDocument } from '../../data/map/MapDocument'
import { projectCell } from '../../data/map/isoCoords'
import { renderWithProviders } from '../../test/render'
import { installCanvasStubs } from '../../test/mocks/canvasStub'
import MapViewport from './MapViewport'

installCanvasStubs()

function stubCanvas(canvas: HTMLCanvasElement) {
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 2000, height: 2000, top: 0, left: 0, right: 2000, bottom: 2000, toJSON() {},
  })
}

function dispatchPointer(
  canvas: HTMLCanvasElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: { pointerId: number; clientX: number; clientY: number; button?: number; buttons?: number },
) {
  const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
  const event = new Ctor(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: init.button ?? 0,
    buttons: init.buttons ?? (type === 'pointerup' ? 0 : 1),
    pointerId: init.pointerId,
    pointerType: 'touch',
  } as PointerEventInit)
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId })
  canvas.dispatchEvent(event)
}

describe('MapViewport touch', () => {
  it('paints on pointer down and reports long-press pick', () => {
    vi.useFakeTimers()
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onPaint = vi.fn()
    const onPick = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="raise"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={onPaint}
          onPick={onPick}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const origin = projectCell(12, 12, 0, doc.isoSize)
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: origin.px, clientY: origin.py + 15 })
    expect(onPaint).toHaveBeenCalledWith(12, 12)
    vi.advanceTimersByTime(500)
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ rx: 12, ry: 12, longPress: true }))
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: origin.px, clientY: origin.py + 15, buttons: 0 })
    vi.useRealTimers()
  })

  it('pinches with two pointers to change scale', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onScaleChange = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="raise"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={onScaleChange}
          onPaint={vi.fn()}
          onPick={vi.fn()}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
    dispatchPointer(canvas, 'pointerdown', { pointerId: 2, clientX: 140, clientY: 100 })
    dispatchPointer(canvas, 'pointermove', { pointerId: 2, clientX: 180, clientY: 100, buttons: 1 })
    expect(onScaleChange).toHaveBeenCalled()
    const next = onScaleChange.mock.calls.at(-1)?.[0] as number
    expect(next).toBeGreaterThan(1)
  })
})
