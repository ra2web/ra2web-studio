import { describe, expect, it } from 'vitest'
import {
  OS_CAMEO_SPRITE_COUNT,
  OS_CAMEO_SPRITE_HEIGHT,
  OS_CAMEO_SPRITE_WIDTH,
  OS_CAMEO_SPRITES,
} from './osCameoFontData'
import {
  isOsCameoFontFullyCoverable,
  layoutOsCameoText,
  osCharSpriteWidth,
  osCharToLine1Index,
  osCharToSpriteIndex,
} from './osCameoFont'

describe('osCameoFontData', () => {
  it('exports 75 sprites of 20x12 RGBA', () => {
    expect(OS_CAMEO_SPRITE_WIDTH).toBe(20)
    expect(OS_CAMEO_SPRITE_HEIGHT).toBe(12)
    expect(OS_CAMEO_SPRITE_COUNT).toBe(75)
    expect(OS_CAMEO_SPRITES).toHaveLength(75)
    for (const sprite of OS_CAMEO_SPRITES) {
      expect(sprite.length).toBe(20 * 12 * 4)
    }
  })

  it('数字 / 字母 / 句点 sprite 都有非透明像素（说明字体抠对了）', () => {
    const checkIndices = [0, 1, 9, 10, 25, 35, 36] // '0', '1', '9', 'A', 'P', 'Z', '.'
    for (const idx of checkIndices) {
      let opaque = 0
      const sprite = OS_CAMEO_SPRITES[idx]
      for (let i = 3; i < sprite.length; i += 4) {
        if (sprite[i] > 0) opaque++
      }
      expect(opaque, `sprite #${idx} has 0 opaque pixels`).toBeGreaterThan(0)
    }
  })
})

describe('osCharToLine1Index', () => {
  it('maps digits 0-9 to indices 0-9', () => {
    for (let n = 0; n <= 9; n++) {
      expect(osCharToLine1Index(String(n))).toBe(n)
    }
  })

  it('maps A-Z to 10-35 (case insensitive)', () => {
    expect(osCharToLine1Index('A')).toBe(10)
    expect(osCharToLine1Index('Z')).toBe(35)
    expect(osCharToLine1Index('a')).toBe(10) // 小写应被转大写
    expect(osCharToLine1Index('z')).toBe(35)
    expect(osCharToLine1Index('M')).toBe(22)
  })

  it('maps "." to 36', () => {
    expect(osCharToLine1Index('.')).toBe(36)
  })

  it('maps space to -2 (special: fixed 3px width, no sprite)', () => {
    expect(osCharToLine1Index(' ')).toBe(-2)
  })

  it('returns -1 for illegal chars (chinese / punctuation / emoji)', () => {
    expect(osCharToLine1Index('中')).toBe(-1)
    expect(osCharToLine1Index(',')).toBe(-1)
    expect(osCharToLine1Index('!')).toBe(-1)
    expect(osCharToLine1Index('-')).toBe(-1)
  })
})

describe('osCharToSpriteIndex', () => {
  it('line1 returns same as line1 index', () => {
    expect(osCharToSpriteIndex('A', 'line1')).toBe(10)
    expect(osCharToSpriteIndex('0', 'line1')).toBe(0)
    expect(osCharToSpriteIndex('.', 'line1')).toBe(36)
  })

  it('line2 returns line1 index + 38', () => {
    expect(osCharToSpriteIndex('A', 'line2')).toBe(10 + 38) // 48
    expect(osCharToSpriteIndex('0', 'line2')).toBe(0 + 38) // 38
    expect(osCharToSpriteIndex('Z', 'line2')).toBe(35 + 38) // 73
    expect(osCharToSpriteIndex('.', 'line2')).toBe(36 + 38) // 74
  })

  it('space and illegal chars are not affected by variant', () => {
    expect(osCharToSpriteIndex(' ', 'line1')).toBe(-2)
    expect(osCharToSpriteIndex(' ', 'line2')).toBe(-2)
    expect(osCharToSpriteIndex('中', 'line1')).toBe(-1)
    expect(osCharToSpriteIndex('中', 'line2')).toBe(-1)
  })
})

describe('osCharSpriteWidth (WorkOutCharLength 等价)', () => {
  it('returns >= 2 for any valid char sprite (default 2px)', () => {
    for (let i = 0; i <= 36; i++) {
      const w = osCharSpriteWidth(i)
      expect(w, `sprite #${i}`).toBeGreaterThanOrEqual(2)
      expect(w, `sprite #${i}`).toBeLessThanOrEqual(6)
    }
  })

  it('字母 W / M 应该比 I / 1 更宽', () => {
    const wW = osCharSpriteWidth(osCharToLine1Index('W')) // index 32
    const wI = osCharSpriteWidth(osCharToLine1Index('I')) // index 18
    const wM = osCharSpriteWidth(osCharToLine1Index('M')) // index 22
    const w1 = osCharSpriteWidth(osCharToLine1Index('1')) // index 1
    expect(wW).toBeGreaterThan(wI)
    expect(wM).toBeGreaterThan(w1)
  })
})

describe('layoutOsCameoText', () => {
  it('skips illegal chars but keeps total width consistent', () => {
    // "A中B" 中文应被跳过；总宽 = width('A') + width('B')
    const layoutFull = layoutOsCameoText('AB', 'line1')
    const layoutWithSkip = layoutOsCameoText('A中B', 'line1')
    expect(layoutWithSkip.totalWidth).toBe(layoutFull.totalWidth)
    expect(layoutWithSkip.chars).toHaveLength(2)
    expect(layoutWithSkip.chars[0].spriteIndex).toBe(osCharToLine1Index('A'))
    expect(layoutWithSkip.chars[1].spriteIndex).toBe(osCharToLine1Index('B'))
  })

  it('space contributes 3px width with spriteIndex=-2', () => {
    const layout = layoutOsCameoText(' ', 'line1')
    expect(layout.chars).toHaveLength(1)
    expect(layout.chars[0].spriteIndex).toBe(-2)
    expect(layout.chars[0].width).toBe(3)
    expect(layout.totalWidth).toBe(3)
  })

  it('"TANK" line2 uses line2 sprite indices (offset +38)', () => {
    const layout = layoutOsCameoText('TANK', 'line2')
    expect(layout.chars.map((c) => c.spriteIndex)).toEqual([
      osCharToSpriteIndex('T', 'line2'),
      osCharToSpriteIndex('A', 'line2'),
      osCharToSpriteIndex('N', 'line2'),
      osCharToSpriteIndex('K', 'line2'),
    ])
    // 全部 >= 38
    for (const c of layout.chars) expect(c.spriteIndex).toBeGreaterThanOrEqual(38)
  })
})

describe('isOsCameoFontFullyCoverable', () => {
  it('true for empty / pure ASCII char set', () => {
    expect(isOsCameoFontFullyCoverable('')).toBe(true)
    expect(isOsCameoFontFullyCoverable('TANK')).toBe(true)
    expect(isOsCameoFontFullyCoverable('TANK V3')).toBe(true)
    expect(isOsCameoFontFullyCoverable('A.B')).toBe(true)
    expect(isOsCameoFontFullyCoverable('tank')).toBe(true) // 小写也兼容
  })

  it('false when any chinese / non-supported char appears', () => {
    expect(isOsCameoFontFullyCoverable('坦克')).toBe(false)
    expect(isOsCameoFontFullyCoverable('TANK!')).toBe(false) // ! 不在字符集内
    expect(isOsCameoFontFullyCoverable('TANK 中')).toBe(false)
    expect(isOsCameoFontFullyCoverable('-')).toBe(false)
  })
})
