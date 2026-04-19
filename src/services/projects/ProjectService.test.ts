import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileSystemUtil } from '../gameRes/FileSystemUtil'
import { ProjectService } from './ProjectService'

const { zipFileSpy, zipGenerateAsyncSpy } = vi.hoisted(() => ({
  zipFileSpy: vi.fn(),
  zipGenerateAsyncSpy: vi.fn(),
}))

vi.mock('jszip', () => ({
  default: vi.fn().mockImplementation(() => ({
    file: zipFileSpy,
    generateAsync: zipGenerateAsyncSpy,
  })),
}))

describe('ProjectService', () => {
  afterEach(() => {
    vi.clearAllMocks()
    zipFileSpy.mockReset()
    zipGenerateAsyncSpy.mockReset()
  })

  it('creates a project bucket and rejects duplicate names', async () => {
    vi.spyOn(FileSystemUtil, 'listImportedModNames').mockResolvedValue(['Alpha'])
    vi.spyOn(FileSystemUtil, 'listImportedFiles').mockResolvedValue([])
    const ensureBucketSpy = vi.spyOn(FileSystemUtil, 'ensureBucket').mockResolvedValue()

    await expect(ProjectService.createProject('Alpha')).rejects.toThrow(/已存在/)
    await expect(ProjectService.createProject('Beta')).resolves.toBe('Beta')
    expect(ensureBucketSpy).toHaveBeenCalledWith('mod', 'Beta')
  })

  it('renames a project by copying files and clearing the old bucket', async () => {
    vi.spyOn(FileSystemUtil, 'listImportedModNames').mockResolvedValue(['Alpha'])
    vi.spyOn(FileSystemUtil, 'listImportedFiles').mockImplementation(async (bucket, modName) => {
      if (bucket === 'mod' && modName === 'Alpha') {
        return [{ bucket: 'mod', name: 'ra2.mix', size: 12, lastModified: 100, modName: 'Alpha' }]
      }
      return []
    })
    const ensureBucketSpy = vi.spyOn(FileSystemUtil, 'ensureBucket').mockResolvedValue()
    const copyImportedFileSpy = vi.spyOn(FileSystemUtil, 'copyImportedFile').mockResolvedValue('ra2.mix')
    const clearBucketSpy = vi.spyOn(FileSystemUtil, 'clearBucket').mockResolvedValue()

    await expect(ProjectService.renameProject('Alpha', 'Bravo')).resolves.toBe('Bravo')
    expect(ensureBucketSpy).toHaveBeenCalledWith('mod', 'Bravo')
    expect(copyImportedFileSpy).toHaveBeenCalledWith({
      sourceBucket: 'mod',
      sourceFilename: 'ra2.mix',
      sourceModName: 'Alpha',
      targetBucket: 'mod',
      targetModName: 'Bravo',
      targetFilename: 'ra2.mix',
    })
    expect(clearBucketSpy).toHaveBeenCalledWith('mod', 'Alpha')
  })

  it('copies a base archive into a project bucket', async () => {
    vi.spyOn(FileSystemUtil, 'ensureBucket').mockResolvedValue()
    const copyImportedFileSpy = vi.spyOn(FileSystemUtil, 'copyImportedFile').mockResolvedValue('ra2.mix')

    await expect(ProjectService.copyBaseFileToProject('Demo', 'ra2.mix')).resolves.toBe('ra2.mix')
    expect(copyImportedFileSpy).toHaveBeenCalledWith({
      sourceBucket: 'base',
      sourceFilename: 'ra2.mix',
      targetBucket: 'mod',
      targetModName: 'Demo',
      targetFilename: 'ra2.mix',
    })
  })

  it('copyProjectFile (directory branch): reads source, ensures dir, writes new path; rejects same-path', async () => {
    const sourceBytes = new TextEncoder().encode('hello world')
    const sourceFile = new File([sourceBytes], 'foo.shp', {
      type: 'application/octet-stream',
      lastModified: 100,
    })
    Object.defineProperty(sourceFile, 'arrayBuffer', {
      value: async () => {
        const buf = new ArrayBuffer(sourceBytes.byteLength)
        new Uint8Array(buf).set(sourceBytes)
        return buf
      },
    })
    vi.spyOn(FileSystemUtil, 'readImportedFile').mockResolvedValue(sourceFile)
    const existsSpy = vi.spyOn(FileSystemUtil, 'importedEntryExists').mockResolvedValue(false)
    const ensureDirSpy = vi.spyOn(FileSystemUtil, 'ensureDirectory').mockResolvedValue('art/icons')
    const writeSpy = vi.spyOn(FileSystemUtil, 'writeImportedFile').mockResolvedValue('art/icons/bar.shp')

    const newPath = await ProjectService.copyProjectFile(
      'Demo',
      'src/foo.shp',
      { kind: 'directory', projectName: 'Demo', relativePath: 'art/icons' },
      'bar.shp',
    )
    expect(newPath).toBe('art/icons/bar.shp')
    expect(existsSpy).toHaveBeenCalledWith('mod', 'art/icons/bar.shp', 'Demo')
    expect(ensureDirSpy).toHaveBeenCalledWith('mod', 'art/icons', 'Demo')
    // 写入：第三个参数应是新 File，basename = bar.shp
    const writtenArgs = writeSpy.mock.calls[0]
    expect(writtenArgs[0]).toBe('mod')
    expect((writtenArgs[1] as File).name).toBe('bar.shp')
    expect(writtenArgs[2]).toBe('Demo')
    expect(writtenArgs[3]).toBe('art/icons/bar.shp')

    // same-path 校验：复制到原目录 + 同名 → 抛错
    await expect(
      ProjectService.copyProjectFile(
        'Demo',
        'src/foo.shp',
        { kind: 'directory', projectName: 'Demo', relativePath: 'src' },
        'foo.shp',
      ),
    ).rejects.toThrow(/相同/)
  })

  it('copyProjectFile (directory branch): rejects when target already exists', async () => {
    const sourceBytes = new Uint8Array([1, 2, 3])
    const sourceFile = new File([sourceBytes], 'foo.shp')
    Object.defineProperty(sourceFile, 'arrayBuffer', {
      value: async () => {
        const buf = new ArrayBuffer(sourceBytes.byteLength)
        new Uint8Array(buf).set(sourceBytes)
        return buf
      },
    })
    vi.spyOn(FileSystemUtil, 'readImportedFile').mockResolvedValue(sourceFile)
    vi.spyOn(FileSystemUtil, 'importedEntryExists').mockResolvedValue(true)

    await expect(
      ProjectService.copyProjectFile(
        'Demo',
        'src/foo.shp',
        { kind: 'directory', projectName: 'Demo', relativePath: 'art' },
        'foo.shp',
      ),
    ).rejects.toThrow(/已存在/)
  })

  it('copyProjectFile rejects empty new name and names containing path separator', async () => {
    await expect(
      ProjectService.copyProjectFile(
        'Demo',
        'src/foo.shp',
        { kind: 'directory', projectName: 'Demo', relativePath: 'art' },
        '   ',
      ),
    ).rejects.toThrow(/不能为空/)
    await expect(
      ProjectService.copyProjectFile(
        'Demo',
        'src/foo.shp',
        { kind: 'directory', projectName: 'Demo', relativePath: 'art' },
        'sub/bar.shp',
      ),
    ).rejects.toThrow(/路径分隔符/)
  })

  it('exports only project-owned files into a zip', async () => {
    vi.spyOn(FileSystemUtil, 'listImportedFiles').mockResolvedValue([
      { bucket: 'mod', name: 'ra2.mix', size: 3, lastModified: 100, modName: 'Demo' },
      { bucket: 'mod', name: 'notes.txt', size: 5, lastModified: 110, modName: 'Demo' },
    ])
    vi.spyOn(FileSystemUtil, 'readImportedFile').mockImplementation(async (_bucket, filename) => {
      const text = filename === 'ra2.mix' ? 'mix' : 'notes'
      const file = new File([text], filename)
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new TextEncoder().encode(text).buffer,
      })
      return file
    })

    zipGenerateAsyncSpy.mockResolvedValue(new Uint8Array([1, 2, 3]))

    const { blob, filename } = await ProjectService.exportProjectZip('Demo')
    expect(filename).toBe('Demo.zip')
    expect(zipFileSpy).toHaveBeenCalledTimes(2)
    expect(zipFileSpy).toHaveBeenNthCalledWith(1, 'ra2.mix', expect.any(Uint8Array))
    expect(zipFileSpy).toHaveBeenNthCalledWith(2, 'notes.txt', expect.any(Uint8Array))
    expect(zipGenerateAsyncSpy).toHaveBeenCalledWith({ type: 'uint8array' })
    expect(blob).toBeInstanceOf(Blob)
  })
})
