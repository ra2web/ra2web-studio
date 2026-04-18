import React, { useEffect, useRef, useState } from 'react'
import { FolderOpen, Download, Settings, FolderPlus, Trash2, PackagePlus, Languages } from 'lucide-react'
import { useLocale } from '../i18n/LocaleContext'

interface ToolbarProps {
  mixFiles: string[]
  loading?: boolean
  onExportTopMix?: () => void
  onExportCurrentMix?: () => void
  onOpenCurrentMixImportPicker?: () => void
  onReimportBaseDirectory: () => void | Promise<void>
  onOpenBaseArchivePicker?: () => void
  onOpenPatchPicker?: () => void
  onClearNonBaseResources: () => void | Promise<void>
  resourceReady: boolean
  resourceSummary?: string
}

const Toolbar: React.FC<ToolbarProps> = ({
  mixFiles,
  loading,
  onExportTopMix,
  onExportCurrentMix,
  onOpenCurrentMixImportPicker,
  onReimportBaseDirectory,
  onOpenBaseArchivePicker,
  onOpenPatchPicker,
  onClearNonBaseResources,
  resourceReady,
  resourceSummary,
}) => {
  const { t, locale, setLocale } = useLocale()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!settingsMenuRef.current) return
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const handleExportTopMix = () => {
    onExportTopMix?.()
  }

  const handleExportCurrentMix = () => {
    onExportCurrentMix?.()
  }

  const handleReimportBaseDirectoryFromSettings = () => {
    setSettingsOpen(false)
    void onReimportBaseDirectory()
  }

  const handleReimportBaseArchivesFromSettings = () => {
    setSettingsOpen(false)
    onOpenBaseArchivePicker?.()
  }

  return (
    <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => onOpenPatchPicker?.()}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!resourceReady || !!loading}
          title={!resourceReady ? t('toolbar.importGameFirst') : ''}
        >
          <PackagePlus size={16} />
          <span>{t('toolbar.importMix')}</span>
        </button>
        <button
          onClick={() => onClearNonBaseResources()}
          className="flex items-center space-x-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!!loading}
          title={t('toolbar.clearPatchesOnly')}
        >
          <Trash2 size={16} />
          <span>{t('toolbar.clearPatches')}</span>
        </button>

        <button
          onClick={handleExportTopMix}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!mixFiles.length || !!loading}
        >
          <Download size={16} />
          <span>{t('toolbar.exportTopMix')}</span>
        </button>

        <button
          onClick={handleExportCurrentMix}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!mixFiles.length || !!loading}
        >
          <Download size={16} />
          <span>{t('toolbar.exportCurrentMix')}</span>
        </button>

        <button
          onClick={() => onOpenCurrentMixImportPicker?.()}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!mixFiles.length || !!loading}
        >
          <FolderPlus size={16} />
          <span>{t('toolbar.importToCurrentMix')}</span>
        </button>
      </div>

      <div className="flex-1 text-xs text-gray-400 text-right truncate px-4">
        {resourceSummary ?? (resourceReady ? t('toolbar.resourceReady') : t('toolbar.waitingImport'))}
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative" ref={settingsMenuRef}>
          <button
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            disabled={!!loading}
          >
            <Settings size={16} />
            <span>{t('toolbar.settings')}</span>
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded border border-gray-600 bg-gray-800 shadow-lg z-20">
              <div className="px-3 py-2 border-b border-gray-700">
                <div className="text-xs font-semibold text-gray-200">{t('toolbar.systemConfig')}</div>
                <div className="text-[11px] text-gray-400 mt-1">{t('toolbar.baseFileManage')}</div>
              </div>
              <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
                <Languages size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-400 flex-shrink-0">{t('settings.language')}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-xs rounded ${locale === 'zh' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    onClick={() => setLocale('zh')}
                  >
                    {t('settings.languageZh')}
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 text-xs rounded ${locale === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    onClick={() => setLocale('en')}
                  >
                    {t('settings.languageEn')}
                  </button>
                </div>
              </div>
              <button
                onClick={handleReimportBaseDirectoryFromSettings}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-left hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!!loading}
              >
                <FolderPlus size={15} />
                <span>{t('toolbar.reimportBaseDir')}</span>
              </button>
              <button
                onClick={handleReimportBaseArchivesFromSettings}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-left hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!!loading}
              >
                <FolderOpen size={15} />
                <span>{t('toolbar.reimportBaseArchives')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Toolbar
