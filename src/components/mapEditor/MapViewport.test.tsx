import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapDocument } from '../../data/map/MapDocument'
import { projectCell } from '../../data/map/isoCoords'
import { parseTheaterIni } from '../../data/map/theaterIndex'
import { worldFromCanvasClient } from '../../data/map/viewportZoom'
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
  it('paints on pointer down without a long-press pick', () => {
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
    expect(onPaint).toHaveBeenCalledWith(12, 12, expect.objectContaining({ subCell: expect.any(Number) }))
    vi.advanceTimersByTime(500)
    expect(onPick).not.toHaveBeenCalled()
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: origin.px, clientY: origin.py + 15, buttons: 0 })
    vi.useRealTimers()
  })

  it('picks a cell with the select tool so object properties can open', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onPaint = vi.fn()
    const onPick = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="select"
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
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({
      rx: 12,
      ry: 12,
      longPress: false,
      subCell: expect.any(Number),
    }))
    expect(onPaint).not.toHaveBeenCalled()
  })

  it('picks infantry subtiles inside the same cell', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onPick = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="select"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={vi.fn()}
          onPick={onPick}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const origin = projectCell(12, 12, 0, doc.isoSize)
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: origin.px, clientY: origin.py + 2 })
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ rx: 12, ry: 12, subCell: 0 }))
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: origin.px, clientY: origin.py + 2, buttons: 0 })
    dispatchPointer(canvas, 'pointerdown', { pointerId: 2, clientX: origin.px + 15, clientY: origin.py + 15 })
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ rx: 12, ry: 12, subCell: 2 }))
    dispatchPointer(canvas, 'pointerup', { pointerId: 2, clientX: origin.px + 15, clientY: origin.py + 15, buttons: 0 })
    dispatchPointer(canvas, 'pointerdown', { pointerId: 3, clientX: origin.px - 15, clientY: origin.py + 15 })
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ rx: 12, ry: 12, subCell: 3 }))
  })

  it('reports a double-click pick for expanding object properties', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onPick = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="select"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={vi.fn()}
          onPick={onPick}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const origin = projectCell(12, 12, 0, doc.isoSize)
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: origin.px, clientY: origin.py + 15 })
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: origin.px, clientY: origin.py + 15, buttons: 0 })
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: origin.px, clientY: origin.py + 15 })
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ rx: 12, ry: 12, doubleClick: true }))
  })

  it('drags a unit in select mode to a new cell', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    doc.units.push({
      id: 'u1',
      owner: 'Americans',
      name: 'MTNK',
      health: 256,
      rx: 12,
      ry: 12,
      direction: 64,
      mission: 'Guard',
      tag: 'none',
      veterancy: 0,
      group: -1,
      onBridge: false,
      recruitable: false,
      aiRecruitable: false,
      extra: [],
    })
    const onMoveObject = vi.fn()
    const onPaint = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="select"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={onPaint}
          onPick={vi.fn()}
          onMoveObject={onMoveObject}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const from = projectCell(12, 12, 0, doc.isoSize)
    const to = projectCell(13, 12, 0, doc.isoSize)
    act(() => {
      dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: from.px, clientY: from.py + 15 })
      dispatchPointer(canvas, 'pointermove', { pointerId: 1, clientX: to.px, clientY: to.py + 15 })
      dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: to.px, clientY: to.py + 15, buttons: 0 })
    })
    expect(onMoveObject).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'unit',
      id: 'u1',
      rx: 12,
      ry: 12,
      toRx: 13,
      toRy: 12,
      copy: false,
    }))
    expect(onPaint).not.toHaveBeenCalled()
  })

  it('drags a start waypoint in select mode', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const start = doc.waypoints.find((item) => item.number === 0)
    if (!start) throw new Error('expected start waypoint')
    const onMoveObject = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="select"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={vi.fn()}
          onPick={vi.fn()}
          onMoveObject={onMoveObject}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const from = projectCell(start.rx, start.ry, 0, doc.isoSize)
    const to = projectCell(12, 12, 0, doc.isoSize)
    act(() => {
      dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: from.px, clientY: from.py + 15 })
      dispatchPointer(canvas, 'pointermove', { pointerId: 1, clientX: to.px, clientY: to.py + 15 })
      dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: to.px, clientY: to.py + 15, buttons: 0 })
    })
    expect(onMoveObject).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'waypoint',
      id: '0',
      toRx: 12,
      toRy: 12,
    }))
  })

  it('pinches with two pointers around the finger midpoint', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onScaleChange = vi.fn()
    const onPanChange = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="raise"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={onPanChange}
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
    const startMid = { x: 120, y: 100 }
    const before = worldFromCanvasClient(startMid.x, startMid.y, 0, 0, 1)
    dispatchPointer(canvas, 'pointermove', { pointerId: 2, clientX: 180, clientY: 100, buttons: 1 })
    expect(onScaleChange).toHaveBeenCalled()
    expect(onPanChange).toHaveBeenCalled()
    const nextScale = onScaleChange.mock.calls.at(-1)?.[0] as number
    const [nextPanX, nextPanY] = onPanChange.mock.calls.at(-1) as [number, number]
    expect(nextScale).toBeGreaterThan(1)
    const after = worldFromCanvasClient(140, 100, nextPanX, nextPanY, nextScale)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('zooms the wheel around the cursor instead of the top-left', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onScaleChange = vi.fn()
    const onPanChange = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="pan"
          brush={1}
          panX={80}
          panY={40}
          scale={0.45}
          onPanChange={onPanChange}
          onScaleChange={onScaleChange}
          onPaint={vi.fn()}
          onPick={vi.fn()}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const clientX = 400
    const clientY = 300
    const before = worldFromCanvasClient(clientX, clientY, 80, 40, 0.45)
    canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      deltaY: -100,
    }))
    expect(onScaleChange).toHaveBeenCalled()
    expect(onPanChange).toHaveBeenCalled()
    const nextScale = onScaleChange.mock.calls.at(-1)?.[0] as number
    const [nextPanX, nextPanY] = onPanChange.mock.calls.at(-1) as [number, number]
    expect(nextScale).toBeGreaterThan(0.45)
    expect(nextPanX).not.toBe(80)
    const after = worldFromCanvasClient(clientX, clientY, nextPanX, nextPanY, nextScale)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('draws trigger locations as an iso-ground disc with an upright flag', () => {
    const texts: string[] = []
    const ellipses: number[][] = []
    const proto = HTMLCanvasElement.prototype as { getContext: (type: string) => CanvasRenderingContext2D | null }
    const origGetContext = proto.getContext
    proto.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = origGetContext.call(this, type) as (CanvasRenderingContext2D & { __triggerSpy?: boolean }) | null
      if (ctx && !ctx.__triggerSpy) {
        ctx.__triggerSpy = true
        const origText = ctx.fillText.bind(ctx)
        ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
          texts.push(String(text))
          return origText(text, x, y, maxWidth)
        }
        const origEllipse = ctx.ellipse.bind(ctx)
        ctx.ellipse = (...args: Parameters<CanvasRenderingContext2D['ellipse']>) => {
          ellipses.push([args[2], args[3]])
          return origEllipse(...args)
        }
      }
      return ctx
    }
    try {
      const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
      renderWithProviders(
        <div style={{ width: 2000, height: 2000 }}>
          <MapViewport
            document={doc}
            tool="waypoint"
            brush={1}
            panX={0}
            panY={0}
            scale={1}
            onPanChange={vi.fn()}
            onScaleChange={vi.fn()}
            onPaint={vi.fn()}
            onPick={vi.fn()}
          />
        </div>,
      )
      expect(texts).not.toContain('🚩')
      expect(texts.some((text) => /^\d+$/.test(text))).toBe(true)
      expect(ellipses.length).toBeGreaterThan(0)
      expect(ellipses[0][1]).toBeCloseTo(ellipses[0][0] * 0.5)
    } finally {
      proto.getContext = origGetContext
    }
  })

  it('draws FA2 red valid-area and blue visible-area bounds', () => {
    const colors: string[] = []
    const proto = HTMLCanvasElement.prototype as { getContext: (type: string) => CanvasRenderingContext2D | null }
    const origGetContext = proto.getContext
    proto.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = origGetContext.call(this, type) as (CanvasRenderingContext2D & { __boundSpy?: boolean }) | null
      if (ctx && !ctx.__boundSpy) {
        ctx.__boundSpy = true
        const origStroke = ctx.strokeRect.bind(ctx)
        ctx.strokeRect = (...args: Parameters<CanvasRenderingContext2D['strokeRect']>) => {
          colors.push(String(ctx.strokeStyle))
          return origStroke(...args)
        }
      }
      return ctx
    }
    try {
      const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE', multiplayer: true })
      renderWithProviders(
        <div style={{ width: 2000, height: 2000 }}>
          <MapViewport
            document={doc}
            tool="select"
            brush={1}
            panX={0}
            panY={0}
            scale={1}
            onPanChange={vi.fn()}
            onScaleChange={vi.fn()}
            onPaint={vi.fn()}
            onPick={vi.fn()}
          />
        </div>,
      )
      expect(colors).toContain('#ff0000')
      expect(colors).toContain('#0000ff')
    } finally {
      proto.getContext = origGetContext
    }
  })

  it('reports hover cell on pointer move without painting', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onHover = vi.fn()
    const onPaint = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="tile"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={onPaint}
          onPick={vi.fn()}
          onHover={onHover}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const origin = projectCell(12, 12, 0, doc.isoSize)
    dispatchPointer(canvas, 'pointermove', { pointerId: 1, clientX: origin.px, clientY: origin.py + 15, buttons: 0 })
    expect(onHover).toHaveBeenCalledWith(expect.objectContaining({ rx: 12, ry: 12, subCell: expect.any(Number) }))
    expect(onPaint).not.toHaveBeenCalled()
  })

  it('finishes a bridge on pointer up after a drag, without painting in between', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const onPaint = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="bridge"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={onPaint}
          onPick={vi.fn()}
        />
      </div>,
    )
    const canvas = screen.getByTestId('map-viewport') as HTMLCanvasElement
    stubCanvas(canvas)
    const start = projectCell(12, 12, 0, doc.isoSize)
    const end = projectCell(14, 12, 0, doc.isoSize)
    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, clientX: start.px, clientY: start.py + 15 })
    expect(onPaint).toHaveBeenCalledTimes(1)
    expect(onPaint).toHaveBeenCalledWith(12, 12, expect.objectContaining({ subCell: expect.any(Number) }))
    dispatchPointer(canvas, 'pointermove', { pointerId: 1, clientX: end.px, clientY: end.py + 15, buttons: 1 })
    expect(onPaint).toHaveBeenCalledTimes(1)
    dispatchPointer(canvas, 'pointerup', { pointerId: 1, clientX: end.px, clientY: end.py + 15, buttons: 0 })
    expect(onPaint).toHaveBeenCalledTimes(2)
    expect(onPaint).toHaveBeenLastCalledWith(14, 12, expect.objectContaining({ subCell: expect.any(Number) }))
  })

  it('requests theater art for brush ghosts so the next stamp is visible', () => {
    const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
    const peek = vi.fn(() => undefined)
    const request = vi.fn()
    const peekOverlay = vi.fn(() => undefined)
    const requestOverlay = vi.fn()
    const peekObject = vi.fn(() => undefined)
    const requestObject = vi.fn()
    renderWithProviders(
      <div style={{ width: 2000, height: 2000 }}>
        <MapViewport
          document={doc}
          tool="tile"
          brush={1}
          panX={0}
          panY={0}
          scale={1}
          brushGhosts={[
            { kind: 'tile', rx: 12, ry: 12, tileNum: 7, subTile: 0, height: 0 },
            { kind: 'overlay', rx: 12, ry: 12, overlayId: 102, overlayValue: 0 },
            {
              kind: 'object',
              rx: 12,
              ry: 12,
              name: 'E1',
              objectKind: 'infantry',
              facing: 128,
              owner: 'Neutral',
              subCell: 0,
            },
          ]}
          theaterArt={{
            peek,
            request,
            peekOverlay,
            requestOverlay,
            peekObject,
            requestObject,
            cellVariant: () => 0,
          } as never}
          onPanChange={vi.fn()}
          onScaleChange={vi.fn()}
          onPaint={vi.fn()}
          onPick={vi.fn()}
        />
      </div>,
    )
    expect(request).toHaveBeenCalledWith(7, 0, 0)
    expect(requestOverlay).toHaveBeenCalledWith(102, 0)
    expect(requestObject).toHaveBeenCalled()
  })

  it('strokes FA2 height cursor colors on the hover cell', () => {
    const colors: string[] = []
    const proto = HTMLCanvasElement.prototype as { getContext: (type: string) => CanvasRenderingContext2D | null }
    const origGetContext = proto.getContext
    proto.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = origGetContext.call(this, type) as (CanvasRenderingContext2D & { __cursorSpy?: boolean }) | null
      if (ctx && !ctx.__cursorSpy) {
        ctx.__cursorSpy = true
        const origStroke = ctx.stroke.bind(ctx)
        ctx.stroke = (...args: Parameters<CanvasRenderingContext2D['stroke']>) => {
          colors.push(String(ctx.strokeStyle))
          return origStroke(...args)
        }
      }
      return ctx
    }
    try {
      const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
      doc.setCell({ ...doc.getCell(12, 12), height: 6 })
      renderWithProviders(
        <div style={{ width: 2000, height: 2000 }}>
          <MapViewport
            document={doc}
            tool="select"
            brush={1}
            panX={0}
            panY={0}
            scale={1}
            hover={{ rx: 12, ry: 12 }}
            onPanChange={vi.fn()}
            onScaleChange={vi.fn()}
            onPaint={vi.fn()}
            onPick={vi.fn()}
          />
        </div>,
      )
      expect(colors).toContain('#ff3232')
      expect(colors).toContain('#3c3cff')
      expect(colors).toContain('#3c3c3c')
    } finally {
      proto.getContext = origGetContext
    }
  })

  it('paints height colors in marble madness without requesting TMP tiles', () => {
    const fills: string[] = []
    const proto = HTMLCanvasElement.prototype as { getContext: (type: string) => CanvasRenderingContext2D | null }
    const origGetContext = proto.getContext
    proto.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = origGetContext.call(this, type) as (CanvasRenderingContext2D & { __frameworkSpy?: boolean }) | null
      if (ctx && !ctx.__frameworkSpy) {
        ctx.__frameworkSpy = true
        const origFill = ctx.fill.bind(ctx)
        ctx.fill = (...args: Parameters<CanvasRenderingContext2D['fill']>) => {
          fills.push(String(ctx.fillStyle))
          return origFill(...args)
        }
      }
      return ctx
    }
    try {
      const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
      doc.setCell({ ...doc.getCell(12, 12), tileNum: 0, subTile: 2, height: 6 })
      const peek = vi.fn(() => undefined)
      const request = vi.fn()
      renderWithProviders(
        <div style={{ width: 2000, height: 2000 }}>
          <MapViewport
            document={doc}
            tool="select"
            brush={1}
            panX={0}
            panY={0}
            scale={1}
            marbleMadness
            theaterArt={{
              peek,
              request,
              peekOverlay: vi.fn(() => undefined),
              requestOverlay: vi.fn(),
              peekObject: vi.fn(() => undefined),
              requestObject: vi.fn(),
              cellVariant: () => 0,
              marbleTile: (_tileNum: number, height: number) => 100 + height,
              marbleUsesHeightBase: () => true,
            } as never}
            onPanChange={vi.fn()}
            onScaleChange={vi.fn()}
            onPaint={vi.fn()}
            onPick={vi.fn()}
          />
        </div>,
      )
      expect(request).not.toHaveBeenCalled()
      expect(peek).not.toHaveBeenCalled()
      expect(fills).toContain('#ff3232')
    } finally {
      proto.getContext = origGetContext
    }
  })

  it('labels mapped cliff tiles in marble madness without requesting TMP', () => {
    const labels: string[] = []
    const proto = HTMLCanvasElement.prototype as { getContext: (type: string) => CanvasRenderingContext2D | null }
    const origGetContext = proto.getContext
    proto.getContext = function (this: HTMLCanvasElement, type: string) {
      const ctx = origGetContext.call(this, type) as (CanvasRenderingContext2D & { __labelSpy?: boolean }) | null
      if (ctx && !ctx.__labelSpy) {
        ctx.__labelSpy = true
        const origFillText = ctx.fillText.bind(ctx)
        ctx.fillText = (text: string, ...rest: [number, number, number?]) => {
          labels.push(text)
          return origFillText(text, ...rest)
        }
      }
      return ctx
    }
    try {
      const index = parseTheaterIni(`
[General]
CliffSet=1
HeightBase=2

[TileSet0000]
FileName=Clear
SetName=Clear
TilesInSet=1

[TileSet0001]
FileName=Cliff
SetName=Cliff Set
TilesInSet=20
MarbleMadness=3

[TileSet0002]
FileName=hyte
SetName=HeightBase
TilesInSet=15

[TileSet0003]
FileName=Mclif
SetName=ZMM Cliff
TilesInSet=20
`)
      const cliffStart = index.sets[1].startTileNum
      const doc = MapDocument.create({ width: 16, height: 16, theater: 'TEMPERATE' })
      doc.setCell({ ...doc.getCell(12, 12), tileNum: cliffStart + 17, subTile: 0, height: 0 })
      const request = vi.fn()
      renderWithProviders(
        <div style={{ width: 2000, height: 2000 }}>
          <MapViewport
            document={doc}
            tool="select"
            brush={1}
            panX={0}
            panY={0}
            scale={1}
            marbleMadness
            theaterArt={{
              index,
              peek: vi.fn(() => undefined),
              request,
              peekOverlay: vi.fn(() => undefined),
              requestOverlay: vi.fn(),
              peekObject: vi.fn(() => undefined),
              requestObject: vi.fn(),
              cellVariant: () => 0,
            } as never}
            onPanChange={vi.fn()}
            onScaleChange={vi.fn()}
            onPaint={vi.fn()}
            onPick={vi.fn()}
          />
        </div>,
      )
      expect(request).not.toHaveBeenCalled()
      expect(labels).toContain('C18')
    } finally {
      proto.getContext = origGetContext
    }
  })
})
