import { lzo1x, type LzoState } from './Lzo1x'

/**
 * MiniLZO 包装。解码走现有 lzo1x.decompress；编码采用可被该解码器还原的
 * literal-only LZO1x（IsoMapPack5 不要求最优压缩比，只要游戏/FA2 能解开）。
 */
export class MiniLzo {
  static decompress(input: Uint8Array, outputSize: number): Uint8Array {
    const state: LzoState = {
      inputBuffer: input,
      outputBuffer: null,
    }
    const result = lzo1x.decompress(state, { outputSize })

    if (result !== 0) {
      throw new Error(`MiniLzo decode failed with code ${result}`)
    }
    if (!state.outputBuffer) {
      throw new Error('MiniLzo decode failed: empty output buffer')
    }
    return state.outputBuffer
  }

  /** LZO1x-compatible store: first-literal run + M4 EOF (0x11 0x00 0x00). */
  static compress(input: Uint8Array): Uint8Array {
    const t = input.length
    const out: number[] = []

    if (t === 0) {
      out.push(0x11, 0x00, 0x00)
      return new Uint8Array(out)
    }

    if (t <= 238) {
      out.push(17 + t)
    } else {
      let rest = t - 18
      out.push(0)
      while (rest > 255) {
        rest -= 255
        out.push(0)
      }
      out.push(rest)
    }

    for (let i = 0; i < t; i++) out.push(input[i])
    out.push(0x11, 0x00, 0x00)
    return new Uint8Array(out)
  }
}

