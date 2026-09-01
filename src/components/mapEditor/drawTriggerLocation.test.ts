import { describe, expect, it } from 'vitest'
import { ISO_GROUND_ASPECT, drawTriggerLocation, isoGroundEllipse } from './drawTriggerLocation'

describe('drawTriggerLocation', () => {
  it('flattens a ground circle to the RA2 2:1 iso ellipse', () => {
    expect(ISO_GROUND_ASPECT).toBe(0.5)
    expect(isoGroundEllipse(100, 80, 12)).toEqual({ cx: 100, cy: 80, rx: 12, ry: 6 })
  })

  it('strokes a hollow ring and paints a stroked yellow number', () => {
    const ops: string[] = []
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      translate() {},
      scale() {},
      moveTo() {},
      quadraticCurveTo() {},
      arc() {},
      fillRect() {},
      ellipse() { ops.push('ellipse') },
      fill() { ops.push(`fill:${String(this.fillStyle)}`) },
      stroke() { ops.push(`stroke:${String(this.strokeStyle)}`) },
      fillText(text: string) { ops.push(`fillText:${text}:${String(this.fillStyle)}`) },
      strokeText(text: string) { ops.push(`strokeText:${text}:${String(this.strokeStyle)}`) },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: 'center' as CanvasTextAlign,
      textBaseline: 'middle' as CanvasTextBaseline,
      lineJoin: 'miter' as CanvasLineJoin,
      miterLimit: 10,
    }
    drawTriggerLocation(ctx as unknown as CanvasRenderingContext2D, { px: 10, py: 20 }, 7, 1)
    const ellipseAt = ops.indexOf('ellipse')
    const next = ops.slice(ellipseAt + 1).find((op) => op.startsWith('fill:') || op.startsWith('stroke:'))
    expect(next?.startsWith('stroke:')).toBe(true)
    expect(ops.some((op) => op.startsWith('fill:#4ade80'))).toBe(false)
    expect(ops).toContain('strokeText:7:#0a0a0a')
    expect(ops).toContain('fillText:7:#facc15')
    expect(ctx.font).toMatch(/900 /)
  })
})
