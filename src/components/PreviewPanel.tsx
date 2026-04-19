import React, { useMemo, useState, useEffect } from 'react'
import { Image, Box, FileText, Music, Info, Archive, Video, Download, Pencil, Trash2, Save, RotateCcw } from 'lucide-react'
import { MixFileInfo } from '../services/MixParser'
import IniViewer from './preview/IniViewer'
import DatViewer from './preview/DatViewer'
import HexViewer from './preview/HexViewer'
import TxtViewer from './preview/TxtViewer'
import CsfViewer from './preview/CsfViewer'
import PalViewer from './preview/PalViewer'
import PcxViewer from './preview/PcxViewer'
import ShpViewer from './preview/ShpViewer'
import CameoEditor from './cameo/CameoEditor'
import TmpViewer from './preview/TmpViewer'
import VxlViewer from './preview/VxlViewer'
import VxlViewer3D from './preview/VxlViewer3D.tsx'
import HvaViewer from './preview/HvaViewer'
import MixDirectoryViewer from './preview/MixDirectoryViewer'
import WavViewer from './preview/WavViewer'
import MapViewer from './preview/MapViewer'
import BikViewer from './preview/BikViewer'
import type { ResourceContext } from '../services/gameRes/ResourceContext'
import { useLocale } from '../i18n/LocaleContext'
import type { PreviewEditorHandle, PreviewTarget } from './preview/types'

type MixFileData = { file: File; info: MixFileInfo }

interface PreviewPanelProps {
  selectedFile: string | null
  mixFiles: MixFileData[]
  target?: PreviewTarget | null
  breadcrumbs?: string[]
  onBreadcrumbClick?: (index: number) => void
  resourceContext?: ResourceContext | null
  onOpenMetadataDrawer?: () => void
  metadataDrawerOpen?: boolean
  onEnterCurrentMix?: () => void
  canEnterCurrentMix?: boolean
  onRenameFile?: () => void
  onDeleteFile?: () => void
  canModifyFile?: boolean
  actionsDisabled?: boolean
  onSaveFile?: () => void
  onDiscardChanges?: () => void
  canSaveSelectedFile?: boolean
  hasUnsavedChanges?: boolean
  textValue?: string
  textLoading?: boolean
  textError?: string | null
  onTextChange?: (next: string) => void
  onBeforeViewChange?: (nextView: string) => Promise<boolean> | boolean
  onOpenRawExport?: () => void
  onOpenImageExport?: () => void
  onEditorReady?: (handle: PreviewEditorHandle | null) => void
  /**
   * 命中条件 (project mode + 选中的是空 .shp) 时，预览区不再走 ShpViewer，
   * 而是渲染 CameoEditor。命中后保存按钮回调走 onSaveCameo，cameoSaving 控制写盘中状态。
   */
  isCameoCreationCandidate?: boolean
  onSaveCameo?: (shpBytes: Uint8Array) => void | Promise<void>
  cameoSaving?: boolean
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  selectedFile,
  mixFiles,
  target,
  breadcrumbs,
  onBreadcrumbClick,
  resourceContext,
  onOpenMetadataDrawer,
  metadataDrawerOpen = false,
  onEnterCurrentMix,
  canEnterCurrentMix = false,
  onRenameFile,
  onDeleteFile,
  canModifyFile = false,
  actionsDisabled = false,
  onSaveFile,
  onDiscardChanges,
  canSaveSelectedFile = false,
  hasUnsavedChanges = false,
  textValue,
  textLoading = false,
  textError = null,
  onTextChange,
  onBeforeViewChange,
  onOpenRawExport,
  onOpenImageExport,
  onEditorReady,
  isCameoCreationCandidate = false,
  onSaveCameo,
  cameoSaving = false,
}) => {
  const { t } = useLocale()

  const getFileTypeIcon = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase()

    switch (extension) {
      case 'ini':
      case 'pkt':
        return <FileText size={48} className="text-gray-300" />
      case 'shp':
        return <Image size={48} className="text-blue-400" />
      case 'vxl':
        return <Box size={48} className="text-green-400" />
      case 'pcx':
        return <Image size={48} className="text-purple-400" />
      case 'tmp':
      case 'tem':
      case 'sno':
      case 'urb':
      case 'ubn':
      case 'des':
      case 'lun':
        return <Image size={48} className="text-orange-400" />
      case 'wav':
        return <Music size={48} className="text-yellow-400" />
      case 'bik':
        return <Video size={48} className="text-rose-400" />
      case 'csf':
        return <FileText size={48} className="text-sky-400" />
      case 'map':
      case 'mpr':
        return <Image size={48} className="text-emerald-400" />
      case 'mix':
      case 'mmx':
      case 'yro':
        return <Archive size={48} className="text-cyan-400" />
      default:
        return <FileText size={48} className="text-gray-400" />
    }
  }

  const getFileTypeName = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase()
    const keyMap: Record<string, string> = {
      ini: 'preview.fileType_ini', pkt: 'preview.fileType_pkt', txt: 'preview.fileType_txt', csf: 'preview.fileType_csf',
      pal: 'preview.fileType_pal', shp: 'preview.fileType_shp', vxl: 'preview.fileType_vxl',
      pcx: 'preview.fileType_pcx', wav: 'preview.fileType_wav', bik: 'preview.fileType_bik',
      map: 'preview.fileType_map', mpr: 'preview.fileType_map',
      mix: 'preview.fileType_mix', mmx: 'preview.fileType_mix', yro: 'preview.fileType_mix',
    }
    const key = extension ? (keyMap[extension] ?? (['tmp','tem','sno','urb','ubn','des','lun'].includes(extension) ? 'preview.fileType_tmp' : 'preview.fileType_unknown')) : 'preview.fileType_unknown'
    return t(key as 'preview.fileType_ini')
  }

  const displayPath = useMemo(() => target?.displayPath ?? selectedFile ?? '', [selectedFile, target])
  const displayName = useMemo(() => {
    if (target?.kind === 'project-file') {
      return target.relativePath.split('/').pop() ?? target.relativePath
    }
    if (target?.kind === 'mix-entry' || target?.kind === 'base-mix-entry') {
      return target.entryName
    }
    return selectedFile?.split('/').pop() ?? ''
  }, [selectedFile, target])
  const ext = useMemo(
    () => target?.extension ?? selectedFile?.split('.').pop()?.toLowerCase() ?? '',
    [selectedFile, target],
  )

  type ViewerDef = {
    key: string
    label: string
    Component: React.ComponentType<any>
  }
  const tmpViews: ViewerDef[] = [
    { key: 'image', label: t('viewLabels.image'), Component: TmpViewer },
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const mixViews: ViewerDef[] = [
    { key: 'directory', label: t('viewLabels.directory'), Component: MixDirectoryViewer },
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const mapViews: ViewerDef[] = [
    { key: 'minimap', label: t('viewLabels.minimap'), Component: MapViewer },
    { key: 'text', label: t('viewLabels.text'), Component: IniViewer },
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const viewsByExt: Record<string, ViewerDef[]> = {
    ini: [
      { key: 'text', label: t('viewLabels.text'), Component: IniViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    pkt: [
      { key: 'text', label: t('viewLabels.text'), Component: IniViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    dat: [
      { key: 'auto', label: t('viewLabels.lmdAuto'), Component: DatViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    txt: [
      { key: 'text', label: t('viewLabels.text'), Component: TxtViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    csf: [
      { key: 'viewer', label: 'CSF', Component: CsfViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    pal: [
      { key: 'swatches', label: t('viewLabels.swatches'), Component: PalViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    shp: [
      { key: 'image', label: t('viewLabels.image'), Component: ShpViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    vxl: [
      { key: 'viewer2d', label: t('viewLabels.viewer2d'), Component: VxlViewer },
      { key: 'viewer3d', label: t('viewLabels.viewer3d'), Component: VxlViewer3D },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    pcx: [
      { key: 'image', label: t('viewLabels.image'), Component: PcxViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    wav: [
      { key: 'audio', label: t('viewLabels.audio'), Component: WavViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    bik: [
      { key: 'video', label: t('viewLabels.video'), Component: BikViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    hva: [
      { key: 'viewer', label: t('viewLabels.viewer3d'), Component: HvaViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    mix: mixViews,
    mmx: mixViews,
    yro: mixViews,
    map: mapViews,
    mpr: mapViews,
    tmp: tmpViews,
    tem: tmpViews,
    sno: tmpViews,
    urb: tmpViews,
    ubn: tmpViews,
    des: tmpViews,
    lun: tmpViews,
  }
  const defaultViews: ViewerDef[] = [
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const available = useMemo(() => viewsByExt[ext] ?? defaultViews, [ext])
  const [activeView, setActiveView] = useState<string>(available[0].key)
  useEffect(() => {
    setActiveView(available[0].key)
  }, [available])

  // 旧的 INI 本地状态已移入 IniViewer 组件

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <FileText size={64} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">{t('preview.selectFile')}</p>
          <p className="text-sm mt-2">{t('preview.selectFileHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col"
      data-context-kind="preview-selection"
      data-file-path={displayPath}
      data-is-mix-file={String(ext === 'mix' || ext === 'mmx' || ext === 'yro')}
    >
      {/* 预览头部：文件信息 + 文件操作区 */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
          {getFileTypeIcon(displayPath)}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold truncate">{displayName}</h3>
              <button
                type="button"
                onClick={() => onOpenMetadataDrawer?.()}
                className={`inline-flex items-center justify-center p-1 rounded transition-colors ${
                  metadataDrawerOpen
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
                title={t('preview.metadataAria')}
                aria-label={t('preview.metadataAria')}
                aria-pressed={metadataDrawerOpen}
              >
                <Info size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-400">{getFileTypeName(displayPath)}</p>
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs bg-blue-700 hover:bg-blue-600 text-white inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onSaveFile?.()}
              disabled={!canSaveSelectedFile || !hasUnsavedChanges || actionsDisabled}
            >
              <Save size={14} />
              {t('preview.saveFile')}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-100 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onDiscardChanges?.()}
              disabled={!canSaveSelectedFile || !hasUnsavedChanges || actionsDisabled}
            >
              <RotateCcw size={14} />
              {t('preview.discardChanges')}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-100 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onRenameFile?.()}
              disabled={!canModifyFile || actionsDisabled}
            >
              <Pencil size={14} />
              {t('preview.renameFile')}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs bg-red-700 hover:bg-red-600 text-white inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onDeleteFile?.()}
              disabled={!canModifyFile || actionsDisabled}
            >
              <Trash2 size={14} />
              {t('preview.deleteFile')}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-100 inline-flex items-center gap-1"
              onClick={() => onOpenRawExport?.()}
            >
              <Download size={14} />
              {t('preview.rawExport')}
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded text-xs inline-flex items-center gap-1 ${
                ext === 'shp'
                  ? 'bg-blue-700 hover:bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
              onClick={() => {
                if (ext !== 'shp') return
                onOpenImageExport?.()
              }}
              disabled={ext !== 'shp'}
              title={ext === 'shp' ? t('preview.imageGifExportTitle') : t('preview.shpOnlyHint')}
            >
              <Image size={14} />
              {t('preview.imageGifExport')}
            </button>
          </div>
        </div>
      </div>

      {/* 视图切换 */}
      <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
        <span className="text-xs text-gray-400">{t('preview.viewLabel')}:</span>
        <div className="flex flex-wrap gap-2">
          {available.map(v => (
            <button
              key={v.key}
              className={`px-2 py-1 text-xs rounded ${activeView === v.key ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
              onClick={() => {
                void (async () => {
                  if (v.key === activeView) return
                  const allowed = await onBeforeViewChange?.(v.key)
                  if (allowed === false) return
                  setActiveView(v.key)
                })()
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* 预览内容区域 */}
      <div className="flex-1 overflow-hidden">
        <div className="bg-gray-800 h-full w-full overflow-hidden">
          {(() => {
            const Viewer = available.find(v => v.key === activeView)?.Component ?? available[0].Component
            if (!selectedFile) return null
            if ((ext === 'pkt' || ext === 'ini') && activeView === 'text') {
              return (
                <IniViewer
                  selectedFile={selectedFile}
                  mixFiles={mixFiles}
                  target={target}
                  resourceContext={resourceContext}
                  value={textValue}
                  loadingOverride={textLoading}
                  errorOverride={textError}
                  onChange={onTextChange}
                  // 保存等异步动作进行中时（actionsDisabled），同时锁住编辑器，避免改了一半触发竞态
                  readOnly={!canSaveSelectedFile || actionsDisabled}
                  onEditorReady={onEditorReady}
                />
              )
            }
            if (ext === 'txt' && activeView === 'text') {
              return (
                <TxtViewer
                  selectedFile={selectedFile}
                  mixFiles={mixFiles}
                  target={target}
                  resourceContext={resourceContext}
                  value={textValue}
                  loadingOverride={textLoading}
                  errorOverride={textError}
                  onChange={onTextChange}
                  readOnly={!canSaveSelectedFile || actionsDisabled}
                  onEditorReady={onEditorReady}
                />
              )
            }
            if (
              (ext === 'mix' || ext === 'mmx' || ext === 'yro')
              && activeView === 'directory'
            ) {
              return (
                <MixDirectoryViewer
                  selectedFile={selectedFile}
                  mixFiles={mixFiles}
                  target={target}
                  resourceContext={resourceContext}
                  onEnterCurrentMix={onEnterCurrentMix}
                  canEnterCurrentMix={canEnterCurrentMix}
                />
              )
            }
            // 空 .shp 文件 → Cameo 编辑器（替代默认的 ShpViewer 解析失败占位）
            if (ext === 'shp' && isCameoCreationCandidate && onSaveCameo) {
              return (
                <CameoEditor
                  paletteHint={{
                    mixFiles,
                    resourceContext: resourceContext ?? null,
                  }}
                  filenameHint={selectedFile.split('/').pop()}
                  onSave={onSaveCameo}
                  saving={cameoSaving}
                />
              )
            }
            return (
              <Viewer
                selectedFile={selectedFile}
                mixFiles={mixFiles}
                target={target}
                resourceContext={resourceContext}
              />
            )
          })()}
        </div>
      </div>

      {/* 预览底部：路径导航 + 当前文件 */}
      <div className="p-2 border-t border-gray-700 space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="text-xs text-gray-300 flex flex-wrap items-center gap-1">
            {breadcrumbs.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <button
                  className="hover:text-white disabled:text-gray-400 focus:outline-none"
                  onClick={() => onBreadcrumbClick && onBreadcrumbClick(i)}
                >
                  {seg}
                </button>
                {i < breadcrumbs.length - 1 && <span className="text-gray-500">/</span>}
              </span>
            ))}
          </div>
        )}
        <div>
          <span className="text-xs text-gray-400">{t('preview.viewingFile', { name: displayName })}</span>
        </div>
      </div>
    </div>
  )
}

export default PreviewPanel
