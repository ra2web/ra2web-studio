import React, { useEffect, useState } from 'react'
import { Info, Palette, Layers, FileText } from 'lucide-react'
import { MixFileData } from './MixEditor'
import { MixParser } from '../services/MixParser'
import { CsfFile } from '../data/CsfFile'
import { VirtualFile } from '../data/vfs/VirtualFile'
import { useLocale } from '../i18n/LocaleContext'
import { resolvePreviewFile } from './preview/previewFileResolver'
import type { PreviewTarget } from './preview/types'

interface PropertiesPanelProps {
  selectedFile: string | null
  mixFiles: MixFileData[]
  target?: PreviewTarget | null
}

interface ParsedPath {
  mixName: string
  innerPath: string
  filename: string
}

interface CsfMetadata {
  version: number
  languageName: string
  declaredLabels: number
  declaredValues: number
  parsedLabels: number
}

function parseSelectedPath(filePath: string): ParsedPath | null {
  const slash = filePath.indexOf('/')
  if (slash <= 0) return null
  const mixName = filePath.substring(0, slash)
  const innerPath = filePath.substring(slash + 1)
  const filename = innerPath.split('/').pop() || ''
  if (!filename) return null
  return { mixName, innerPath, filename }
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ selectedFile, mixFiles, target }) => {
  const { t } = useLocale()
  const [resolvedSize, setResolvedSize] = useState<number | null>(null)
  const [csfMetadata, setCsfMetadata] = useState<CsfMetadata | null>(null)
  const [csfLoading, setCsfLoading] = useState(false)
  const [csfError, setCsfError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function loadCsfMetadata() {
      setCsfMetadata(null)
      setCsfError(null)
      setCsfLoading(false)
      setResolvedSize(null)

      if (!selectedFile) return
      if (target) {
        const extension = target.extension.toLowerCase()
        try {
          const resolved = await resolvePreviewFile(target)
          const bytes = await resolved.readBytes()
          if (disposed) return
          setResolvedSize(bytes.byteLength)
          if (extension !== 'csf') return
          setCsfLoading(true)
          const parsed = CsfFile.fromVirtualFile(VirtualFile.fromBytes(bytes, resolved.name))
          if (disposed) return
          setCsfMetadata({
            version: parsed.version,
            languageName: parsed.languageName,
            declaredLabels: parsed.stats.declaredLabels,
            declaredValues: parsed.stats.declaredValues,
            parsedLabels: parsed.stats.parsedLabels,
          })
          setCsfLoading(false)
          return
        } catch (e: any) {
          if (!disposed) {
            setCsfError(e?.message || 'Failed to parse file metadata')
            setCsfLoading(false)
          }
          return
        }
      }
      const parsedPath = parseSelectedPath(selectedFile)
      if (!parsedPath) return
      const extension = parsedPath.filename.split('.').pop()?.toLowerCase() || ''
      if (extension !== 'csf') return

      setCsfLoading(true)
      try {
        const mix = mixFiles.find((item) => item.info.name === parsedPath.mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, parsedPath.innerPath)
        if (!vf) throw new Error('CSF file not found in MIX')
        const parsed = CsfFile.fromVirtualFile(vf)
        if (disposed) return
        setCsfMetadata({
          version: parsed.version,
          languageName: parsed.languageName,
          declaredLabels: parsed.stats.declaredLabels,
          declaredValues: parsed.stats.declaredValues,
          parsedLabels: parsed.stats.parsedLabels,
        })
      } catch (e: any) {
        if (!disposed) setCsfError(e?.message || 'Failed to parse CSF metadata')
      } finally {
        if (!disposed) setCsfLoading(false)
      }
    }

    loadCsfMetadata()
    return () => {
      disposed = true
    }
  }, [selectedFile, mixFiles, target])

  const getFileProperties = (filePath: string) => {
    if (target) {
      const name = target.kind === 'project-file'
        ? target.relativePath.split('/').pop() || target.relativePath
        : target.entryName
      return {
        name,
        path: target.displayPath,
        type: (target.extension || '').toUpperCase() || 'UNKNOWN',
        size: resolvedSize != null ? resolvedSize.toString() : t('props.unknown'),
      }
    }

    const parsedPath = parseSelectedPath(filePath)
    const mixName = parsedPath?.mixName || ''
    const innerPath = parsedPath?.innerPath || ''
    const filename = parsedPath?.filename || ''

    if (!filename) {
      return {
        name: t('props.noFileSelected'),
        path: '',
        type: 'UNKNOWN',
        size: '0',
      }
    }

    const extension = filename.split('.').pop()?.toLowerCase() || ''

    // 查找对应的MIX文件和文件信息
    const mixData = mixFiles.find(mix => mix.info.name === mixName)
    const fileInfo = mixData?.info.files.find((file: any) => file.filename === innerPath || file.filename === filename)

    const baseProps = {
      name: filename,
      path: filePath,
      type: extension.toUpperCase(),
      size: fileInfo ? fileInfo.length.toString() : t('props.unknown'),
      hash: fileInfo ? `0x${fileInfo.hash.toString(16).toUpperCase()}` : t('props.unknown'),
      offset: fileInfo ? fileInfo.offset.toString() : t('props.unknown'),
    }

    switch (extension) {
      case 'shp':
        return {
          ...baseProps,
          format: 'SHP (Chronodivide Image Format)',
          frames: 12,
          width: 64,
          height: 48,
          compression: 'Format80',
          palette: 'unittem.pal',
        }
      case 'vxl':
        return {
          ...baseProps,
          format: 'VXL (Chronodivide 3D Model Format)',
          sections: 3,
          voxels: 1248,
          bounds: { min: [-32, -16, -8], max: [32, 16, 24] },
          normals: 'Enabled',
        }
      case 'pcx':
        return {
          ...baseProps,
          format: 'PCX (PC Paintbrush Format)',
          width: 320,
          height: 200,
          colors: 256,
          planes: 1,
          encoding: 'RLE',
        }
      case 'csf':
        return {
          ...baseProps,
          format: 'CSF (Westwood String Table)',
        }
      default:
        return baseProps
    }
  }

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Info size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm">{t('props.selectFileToView')}</p>
        </div>
      </div>
    )
  }

  const properties = getFileProperties(selectedFile)
  const isCsf = properties.type === 'CSF'

  return (
    <div className="h-full flex flex-col">
      {/* 属性头部 */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold flex items-center">
          <Info size={20} className="mr-2" />
          {t('props.fileAttributes')}
        </h3>
      </div>

      {/* 属性内容 */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* 基本信息 */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-300 flex items-center">
            <FileText size={16} className="mr-2" />
            {t('props.basicInfo')}
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">{t('props.fileName')}:</span>
              <span className="text-white">{properties.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t('props.filePath')}:</span>
              <span className="text-white text-xs break-all">{properties.path}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t('props.fileType')}:</span>
              <span className="text-white">{properties.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t('props.fileSize')}:</span>
              <span className="text-white">{properties.size} {t('props.bytesUnit')}</span>
            </div>
            {'hash' in properties && (
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.hash')}:</span>
                <span className="text-white font-mono text-xs">{properties.hash}</span>
              </div>
            )}
            {'offset' in properties && (
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.offset')}:</span>
                <span className="text-white">{properties.offset}</span>
              </div>
            )}
          </div>
        </div>

        {/* 格式特定信息 */}
        {'frames' in properties && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center">
              <Layers size={16} className="mr-2" />
              {t('props.shpInfo')}
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.format')}:</span>
                <span className="text-white">{properties.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.frames')}:</span>
                <span className="text-white">{properties.frames}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.dimensions')}:</span>
                <span className="text-white">{properties.width} × {properties.height}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.compression')}:</span>
                <span className="text-white">{properties.compression}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.palette')}:</span>
                <span className="text-white">{properties.palette}</span>
              </div>
            </div>
          </div>
        )}

        {'voxels' in properties && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center">
              <Layers size={16} className="mr-2" />
              {t('props.vxlInfo')}
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.format')}:</span>
                <span className="text-white">{properties.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.sectionCount')}:</span>
                <span className="text-white">{properties.sections}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.voxelCount')}:</span>
                <span className="text-white">{properties.voxels}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.bounds')}:</span>
                <span className="text-white">
                  [{properties.bounds.min.join(', ')}] - [{properties.bounds.max.join(', ')}]
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.normals')}:</span>
                <span className="text-white">{properties.normals}</span>
              </div>
            </div>
          </div>
        )}

        {'colors' in properties && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center">
              <Palette size={16} className="mr-2" />
              {t('props.pcxInfo')}
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.format')}:</span>
                <span className="text-white">{properties.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.dimensions')}:</span>
                <span className="text-white">{properties.width} × {properties.height}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.colorCount')}:</span>
                <span className="text-white">{properties.colors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.planes')}:</span>
                <span className="text-white">{properties.planes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('props.encoding')}:</span>
                <span className="text-white">{properties.encoding}</span>
              </div>
            </div>
          </div>
        )}

        {isCsf && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center">
              <FileText size={16} className="mr-2" />
              {t('props.csfInfo')}
            </h4>
            {'format' in properties && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t('props.format')}:</span>
                <span className="text-white">{properties.format}</span>
              </div>
            )}
            {csfLoading && (
              <div className="text-xs text-gray-500">{t('props.readingCsfMetadata')}</div>
            )}
            {csfError && !csfLoading && (
              <div className="text-xs text-red-400">{t('props.readCsfFailed', { msg: csfError })}</div>
            )}
            {csfMetadata && !csfLoading && (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('props.version')}:</span>
                  <span className="text-white">{csfMetadata.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('props.language')}:</span>
                  <span className="text-white">{csfMetadata.languageName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('props.labelCount')}:</span>
                  <span className="text-white">{csfMetadata.parsedLabels}/{csfMetadata.declaredLabels}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('props.declaredValues')}:</span>
                  <span className="text-white">{csfMetadata.declaredValues}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PropertiesPanel
