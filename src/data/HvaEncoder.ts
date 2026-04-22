import { Matrix4 } from 'three'
import { DataStream } from './DataStream'
import { HvaSection } from './HvaFile'

/**
 * 把 HvaFile.sections 编码回原始 .hva 字节，对称 [src/data/HvaFile.ts](src/data/HvaFile.ts)。
 *
 * 磁盘布局：
 *   16 bytes  header id（CString，原版用 unit 文件名缩写；可空）
 *   int32     numFrames
 *   int32     numSections
 *   sections × { 16 bytes name CString }
 *   frames × sections × { 12 float32  3x4 row-major }
 *
 * 所有节的 matrices 数组长度必须相同（= numFrames），否则抛错。
 */

export interface HvaEncodeArgs {
  sections: HvaSection[]
  /** 头部 16 字节标识；不传 = 空字符串 */
  headerId?: string
}

const NAME_FIELD_SIZE = 16

function writeFixed16(stream: DataStream, name: string): void {
  const bytes = new Uint8Array(NAME_FIELD_SIZE)
  for (let i = 0; i < Math.min(name.length, NAME_FIELD_SIZE); i++) {
    bytes[i] = name.charCodeAt(i) & 0xff
  }
  stream.writeUint8Array(bytes)
}

/**
 * THREE.Matrix4 写出 row-major 3x4 float32（与 HvaFile.readMatrix 反向）。
 * 解析：fromArray 4x3 (column-major) + transpose() 得到最终矩阵。
 * 反向：elements[c*4 + r] 直接读 row-major (r,c)。
 */
function writeMatrix3x4(stream: DataStream, m: Matrix4): void {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      stream.writeFloat32(m.elements[c * 4 + r])
    }
  }
}

export class HvaEncoder {
  static encode(args: HvaEncodeArgs): Uint8Array {
    const sections = args.sections ?? []
    const numSections = sections.length
    if (numSections === 0) {
      throw new Error('HvaEncoder: at least one section required')
    }
    const numFrames = sections[0].matrices.length
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].matrices.length !== numFrames) {
        throw new Error(
          `HvaEncoder: section "${sections[i].name}" frame count ${sections[i].matrices.length} `
          + `differs from section[0] count ${numFrames}`,
        )
      }
    }

    const totalSize =
      NAME_FIELD_SIZE         // header id
      + 4                     // numFrames
      + 4                     // numSections
      + numSections * NAME_FIELD_SIZE
      + numFrames * numSections * 12 * 4

    const stream = new DataStream(new ArrayBuffer(totalSize))
    stream.endianness = DataStream.LITTLE_ENDIAN

    writeFixed16(stream, args.headerId ?? '')
    stream.writeInt32(numFrames)
    stream.writeInt32(numSections)
    for (const sec of sections) writeFixed16(stream, sec.name)

    for (let f = 0; f < numFrames; f++) {
      for (let s = 0; s < numSections; s++) {
        const matrix = sections[s].matrices[f]
        if (!matrix) {
          throw new Error(`HvaEncoder: section[${s}] frame[${f}] matrix missing`)
        }
        writeMatrix3x4(stream, matrix)
      }
    }

    if (stream.position !== totalSize) {
      throw new Error(
        `HvaEncoder: cursor mismatch (wrote ${stream.position}, expected ${totalSize})`,
      )
    }
    return new Uint8Array(stream.buffer, 0, totalSize)
  }
}
