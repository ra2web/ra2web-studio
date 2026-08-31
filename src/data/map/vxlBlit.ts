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
): VxlRgba | null {
  if (voxels.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const projected = voxels.map((voxel) => {
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
  void sizeX
  void sizeY
  void sizeZ
  return { width, height, rgba }
}
