import React from 'react'
import {
  Archive,
  Download,
  FilePlus,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  PackagePlus,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'
import { useLocale } from '../i18n/LocaleContext'
import type { StudioMode } from '../types/studio'

type WorkspaceStudioMode = Exclude<StudioMode, 'search'>

interface ActionSidebarProps {
  studioMode: WorkspaceStudioMode
  loading?: boolean
  mixFiles: string[]
  activeProjectName: string | null
  // Base mode callbacks
  onOpenBaseArchivePicker?: () => void
  onReimportBaseDirectory: () => void | Promise<void>
  onExportTopMix?: () => void
  onExportCurrentMix?: () => void
  onAddSelectionToProject?: () => void
  canAddSelectionToProject?: boolean
  // Projects mode callbacks
  onRenameProject?: () => void
  onDeleteProject?: () => void
  onExportProjectZip?: () => void
  onOpenProjectArchivePicker?: () => void
  onCreateProjectFolder?: () => void
  onCreateProjectFile?: () => void
}

type SidebarIconButtonProps = {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  disabled?: boolean
  danger?: boolean
  onClick?: () => void
}

const SidebarIconButton: React.FC<SidebarIconButtonProps> = ({
  icon: Icon,
  label,
  disabled,
  danger = false,
  onClick,
}) => {
  const className = danger
    ? 'group inline-flex h-10 w-10 items-center justify-center text-red-300 transition-colors hover:bg-red-900/40 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40'
    : 'group inline-flex h-10 w-10 items-center justify-center text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'

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

const SidebarDivider: React.FC = () => (
  <div className="my-1 h-px w-7 bg-gray-700/70" aria-hidden />
)

const ActionSidebar: React.FC<ActionSidebarProps> = ({
  studioMode,
  loading,
  mixFiles,
  activeProjectName,
  onOpenBaseArchivePicker,
  onReimportBaseDirectory,
  onExportTopMix,
  onExportCurrentMix,
  onAddSelectionToProject,
  canAddSelectionToProject = false,
  onRenameProject,
  onDeleteProject,
  onExportProjectZip,
  onOpenProjectArchivePicker,
  onCreateProjectFolder,
  onCreateProjectFile,
}) => {
  const { t } = useLocale()

  return (
    <div
      className="flex w-14 flex-shrink-0 flex-col items-center gap-1.5 border-r border-gray-700 bg-gray-800 py-3"
      data-context-kind="action-sidebar"
      data-studio-mode={studioMode}
    >
      {studioMode === 'base' && (
        <>
          <SidebarIconButton
            icon={FolderOpen}
            label={t('toolbar.reimportBaseArchives')}
            onClick={() => onOpenBaseArchivePicker?.()}
            disabled={!!loading}
          />
          <SidebarIconButton
            icon={Upload}
            label={t('toolbar.reimportBaseDir')}
            onClick={() => void onReimportBaseDirectory()}
            disabled={!!loading}
          />
          <SidebarDivider />
          <SidebarIconButton
            icon={Download}
            label={t('toolbar.exportTopMix')}
            onClick={() => onExportTopMix?.()}
            disabled={!mixFiles.length || !!loading}
          />
          <SidebarIconButton
            icon={Archive}
            label={t('toolbar.exportCurrentMix')}
            onClick={() => onExportCurrentMix?.()}
            disabled={!mixFiles.length || !!loading}
          />
          <SidebarDivider />
          <SidebarIconButton
            icon={PackagePlus}
            label={t('toolbar.addToProject')}
            onClick={() => onAddSelectionToProject?.()}
            disabled={!!loading || !canAddSelectionToProject}
          />
        </>
      )}

      {studioMode === 'projects' && (
        <>
          <SidebarIconButton
            icon={Pencil}
            label={t('toolbar.renameProject')}
            onClick={() => onRenameProject?.()}
            disabled={!!loading || !activeProjectName}
          />
          <SidebarIconButton
            icon={Trash2}
            label={t('toolbar.deleteProject')}
            onClick={() => onDeleteProject?.()}
            disabled={!!loading || !activeProjectName}
            danger
          />
          <SidebarDivider />
          <SidebarIconButton
            icon={Archive}
            label={t('toolbar.exportProjectZip')}
            onClick={() => onExportProjectZip?.()}
            disabled={!!loading || !activeProjectName}
          />
          <SidebarIconButton
            icon={FilePlus2}
            label={t('toolbar.importProjectFiles')}
            onClick={() => onOpenProjectArchivePicker?.()}
            disabled={!!loading || !activeProjectName}
          />
          <SidebarDivider />
          <SidebarIconButton
            icon={FolderPlus}
            label={t('toolbar.createProjectFolder')}
            onClick={() => onCreateProjectFolder?.()}
            disabled={!!loading || !activeProjectName}
          />
          <SidebarIconButton
            icon={FilePlus}
            label={t('toolbar.createProjectFile')}
            onClick={() => onCreateProjectFile?.()}
            disabled={!!loading || !activeProjectName}
          />
        </>
      )}
    </div>
  )
}

export default ActionSidebar
