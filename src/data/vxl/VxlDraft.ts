import * as THREE from 'three'
import { Matrix4 } from 'three'
import { Section, type Span, type Voxel } from './Section'
import { HvaSection } from '../HvaFile'

/**
 * VXL 编辑器使用的可写 draft：从 VxlFile 解析后克隆得到，编辑期间维护脏状态比较，
 * 保存时再交给 VxlEncoder 重新编码。
 *
 * sections 引用现有 [src/data/vxl/Section.ts](src/data/vxl/Section.ts) 的 Section 类，
 * 但需要 deep-clone（包括 transfMatrix / bounds / spans / voxels）。
 */
export interface VxlDraft {
  /** 嵌入调色板 768 字节 */
  embeddedPalette: Uint8Array
  sections: Section[]
}

export interface HvaDraft {
  sections: HvaSection[]
}

// ---------------- clone ----------------

function cloneVoxel(v: Voxel): Voxel {
  return { x: v.x, y: v.y, z: v.z, colorIndex: v.colorIndex, normalIndex: v.normalIndex }
}

function cloneSpan(s: Span): Span {
  return { x: s.x, y: s.y, voxels: s.voxels.map(cloneVoxel) }
}

function cloneSection(src: Section): Section {
  const dst = new Section()
  dst.name = src.name
  dst.normalsMode = src.normalsMode
  dst.minBounds = new THREE.Vector3(src.minBounds.x, src.minBounds.y, src.minBounds.z)
  dst.maxBounds = new THREE.Vector3(src.maxBounds.x, src.maxBounds.y, src.maxBounds.z)
  dst.sizeX = src.sizeX
  dst.sizeY = src.sizeY
  dst.sizeZ = src.sizeZ
  dst.hvaMultiplier = src.hvaMultiplier
  dst.transfMatrix = src.transfMatrix.clone()
  dst.spans = src.spans.map(cloneSpan)
  return dst
}

export function cloneVxlDraft(d: VxlDraft): VxlDraft {
  return {
    embeddedPalette: new Uint8Array(d.embeddedPalette),
    sections: d.sections.map(cloneSection),
  }
}

function cloneHvaSection(src: HvaSection): HvaSection {
  const dst = new HvaSection()
  dst.name = src.name
  dst.matrices = src.matrices.map((m) => m.clone())
  return dst
}

export function cloneHvaDraft(d: HvaDraft): HvaDraft {
  return { sections: d.sections.map(cloneHvaSection) }
}

// ---------------- equals ----------------

function paletteEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function vec3Equals(a: THREE.Vector3, b: THREE.Vector3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

function matrix4Equals(a: Matrix4, b: Matrix4): boolean {
  for (let i = 0; i < 16; i++) {
    if (a.elements[i] !== b.elements[i]) return false
  }
  return true
}

function voxelEquals(a: Voxel, b: Voxel): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
    && a.colorIndex === b.colorIndex && a.normalIndex === b.normalIndex
}

function spanEquals(a: Span, b: Span): boolean {
  if (a.x !== b.x || a.y !== b.y) return false
  if (a.voxels.length !== b.voxels.length) return false
  for (let i = 0; i < a.voxels.length; i++) {
    if (!voxelEquals(a.voxels[i], b.voxels[i])) return false
  }
  return true
}

function sectionEquals(a: Section, b: Section): boolean {
  if (a.name !== b.name) return false
  if (a.normalsMode !== b.normalsMode) return false
  if (a.sizeX !== b.sizeX || a.sizeY !== b.sizeY || a.sizeZ !== b.sizeZ) return false
  if (a.hvaMultiplier !== b.hvaMultiplier) return false
  if (!vec3Equals(a.minBounds, b.minBounds)) return false
  if (!vec3Equals(a.maxBounds, b.maxBounds)) return false
  if (!matrix4Equals(a.transfMatrix, b.transfMatrix)) return false
  if (a.spans.length !== b.spans.length) return false
  for (let i = 0; i < a.spans.length; i++) {
    if (!spanEquals(a.spans[i], b.spans[i])) return false
  }
  return true
}

export function vxlDraftEquals(a: VxlDraft, b: VxlDraft): boolean {
  if (!paletteEquals(a.embeddedPalette, b.embeddedPalette)) return false
  if (a.sections.length !== b.sections.length) return false
  for (let i = 0; i < a.sections.length; i++) {
    if (!sectionEquals(a.sections[i], b.sections[i])) return false
  }
  return true
}

function hvaSectionEquals(a: HvaSection, b: HvaSection): boolean {
  if (a.name !== b.name) return false
  if (a.matrices.length !== b.matrices.length) return false
  for (let i = 0; i < a.matrices.length; i++) {
    if (!matrix4Equals(a.matrices[i], b.matrices[i])) return false
  }
  return true
}

export function hvaDraftEquals(a: HvaDraft, b: HvaDraft): boolean {
  if (a.sections.length !== b.sections.length) return false
  for (let i = 0; i < a.sections.length; i++) {
    if (!hvaSectionEquals(a.sections[i], b.sections[i])) return false
  }
  return true
}
