import { DataStream } from '../DataStream'

export class Format80 {
  static decode(input: Uint8Array, outputSize: number): Uint8Array {
    const output = new Uint8Array(outputSize)
    this.decodeInto(input, output)
    return output
  }

  static decodeInto(input: Uint8Array, output: Uint8Array): number {
    const stream = new DataStream(new DataView(input.buffer, input.byteOffset, input.byteLength))
    let outputPos = 0

    while (true) {
      const command = stream.readUint8()

      if ((command & 128) === 0) {
        const byte = stream.readUint8()
        const count = 3 + ((command & 112) >> 4)
        this.replicatePrevious(output, outputPos, outputPos - (((command & 15) << 8) + byte), count)
        outputPos += count
      } else if ((command & 64) === 0) {
        const count = command & 63
        if (count === 0) return outputPos
        output.set(stream.readUint8Array(count), outputPos)
        outputPos += count
      } else {
        const count = command & 63
        if (count === 62) {
          const length = stream.readInt16()
          const value = stream.readUint8()
          const end = outputPos + length
          while (outputPos < end) {
            output[outputPos++] = value
          }
        } else if (count === 63) {
          const length = stream.readInt16()
          let sourceIndex = stream.readInt16()
          if (sourceIndex >= outputPos) {
            throw new Error(`srcIndex >= destIndex ${sourceIndex} ${outputPos}`)
          }
          const end = outputPos + length
          while (outputPos < end) {
            output[outputPos++] = output[sourceIndex++]
          }
        } else {
          const copyCount = 3 + count
          let sourceIndex = stream.readInt16()
          if (sourceIndex >= outputPos) {
            throw new Error(`srcIndex >= destIndex ${sourceIndex} ${outputPos}`)
          }
          const end = outputPos + copyCount
          while (outputPos < end) {
            output[outputPos++] = output[sourceIndex++]
          }
        }
      }
    }
  }

  private static replicatePrevious(
    output: Uint8Array,
    destinationIndex: number,
    sourceIndex: number,
    count: number,
  ): void {
    if (destinationIndex < sourceIndex) {
      throw new Error(`srcIndex > destIndex ${sourceIndex} ${destinationIndex}`)
    }
    if (destinationIndex - sourceIndex === 1) {
      for (let i = 0; i < count; i++) {
        output[destinationIndex + i] = output[destinationIndex - 1]
      }
      return
    }
    for (let i = 0; i < count; i++) {
      output[destinationIndex + i] = output[sourceIndex + i]
    }
  }

  /** Literal-copy Format80. Count 0 (0x80) is EOF, so chunks are 1–63 bytes. */
  static encode(input: Uint8Array): Uint8Array {
    const out: number[] = []
    let offset = 0
    while (offset < input.length) {
      const count = Math.min(63, input.length - offset)
      out.push(0x80 | count)
      for (let i = 0; i < count; i++) out.push(input[offset + i])
      offset += count
    }
    out.push(0x80)
    return new Uint8Array(out)
  }
}

