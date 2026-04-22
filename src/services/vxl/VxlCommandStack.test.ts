import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { Section } from '../../data/vxl/Section'
import { setVoxelAt, getVoxelAt } from './VxlOps'
import {
  apply, buildReplaceColorCommand, revert,
  StrokeCollector, VxlCommandStack, type VxlCommand,
} from './VxlCommandStack'

function makeSection(): Section {
  const s = new Section()
  s.name = 'TEST'
  s.normalsMode = 2
  s.sizeX = 4; s.sizeY = 4; s.sizeZ = 4
  s.hvaMultiplier = 1
  s.transfMatrix = new THREE.Matrix4().identity()
  s.minBounds = new THREE.Vector3(); s.maxBounds = new THREE.Vector3()
  s.spans = []
  return s
}

describe('VxlCommandStack', () => {
  it('apply + revert restore voxel', () => {
    const sections = [makeSection()]
    setVoxelAt(sections[0], 0, 0, 0, 5, 1)
    const cmd: VxlCommand = {
      label: 'paint',
      patches: [{
        sectionIndex: 0, x: 0, y: 0, z: 0,
        before: { colorIndex: 5, normalIndex: 1 },
        after: { colorIndex: 9, normalIndex: 2 },
      }],
    }
    apply(sections, cmd)
    expect(getVoxelAt(sections[0], 0, 0, 0)).toEqual({ x: 0, y: 0, z: 0, colorIndex: 9, normalIndex: 2 })
    revert(sections, cmd)
    expect(getVoxelAt(sections[0], 0, 0, 0)).toEqual({ x: 0, y: 0, z: 0, colorIndex: 5, normalIndex: 1 })
  })

  it('apply + revert handle insert (before=null)', () => {
    const sections = [makeSection()]
    const cmd: VxlCommand = {
      label: 'create',
      patches: [{
        sectionIndex: 0, x: 1, y: 1, z: 1,
        before: null,
        after: { colorIndex: 7, normalIndex: 0 },
      }],
    }
    apply(sections, cmd)
    expect(getVoxelAt(sections[0], 1, 1, 1)?.colorIndex).toBe(7)
    revert(sections, cmd)
    expect(getVoxelAt(sections[0], 1, 1, 1)).toBeNull()
  })

  it('apply + revert handle delete (after=null)', () => {
    const sections = [makeSection()]
    setVoxelAt(sections[0], 2, 2, 2, 3, 4)
    const cmd: VxlCommand = {
      label: 'delete',
      patches: [{
        sectionIndex: 0, x: 2, y: 2, z: 2,
        before: { colorIndex: 3, normalIndex: 4 },
        after: null,
      }],
    }
    apply(sections, cmd)
    expect(getVoxelAt(sections[0], 2, 2, 2)).toBeNull()
    revert(sections, cmd)
    expect(getVoxelAt(sections[0], 2, 2, 2)?.colorIndex).toBe(3)
  })

  it('VxlCommandStack push/undo/redo cycle', () => {
    const sections = [makeSection()]
    const stack = new VxlCommandStack()
    expect(stack.canUndo()).toBe(false)
    const cmd: VxlCommand = {
      label: 'p',
      patches: [{ sectionIndex: 0, x: 0, y: 0, z: 0, before: null, after: { colorIndex: 1, normalIndex: 0 } }],
    }
    apply(sections, cmd)
    stack.push(cmd)
    expect(stack.canUndo()).toBe(true)
    expect(stack.canRedo()).toBe(false)

    stack.undo(sections)
    expect(getVoxelAt(sections[0], 0, 0, 0)).toBeNull()
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(true)

    stack.redo(sections)
    expect(getVoxelAt(sections[0], 0, 0, 0)?.colorIndex).toBe(1)
    expect(stack.canUndo()).toBe(true)
    expect(stack.canRedo()).toBe(false)
  })

  it('push clears redo stack', () => {
    const sections = [makeSection()]
    const stack = new VxlCommandStack()
    const c1: VxlCommand = { label: 'a', patches: [{ sectionIndex: 0, x: 0, y: 0, z: 0, before: null, after: { colorIndex: 1, normalIndex: 0 } }] }
    apply(sections, c1); stack.push(c1)
    stack.undo(sections)
    expect(stack.canRedo()).toBe(true)
    const c2: VxlCommand = { label: 'b', patches: [{ sectionIndex: 0, x: 1, y: 1, z: 1, before: null, after: { colorIndex: 2, normalIndex: 0 } }] }
    apply(sections, c2); stack.push(c2)
    expect(stack.canRedo()).toBe(false)
  })

  it('StrokeCollector dedupes touched cells', () => {
    const sections = [makeSection()]
    setVoxelAt(sections[0], 0, 0, 0, 1, 0)
    const stroke = new StrokeCollector('brush')
    stroke.touch(sections, 0, 0, 0, 0, { colorIndex: 5, normalIndex: 0 })
    // 第二次 touch 同一 cell，after 改为 9 → 仍只算一个 patch
    stroke.touch(sections, 0, 0, 0, 0, { colorIndex: 9, normalIndex: 0 })
    const cmd = stroke.finish()
    expect(cmd?.patches.length).toBe(1)
    expect(cmd?.patches[0].before).toEqual({ colorIndex: 1, normalIndex: 0 })
    expect(cmd?.patches[0].after).toEqual({ colorIndex: 9, normalIndex: 0 })
  })

  it('StrokeCollector finish() returns null when no real change', () => {
    const sections = [makeSection()]
    setVoxelAt(sections[0], 0, 0, 0, 5, 1)
    const stroke = new StrokeCollector('paint')
    stroke.touch(sections, 0, 0, 0, 0, { colorIndex: 5, normalIndex: 1 })
    expect(stroke.finish()).toBeNull()
  })

  it('buildReplaceColorCommand produces patches per matching voxel', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 0, 5, 1)
    setVoxelAt(s, 1, 1, 1, 5, 2)
    setVoxelAt(s, 2, 2, 2, 6, 3)
    const cmd = buildReplaceColorCommand(0, s, 5, 9)
    expect(cmd?.patches.length).toBe(2)
  })

  it('buildReplaceColorCommand returns null when no match', () => {
    const s = makeSection()
    setVoxelAt(s, 0, 0, 0, 5, 1)
    expect(buildReplaceColorCommand(0, s, 99, 100)).toBeNull()
  })
})
