import { DataStream } from '../../data/DataStream'

/**
 * 单帧编码输入。
 * - width / height：实际像素宽高
 * - x / y：在 SHP 全局画布上的偏移（默认 0）
 * - indexedPixels：长度必须等于 width * height 的 256 色索引数组
 */
export interface ShpEncodedFrame {
  width: number
  height: number
  x?: number
  y?: number
  indexedPixels: Uint8Array
}

export interface EncodeShpType0Args {
  /** SHP 全局画布宽（一般等于最大帧宽，例如 cameo 的 60） */
  canvasWidth: number
  /** SHP 全局画布高（一般等于最大帧高，例如 cameo 的 48） */
  canvasHeight: number
  /** 至少 1 帧 */
  frames: ShpEncodedFrame[]
}

const SHP_HEADER_SIZE = 8
const FRAME_HEADER_SIZE = 24

/**
 * SHP-TS 编码器。当前只实现 type 0（未压缩），帧数据每帧占 width*height 字节连续摆放。
 *
 * 字节布局严格对齐 src/data/ShpFile.ts 的 readFrameHeader 与
 * src/services/MixParser.ts 的 probeShpTsByXccRule 校验：
 *
 * 文件头 8 字节 (little-endian):
 *   int16 zero(0) | int16 cx | int16 cy | int16 cImages
 *
 * 每帧帧头 24 字节:
 *   int16 x | int16 y | int16 w | int16 h
 *   uint8 compression(0) | uint8 r0(0) | uint8 r1(0) | uint8 r2(0)   // 等价 int32 = 0，(comp & 2) === 0 走 raw 分支
 *   int32 ref(0) | int32 zero2(0)                                    // probeShpTsByXccRule 要求 zero2 === 0
 *   int32 dataOffset                                                 // 第 N 帧像素数据在文件中的绝对偏移
 *
 * 数据段:
 *   依次摆放每帧 width*height 字节
 */
export class ShpEncoder {
  static encodeType0(args: EncodeShpType0Args): Uint8Array {
    const { canvasWidth, canvasHeight, frames } = args

    if (!Number.isInteger(canvasWidth) || canvasWidth <= 0 || canvasWidth > 0x7fff) {
      throw new Error(`ShpEncoder: invalid canvasWidth ${canvasWidth}`)
    }
    if (!Number.isInteger(canvasHeight) || canvasHeight <= 0 || canvasHeight > 0x7fff) {
      throw new Error(`ShpEncoder: invalid canvasHeight ${canvasHeight}`)
    }
    if (!frames.length) {
      throw new Error('ShpEncoder: at least one frame is required')
    }
    if (frames.length > 0x7fff) {
      throw new Error(`ShpEncoder: too many frames (${frames.length})`)
    }
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      if (!Number.isInteger(f.width) || f.width <= 0) {
        throw new Error(`ShpEncoder: frame[${i}] invalid width ${f.width}`)
      }
      if (!Number.isInteger(f.height) || f.height <= 0) {
        throw new Error(`ShpEncoder: frame[${i}] invalid height ${f.height}`)
      }
      const expected = f.width * f.height
      if (f.indexedPixels.length !== expected) {
        throw new Error(
          `ShpEncoder: frame[${i}] indexedPixels length ${f.indexedPixels.length} does not match w*h=${expected}`,
        )
      }
    }

    const cImages = frames.length
    let dataCursor = SHP_HEADER_SIZE + cImages * FRAME_HEADER_SIZE
    const totalSize = dataCursor + frames.reduce((sum, f) => sum + f.width * f.height, 0)

    const stream = new DataStream(new ArrayBuffer(totalSize))
    stream.endianness = DataStream.LITTLE_ENDIAN

    // 文件头
    stream.writeInt16(0)
    stream.writeInt16(canvasWidth)
    stream.writeInt16(canvasHeight)
    stream.writeInt16(cImages)

    // 帧头表
    for (const frame of frames) {
      const frameSize = frame.width * frame.height
      stream.writeInt16(frame.x ?? 0)
      stream.writeInt16(frame.y ?? 0)
      stream.writeInt16(frame.width)
      stream.writeInt16(frame.height)
      // compression = 0（一字节）+ 3 字节 reserved，等价 int32 = 0
      stream.writeUint8(0)
      stream.writeUint8(0)
      stream.writeUint8(0)
      stream.writeUint8(0)
      // ref / unknown：写 0；XCC 校验 zero2 (offset+16, int32) 必须为 0
      stream.writeInt32(0)
      stream.writeInt32(0)
      // 像素数据偏移
      stream.writeInt32(dataCursor)
      dataCursor += frameSize
    }

    // 数据段
    for (const frame of frames) {
      stream.writeUint8Array(frame.indexedPixels)
    }

    if (stream.position !== totalSize) {
      throw new Error(
        `ShpEncoder: cursor mismatch (wrote ${stream.position}, expected ${totalSize})`,
      )
    }

    return new Uint8Array(stream.buffer, 0, totalSize)
  }
}
