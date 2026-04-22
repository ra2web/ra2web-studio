/**
 * VXL 编辑器的"游戏化预览"动画元数据。**不属于 VXL/HVA 二进制格式**，是 ra2web-studio
 * 自己持久化到项目内同名 `.anim.json` 的扩展配置。
 *
 * 仅 V1：rotors（直升机桨叶 / 工厂转轴等持续旋转的部件）。
 * 后续可扩展 turret 朝向 / barrel pitch / wheel 等。
 *
 * 与游戏对齐：rotor 的 `name` / `axis` / `speed` 概念取自 RA2 art INI 的 `Rotors=` 字段
 * 以及 [redalert2/src/engine/renderable/entity/unit/RotorHelper.ts]。本文件不做读 INI；
 * 用户在 VxlEditor 的 RotorsPanel 里手动配置。
 */

export type RotorAxis = 'x' | 'y' | 'z'

export interface RotorConfig {
  /** 必须匹配某个 vxl section.name（大小写敏感，但建议大写） */
  sectionName: string
  /** 旋转轴（在 section 局部空间） */
  axis: RotorAxis
  /** 度/秒，可负（反向） */
  speedDegPerSec: number
  /** 启用：禁用时仍保留配置但不旋转 */
  enabled: boolean
}

export interface AnimMetadata {
  rotors: RotorConfig[]
}

export function emptyAnimMetadata(): AnimMetadata {
  return { rotors: [] }
}

export function cloneAnimMetadata(src: AnimMetadata): AnimMetadata {
  return { rotors: src.rotors.map((r) => ({ ...r })) }
}

/** 用于 dirty 判定 */
export function animMetadataEquals(a: AnimMetadata | null, b: AnimMetadata | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.rotors.length !== b.rotors.length) return false
  for (let i = 0; i < a.rotors.length; i++) {
    const ra = a.rotors[i]
    const rb = b.rotors[i]
    if (ra.sectionName !== rb.sectionName) return false
    if (ra.axis !== rb.axis) return false
    if (ra.speedDegPerSec !== rb.speedDegPerSec) return false
    if (ra.enabled !== rb.enabled) return false
  }
  return true
}

/**
 * 解析 `.anim.json`。容错：缺字段就用默认值；解析失败返回 null（调用方 fallback 到 empty）。
 */
export function parseAnimMetadata(text: string): AnimMetadata | null {
  try {
    const json = JSON.parse(text)
    if (!json || typeof json !== 'object') return null
    const rotors: RotorConfig[] = []
    if (Array.isArray(json.rotors)) {
      for (const r of json.rotors) {
        if (!r || typeof r !== 'object') continue
        const sectionName = typeof r.sectionName === 'string' ? r.sectionName : null
        if (!sectionName) continue
        const axis: RotorAxis = (r.axis === 'x' || r.axis === 'y' || r.axis === 'z') ? r.axis : 'z'
        const speedDegPerSec = typeof r.speedDegPerSec === 'number' && Number.isFinite(r.speedDegPerSec)
          ? r.speedDegPerSec : 67
        const enabled = typeof r.enabled === 'boolean' ? r.enabled : true
        rotors.push({ sectionName, axis, speedDegPerSec, enabled })
      }
    }
    return { rotors }
  } catch {
    return null
  }
}

export function serializeAnimMetadata(meta: AnimMetadata): string {
  return JSON.stringify(meta, null, 2)
}
