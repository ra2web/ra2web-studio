import { describe, expect, it } from 'vitest'
import {
  animMetadataEquals,
  cloneAnimMetadata,
  emptyAnimMetadata,
  parseAnimMetadata,
  serializeAnimMetadata,
  type AnimMetadata,
} from './AnimMetadata'

describe('AnimMetadata', () => {
  it('emptyAnimMetadata returns empty rotors array', () => {
    expect(emptyAnimMetadata()).toEqual({ rotors: [] })
  })

  it('cloneAnimMetadata produces deep copy', () => {
    const a: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    const b = cloneAnimMetadata(a)
    expect(b).toEqual(a)
    b.rotors[0].speedDegPerSec = 99
    expect(a.rotors[0].speedDegPerSec).toBe(67)
  })

  it('animMetadataEquals: identical', () => {
    const a: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    const b: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    expect(animMetadataEquals(a, b)).toBe(true)
  })

  it('animMetadataEquals: differs by speed', () => {
    const a: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] }
    const b: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 50, enabled: true }] }
    expect(animMetadataEquals(a, b)).toBe(false)
  })

  it('animMetadataEquals: empty == empty', () => {
    expect(animMetadataEquals(emptyAnimMetadata(), emptyAnimMetadata())).toBe(true)
  })

  it('animMetadataEquals: null vs null = true; null vs empty = false', () => {
    expect(animMetadataEquals(null, null)).toBe(true)
    expect(animMetadataEquals(null, emptyAnimMetadata())).toBe(false)
  })

  it('parseAnimMetadata: well-formed JSON', () => {
    const text = JSON.stringify({ rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] })
    const parsed = parseAnimMetadata(text)
    expect(parsed).toEqual({ rotors: [{ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true }] })
  })

  it('parseAnimMetadata: invalid axis falls back to z', () => {
    const text = JSON.stringify({ rotors: [{ sectionName: 'BLADE', axis: 'q', speedDegPerSec: 50, enabled: true }] })
    const parsed = parseAnimMetadata(text)
    expect(parsed?.rotors[0].axis).toBe('z')
  })

  it('parseAnimMetadata: missing fields use defaults', () => {
    const text = JSON.stringify({ rotors: [{ sectionName: 'BLADE' }] })
    const parsed = parseAnimMetadata(text)
    expect(parsed?.rotors[0]).toEqual({ sectionName: 'BLADE', axis: 'z', speedDegPerSec: 67, enabled: true })
  })

  it('parseAnimMetadata: invalid JSON returns null', () => {
    expect(parseAnimMetadata('not json')).toBeNull()
  })

  it('parseAnimMetadata: missing sectionName entries are dropped', () => {
    const text = JSON.stringify({ rotors: [{ axis: 'x' }, { sectionName: 'OK' }] })
    const parsed = parseAnimMetadata(text)
    expect(parsed?.rotors.length).toBe(1)
    expect(parsed?.rotors[0].sectionName).toBe('OK')
  })

  it('serialize round-trip', () => {
    const a: AnimMetadata = { rotors: [{ sectionName: 'BLADE', axis: 'y', speedDegPerSec: -30, enabled: false }] }
    const text = serializeAnimMetadata(a)
    const back = parseAnimMetadata(text)
    expect(back).toEqual(a)
  })
})
