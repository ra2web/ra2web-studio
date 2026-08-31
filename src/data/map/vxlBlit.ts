/** 等距正交投影，把 VXL 体素画成编辑器用地格图标。 */

export type VoxelSample = {
  x: number
  y: number
  z: number
  colorIndex: number
}

export type VxlRgba = {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export type VxlBlitOptions = {
  /** RA2 Facing：0–255，顺时针。 */
  facing?: number
}

/** RA2 256 向 → 弧度（0 为正北，绕体素 Z）。 */
export function facingRadians(direction: number): number {
  return ((direction & 255) / 256) * Math.PI * 2
}

export function rotateXY(x: number, y: number, radians: number): { x: number; y: number } {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** 8 向量化（RA2 步兵/载具 SHP 常用）。 */
export function facingStep(direction: number, rotations = 8): number {
  const span = 256 / rotations
  return Math.floor(((direction & 255) + span / 2) / span) % rotations
}

export function quantizedFacing(direction: number): number {
  return facingStep(direction) * 32
}

export type MatrixElements = { elements: ArrayLike<number> }

/**
 * 用地格图标时只吃 HVA frame 0（+ hvaMultiplier 平移），跳过会把图标撑爆的异常矩阵。
 * 不使用 VXL `transfMatrix`。
 */
export function applyHvaToVoxels(
  voxels: VoxelSample[],
  matrix: MatrixElements | undefined,
  hvaMultiplier = 1,
): VoxelSample[] {
  if (!matrix || voxels.length === 0) return voxels
  const e = matrix.elements
  const tx = (e[12] ?? 0) * hvaMultiplier
  const ty = (e[13] ?? 0) * hvaMultiplier
  const tz = (e[14] ?? 0) * hvaMultiplier
  const scale = Math.max(Math.abs(e[0] ?? 1), Math.abs(e[5] ?? 1), Math.abs(e[10] ?? 1))
  if (scale > 32 || Math.abs(tx) > 256 || Math.abs(ty) > 256 || Math.abs(tz) > 256) return voxels
  return voxels.map((voxel) => ({
    ...voxel,
    x: voxel.x * (e[0] ?? 1) + voxel.y * (e[4] ?? 0) + voxel.z * (e[8] ?? 0) + tx,
    y: voxel.x * (e[1] ?? 0) + voxel.y * (e[5] ?? 1) + voxel.z * (e[9] ?? 0) + ty,
    z: voxel.x * (e[2] ?? 0) + voxel.y * (e[6] ?? 0) + voxel.z * (e[10] ?? 1) + tz,
  }))
}

function paletteColor(palette: Uint8Array, index: number): [number, number, number] {
  const offset = (index & 0xff) * 3
  return [palette[offset] ?? 0, palette[offset + 1] ?? 0, palette[offset + 2] ?? 0]
}

function projectVoxel(x: number, y: number, z: number): { px: number; py: number } {
  return {
    px: (x - y) * 2,
    py: (x + y) - z * 2,
  }
}

export function blitVoxelsToRgba(
  voxels: VoxelSample[],
  palette: Uint8Array,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  options: VxlBlitOptions = {},
): VxlRgba | null {
  if (voxels.length === 0) return null
  const radians = facingRadians(options.facing ?? 0)
  const originX = sizeX / 2
  const originY = sizeY / 2
  const oriented = radians === 0
    ? voxels
    : voxels.map((voxel) => {
      const rotated = rotateXY(voxel.x - originX, voxel.y - originY, radians)
      return { ...voxel, x: rotated.x + originX, y: rotated.y + originY }
    })
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const projected = oriented.map((voxel) => {
    const point = projectVoxel(voxel.x, voxel.y, voxel.z)
    if (point.px < minX) minX = point.px
    if (point.py < minY) minY = point.py
    if (point.px > maxX) maxX = point.px
    if (point.py > maxY) maxY = point.py
    return { ...point, colorIndex: voxel.colorIndex, depth: voxel.x + voxel.y + voxel.z }
  })
  const pad = 2
  const width = Math.max(8, Math.ceil(maxX - minX + 4) + pad * 2)
  const height = Math.max(8, Math.ceil(maxY - minY + 4) + pad * 2)
  const rgba = new Uint8ClampedArray(width * height * 4)
  const depthBuf = new Float32Array(width * height).fill(-Infinity)
  const sorted = projected.slice().sort((a, b) => a.depth - b.depth)
  for (const voxel of sorted) {
    const sx = Math.floor(voxel.px - minX + pad)
    const sy = Math.floor(voxel.py - minY + pad)
    for (let oy = 0; oy < 2; oy++) {
      for (let ox = 0; ox < 2; ox++) {
        const x = sx + ox
        const y = sy + oy
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const index = y * width + x
        if (voxel.depth < depthBuf[index]) continue
        depthBuf[index] = voxel.depth
        const [r, g, b] = paletteColor(palette, voxel.colorIndex)
        const offset = index * 4
        rgba[offset] = r
        rgba[offset + 1] = g
        rgba[offset + 2] = b
        rgba[offset + 3] = 255
      }
    }
  }
  void sizeZ
  return { width, height, rgba }
}
