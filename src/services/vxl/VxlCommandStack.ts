import { Section, type Voxel } from '../../data/vxl/Section'
import { getVoxelAt, removeVoxelAt, setVoxelAt } from './VxlOps'

/**
 * 单个 voxel 编辑 patch：sectionIndex 定位 section，(x,y,z) 定位体素。
 * before = null 表示编辑前该位置为空；after = null 表示编辑后该位置为空（删除）。
 *
 * 一个 stroke（command）可能包含多个 patch（笔刷一次涂多格 / flood fill 一次填一片）。
 */
export interface VxlVoxelPatch {
  sectionIndex: number
  x: number
  y: number
  z: number
  before: { colorIndex: number; normalIndex: number } | null
  after: { colorIndex: number; normalIndex: number } | null
}

export interface VxlCommand {
  /** 描述用，主要给 UI tooltip 看（"笔刷"、"flood fill"、"replace colour"...） */
  label: string
  /** 该 command 包含的全部 patch */
  patches: VxlVoxelPatch[]
}

/**
 * 编辑器命令栈：保留 undo / redo 历史。每次提交一个 command 后，redo 栈会被清空。
 *
 * apply / revert 都对外部传入的 sections 数组就地修改——使用方负责在 mutate 后用
 * VxlDraft 重新装配并触发 React 更新（与 VxlEditor 现有的 onChange 模型一致）。
 */
export class VxlCommandStack {
  private undoStack: VxlCommand[] = []
  private redoStack: VxlCommand[] = []
  private maxDepth: number

  constructor(maxDepth = 200) {
    this.maxDepth = maxDepth
  }

  /** 注册一个已"应用"的 command（apply 后立刻 push）。会清空 redo 栈。 */
  push(command: VxlCommand): void {
    this.undoStack.push(command)
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift()
    this.redoStack = []
  }

  canUndo(): boolean { return this.undoStack.length > 0 }
  canRedo(): boolean { return this.redoStack.length > 0 }
  size(): number { return this.undoStack.length }

  /**
   * 撤销最近一次 command。把 sections 还原到 before 状态。
   * 返回被撤销的 command，没有可撤销则返回 null。
   */
  undo(sections: Section[]): VxlCommand | null {
    const cmd = this.undoStack.pop()
    if (!cmd) return null
    revert(sections, cmd)
    this.redoStack.push(cmd)
    return cmd
  }

  /**
   * 重做最近一次撤销。把 sections 重新推到 after 状态。
   */
  redo(sections: Section[]): VxlCommand | null {
    const cmd = this.redoStack.pop()
    if (!cmd) return null
    apply(sections, cmd)
    this.undoStack.push(cmd)
    return cmd
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

/** 应用 command（按 patch 顺序写入 after 状态）。 */
export function apply(sections: Section[], cmd: VxlCommand): void {
  for (const p of cmd.patches) {
    const sec = sections[p.sectionIndex]
    if (!sec) continue
    if (p.after) {
      setVoxelAt(sec, p.x, p.y, p.z, p.after.colorIndex, p.after.normalIndex)
    } else {
      removeVoxelAt(sec, p.x, p.y, p.z)
    }
  }
}

/** 反向应用 command（按 patch 倒序写入 before 状态）。 */
export function revert(sections: Section[], cmd: VxlCommand): void {
  for (let i = cmd.patches.length - 1; i >= 0; i--) {
    const p = cmd.patches[i]
    const sec = sections[p.sectionIndex]
    if (!sec) continue
    if (p.before) {
      setVoxelAt(sec, p.x, p.y, p.z, p.before.colorIndex, p.before.normalIndex)
    } else {
      removeVoxelAt(sec, p.x, p.y, p.z)
    }
  }
}

/** Stroke 收集器：累积笔刷过程中的所有 patch，最后 finish() 转成 command。 */
export class StrokeCollector {
  private patches: VxlVoxelPatch[] = []
  private touched = new Set<string>()

  constructor(public readonly label: string) {}

  /**
   * 在 (x,y,z) 触碰一次。如果同一坐标在本 stroke 内已被触过，则只更新 after（保留最早的 before）。
   * 否则记录原 before 并设置 after。
   */
  touch(
    sections: Section[],
    sectionIndex: number,
    x: number, y: number, z: number,
    after: { colorIndex: number; normalIndex: number } | null,
  ): void {
    const key = `${sectionIndex}:${x}:${y}:${z}`
    const sec = sections[sectionIndex]
    if (!sec) return
    if (this.touched.has(key)) {
      // 已记录过 before，找到最近的 patch 更新 after
      for (let i = this.patches.length - 1; i >= 0; i--) {
        const p = this.patches[i]
        if (p.sectionIndex === sectionIndex && p.x === x && p.y === y && p.z === z) {
          p.after = after
          return
        }
      }
      return
    }
    this.touched.add(key)
    const cur = getVoxelAt(sec, x, y, z)
    const before = cur ? { colorIndex: cur.colorIndex, normalIndex: cur.normalIndex } : null
    this.patches.push({ sectionIndex, x, y, z, before, after })
  }

  /**
   * 完成 stroke。返回 command（如果有变化）或 null（若所有 before === after）。
   * **注意**：调用方还需要自己 apply（StrokeCollector 不动 sections）；
   * 通常的用法是 touch() 时已经在 sections 上手动改了，finish() 仅产出 command。
   */
  finish(): VxlCommand | null {
    const meaningful = this.patches.filter((p) => !patchEqual(p.before, p.after))
    if (meaningful.length === 0) return null
    return { label: this.label, patches: meaningful }
  }
}

function patchEqual(
  a: { colorIndex: number; normalIndex: number } | null,
  b: { colorIndex: number; normalIndex: number } | null,
): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.colorIndex === b.colorIndex && a.normalIndex === b.normalIndex
}

/**
 * 把 replaceColor 全 section 操作打包成一个 command（不修改 sections，仅生成 patches）。
 * 调用方决定是否 push。
 */
export function buildReplaceColorCommand(
  sectionIndex: number,
  section: Section,
  oldColor: number,
  newColor: number,
): VxlCommand | null {
  if (oldColor === newColor) return null
  const oc = oldColor & 0xff
  const nc = newColor & 0xff
  const patches: VxlVoxelPatch[] = []
  for (const span of section.spans) {
    for (const v of span.voxels) {
      if (v.colorIndex === oc) {
        patches.push({
          sectionIndex,
          x: v.x, y: v.y, z: v.z,
          before: { colorIndex: oc, normalIndex: v.normalIndex },
          after: { colorIndex: nc, normalIndex: v.normalIndex },
        })
      }
    }
  }
  if (patches.length === 0) return null
  return { label: `Replace color ${oc} → ${nc}`, patches }
}

/** 从一组 voxels 重建 Section，复用现有 Section 引用。 */
export function rebuildSectionFromVoxels(section: Section, voxels: Voxel[]): void {
  section.spans = []
  for (const v of voxels) setVoxelAt(section, v.x, v.y, v.z, v.colorIndex, v.normalIndex)
}
