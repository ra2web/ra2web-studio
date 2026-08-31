import { Format80 } from './Format80'
import { MiniLzo } from './MiniLzo'

export class Format5 {
  static decode(input: Uint8Array, outputSize: number, format: number = 5): Uint8Array {
    const output = new Uint8Array(outputSize)
    this.decodeInto(input, output, format)
    return output
  }

  static decodeInto(input: Uint8Array, output: Uint8Array, format: number = 5): void {
    const outputLength = output.length
    let inputPos = 0
    let outputPos = 0

    while (outputPos < outputLength) {
      const compressedSize = (input[inputPos + 1] << 8) | input[inputPos]
      inputPos += 2

      const decompressedSize = (input[inputPos + 1] << 8) | input[inputPos]
      inputPos += 2

      if (!compressedSize || !decompressedSize) break

      const compressedSlice = input.subarray(inputPos, inputPos + compressedSize)
      const decompressed =
        format === 80
          ? Format80.decode(compressedSlice, decompressedSize)
          : MiniLzo.decompress(compressedSlice, decompressedSize)

      output.set(decompressed.subarray(0, decompressedSize), outputPos)
      inputPos += compressedSize
      outputPos += decompressedSize
    }
  }

  /** Westwood Format5: 8192-byte sections, each prefixed with packed/unpacked UINT16. */
  static readonly SECTION_SIZE = 8192

  static encode(input: Uint8Array, format: number = 5): Uint8Array {
    const chunks: Uint8Array[] = []
    for (let offset = 0; offset < input.length; offset += this.SECTION_SIZE) {
      const slice = input.subarray(offset, Math.min(offset + this.SECTION_SIZE, input.length))
      const packed = format === 80 ? Format80.encode(slice) : MiniLzo.compress(slice)
      if (packed.length > 0xffff || slice.length > 0xffff) {
        throw new Error('Format5 section exceeds UINT16 size')
      }
      const header = new Uint8Array(4 + packed.length)
      header[0] = packed.length & 0xff
      header[1] = (packed.length >> 8) & 0xff
      header[2] = slice.length & 0xff
      header[3] = (slice.length >> 8) & 0xff
      header.set(packed, 4)
      chunks.push(header)
    }
    let total = 0
    for (const chunk of chunks) total += chunk.length
    const output = new Uint8Array(total)
    let pos = 0
    for (const chunk of chunks) {
      output.set(chunk, pos)
      pos += chunk.length
    }
    return output
  }
}

