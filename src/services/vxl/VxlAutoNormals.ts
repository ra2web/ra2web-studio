import { Section, type Voxel } from '../../data/vxl/Section'
import { getVoxelAt } from './VxlOps'

/**
 * 简化版"自动法线"算法：
 * 移植自 OS Voxel Section Editor III 的 Voxel_AutoNormals.pas（neighbour-based）。
 *
 * 该工具的核心思路：对每个体素 v，看 6 个轴向邻居（±x ±y ±z）的存在性：
 * - 如果某个方向没有邻居 → 该方向是"暴露面"
 * - 把所有暴露面方向加权求和，得到一个"主方向"，再用该主方向去查 normalsTable，
 *   找最接近的 normalIndex 写回 voxel.normalIndex。
 *
 * Pascal 原版有针对 normalsMode 1/2/3/4 的不同 normalsTable（共 244 / 36 / ... 条目），
 * 那些表数据都很大且与 Westwood 内部数据耦合。本实现采用通用的"球面均匀分布伪 normals"
 * 表 + cosine 距离匹配；语义上等价：表越细，结果越接近。对编辑器来说足够用。
 */

interface RawNormal { x: number; y: number; z: number }

/** 用 Fibonacci 球面分布生成 N 个法线，作为通用 normals 表 */
function buildNormalsTable(count: number): RawNormal[] {
  const out: RawNormal[] = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = phi * i
    out.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r })
  }
  return out
}

const NORMALS_BY_MODE: Record<number, RawNormal[]> = {
  1: buildNormalsTable(244), // TS = 244 条目（Pascal 原版）
  2: buildNormalsTable(36),  // RA2 = 36 条目（Pascal 原版）
  3: buildNormalsTable(86),
  4: buildNormalsTable(86),
}

function getNormalsTable(mode: number): RawNormal[] {
  return NORMALS_BY_MODE[mode] ?? NORMALS_BY_MODE[2]
}

/** 找最接近 dir 的 normal index（cosine similarity 最大）。 */
export function findClosestNormalIndex(
  dir: { x: number; y: number; z: number },
  table: RawNormal[],
): number {
  // 归一化 dir
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
  if (len < 1e-6) return 0
  const nx = dir.x / len, ny = dir.y / len, nz = dir.z / len
  let bestIdx = 0
  let bestDot = -Infinity
  for (let i = 0; i < table.length; i++) {
    const n = table[i]
    const dot = n.x * nx + n.y * ny + n.z * nz
    if (dot > bestDot) {
      bestDot = dot
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * 计算单个体素的"暴露方向"：累加所有缺失邻居方向的单位向量。
 * 如果体素被完全包围（无暴露面）→ 返回 null（保留原 normalIndex）。
 */
export function computeExposureDir(
  section: Section,
  v: Voxel,
): { x: number; y: number; z: number } | null {
  let dx = 0, dy = 0, dz = 0
  let exposed = 0
  if (!getVoxelAt(section, v.x + 1, v.y, v.z)) { dx += 1; exposed++ }
  if (!getVoxelAt(section, v.x - 1, v.y, v.z)) { dx -= 1; exposed++ }
  if (!getVoxelAt(section, v.x, v.y + 1, v.z)) { dy += 1; exposed++ }
  if (!getVoxelAt(section, v.x, v.y - 1, v.z)) { dy -= 1; exposed++ }
  if (!getVoxelAt(section, v.x, v.y, v.z + 1)) { dz += 1; exposed++ }
  if (!getVoxelAt(section, v.x, v.y, v.z - 1)) { dz -= 1; exposed++ }
  if (exposed === 0) return null
  return { x: dx, y: dy, z: dz }
}

/**
 * 对整个 section 应用自动法线。就地修改 voxel.normalIndex；返回被修改的 voxel 数。
 */
export function computeAutoNormals(section: Section): number {
  const table = getNormalsTable(section.normalsMode)
  let count = 0
  for (const span of section.spans) {
    for (let i = 0; i < span.voxels.length; i++) {
      const v = span.voxels[i]
      const dir = computeExposureDir(section, v)
      if (!dir) continue
      const newIndex = findClosestNormalIndex(dir, table)
      if (v.normalIndex !== newIndex) {
        span.voxels[i] = { ...v, normalIndex: newIndex }
        count++
      }
    }
  }
  return count
}
