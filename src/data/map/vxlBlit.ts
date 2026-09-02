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

export type Fa2VxlSection = {
  voxels: VoxelSample[]
  sizeX: number
  sizeY: number
  sizeZ: number
  minBounds: { x: number; y: number; z: number }
  maxBounds: { x: number; y: number; z: number }
  hvaMultiplier?: number
  hvaMatrix?: MatrixElements
}

export type Fa2VxlRgba = VxlRgba & { centerX: number; centerY: number }

function rotateX(v: { x: number; y: number; z: number }, a: number) {
  const l = Math.hypot(v.y, v.z)
  const da = Math.atan2(v.y, v.z) + a
  return { x: v.x, y: l * Math.sin(da), z: l * Math.cos(da) }
}

function rotateY(v: { x: number; y: number; z: number }, a: number) {
  const l = Math.hypot(v.x, v.z)
  const da = Math.atan2(v.x, v.z) + a
  return { x: l * Math.sin(da), y: v.y, z: l * Math.cos(da) }
}

function rotateZ(v: { x: number; y: number; z: number }, a: number) {
  const l = Math.hypot(v.x, v.y)
  const da = Math.atan2(v.x, v.y) + a
  return { x: l * Math.sin(da), y: l * Math.cos(da), z: v.z }
}

/** FA2 `rotate_zxy`：先 Z 再 X 再 Y。 */
export function rotateZxy(
  v: { x: number; y: number; z: number },
  rx: number,
  ry: number,
  rz: number,
) {
  return rotateY(rotateX(rotateZ(v, rz), rx), ry)
}

/** FA2 建筑 VXL：`r_x=300, r_z=45*dir+90`，dir 与步兵朝向索引相同。 */
export function fa2BuildingVxlRadians(dirIndex: number): { rx: number; ry: number; rz: number } {
  const dir = ((dirIndex % 8) + 8) % 8
  const deg = Math.PI / 180
  return { rx: 300 * deg, ry: 0, rz: (45 * dir + 90) * deg }
}

/**
 * FA2 `LoadVXLImage`：格子坐标映射到 min/max bounds，再乘 HVA*scale，再 rotate_zxy。
 * 返回画布以及模型原点投影（`turretinfo.x/y`）。
 */
export function blitFa2VxlSections(
  sections: Fa2VxlSection[],
  palette: Uint8Array,
  dirIndex = 0,
  modelOffset: { x?: number; y?: number; z?: number } = {},
): Fa2VxlRgba | null {
  const rot = fa2BuildingVxlRadians(dirIndex)
  const ox = modelOffset.x ?? 0
  const oy = modelOffset.y ?? 0
  const oz = modelOffset.z ?? 0
  const projected: Array<{ px: number; py: number; depth: number; colorIndex: number }> = []
  for (const section of sections) {
    const sx = Math.max(1, section.sizeX)
    const sy = Math.max(1, section.sizeY)
    const sz = Math.max(1, section.sizeZ)
    const spanX = (section.maxBounds.x - section.minBounds.x) / sx
    const spanY = (section.maxBounds.y - section.minBounds.y) / sy
    const spanZ = (section.maxBounds.z - section.minBounds.z) / sz
    for (const voxel of section.voxels) {
      const world = {
        x: section.minBounds.x + voxel.x * spanX,
        y: section.minBounds.y + voxel.y * spanY,
        z: section.minBounds.z + voxel.z * spanZ,
        colorIndex: voxel.colorIndex,
      }
      const [mapped] = applyHvaToVoxels([world], section.hvaMatrix, section.hvaMultiplier ?? 1)
      const screen = rotateZxy(mapped, rot.rx, rot.ry, rot.rz)
      projected.push({
        px: screen.x + ox,
        py: screen.y + oy,
        depth: screen.z + oz,
        colorIndex: mapped.colorIndex,
      })
    }
  }
  if (projected.length === 0) return null
  const origin = rotateZxy({ x: 0, y: 0, z: 0 }, rot.rx, rot.ry, rot.rz)
  origin.x += ox
  origin.y += oy
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of projected) {
    if (point.px < minX) minX = point.px
    if (point.py < minY) minY = point.py
    if (point.px > maxX) maxX = point.px
    if (point.py > maxY) maxY = point.py
  }
  const pad = 1
  const width = Math.max(1, Math.ceil(maxX - minX + 2) + pad * 2)
  const height = Math.max(1, Math.ceil(maxY - minY + 2) + pad * 2)
  const rgba = new Uint8ClampedArray(width * height * 4)
  const depthBuf = new Float32Array(width * height).fill(-Infinity)
  for (const voxel of projected) {
    const x = Math.floor(voxel.px - minX + pad)
    const y = Math.floor(voxel.py - minY + pad)
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
  return {
    width,
    height,
    rgba,
    centerX: origin.x - minX + pad,
    centerY: origin.y - minY + pad,
  }
}
