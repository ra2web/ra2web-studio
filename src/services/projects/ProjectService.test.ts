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
