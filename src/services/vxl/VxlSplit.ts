import type { Section, Voxel } from '../../data/vxl/Section'

/**
 * 形状拆分：用一个**轴对齐 + 有限矩形范围**的切面把 section 的部分体素分到两侧，
 * 用户选其中一侧 (A 或 B) 搬到新 section。
 *
 * 切面参数：
 *   axis = 'x' → 切面与 YZ 平面平行，"主轴"= x；range A/B 限定 y/z 范围
 *   axis = 'y' → 切面与 XZ 平面平行；range A/B 限定 x/z
 *   axis = 'z' → 切面与 XY 平面平行；range A/B 限定 x/y
 *   k = 切面在主轴上的位置（整数）
 *
 * 体素分类：
 *   - 不在 range 内 → untouched，保留在原 section
 *   - 在 range 内：
 *       主轴坐标 < k → A 侧
 *       主轴坐标 >= k → B 侧
 *   - 用户选 chosenSide ∈ {A, B}：选中侧 → 新 section；另一侧 + untouched → 原 section
 *
 * 拒绝条件（V1 默认开启）：
 *   1. 选中侧为空（切面没切到东西）
 *   2. 选中侧内部不是单一 6-邻接连通块（即"切完之后选中那部分"还有多个分离的块）
 *      用户希望"分成 2 部分"作为可选检查；不通过时返回 ok=false 并给出 movedComponents
 *
 * 备注：连通性检查只查"选中侧"内部；原 section 留下的部分不查（删掉一部分后未必仍连通，由用户负责）。
 */

export interface SplitPlane {
  axis: 'x' | 'y' | 'z'
  /** 主轴位置（整数） */
  k: number
  /** 另一轴 1 范围（含端点），例 axis=x 时表示 y 范围 */
  rangeAMin: number
  rangeAMax: number
  /** 另一轴 2 范围（含端点），例 axis=x 时表示 z 范围 */
  rangeBMin: number
  rangeBMax: number
}

export interface SplitResult {
  /** 切完之后留在原 section 的体素 */
  remain: Voxel[]
  /** 切完之后搬到新 section 的体素 */
  moved: Voxel[]
  /** 选中侧的 6-邻接连通分量数（仅按 moved 内部判定） */
  movedComponents: number
  /** 是否通过校验：选中侧非空 + 单一连通块 */
  ok: boolean
}

/**
 * 把 voxel 按 (axis, k, range) 归到三类：A / B / untouched。
 * 返回三个数组都是对原 voxel 的浅引用（不拷贝），由调用方决定是否进一步处理。
 */
export function classifyVoxels(
  section: Section,
  plane: SplitPlane,
): { sideA: Voxel[]; sideB: Voxel[]; untouched: Voxel[] } {
  const sideA: Voxel[] = []
  const sideB: Voxel[] = []
  const untouched: Voxel[] = []
  for (const span of section.spans) {
    for (const v of span.voxels) {
      const inA1 = inRange(otherAxis1Coord(plane.axis, v), plane.rangeAMin, plane.rangeAMax)
      const inA2 = inRange(otherAxis2Coord(plane.axis, v), plane.rangeBMin, plane.rangeBMax)
      if (!inA1 || !inA2) { untouched.push(v); continue }
      const main = mainAxisCoord(plane.axis, v)
      if (main < plane.k) sideA.push(v)
      else sideB.push(v)
    }
  }
  return { sideA, sideB, untouched }
}

/**
 * 完整 plan：返回 remain / moved + 连通性结论。不修改 section。
 */
export function planSplit(section: Section, plane: SplitPlane, chosenSide: 'A' | 'B'): SplitResult {
  const { sideA, sideB, untouched } = classifyVoxels(section, plane)
  const moved = chosenSide === 'A' ? sideA : sideB
  const stayingSide = chosenSide === 'A' ? sideB : sideA
  const remain = stayingSide.concat(untouched)
  const movedComponents = countConnectedComponents(moved)
  const ok = moved.length > 0 && movedComponents === 1
  return { remain, moved, movedComponents, ok }
}

function inRange(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi
}

function mainAxisCoord(axis: 'x' | 'y' | 'z', v: Voxel): number {
  return axis === 'x' ? v.x : axis === 'y' ? v.y : v.z
}

function otherAxis1Coord(axis: 'x' | 'y' | 'z', v: Voxel): number {
  // axis=x → 另两轴是 (y, z)；axis=y → (x, z)；axis=z → (x, y)
  if (axis === 'x') return v.y
  if (axis === 'y') return v.x
  return v.x
}

function otherAxis2Coord(axis: 'x' | 'y' | 'z', v: Voxel): number {
  if (axis === 'x') return v.z
  if (axis === 'y') return v.z
  return v.y
}

/**
 * 6-邻接 BFS 数 voxels 列表的连通分量数。voxel 列表认为是无序集合；
 * 同坐标重复的体素被视作 1 个。
 */
export function countConnectedComponents(voxels: Voxel[]): number {
  if (voxels.length === 0) return 0
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const present = new Set<string>()
  for (const v of voxels) present.add(key(v.x, v.y, v.z))
  const visited = new Set<string>()
  let count = 0
  const dirs: Array<[number, number, number]> = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ]
  for (const v of voxels) {
    const start = key(v.x, v.y, v.z)
    if (visited.has(start)) continue
    count++
    // BFS
    const queue: Array<[number, number, number]> = [[v.x, v.y, v.z]]
    visited.add(start)
    while (queue.length > 0) {
      const [cx, cy, cz] = queue.shift()!
      for (const [dx, dy, dz] of dirs) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz
        const nk = key(nx, ny, nz)
        if (!present.has(nk) || visited.has(nk)) continue
        visited.add(nk)
        queue.push([nx, ny, nz])
      }
    }
  }
  return count
}
