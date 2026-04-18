import React, { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Boxes,
  Download,
  FilePlus2,
  FolderOpen,
  Languages,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react'
import { useLocale } from '../i18n/LocaleContext'
import SearchableSelect from './common/SearchableSelect'
import type { ProjectSummary, StudioMode } from '../types/studio'

type WorkspaceStudioMode = Exclude<StudioMode, 'search'>

interface ToolbarProps {
  studioMode: WorkspaceStudioMode
  onStudioModeChange: (mode: WorkspaceStudioMode) => void
  searchQuery: string
  searchActive: boolean
  onSearchQueryChange: (query: string) => void
  onSearchActivate?: () => void
  onSearchClear?: () => void
  mixFiles: string[]
  loading?: boolean
  onExportTopMix?: () => void
  onExportCurrentMix?: () => void
  onOpenCurrentMixImportPicker?: () => void
  onReimportBaseDirectory: () => void | Promise<void>
  onOpenBaseArchivePicker?: () => void
  onOpenProjectArchivePicker?: () => void
  onCreateProject?: () => void
  onRenameProject?: () => void
  onDeleteProject?: () => void
  onExportProjectZip?: () => void
  onAddSelectionToProject?: () => void
  canAddSelectionToProject?: boolean
  projects: ProjectSummary[]
  activeProjectName: string | null
  onActiveProjectChange?: (projectName: string) => void
}

type ToolbarIconButtonProps = {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  disabled?: boolean
  active?: boolean
  danger?: boolean
  onClick?: () => void
}

const ToolbarIconButton: React.FC<ToolbarIconButtonProps> = ({
  icon: Icon,
  label,
  disabled,
  active = false,
  danger = false,
  onClick,
}) => {
  const className = danger
    ? 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/40 bg-red-900/35 text-red-100 transition-colors hover:bg-red-800/60 disabled:cursor-not-allowed disabled:opacity-50'
    : active
      ? 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/70 bg-blue-600 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.22)] transition-colors disabled:cursor-not-allowed disabled:opacity-50'
      : 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-700 bg-gray-800/90 text-gray-200 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={17} />
      <span className="sr-only">{label}</span>
    </button>
  )
}

const Toolbar: React.FC<ToolbarProps> = ({
  studioMode,
  onStudioModeChange,
  searchQuery,
  searchActive,
  onSearchQueryChange,
  onSearchActivate,
  onSearchClear,
  mixFiles,
  loading,
  onExportTopMix,
  onExportCurrentMix,
  onOpenCurrentMixImportPicker,
  onReimportBaseDirectory,
  onOpenBaseArchivePicker,
  onOpenProjectArchivePicker,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onExportProjectZip,
  onAddSelectionToProject,
  canAddSelectionToProject = false,
  projects,
  activeProjectName,
  onActiveProjectChange,
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

  const projectOptions = projects.map((project) => ({
    value: project.name,
    label: project.name,
    searchText: `${project.fileCount}`,
  }))

  const currentProjectLabel = activeProjectName
    ? `${t('toolbar.projectMode')} · ${activeProjectName}`
    : t('toolbar.projectMode')

  return (
    <div className="h-16 border-b border-gray-700 bg-gray-800 px-4">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(18rem,34rem)_auto] items-center gap-4">
        <div className="min-w-0 overflow-x-auto">
          <div className="flex min-w-max items-center gap-1.5 pr-2">
            {studioMode === 'base' && (
              <>
                <ToolbarIconButton
                  icon={FolderOpen}
                  label={t('toolbar.reimportBaseArchives')}
                  onClick={() => onOpenBaseArchivePicker?.()}
                  disabled={!!loading}
                />
                <ToolbarIconButton
                  icon={Upload}
                  label={t('toolbar.reimportBaseDir')}
                  onClick={() => void onReimportBaseDirectory()}
                  disabled={!!loading}
                />
                <ToolbarIconButton
                  icon={Download}
                  label={t('toolbar.exportTopMix')}
                  onClick={() => onExportTopMix?.()}
                  disabled={!mixFiles.length || !!loading}
                />
                <ToolbarIconButton
                  icon={Archive}
                  label={t('toolbar.exportCurrentMix')}
                  onClick={() => onExportCurrentMix?.()}
                  disabled={!mixFiles.length || !!loading}
                />
                <ToolbarIconButton
                  icon={PackagePlus}
                  label={t('toolbar.addToProject')}
                  onClick={() => onAddSelectionToProject?.()}
                  disabled={!!loading || !canAddSelectionToProject}
                />
              </>
            )}

            {studioMode === 'projects' && (
              <>
                {projects.length > 0 ? (
                  <SearchableSelect
                    value={activeProjectName ?? projects[0]?.name ?? ''}
                    options={projectOptions}
                    onChange={(next) => onActiveProjectChange?.(next)}
                    triggerClassName="inline-flex h-10 min-w-[15rem] max-w-[22rem] items-center gap-2 rounded-xl border border-blue-500/30 bg-gradient-to-r from-gray-800 via-gray-800 to-slate-800 px-3 text-left text-sm text-gray-100 shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-colors hover:border-blue-400/50 hover:bg-gray-700"
                    triggerTitle={currentProjectLabel}
                    triggerAriaLabel={currentProjectLabel}
                    renderTriggerContent={(selected) => (
                      <>
                        <Boxes size={17} className="flex-shrink-0 text-blue-300" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {selected?.label ?? t('toolbar.noProjects')}
                        </span>
                      </>
                    )}
                    menuClassName="z-50 w-80 rounded-xl border border-gray-600 bg-gray-800 shadow-2xl"
                    searchPlaceholder={t('toolbar.searchProjectPlaceholder')}
                    noResultsText={t('toolbar.noProjects')}
                    footerHint=""
                  />
                ) : (
                  <div
                    className="inline-flex h-10 min-w-[15rem] items-center gap-2 rounded-xl border border-gray-700 bg-gray-800/90 px-3 text-sm text-gray-400"
                    aria-label={t('toolbar.noProjects')}
                    title={t('toolbar.noProjects')}
                  >
                    <Boxes size={17} className="flex-shrink-0" />
                    <span className="truncate">{t('toolbar.noProjects')}</span>
                  </div>
                )}
                <ToolbarIconButton
                  icon={Plus}
                  label={t('toolbar.createProject')}
                  onClick={() => onCreateProject?.()}
                  disabled={!!loading}
                />
                <ToolbarIconButton
                  icon={Pencil}
                  label={t('toolbar.renameProject')}
                  onClick={() => onRenameProject?.()}
                  disabled={!!loading || !activeProjectName}
                />
                <ToolbarIconButton
                  icon={Trash2}
                  label={t('toolbar.deleteProject')}
                  onClick={() => onDeleteProject?.()}
                  disabled={!!loading || !activeProjectName}
                  danger
                />
                <ToolbarIconButton
                  icon={Archive}
                  label={t('toolbar.exportProjectZip')}
                  onClick={() => onExportProjectZip?.()}
                  disabled={!!loading || !activeProjectName}
                />
                <ToolbarIconButton
                  icon={FilePlus2}
                  label={t('toolbar.importProjectFiles')}
                  onClick={() => onOpenProjectArchivePicker?.()}
                  disabled={!!loading || !activeProjectName}
                />
                <ToolbarIconButton
                  icon={Download}
                  label={t('toolbar.exportTopMix')}
                  onClick={() => onExportTopMix?.()}
                  disabled={!mixFiles.length || !!loading || !activeProjectName}
                />
                <ToolbarIconButton
                  icon={ArchiveRestore}
                  label={t('toolbar.exportCurrentMix')}
                  onClick={() => onExportCurrentMix?.()}
                  disabled={!mixFiles.length || !!loading || !activeProjectName}
                />
                <ToolbarIconButton
                  icon={PackagePlus}
                  label={t('toolbar.importToCurrentMix')}
                  onClick={() => onOpenCurrentMixImportPicker?.()}
                  disabled={!mixFiles.length || !!loading || !activeProjectName}
                />
              </>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <label
            className={`group flex h-11 items-center rounded-2xl border px-3 transition-all ${
              searchActive
                ? 'border-blue-400/70 bg-gray-950 shadow-[0_0_0_1px_rgba(96,165,250,0.25)]'
                : 'border-gray-700 bg-gray-900/90 hover:border-gray-500'
            }`}
          >
            <Search
              size={17}
              className={`mr-2 flex-shrink-0 transition-colors ${
                searchActive ? 'text-blue-300' : 'text-gray-400 group-hover:text-gray-300'
              }`}
            />
            <input
              data-testid="global-search-input"
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onFocus={() => onSearchActivate?.()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onSearchClear?.()
                }
              }}
              placeholder={t('search.placeholder')}
              aria-label={t('search.title')}
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
            />
            <span className="ml-3 hidden rounded-md border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gray-500 md:inline">
              Esc
            </span>
          </label>
        </div>

        <div className="flex items-center gap-1.5 justify-self-end">
          <ToolbarIconButton
            icon={ArchiveRestore}
            label={t('toolbar.baseMode')}
            active={studioMode === 'base'}
            onClick={() => onStudioModeChange('base')}
          />
          <ToolbarIconButton
            icon={Boxes}
            label={t('toolbar.projectMode')}
            active={studioMode === 'projects'}
            onClick={() => onStudioModeChange('projects')}
          />

          <div className="relative" ref={settingsMenuRef}>
            <ToolbarIconButton
              icon={Settings}
              label={t('toolbar.settings')}
              onClick={() => setSettingsOpen((prev) => !prev)}
              disabled={!!loading}
            />
            {settingsOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-gray-600 bg-gray-800 shadow-2xl">
                <div className="border-b border-gray-700 px-3 py-2">
                  <div className="text-xs font-semibold text-gray-200">{t('toolbar.systemConfig')}</div>
                  <div className="mt-1 text-[11px] text-gray-400">{t('toolbar.baseFileManage')}</div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2">
                  <Languages size={14} className="flex-shrink-0 text-gray-400" />
                  <span className="flex-shrink-0 text-xs text-gray-400">{t('settings.language')}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 text-xs ${locale === 'zh' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      onClick={() => setLocale('zh')}
                    >
                      {t('settings.languageZh')}
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 text-xs ${locale === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      onClick={() => setLocale('en')}
                    >
                      {t('settings.languageEn')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Toolbar
