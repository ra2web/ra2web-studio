import * as THREE from 'three'
import { Section, type Span, type Voxel } from '../../data/vxl/Section'

/**
 * 体素 CRUD 纯函数集合。所有操作都是"对 Section 实例就地修改"，调用方负责
 * 在调用前先 deep-clone（参见 [src/data/vxl/VxlDraft.ts](../../data/vxl/VxlDraft.ts)）。
 *
 * Section 的 spans 数组一开始可能不包含所有 (x,y) 槽位。本模块统一保证：
 * 任何 setVoxel / removeVoxel 之后，被触碰过的 (x,y) 槽位至少有一条 span 存在；
 * 空 span 会保留（VxlEncoder 会写 -1 offset，对体积/语义无副作用）。
 */

function findSpanIndex(section: Section, x: number, y: number): number {
  for (let i = 0; i < section.spans.length; i++) {
    const sp = section.spans[i]
    if (sp.x === x && sp.y === y) return i
  }
  return -1
}

function ensureSpan(section: Section, x: number, y: number): Span {
  const idx = findSpanIndex(section, x, y)
  if (idx >= 0) return section.spans[idx]
  const span: Span = { x, y, voxels: [] }
  section.spans.push(span)
  return span
}

function indexInBounds(section: Section, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0
    && x < section.sizeX && y < section.sizeY && z < section.sizeZ
}

/** 取 (x,y,z) 处的体素；不存在返回 null。 */
export function getVoxelAt(section: Section, x: number, y: number, z: number): Voxel | null {
  const idx = findSpanIndex(section, x, y)
  if (idx < 0) return null
  const span = section.spans[idx]
  for (const v of span.voxels) {
    if (v.z === z) return v
  }
  return null
}

/**
 * 在 (x,y,z) 处写入体素。如果该位置已有体素 → 覆盖。返回是否真的发生变化（用于 dirty 判定）。
 * 越界静默忽略。
 */
export function setVoxelAt(
  section: Section,
  x: number, y: number, z: number,
  colorIndex: number, normalIndex: number,
): boolean {
  if (!indexInBounds(section, x, y, z)) return false
  const span = ensureSpan(section, x, y)
  for (let i = 0; i < span.voxels.length; i++) {
    const v = span.voxels[i]
    if (v.z === z) {
      if (v.colorIndex === colorIndex && v.normalIndex === normalIndex) return false
      span.voxels[i] = { x, y, z, colorIndex: colorIndex & 0xff, normalIndex: normalIndex & 0xff }
      return true
    }
  }
  // 按 z 升序插入（保持 spans 内 voxels 有序，便于编码）
  const newVoxel: Voxel = { x, y, z, colorIndex: colorIndex & 0xff, normalIndex: normalIndex & 0xff }
  let insertAt = span.voxels.length
  for (let i = 0; i < span.voxels.length; i++) {
    if (span.voxels[i].z > z) { insertAt = i; break }
  }
  span.voxels.splice(insertAt, 0, newVoxel)
  return true
}

/**
 * 删除 (x,y,z) 处的体素。返回是否真的删除了一个。
 */
export function removeVoxelAt(section: Section, x: number, y: number, z: number): boolean {
  if (!indexInBounds(section, x, y, z)) return false
  const idx = findSpanIndex(section, x, y)
  if (idx < 0) return false
  const span = section.spans[idx]
  for (let i = 0; i < span.voxels.length; i++) {
    if (span.voxels[i].z === z) {
      span.voxels.splice(i, 1)
      return true
    }
  }
  return false
}

/**
 * 把 oldColor 全部替换为 newColor（normalIndex 保持不变）。返回被替换的体素数。
 */
export function replaceColor(section: Section, oldColor: number, newColor: number): number {
  if (oldColor === newColor) return 0
  const oc = oldColor & 0xff
  const nc = newColor & 0xff
  let count = 0
  for (const span of section.spans) {
    for (let i = 0; i < span.voxels.length; i++) {
      const v = span.voxels[i]
      if (v.colorIndex === oc) {
        span.voxels[i] = { ...v, colorIndex: nc }
        count++
      }
    }
  }
  return count
}

/**
 * 4-way 平面 flood fill（在 axis 指定的切片平面内）。axis = 'z' 表示固定 z，在 (x,y) 平面填；
 * 'y' 固定 y，'x' 固定 x。从 seed 开始把所有连通且 colorIndex === seedColor 的体素改成 newColor。
 *
 * 边界判定 = 同色像素是否存在；空位（无体素）也被视为"不同色"，不会被填。
 */
export function floodFill2D(
  section: Section,
  axis: 'x' | 'y' | 'z',
  fixed: number,
  seedX: number, seedY: number,  // axis 平面里的两个动态轴坐标
  newColor: number,
  newNormal: number,
): number {
  // 把 axis 平面坐标映射回 (x, y, z)
  const toVoxelXYZ = (a: number, b: number): [number, number, number] => {
    if (axis === 'z') return [a, b, fixed]
    if (axis === 'y') return [a, fixed, b]
    return [fixed, a, b]
  }
  const [seedVx, seedVy, seedVz] = toVoxelXYZ(seedX, seedY)
  const seed = getVoxelAt(section, seedVx, seedVy, seedVz)
  if (!seed) return 0
  const seedColor = seed.colorIndex
  if (seedColor === (newColor & 0xff)) return 0

  // 平面 a/b 的边界
  const aMax = axis === 'x' ? section.sizeY : section.sizeX
  const bMax = axis === 'z' ? section.sizeY : section.sizeZ

  const visited = new Set<number>()
  const queue: [number, number][] = [[seedX, seedY]]
  let count = 0
  while (queue.length > 0) {
    const [a, b] = queue.shift()!
    const key = a * 4096 + b
    if (visited.has(key)) continue
    visited.add(key)
    if (a < 0 || a >= aMax || b < 0 || b >= bMax) continue
    const [vx, vy, vz] = toVoxelXYZ(a, b)
    const cur = getVoxelAt(section, vx, vy, vz)
    if (!cur || cur.colorIndex !== seedColor) continue
    setVoxelAt(section, vx, vy, vz, newColor, newNormal)
    count++
    queue.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1])
  }
  return count
}

/**
 * 把 srcSection 的 voxels 全部 deep-copy 到一个新 Section（保留 transform / bounds / size 等元数据）。
 * 用于"导入 section from 另一份 vxl"。
 */
export function cloneSection(src: Section, overrideName?: string): Section {
  const dst = new Section()
  dst.name = overrideName ?? src.name
  dst.normalsMode = src.normalsMode
  dst.sizeX = src.sizeX
  dst.sizeY = src.sizeY
  dst.sizeZ = src.sizeZ
  dst.hvaMultiplier = src.hvaMultiplier
  dst.transfMatrix = src.transfMatrix.clone()
  dst.minBounds = new THREE.Vector3(src.minBounds.x, src.minBounds.y, src.minBounds.z)
  dst.maxBounds = new THREE.Vector3(src.maxBounds.x, src.maxBounds.y, src.maxBounds.z)
  dst.spans = src.spans.map((sp) => ({
    x: sp.x, y: sp.y,
    voxels: sp.voxels.map((v) => ({ ...v })),
  }))
  return dst
}

/**
 * 用 nearest-neighbor 插值把 section 的尺寸改为 newSizeX/Y/Z，所有体素重新映射到新坐标。
 * 越界的旧体素会被丢弃；新坐标按比例从旧坐标采样。
 */
export function resizeSectionNearest(
  section: Section,
  newSizeX: number, newSizeY: number, newSizeZ: number,
): void {
  const oldSizeX = section.sizeX
  const oldSizeY = section.sizeY
  const oldSizeZ = section.sizeZ
  if (newSizeX === oldSizeX && newSizeY === oldSizeY && newSizeZ === oldSizeZ) return

  // 收集旧 voxel snapshot
  const old = section.spans.map((sp) => ({
    x: sp.x, y: sp.y,
    voxels: sp.voxels.map((v) => ({ ...v })),
  }))

  // 重置 spans
  section.spans = []
  section.sizeX = newSizeX
  section.sizeY = newSizeY
  section.sizeZ = newSizeZ

  for (const sp of old) {
    for (const v of sp.voxels) {
      const nx = Math.floor((v.x + 0.5) * newSizeX / oldSizeX)
      const ny = Math.floor((v.y + 0.5) * newSizeY / oldSizeY)
      const nz = Math.floor((v.z + 0.5) * newSizeZ / oldSizeZ)
      if (nx >= 0 && nx < newSizeX && ny >= 0 && ny < newSizeY && nz >= 0 && nz < newSizeZ) {
        setVoxelAt(section, nx, ny, nz, v.colorIndex, v.normalIndex)
      }
    }
  }
}
