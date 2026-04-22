/**
 * 形状 → voxel 坐标列表纯函数。不直接修改 Section；调用方拿到坐标列表后再走 VxlOps.setVoxelAt
 * 或打包成 VxlCommand 入栈。
 *
 * 三种基本几何：
 *   - box       立方体
 *   - sphere    球（实际上以包围盒尺寸定义椭球，sx == sy == sz 时退化为正球）
 *   - cylinder  圆柱（cylinderAxis 决定主轴；横切面在另两轴上是椭圆）
 *
 * 实心 / 中空：
 *   - solid    : 内部所有满足几何条件的整数格点
 *   - hollow   : 仅外壳厚度 wallThickness（>= 1）的格点
 *     box 中空 = 距离任意一个外面 < wallThickness 的格点
 *     sphere/cylinder 中空 = r-wt < dist <= r 的格点
 */

export type ShapeKind = 'box' | 'sphere' | 'cylinder'

export interface ShapeParams {
  kind: ShapeKind
  /** 包围盒最小角（含），整数 voxel 坐标 */
  x0: number
  y0: number
  z0: number
  /** 包围盒尺寸（>= 1 整数） */
  sx: number
  sy: number
  sz: number
  /** 是否中空 */
  hollow: boolean
  /** 中空时的壁厚（>= 1） */
  wallThickness: number
  /** 仅 cylinder 用：主轴 */
  cylinderAxis: 'x' | 'y' | 'z'
}

export interface SectionSize {
  x: number
  y: number
  z: number
}

/**
 * 生成形状的所有 voxel 坐标。坐标会被 clamp 到 [0, sectionSize.* - 1]，越界的不返回。
 * 返回元组数组以避免对象分配开销。
 */
export function shapeToVoxels(p: ShapeParams, sectionSize: SectionSize): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  const sx = Math.max(1, p.sx | 0)
  const sy = Math.max(1, p.sy | 0)
  const sz = Math.max(1, p.sz | 0)
  const wt = Math.max(1, p.wallThickness | 0)
  const x0 = p.x0 | 0
  const y0 = p.y0 | 0
  const z0 = p.z0 | 0
  const x1 = x0 + sx - 1
  const y1 = y0 + sy - 1
  const z1 = z0 + sz - 1

  for (let z = z0; z <= z1; z++) {
    if (z < 0 || z >= sectionSize.z) continue
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= sectionSize.y) continue
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || x >= sectionSize.x) continue
        if (isInside(p.kind, x, y, z, x0, y0, z0, sx, sy, sz, p.hollow, wt, p.cylinderAxis)) {
          out.push([x, y, z])
        }
      }
    }
  }
  return out
}

function isInside(
  kind: ShapeKind,
  x: number, y: number, z: number,
  x0: number, y0: number, z0: number,
  sx: number, sy: number, sz: number,
  hollow: boolean, wt: number,
  cylAxis: 'x' | 'y' | 'z',
): boolean {
  switch (kind) {
    case 'box': return insideBox(x, y, z, x0, y0, z0, sx, sy, sz, hollow, wt)
    case 'sphere': return insideSphere(x, y, z, x0, y0, z0, sx, sy, sz, hollow, wt)
    case 'cylinder': return insideCylinder(x, y, z, x0, y0, z0, sx, sy, sz, hollow, wt, cylAxis)
  }
}

function insideBox(
  x: number, y: number, z: number,
  x0: number, y0: number, z0: number,
  sx: number, sy: number, sz: number,
  hollow: boolean, wt: number,
): boolean {
  if (!hollow) return true
  const dxMin = Math.min(x - x0, x0 + sx - 1 - x)
  const dyMin = Math.min(y - y0, y0 + sy - 1 - y)
  const dzMin = Math.min(z - z0, z0 + sz - 1 - z)
  // 距任一面距离 < wt → 属于壳
  return dxMin < wt || dyMin < wt || dzMin < wt
}

function insideSphere(
  x: number, y: number, z: number,
  x0: number, y0: number, z0: number,
  sx: number, sy: number, sz: number,
  hollow: boolean, wt: number,
): boolean {
  // 椭球归一化：以包围盒中心为原点，a=sx/2 b=sy/2 c=sz/2
  const ax = sx / 2
  const ay = sy / 2
  const az = sz / 2
  const cx = x0 + ax - 0.5
  const cy = y0 + ay - 0.5
  const cz = z0 + az - 0.5
  const dx = (x - cx) / ax
  const dy = (y - cy) / ay
  const dz = (z - cz) / az
  const dist2 = dx * dx + dy * dy + dz * dz
  if (dist2 > 1) return false
  if (!hollow) return true
  // 中空：归一化半径 r' = sqrt(dist2)，等价的"实际厚度" = ax * (1 - r')
  // 用 min 半径估壁厚比例避免在长椭球上壁厚不均
  const minHalf = Math.min(ax, ay, az)
  const innerScale = (minHalf - wt) / minHalf
  if (innerScale <= 0) return true
  return dist2 > innerScale * innerScale
}

function insideCylinder(
  x: number, y: number, z: number,
  x0: number, y0: number, z0: number,
  sx: number, sy: number, sz: number,
  hollow: boolean, wt: number,
  cylAxis: 'x' | 'y' | 'z',
): boolean {
  // 主轴方向只检查"在 [start, end] 之间"；横切面在其他两轴上做椭圆判定
  let halfA: number, halfB: number, ca: number, cb: number, da: number, db: number
  let onAxis: boolean
  if (cylAxis === 'x') {
    halfA = sy / 2; halfB = sz / 2
    ca = y0 + halfA - 0.5; cb = z0 + halfB - 0.5
    da = (y - ca) / halfA; db = (z - cb) / halfB
    onAxis = x >= x0 && x <= x0 + sx - 1
  } else if (cylAxis === 'y') {
    halfA = sx / 2; halfB = sz / 2
    ca = x0 + halfA - 0.5; cb = z0 + halfB - 0.5
    da = (x - ca) / halfA; db = (z - cb) / halfB
    onAxis = y >= y0 && y <= y0 + sy - 1
  } else {
    halfA = sx / 2; halfB = sy / 2
    ca = x0 + halfA - 0.5; cb = y0 + halfB - 0.5
    da = (x - ca) / halfA; db = (y - cb) / halfB
    onAxis = z >= z0 && z <= z0 + sz - 1
  }
  if (!onAxis) return false
  const dist2 = da * da + db * db
  if (dist2 > 1) return false
  if (!hollow) return true
  // 中空：壳壁 + 两端盖
  const minHalf = Math.min(halfA, halfB)
  const innerScale = (minHalf - wt) / minHalf
  const insideRing = innerScale > 0 && dist2 <= innerScale * innerScale
  // 两端盖：靠近主轴端点 < wt 的 voxel 也算壳
  let endCap = false
  if (cylAxis === 'x') {
    const dxMin = Math.min(x - x0, x0 + sx - 1 - x)
    endCap = dxMin < wt
  } else if (cylAxis === 'y') {
    const dyMin = Math.min(y - y0, y0 + sy - 1 - y)
    endCap = dyMin < wt
  } else {
    const dzMin = Math.min(z - z0, z0 + sz - 1 - z)
    endCap = dzMin < wt
  }
  return endCap || !insideRing
}

/**
 * 估算与已有体素的重叠数（不实际修改 section）。
 * 调用方 = ShapePanel 用来在 UI 上展示"将覆盖 X 个已有 voxel"。
 */
export function countOverlaps(
  voxels: Array<[number, number, number]>,
  isOccupied: (x: number, y: number, z: number) => boolean,
): number {
  let n = 0
  for (const [x, y, z] of voxels) {
    if (isOccupied(x, y, z)) n++
  }
  return n
}
