import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapDocument } from '../../data/map/MapDocument'
import { renderWithProviders } from '../../test/render'
import { installCanvasStubs } from '../../test/mocks/canvasStub'
import MapMiniMap from './MapMiniMap'

installCanvasStubs()

function stubCanvas(canvas: HTMLCanvasElement) {
  canvas.setPointerCapture = () => {}
  canvas.releasePointerCapture = () => {}
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, width: 160, height: 160, top: 0, left: 0, right: 160, bottom: 160, toJSON() {},
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
    pointerType: 'mouse',
  } as PointerEventInit)
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId })
  canvas.dispatchEvent(event)
}

function renderMiniMap(onPanChange = vi.fn()) {
  const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
  renderWithProviders(
    <MapMiniMap
      document={doc}
      revision={1}
      panX={80}
      panY={40}
      scale={0.45}
      viewWidth={800}
      viewHeight={600}
      onPanChange={onPanChange}
    />,
  )
  const canvas = screen.getByTestId('map-minimap') as HTMLCanvasElement
  stubCanvas(canvas)
  return { canvas, onPanChange }
}

describe('MapMiniMap', () => {
  it('recenters the viewport on click like FA2 LButtonDown', () => {
    const { canvas, onPanChange } = renderMiniMap()
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: 40, clientY: 40 })
    expect(onPanChange).toHaveBeenCalledTimes(1)
    const first = onPanChange.mock.calls[0]
    expect(first[0]).not.toBe(80)
    expect(first[1]).not.toBe(40)
  })

  it('keeps recentering while dragging with the left button held', () => {
    const { canvas, onPanChange } = renderMiniMap()
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: 40, clientY: 40 })
    dispatchPointer(canvas, 'pointermove', { pointerId: 1, clientX: 110, clientY: 120, buttons: 1 })
    expect(onPanChange).toHaveBeenCalledTimes(2)
    const [first, second] = onPanChange.mock.calls
    expect(second).not.toEqual(first)
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: 110, clientY: 120, buttons: 0 })
    dispatchPointer(canvas, 'pointermove', { pointerId: 1, clientX: 20, clientY: 20, buttons: 0 })
    expect(onPanChange).toHaveBeenCalledTimes(2)
  })
})
