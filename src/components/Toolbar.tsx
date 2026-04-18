import React, { useEffect, useRef, useState } from 'react'
import {
  ArchiveRestore,
  Boxes,
  Languages,
  Plus,
  Search,
  Settings,
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
  loading?: boolean
  projects: ProjectSummary[]
  activeProjectName: string | null
  onActiveProjectChange?: (projectName: string) => void
  /** 创建新项目（项目模式下，作为项目选择器旁的快捷按钮）。 */
  onCreateProject?: () => void
  /**
   * 渲染在搜索框正下方的下拉内容（例如全局搜索结果面板）。
   * 由父组件按需控制是否展示；为 null/undefined 时不渲染。
   */
  searchDropdownSlot?: React.ReactNode
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
    ? 'inline-flex h-full w-11 items-center justify-center text-red-300 transition-colors hover:bg-red-900/40 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40'
    : active
      ? 'inline-flex h-full w-11 items-center justify-center bg-blue-600 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40'
      : 'inline-flex h-full w-11 items-center justify-center text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={16} />
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
  loading,
  projects,
  activeProjectName,
  onActiveProjectChange,
  onCreateProject,
  searchDropdownSlot,
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
    <div className="relative z-50 h-11 border-b border-gray-700 bg-gray-800">
      <div className="flex h-full items-stretch">
        {studioMode === 'projects' && (
          <div className="flex h-full items-center border-r border-gray-700">
            {projects.length > 0 ? (
              <SearchableSelect
                value={activeProjectName ?? projects[0]?.name ?? ''}
                options={projectOptions}
                onChange={(next) => onActiveProjectChange?.(next)}
                rootClassName="relative h-full"
                triggerClassName="inline-flex h-full w-[20rem] max-w-[28rem] items-center gap-2 px-3 text-left text-sm text-gray-100 transition-colors hover:bg-gray-700"
                triggerTitle={currentProjectLabel}
                triggerAriaLabel={currentProjectLabel}
                renderTriggerContent={(selected) => (
                  <>
                    <Boxes size={16} className="flex-shrink-0 text-blue-300" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {selected?.label ?? t('toolbar.noProjects')}
                    </span>
                  </>
                )}
                menuClassName="z-50 w-[20rem] rounded border border-gray-600 bg-gray-800 shadow-2xl overflow-hidden"
                searchPlaceholder={t('toolbar.searchProjectPlaceholder')}
                noResultsText={t('toolbar.noProjects')}
                footerHint=""
              />
            ) : (
              <div
                className="inline-flex h-full w-[20rem] items-center gap-2 px-3 text-sm text-gray-400"
                aria-label={t('toolbar.noProjects')}
                title={t('toolbar.noProjects')}
              >
                <Boxes size={16} className="flex-shrink-0" />
                <span className="truncate">{t('toolbar.noProjects')}</span>
              </div>
            )}
            <div className="flex h-full items-center border-l border-gray-700">
              <ToolbarIconButton
                icon={Plus}
                label={t('toolbar.createProject')}
                onClick={() => onCreateProject?.()}
                disabled={!!loading}
              />
            </div>
          </div>
        )}

        {/* 占位填充：把搜索栏推到右侧紧贴按钮组 */}
        <div className="min-w-0 flex-1" aria-hidden />

        <div className="relative h-full w-[28rem] flex-shrink-0 border-l border-gray-700">
          <label
            className={`group flex h-full items-center px-3 transition-colors ${
              searchActive ? 'bg-gray-900/70' : 'hover:bg-gray-800/60'
            }`}
          >
            <Search
              size={16}
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
            <span className="ml-3 hidden text-[10px] uppercase tracking-[0.2em] text-gray-500 md:inline">
              Esc
            </span>
          </label>
          {searchDropdownSlot && (
            <div
              className="absolute left-0 right-0 top-full z-50"
              data-context-kind="global-shell"
            >
              {searchDropdownSlot}
            </div>
          )}
        </div>

        <div className="flex h-full items-center border-l border-gray-700">
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

          <div className="relative h-full" ref={settingsMenuRef}>
            <ToolbarIconButton
              icon={Settings}
              label={t('toolbar.settings')}
              onClick={() => setSettingsOpen((prev) => !prev)}
              disabled={!!loading}
            />
            {settingsOpen && (
              <div className="absolute right-0 top-full z-20 w-72 rounded border border-gray-600 bg-gray-800 shadow-2xl">
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
