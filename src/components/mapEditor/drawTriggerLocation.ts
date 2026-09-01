import { RA2_ISO_TILE_HEIGHT, RA2_ISO_TILE_WIDTH } from '../../data/map/constants'

/** RA2 isometric ground: a circle on the tile plane is a 2:1 screen ellipse. */
export const ISO_GROUND_ASPECT = RA2_ISO_TILE_HEIGHT / RA2_ISO_TILE_WIDTH

export type ScreenOrigin = { px: number; py: number }

export function isoGroundEllipse(cx: number, cy: number, radius: number): {
  cx: number
  cy: number
  rx: number
  ry: number
} {
  return { cx, cy, rx: radius, ry: radius * ISO_GROUND_ASPECT }
}

function worldScale(scale: number): number {
  return 1 / Math.max(scale, 0.2)
}

/** Upright pennant (screen-vertical), planted on the ground pad — not an emoji. */
function drawStandingFlag(ctx: CanvasRenderingContext2D, x: number, y: number, inv: number): void {
  const poleH = 18 * inv
  const poleW = Math.max(1.25, 1.7 * inv)
  const topY = y - poleH
  ctx.fillStyle = '#292524'
  ctx.fillRect(x - poleW / 2, topY, poleW, poleH)

  ctx.beginPath()
  ctx.arc(x, topY, poleW * 1.05, 0, Math.PI * 2)
  ctx.fillStyle = '#eab308'
  ctx.fill()

  const fly = 12 * inv
  const drop = 8.5 * inv
  const hoist = x + poleW / 2
  ctx.beginPath()
  ctx.moveTo(hoist, topY + 1.2 * inv)
  ctx.quadraticCurveTo(hoist + fly * 0.62, topY + drop * 0.12, hoist + fly, topY + drop * 0.36)
  ctx.quadraticCurveTo(hoist + fly * 0.58, topY + drop * 0.58, hoist, topY + drop)
  ctx.closePath()
  ctx.fillStyle = '#ef4444'
  ctx.fill()
  ctx.strokeStyle = '#7f1d1d'
  ctx.lineWidth = Math.max(0.7, 0.85 * inv)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(hoist, topY + 2.2 * inv)
  ctx.quadraticCurveTo(hoist + fly * 0.42, topY + drop * 0.28, hoist + fly * 0.72, topY + drop * 0.36)
  ctx.strokeStyle = 'rgba(254, 202, 202, 0.55)'
  ctx.lineWidth = Math.max(0.6, 0.7 * inv)
  ctx.stroke()
}

function drawIsoNumber(ctx: CanvasRenderingContext2D, text: string, inv: number): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${20 * inv}px sans-serif`
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.lineWidth = Math.max(3.2, 5.2 * inv)
  ctx.strokeStyle = '#0a0a0a'
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = '#facc15'
  ctx.fillText(text, 0, 0)
}

/**
 * Trigger location: hollow iso-ground ring, yellow number decal, upright custom flag.
 * The ring/number lie on the tile plane; the flag is screen-vertical.
 */
export function drawTriggerLocation(
  ctx: CanvasRenderingContext2D,
  origin: ScreenOrigin,
  number: number,
  scale: number,
): void {
  const inv = worldScale(scale)
  const radius = 14 * inv
  const cx = origin.px
  const cy = origin.py + RA2_ISO_TILE_HEIGHT / 2
  const { rx, ry } = isoGroundEllipse(cx, cy, radius)

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.strokeStyle = '#052e16'
  ctx.lineWidth = Math.max(2.4, 3.4 * inv)
  ctx.stroke()
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = Math.max(1.2, 1.8 * inv)
  ctx.stroke()

  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ISO_GROUND_ASPECT)
  drawIsoNumber(ctx, String(number), inv)
  ctx.restore()

  drawStandingFlag(ctx, cx, cy - ry * 0.2, inv)
  ctx.restore()
}
