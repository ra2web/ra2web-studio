import { DataStream } from './DataStream'

export interface IdxEntry {
  filename: string
  offset: number
  length: number
  sampleRate: number
  flags: number
  chunkSize: number
}

function createStream(source: DataStream | Uint8Array): DataStream {
  if (source instanceof DataStream) {
    source.seek(0)
    return source
  }
  return new DataStream(new DataView(source.buffer, source.byteOffset, source.byteLength))
}

function readFixedName(stream: DataStream): string {
  const raw = stream.readString(16)
  const nullIndex = raw.indexOf('\0')
  return (nullIndex >= 0 ? raw.slice(0, nullIndex) : raw).trim()
}

export class IdxFile {
  readonly entries = new Map<string, IdxEntry>()

  constructor(source: DataStream | Uint8Array) {
    this.parse(createStream(source))
  }

  private parse(stream: DataStream): void {
    const magic = stream.readString(4)
    if (magic !== 'GABA') {
      throw new Error(`Unable to load IDX file, expected GABA magic but found ${magic || '(empty)'}`)
    }

    const version = stream.readInt32()
    if (version !== 2) {
      throw new Error(`Unable to load IDX file, expected version 2 but found ${version}`)
    }

    const count = stream.readInt32()
    if (count < 0) {
      throw new Error(`Unable to load IDX file, invalid entry count ${count}`)
    }

    for (let i = 0; i < count; i++) {
      const stem = readFixedName(stream)
      const offset = stream.readUint32()
      const length = stream.readUint32()
      const sampleRate = stream.readUint32()
      const flags = stream.readUint32()
      const chunkSize = stream.readUint32()

      if (!stem) continue
      const filename = `${stem}.wav`
      this.entries.set(filename, {
        filename,
        offset,
        length,
        sampleRate,
        flags,
        chunkSize,
      })
    }
  }

  getEntries(): IdxEntry[] {
    return [...this.entries.values()]
  }
}
