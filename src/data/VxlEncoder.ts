import * as THREE from 'three'
import { DataStream } from './DataStream'
import { Section, Voxel } from './vxl/Section'

/**
 * 把内存里的 VXL draft 编码回原始 VXL 字节，对称 [src/data/VxlFile.ts](src/data/VxlFile.ts)
 * 与 [src/data/vxl/Section.ts](src/data/vxl/Section.ts) 的解析逻辑。
 *
 * 文件磁盘布局：
 *
 *   header (16 bytes name CString + 4 uint32 + 2 uint8 + 768 bytes embeddedPalette = 802 字节)
 *   section headers (28 字节/节：name 16 + 3×uint32)
 *   body (bodySize 字节)：每节顺序拼接：
 *     offset table     (sizeX*sizeY × int32，-1 = 空 span)
 *     end offset table (sizeX*sizeY × int32)
 *     span data       （变长，runs of 跳过+计数+体素+尾计数）
 *   section tailers (92 字节/节)
 *
 * Span data 一个 run 的字节布局（由 readSpanVoxels 反推）：
 *   uint8 skip      // 跳过到该 run 起点的 z 增量
 *   uint8 count     // 这个 run 含几个连续体素
 *   { uint8 colorIndex; uint8 normalIndex } × count
 *   uint8 endCount  // 一般等于 count
 *
 * 我们的策略：把 span.voxels 按 z 排序，按 z 是否连续切分成多个 run，
 * 每个 run 内部 z 连续；run 之间靠 skip 跳过空 z。
 */

export interface VxlEncodeArgs {
  /** 头部 embedded palette；长度若 != 768 会自动 pad/truncate */
  embeddedPalette: Uint8Array
  sections: Section[]
  /** 头部 fileName 字段，可选；不传时为空字符串（空 16 字节会被 readCString 视为空串） */
  fileName?: string
  /** 头部 paletteRemapStart / End；不传则用 0/0 */
  paletteRemapStart?: number
  paletteRemapEnd?: number
}

const HEADER_BASE_SIZE = 16 + 4 + 4 + 4 + 4 + 1 + 1 // 34
const PALETTE_SIZE = 768
const HEADER_TOTAL_SIZE = HEADER_BASE_SIZE + PALETTE_SIZE // 802
const SECTION_HEADER_SIZE = 16 + 4 + 4 + 4 // 28
const SECTION_TAILER_SIZE = 4 + 4 + 4 + 4 + 48 + 12 + 12 + 4 // 92

/** 写一个 16 字节的 ASCII fixed-length name（null padded）。 */
function writeNameFixed16(stream: DataStream, name: string): void {
  const bytes = new Uint8Array(16)
  for (let i = 0; i < Math.min(name.length, 16); i++) {
    bytes[i] = name.charCodeAt(i) & 0xff
  }
  stream.writeUint8Array(bytes)
}

/** 把 768 字节调色板规范化（不足补 0、超出截断）。 */
function normalizePalette(input: Uint8Array): Uint8Array {
  if (input.length === PALETTE_SIZE) return input
  const out = new Uint8Array(PALETTE_SIZE)
  out.set(input.subarray(0, Math.min(input.length, PALETTE_SIZE)))
  return out
}

/**
 * THREE.Matrix4 写出 row-major 3x4 float32（与解析侧 readTransfMatrix 反向）。
 * 解析：先按 column-major fromArray 4x3 + transpose() 得到最终矩阵。
 * 反向：直接读取 elements[c*4 + r] 拿到 row-major 第 r 行第 c 列的值。
 */
function writeTransfMatrix(stream: DataStream, m: THREE.Matrix4): void {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      stream.writeFloat32(m.elements[c * 4 + r])
    }
  }
}

interface EncodedSpan {
  /** 体素总数 0 时跳过整段 span（offset/end 写 -1） */
  isEmpty: boolean
  /** 已编码 span 数据字节（不含 offset 表） */
  bytes: Uint8Array
}

/**
 * 把单 span 的体素按 z 排序后切分成 runs，编码成字节。空 span 返回 isEmpty=true。
 *
 * 关键细节：parser 的循环 `for (z = 0; z < sizeZ; ...)` 每次必须读出"skip + count + voxels + endCount"。
 * 如果最后一个 voxel 的 z+1 < sizeZ，循环不会停止，会继续读"下一段 run"——读到末尾或下一段 span 的字节，
 * 都会引发越界或脏读。所以编码时必须在末尾追加 terminator run（skip 把 z 推到 >= sizeZ，count = 0）。
 *
 * 当 (sizeZ - prevEndZ) 超过 255 时，需要发多个空 run 拼接（每个 ≤ 255 的 skip）。
 */
function encodeSpan(voxels: Voxel[], sizeZ: number): EncodedSpan {
  if (!voxels || voxels.length === 0) return { isEmpty: true, bytes: new Uint8Array(0) }

  // 按 z 升序排（同 z 重复时仅保留第一个）
  const seenZ = new Set<number>()
  const sorted = [...voxels].sort((a, b) => a.z - b.z).filter((v) => {
    if (seenZ.has(v.z)) return false
    seenZ.add(v.z)
    return true
  })

  // 切分成 runs：z 连续的归一组
  const runs: { startZ: number; voxels: Voxel[] }[] = []
  for (const v of sorted) {
    const last = runs[runs.length - 1]
    if (last && v.z === last.startZ + last.voxels.length) {
      last.voxels.push(v)
    } else {
      runs.push({ startZ: v.z, voxels: [v] })
    }
  }

  // 计算末尾 terminator runs：把 z 从 prevEndZ 推到 sizeZ，每个空 run 最多跨 255
  const lastRealEndZ = runs.length > 0
    ? runs[runs.length - 1].startZ + runs[runs.length - 1].voxels.length
    : 0
  const terminators: number[] = [] // 各空 run 的 skip 值
  let remaining = sizeZ - lastRealEndZ
  while (remaining > 0) {
    const step = Math.min(255, remaining)
    terminators.push(step)
    remaining -= step
  }

  // 估算字节数：每个真 run = 1 (skip) + 1 (count) + 2*N (体素) + 1 (endCount)；空 terminator = 3 字节
  let total = 0
  for (const r of runs) total += 3 + 2 * r.voxels.length
  total += terminators.length * 3
  const bytes = new Uint8Array(total)

  let pos = 0
  let prevEndZ = 0
  for (const r of runs) {
    const skip = r.startZ - prevEndZ
    if (skip < 0 || skip > 0xff) {
      throw new Error(`VxlEncoder: span run skip ${skip} out of uint8 range`)
    }
    if (r.voxels.length > 0xff) {
      throw new Error(`VxlEncoder: span run length ${r.voxels.length} > 255`)
    }
    bytes[pos++] = skip
    bytes[pos++] = r.voxels.length
    for (const v of r.voxels) {
      bytes[pos++] = v.colorIndex & 0xff
      bytes[pos++] = v.normalIndex & 0xff
    }
    bytes[pos++] = r.voxels.length // endCount
    prevEndZ = r.startZ + r.voxels.length
  }
  for (const skip of terminators) {
    bytes[pos++] = skip
    bytes[pos++] = 0 // voxelCount = 0
    bytes[pos++] = 0 // endCount = 0
  }
  return { isEmpty: false, bytes }
}

/** 单节 body 块（offset 表 + end 表 + span 数据）。 */
function encodeSectionBody(section: Section): {
  /** 该节 body 总字节数 */
  byteLength: number
  /** 写函数：在调用方分配的大 stream 上从当前 position 开始写 byteLength 字节 */
  write: (stream: DataStream) => void
} {
  const { sizeX, sizeY } = section
  if (!Number.isInteger(sizeX) || sizeX <= 0 || !Number.isInteger(sizeY) || sizeY <= 0) {
    throw new Error(`VxlEncoder: section "${section.name}" invalid sizeX/Y ${sizeX}x${sizeY}`)
  }
  const N = sizeX * sizeY
  // 把 spans 按 (y, x) 索引到 N 槽（与解析顺序一致）
  const slots: (EncodedSpan | null)[] = new Array(N).fill(null)
  for (const span of section.spans) {
    if (
      !Number.isInteger(span.x) || span.x < 0 || span.x >= sizeX
      || !Number.isInteger(span.y) || span.y < 0 || span.y >= sizeY
    ) {
      throw new Error(
        `VxlEncoder: section "${section.name}" span out of bounds (${span.x},${span.y}) `
        + `for size ${sizeX}x${sizeY}`,
      )
    }
    const idx = span.y * sizeX + span.x
    // 同坐标多次出现时合并体素（理论不该出现，宽容处理）
    if (slots[idx]) {
      throw new Error(
        `VxlEncoder: section "${section.name}" duplicate span at (${span.x},${span.y})`,
      )
    }
    slots[idx] = encodeSpan(span.voxels, section.sizeZ)
  }
  // 缺失槽位作空 span
  for (let i = 0; i < N; i++) {
    if (!slots[i]) slots[i] = { isEmpty: true, bytes: new Uint8Array(0) }
  }

  // 计算 offset 表 / end offset 表
  const offsetTable = new Int32Array(N)
  const endOffsetTable = new Int32Array(N)
  let dataCursor = 0
  for (let i = 0; i < N; i++) {
    const span = slots[i]!
    if (span.isEmpty) {
      offsetTable[i] = -1
      endOffsetTable[i] = -1
      continue
    }
    offsetTable[i] = dataCursor
    endOffsetTable[i] = dataCursor + span.bytes.length - 1
    dataCursor += span.bytes.length
  }

  const tableBytes = N * 4
  const dataBytes = dataCursor
  const total = tableBytes * 2 + dataBytes

  return {
    byteLength: total,
    write(stream: DataStream) {
      for (let i = 0; i < N; i++) stream.writeInt32(offsetTable[i])
      for (let i = 0; i < N; i++) stream.writeInt32(endOffsetTable[i])
      for (let i = 0; i < N; i++) {
        const span = slots[i]!
        if (!span.isEmpty) stream.writeUint8Array(span.bytes)
      }
    },
  }
}

export class VxlEncoder {
  static encode(args: VxlEncodeArgs): Uint8Array {
    const sections = args.sections ?? []
    const palette = normalizePalette(args.embeddedPalette ?? new Uint8Array(0))

    // 预计算每节 body
    const sectionBodies = sections.map((s) => encodeSectionBody(s))
    const bodySize = sectionBodies.reduce((sum, b) => sum + b.byteLength, 0)

    const totalSize =
      HEADER_TOTAL_SIZE
      + sections.length * SECTION_HEADER_SIZE
      + bodySize
      + sections.length * SECTION_TAILER_SIZE

    const stream = new DataStream(new ArrayBuffer(totalSize))
    stream.endianness = DataStream.LITTLE_ENDIAN

    // 1) Header
    writeNameFixed16(stream, args.fileName ?? '')
    stream.writeUint32(1) // paletteCount = 1
    stream.writeUint32(sections.length) // headerCount
    stream.writeUint32(sections.length) // tailerCount
    stream.writeUint32(bodySize) // bodySize
    stream.writeUint8((args.paletteRemapStart ?? 0) & 0xff)
    stream.writeUint8((args.paletteRemapEnd ?? 0) & 0xff)
    stream.writeUint8Array(palette)

    // 2) Section headers
    for (const s of sections) {
      writeNameFixed16(stream, s.name)
      stream.writeUint32(0)
      stream.writeUint32(0)
      stream.writeUint32(0)
    }

    // 3) Body section（顺序写各节 body）+ 顺便记录每节的 startingSpanOffset（相对 bodyStart）
    const startingOffsets = new Array<number>(sections.length)
    let cumulative = 0
    for (let i = 0; i < sections.length; i++) {
      startingOffsets[i] = cumulative
      sectionBodies[i].write(stream)
      cumulative += sectionBodies[i].byteLength
    }

    // 4) Tailers
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]
      const N = s.sizeX * s.sizeY
      const startingSpanOffset = startingOffsets[i]
      const endingSpanOffset = startingSpanOffset + N * 4
      const dataSpanOffset = startingSpanOffset + N * 8
      stream.writeUint32(startingSpanOffset)
      stream.writeUint32(endingSpanOffset)
      stream.writeUint32(dataSpanOffset)
      stream.writeFloat32(s.hvaMultiplier)
      writeTransfMatrix(stream, s.transfMatrix)
      stream.writeFloat32(s.minBounds.x)
      stream.writeFloat32(s.minBounds.y)
      stream.writeFloat32(s.minBounds.z)
      stream.writeFloat32(s.maxBounds.x)
      stream.writeFloat32(s.maxBounds.y)
      stream.writeFloat32(s.maxBounds.z)
      stream.writeUint8(s.sizeX & 0xff)
      stream.writeUint8(s.sizeY & 0xff)
      stream.writeUint8(s.sizeZ & 0xff)
      stream.writeUint8(s.normalsMode & 0xff)
    }

    if (stream.position !== totalSize) {
      throw new Error(
        `VxlEncoder: cursor mismatch (wrote ${stream.position}, expected ${totalSize})`,
      )
    }
    return new Uint8Array(stream.buffer, 0, totalSize)
  }
}
