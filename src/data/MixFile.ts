import { DataStream } from "./DataStream";
import { Blowfish } from "./encoding/Blowfish";
import { BlowfishKey } from "./encoding/BlowfishKey";
import { MixEntry } from "./MixEntry";
import { VirtualFile } from "./vfs/VirtualFile";

enum MixFileFlags {
  Checksum = 0x00010000, // 65536
  Encrypted = 0x00020000, // 131072
}

export class MixFile {
  private stream: DataStream;
  private headerStart = 84; // For RA encrypted headers, from original constructor
  private index: Map<number, MixEntry>;
  private dataStart: number = 0; // Offset where the actual file data begins

  constructor(stream: DataStream) {
    this.stream = stream;
    this.index = new Map<number, MixEntry>();
    this.parseHeader();
  }

  private parseHeader(): void {
    // 任何一种合法 MIX 头都至少需要 6 字节 (TD/RA 非加密：u16 count + u32 size)。
    // 小于该尺寸的输入 (例如 RA2 安装里 5 字节的 MOVIESxx.MIX 占位文件) 会让
    // 后续 readUint16/readUint32 越界，抛出难以定位的 RangeError，因此提前拦截。
    if (this.stream.byteLength < 6) {
      throw new Error(
        `MIX file is too small to contain a valid header (${this.stream.byteLength} bytes)`
      );
    }

    const flags = this.stream.readUint32();

    // Original logic: t = 0 == (e & ~(r.Checksum | r.Encrypted));
    // This checks if flags, after clearing Checksum and Encrypted bits, is zero.
    // Meaning, flags only contains Checksum, Encrypted, or both, or is zero.
    const isChronodivideMix = (flags & ~(MixFileFlags.Checksum | MixFileFlags.Encrypted)) === 0;

    if (isChronodivideMix) {
      if ((flags & MixFileFlags.Encrypted) !== 0) {
        // RA/TS Encrypted header
        this.dataStart = this.parseRaHeader();
        return; // Successfully parsed encrypted header
      }
      // else TD/RA unencrypted header (or flags = 0), continue to parseTdHeader with current stream
    } else {
      // Not a Chronodivide MIX file based on flags, or potentially a TD/RA file with no flags set (stream was 0).
      // Original logic: else this.stream.seek(0);
      // Try to parse as TD header from the beginning of the file.
      this.stream.seek(0);
    }
    // For unencrypted Chronodivide Mix or non-Chronodivide (seeked to 0)
    this.dataStart = this.parseTdHeader(this.stream);
  }

  private parseRaHeader(): number {
    const e = this.stream;
    const keySource = e.mapUint8Array(80)
    const decryptedKey = new BlowfishKey().decryptKey(keySource)
    const encryptedHeaderBlock = new Uint32Array(2)
    encryptedHeaderBlock[0] = e.readUint32()
    encryptedHeaderBlock[1] = e.readUint32()

    const blowfish = new Blowfish(decryptedKey)
    let headerStream = new DataStream(blowfish.decrypt(encryptedHeaderBlock))

    const fileCount = headerStream.readUint16()
    const declaredDataSize = headerStream.readUint32()

    e.position = this.headerStart
    let headerBytes = 6 + fileCount * MixEntry.size
    let encryptedWordCount = ((3 + headerBytes) / 4) | 0
    const encryptedIndexWords = new Uint32Array(encryptedWordCount + (encryptedWordCount % 2))
    for (let idx = 0; idx < encryptedIndexWords.length; idx++) {
      if (e.position + 4 > e.byteLength) {
        throw new Error('Encrypted MIX header is truncated')
      }
      encryptedIndexWords[idx] = e.readUint32()
    }

    headerStream = new DataStream(blowfish.decrypt(encryptedIndexWords))
    headerBytes = this.parseTdHeader(headerStream)
    const dataStart = this.headerStart + headerBytes + ((1 + (~headerBytes >>> 0)) & 7)
    if (dataStart + declaredDataSize > e.byteLength) {
      throw new Error('Encrypted MIX declares data section outside file bounds')
    }
    return dataStart
  }

  private parseTdHeader(e: DataStream): number {
    if (e.position + 6 > e.byteLength) {
      throw new Error('Invalid MIX header: insufficient bytes for fileCount + dataSize')
    }
    const fileCount = e.readUint16();
    const declaredDataSize = e.readUint32();
    const tableBytes = fileCount * MixEntry.size
    if (e.position + tableBytes > e.byteLength) {
      throw new Error('Invalid MIX header: index table exceeds stream length')
    }

    const seenHashes = new Set<number>();
    for (let r = 0; r < fileCount; r++) {
      if (e.position + 12 > e.byteLength) {
        throw new Error('Invalid MIX header: entry is truncated')
      }

      const hash = e.readUint32()
      const offset = e.readUint32()
      const length = e.readUint32()
      const end = offset + length

      if (offset > declaredDataSize || length > declaredDataSize || end > declaredDataSize) {
        throw new Error('Invalid MIX header: entry range exceeds declared data section')
      }

      if (!seenHashes.has(hash)) {
        seenHashes.add(hash)
      }

      this.index.set(hash, new MixEntry(hash, offset, length))
    }

    return e.position;
  }

  private createVirtualFileFromEntry(entry: MixEntry, filename: string): VirtualFile {
    const absoluteOffset = this.dataStart + entry.offset
    const absoluteEnd = absoluteOffset + entry.length
    if (
      absoluteOffset < 0
      || entry.length < 0
      || absoluteEnd > this.stream.byteLength
    ) {
      throw new Error(`Invalid MIX entry range for "${filename}"`)
    }
    return VirtualFile.factory(
      this.stream.dataView,
      filename,
      absoluteOffset,
      entry.length,
    )
  }

  public containsFile(filename: string): boolean { // 'e' in original
    // Filenames in MIX are typically case-insensitive. MixEntry.hashFilename handles uppercasing.
    const normalized = filename.replace(/\//g, "\\");
    return this.index.has(MixEntry.hashFilename(normalized));
  }

  public openFile(filename: string): VirtualFile { // 'e' in original filename
    // Filenames in MIX are typically case-insensitive.
    const normalized = filename.replace(/\//g, "\\");
    const fileId = MixEntry.hashFilename(normalized);
    const entry = this.index.get(fileId); // 't' in original

    if (!entry) {
      throw new Error(`File "${filename}" not found`);
    }

    // The 'this.stream' here is the DataStream of the entire MIX file.
    // 'VirtualFile.factory' in original was i.VirtualFile.factory
    // It expects the source DataStream (or DataView), filename, absolute offset, and length.
    return this.createVirtualFileFromEntry(entry, filename);
  }

  /**
   * 直接通过 id (索引中的散列/标识) 打开条目。
   * 用作回退（例如 UI 使用占位名 file_XXXXXXXX.ext）。
   */
  public containsId(id: number): boolean {
    return this.index.has(id >>> 0);
  }

  public openById(id: number, filename?: string): VirtualFile {
    const entry = this.index.get(id >>> 0);
    if (!entry) {
      throw new Error(`File id 0x${(id >>> 0).toString(16).toUpperCase()} not found`);
    }
    return this.createVirtualFileFromEntry(
      entry,
      filename ?? `file_${(id >>> 0).toString(16).toUpperCase()}`,
    );
  }

  /**
   * 打开指定 id 的前 length 字节视图，用于类型嗅探。
   */
  public openSliceById(id: number, length: number): VirtualFile {
    const entry = this.index.get(id >>> 0);
    if (!entry) {
      throw new Error(`File id 0x${(id >>> 0).toString(16).toUpperCase()} not found`);
    }
    const sliceLen = Math.max(0, Math.min(length, entry.length));
    return this.createVirtualFileFromEntry(
      new MixEntry(entry.hash, entry.offset, sliceLen),
      `slice_${(id >>> 0).toString(16).toUpperCase()}`,
    );
  }

  /**
   * 获取所有文件条目
   */
  public getAllEntries(): MixEntry[] {
    return Array.from(this.index.values());
  }

  /**
   * 获取所有文件名
   */
  public getAllFilenames(): string[] {
    return Array.from(this.index.values()).map(entry => {
      // 这里需要反向计算文件名
      // 由于原始代码没有提供反向哈希函数，我们需要一个不同的方法
      // 暂时返回哈希值的十六进制表示作为文件名
      return `file_${entry.hash.toString(16).toUpperCase()}.${this.getExtensionFromHash(entry.hash)}`;
    });
  }

  /**
   * 根据哈希值推测文件扩展名（这是一个简化的实现）
   */
  private getExtensionFromHash(_hash: number): string {
    // 这是一个简化的实现，实际应该通过其他方式确定扩展名
    // 或者在MIX文件中存储文件名映射
    return 'bin';
  }
}
