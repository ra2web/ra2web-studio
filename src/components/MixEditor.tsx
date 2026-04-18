import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Toolbar from './Toolbar'
import FileTree from './FileTree'
import ProjectExplorer from './ProjectExplorer'
import MixExplorer from './MixExplorer'
import GlobalSearchPanel from './GlobalSearchPanel'
import PreviewPanel from './PreviewPanel'
import PropertiesPanel from './PropertiesPanel'
import ImportProgressPanel from './ImportProgressPanel'
import ExportDialog from './export/ExportDialog'
import { MixParser, MixFileInfo } from '../services/MixParser'
import { VirtualFile } from '../data/vfs/VirtualFile'
import { DataStream } from '../data/DataStream'
import { MixFile as MixFileDataStream } from '../data/MixFile'
import { GameResBootstrap } from '../services/gameRes/GameResBootstrap'
import { GameResConfig } from '../services/gameRes/GameResConfig'
import { FileSystemUtil } from '../services/gameRes/FileSystemUtil'
import type { ResourceContext, ResourceLoadProgressEvent } from '../services/gameRes/ResourceContext'
import {
  getResourcePathBasename,
  getResourcePathExtension,
  isMixLikeFile,
  normalizeResourceFilename,
  normalizeResourcePath,
} from '../services/gameRes/patterns'
import {
  MixArchiveBuilder,
  type MixArchiveBuilderEntry,
  type MixArchiveLmdSummary,
} from '../services/mixEdit/MixArchiveBuilder'
import { bytesToBlob, triggerBrowserDownload } from '../services/export/utils'
import { useAppDialog } from './common/AppDialogProvider'
import { useLocale } from '../i18n/LocaleContext'
import AppContextMenu from './common/AppContextMenu'
import {
  buildContextMenuItems,
  type ContextMenuBuildState,
  type ContextMenuCommandId,
  type ContextMenuTarget,
  resolveContextMenuTarget,
} from './common/contextMenuModel'
import {
  createInitialGameResImportSteps,
  GAME_RES_IMPORT_STAGE_ORDER,
} from '../services/gameRes/types'
import type { GameResImportProgressEvent, GameResImportStepState } from '../services/gameRes/types'
import { resolvePreviewFile } from './preview/previewFileResolver'
import type { PreviewEditorHandle, PreviewTarget } from './preview/types'
import { ProjectService } from '../services/projects/ProjectService'
import { GlobalSearchService } from '../services/search/GlobalSearchService'
import type {
  GlobalSearchResult,
  ProjectFileEntry,
  ProjectSelectionTarget,
  ProjectSummary,
  ProjectTreeNode,
  StudioMode,
} from '../types/studio'

export interface MixFileData {
  file: File
  info: MixFileInfo
}

type WorkspaceStudioMode = Exclude<StudioMode, 'search'>
type MixContainerNode = { name: string; info: MixFileInfo; fileObj: File | VirtualFile }
type RestorableNavigationTarget = { stackNames: string[]; selectedLeafName?: string }
type LayerLmdSummary = MixArchiveLmdSummary & { layerName: string }
type PersistEntriesResult = {
  currentLmdSummary: MixArchiveLmdSummary
  parentLmdSummaries: LayerLmdSummary[]
}
type ExportTab = 'raw' | 'static' | 'gif'
type EditablePktSession = {
  filePath: string
  originalContent: string
  draftContent: string
  loading: boolean
  error: string | null
}

const LOCAL_MIX_DATABASE_FILENAME = 'local mix database.dat'

function normalizeMixEntryName(name: string): string {
  return name.replace(/\\/g, '/').trim().toLowerCase()
}

function sameMixEntryName(a: string, b: string): boolean {
  return normalizeMixEntryName(a) === normalizeMixEntryName(b)
}

function isLocalMixDatabaseEntry(name: string): boolean {
  return sameMixEntryName(name, LOCAL_MIX_DATABASE_FILENAME)
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function encodeAsciiString(text: string): Uint8Array {
  const stream = new DataStream(0)
  stream.writeString(text)
  return stream.toUint8Array()
}

function getEditableSelection(input: HTMLInputElement | HTMLTextAreaElement): string {
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? start
  return input.value.slice(start, end)
}

function replaceEditableSelection(
  input: HTMLInputElement | HTMLTextAreaElement,
  replacement: string,
): void {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  input.setRangeText(replacement, start, end, 'end')
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function focusEditableInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  input.focus()
  try {
    input.select()
  } catch {
    try {
      input.setSelectionRange(0, input.value.length)
    } catch {
      // ignore browsers that do not support selection ranges for this input type
    }
  }
}

function findFirstProjectFilePath(nodes: ProjectTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === 'file') return node.path
    const nested = findFirstProjectFilePath(node.children ?? [])
    if (nested) return nested
  }
  return null
}

const NON_ERROR_STAGE_ORDER = GAME_RES_IMPORT_STAGE_ORDER.filter((stage) => stage !== 'error')
const STARTUP_LOADED_RESOURCE_LIMIT = 10

function applyProgressEventToSteps(
  steps: GameResImportStepState[],
  event: GameResImportProgressEvent,
): GameResImportStepState[] {
  const next = steps.map((step) => ({ ...step }))

  if (event.stage === 'error') {
    for (const step of next) {
      if (step.status === 'active') step.status = 'completed'
    }
    const errorStep = next.find((step) => step.id === 'error')
    if (errorStep) errorStep.status = 'error'
    return next
  }

  const activeIndex = NON_ERROR_STAGE_ORDER.indexOf(event.stage)
  for (const step of next) {
    if (step.id === 'error') {
      step.status = 'pending'
      continue
    }
    const stepIndex = NON_ERROR_STAGE_ORDER.indexOf(step.id as Exclude<typeof step.id, 'error'>)
    if (stepIndex < activeIndex) {
      step.status = 'completed'
    } else if (stepIndex === activeIndex) {
      step.status = event.stage === 'done' ? 'completed' : 'active'
    } else {
      step.status = 'pending'
    }
  }
  return next
}

const MixEditor: React.FC = () => {
  const dialog = useAppDialog()
  const { t } = useLocale()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [baseMixFiles, setBaseMixFiles] = useState<MixFileData[]>([])
  const [projectMixFiles, setProjectMixFiles] = useState<MixFileData[]>([])
  const [projectEntries, setProjectEntries] = useState<ProjectFileEntry[]>([])
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([])
  const [projectSelection, setProjectSelection] = useState<ProjectSelectionTarget | null>(null)
  const [studioMode, setStudioMode] = useState<WorkspaceStudioMode>('projects')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null)
  const [activeTopMixName, setActiveTopMixName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [importProgressEvent, setImportProgressEvent] = useState<GameResImportProgressEvent | null>(null)
  const [importProgressSteps, setImportProgressSteps] = useState<GameResImportStepState[]>(
    () => createInitialGameResImportSteps(),
  )
  const [resourceReady, setResourceReady] = useState(false)
  const [missingRequiredFiles, setMissingRequiredFiles] = useState<string[]>([])
  const [baseResourceContext, setBaseResourceContext] = useState<ResourceContext | null>(null)
  const [projectResourceContext, setProjectResourceContext] = useState<ResourceContext | null>(null)
  const [metadataDrawerOpen, setMetadataDrawerOpen] = useState(false)
  // 导航栈：从顶层 MIX 到当前容器（可能是子 MIX）
  const [navStack, setNavStack] = useState<MixContainerNode[]>([])
  const [initialBooting, setInitialBooting] = useState(true)
  const [showStartupLoadingScreen, setShowStartupLoadingScreen] = useState(false)
  const [startupLoadingStatus, setStartupLoadingStatus] = useState('')
  const [startupTotalResourceCount, setStartupTotalResourceCount] = useState(0)
  const [startupLoadedResourceCount, setStartupLoadedResourceCount] = useState(0)
  const [startupLoadedResourceNames, setStartupLoadedResourceNames] = useState<string[]>([])
  const [pktEditSession, setPktEditSession] = useState<EditablePktSession | null>(null)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportInitialTab, setExportInitialTab] = useState<ExportTab>('raw')
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null)
  const [searchIndex, setSearchIndex] = useState<GlobalSearchResult[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchViewOpen, setSearchViewOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const previewEditorRef = useRef<PreviewEditorHandle | null>(null)
  const didBootstrapRef = useRef(false)
  const isMacLikePlatform = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  }, [])

  const mixFiles = useMemo(() => {
    if (studioMode === 'base') return baseMixFiles
    return projectMixFiles
  }, [baseMixFiles, projectMixFiles, studioMode])

  const projectEntryMap = useMemo(() => {
    const next = new Map<string, ProjectFileEntry>()
    for (const entry of projectEntries) {
      next.set(normalizeResourcePath(entry.relativePath), entry)
    }
    return next
  }, [projectEntries])

  const resourceContext = useMemo(() => {
    if (studioMode === 'projects') return projectResourceContext ?? baseResourceContext
    return baseResourceContext
  }, [baseResourceContext, projectResourceContext, studioMode])

  const currentPreviewTarget = useMemo<PreviewTarget | null>(() => {
    if (studioMode === 'projects') {
      if (!projectSelection) return null
      if (projectSelection.kind === 'project-directory') return null
      return projectSelection
    }
    if (!selectedFile || !navStack.length) return null
    const topLevelOwner = navStack[0]?.name
    const entryName = selectedFile.split('/').pop() ?? ''
    if (!topLevelOwner || !entryName) return null
    return {
      kind: 'base-mix-entry',
      displayPath: selectedFile,
      topLevelOwner,
      containerChain: navStack.slice(1).map((node) => node.name),
      entryName,
      extension: selectedFile.split('.').pop()?.toLowerCase() ?? '',
    }
  }, [navStack, projectSelection, selectedFile, studioMode])

  const filteredSearchResults = useMemo(
    () => GlobalSearchService.filterIndex(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  )

  const initializeSelection = useCallback((nextMixFiles: MixFileData[]) => {
    if (!nextMixFiles.length) {
      setActiveTopMixName(null)
      setNavStack([])
      setSelectedFile(null)
      setMetadataDrawerOpen(false)
      return
    }
    const firstMix = nextMixFiles[0]
    setActiveTopMixName(firstMix.info.name)
    setNavStack([{ name: firstMix.info.name, info: firstMix.info, fileObj: firstMix.file }])
    if (firstMix.info.files.length > 0) {
      setSelectedFile(`${firstMix.info.name}/${firstMix.info.files[0].filename}`)
    } else {
      setSelectedFile(null)
    }
  }, [])

  const buildProjectFileSelection = useCallback((projectName: string, relativePath: string): ProjectSelectionTarget | null => {
    const normalizedPath = normalizeResourcePath(relativePath)
    const entry = projectEntryMap.get(normalizedPath)
    if (!entry || entry.kind !== 'file') return null
    return {
      kind: 'project-file',
      projectName,
      relativePath: normalizedPath,
      displayPath: normalizedPath,
      extension: entry.extension ?? getResourcePathExtension(normalizedPath),
      isMixFile: isMixLikeFile(normalizedPath),
    }
  }, [projectEntryMap])

  const selectProjectFile = useCallback((projectName: string, relativePath: string) => {
    const nextSelection = buildProjectFileSelection(projectName, relativePath)
    if (!nextSelection) return false
    setProjectSelection(nextSelection)
    setSelectedFile(nextSelection.displayPath)
    return true
  }, [buildProjectFileSelection])

  const selectProjectDirectory = useCallback((projectName: string, relativePath: string) => {
    const normalizedPath = normalizeResourcePath(relativePath)
    setProjectSelection({
      kind: 'project-directory',
      projectName,
      relativePath: normalizedPath,
      displayPath: normalizedPath,
    })
    setSelectedFile(null)
  }, [])

  const selectProjectMixEntry = useCallback((args: {
    projectName: string
    owningMixPath: string
    containerChain: string[]
    entryName: string
    extension?: string
  }) => {
    const displayPath = [args.owningMixPath, ...args.containerChain, args.entryName].join('/')
    setProjectSelection({
      kind: 'mix-entry',
      projectName: args.projectName,
      owningMixPath: args.owningMixPath,
      displayPath,
      containerChain: args.containerChain,
      entryName: args.entryName,
      extension: args.extension ?? getResourcePathExtension(args.entryName),
    })
    setSelectedFile(displayPath)
  }, [])

  const resetImportProgress = useCallback((message?: string) => {
    setImportProgressSteps(createInitialGameResImportSteps())
    setImportProgressEvent(null)
    setProgressMessage(message ?? '')
  }, [])

  const handleImportProgressEvent = useCallback((event: GameResImportProgressEvent) => {
    setImportProgressEvent(event)
    setImportProgressSteps((prev) => applyProgressEventToSteps(prev, event))
    setProgressMessage(event.message)
  }, [])

  const appendStartupLoadedResource = useCallback((name: string) => {
    setStartupLoadedResourceNames((prev) => {
      const trimmed = name.trim()
      if (!trimmed) return prev
      const deDuped = prev.filter((item) => item !== trimmed)
      const next = [...deDuped, trimmed]
      return next.slice(-STARTUP_LOADED_RESOURCE_LIMIT)
    })
  }, [])

  const handleStartupResourceProgress = useCallback((event: ResourceLoadProgressEvent) => {
    if (event.phase === 'scan') {
      setStartupTotalResourceCount(event.totalCount)
      setStartupLoadedResourceCount(event.loadedCount)
      setShowStartupLoadingScreen(event.totalCount > 0)
      if (event.totalCount > 0) {
        setStartupLoadingStatus(`${t('mixEditor.readingResources')} (${event.totalCount})`)
      } else {
        setStartupLoadingStatus(t('mixEditor.readingResources'))
      }
      return
    }

    if (event.phase === 'read' || event.phase === 'parse') {
      if (event.itemName) {
        setStartupLoadingStatus(`${t('mixEditor.readingResources')} ${event.itemName}`)
      }
      return
    }

    if (event.phase === 'loaded') {
      setStartupLoadedResourceCount(event.loadedCount)
      if (event.itemName) {
        appendStartupLoadedResource(event.itemName)
        if (event.itemKind === 'archive') {
          setStartupLoadingStatus(`[MIX] ${event.itemName}`)
        } else {
          setStartupLoadingStatus(`[FILE] ${event.itemName}`)
        }
      }
      return
    }

    if (event.phase === 'finalize') {
      setStartupLoadingStatus(t('gameRes.finalize'))
      return
    }

    if (event.phase === 'done') {
      setStartupLoadingStatus(t('gameRes.done'))
    }
  }, [appendStartupLoadedResource, t])

  const createMixReaderFromFileObj = useCallback(async (fileObj: File | VirtualFile) => {
    if (fileObj instanceof File) {
      const ab = await fileObj.arrayBuffer()
      return new MixFileDataStream(new DataStream(ab))
    }
    const ds = fileObj.stream as DataStream
    ds.seek(0)
    return new MixFileDataStream(ds)
  }, [])

  const openContainerEntry = useCallback(
    async (container: MixContainerNode, entry: MixFileInfo['files'][number]): Promise<VirtualFile | null> => {
      const mix = await createMixReaderFromFileObj(container.fileObj)
      const hash = entry.hash >>> 0
      if (mix.containsId(hash)) return mix.openById(hash, entry.filename)
      if (mix.containsFile(entry.filename)) return mix.openFile(entry.filename)
      return null
    },
    [createMixReaderFromFileObj],
  )

  const readContainerEntries = useCallback(
    async (container: MixContainerNode): Promise<MixArchiveBuilderEntry[]> => {
      const mix = await createMixReaderFromFileObj(container.fileObj)
      const entries: MixArchiveBuilderEntry[] = []
      for (const entry of container.info.files) {
        const hash = entry.hash >>> 0
        let vf: VirtualFile | null = null
        if (mix.containsId(hash)) {
          vf = mix.openById(hash, entry.filename)
        } else if (mix.containsFile(entry.filename)) {
          vf = mix.openFile(entry.filename)
        }
        if (!vf) {
          throw new Error(`Cannot read container entry: ${entry.filename}`)
        }
        entries.push({
          filename: entry.filename,
          hash,
          bytes: cloneBytes(vf.getBytes()),
        })
      }
      return entries
    },
    [createMixReaderFromFileObj],
  )

  const selectedFileExtension = useMemo(() => {
    return currentPreviewTarget?.extension ?? selectedFile?.split('.').pop()?.toLowerCase() ?? ''
  }, [currentPreviewTarget, selectedFile])

  const isPktSelected = ['ini', 'pkt', 'txt'].includes(selectedFileExtension)
  const hasUnsavedPktChanges = useMemo(() => {
    if (!pktEditSession) return false
    return pktEditSession.draftContent !== pktEditSession.originalContent
  }, [pktEditSession])

  const loadTextEntryContent = useCallback(async (): Promise<string> => {
    if (!currentPreviewTarget) throw new Error('No file selected')
    const resolved = await resolvePreviewFile(currentPreviewTarget)
    return resolved.readText()
  }, [currentPreviewTarget])

  const discardPktEdits = useCallback(() => {
    setPktEditSession((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        draftContent: prev.originalContent,
        error: null,
      }
    })
  }, [])

  const confirmDiscardPktEdits = useCallback(async (): Promise<boolean> => {
    if (!hasUnsavedPktChanges) return true
    const confirmed = await dialog.confirmDanger({
      title: t('mixEditor.confirmDiscardPktChanges'),
      message: t('mixEditor.confirmDiscardPktChangesMsg'),
      confirmText: t('preview.discardChanges'),
    })
    if (!confirmed) return false
    discardPktEdits()
    return true
  }, [dialog, discardPktEdits, hasUnsavedPktChanges, t])

  const restoreNavigation = useCallback(
    async (nextMixFiles: MixFileData[], target?: RestorableNavigationTarget): Promise<boolean> => {
      if (!target || !target.stackNames.length) return false
      const topMix = nextMixFiles.find((mix) => sameMixEntryName(mix.info.name, target.stackNames[0]))
      if (!topMix) return false

      const restoredStack: MixContainerNode[] = [
        { name: topMix.info.name, info: topMix.info, fileObj: topMix.file },
      ]

      for (let i = 1; i < target.stackNames.length; i++) {
        const expectedName = target.stackNames[i]
        const parent = restoredStack[restoredStack.length - 1]
        const childEntry = parent.info.files.find((entry) => sameMixEntryName(entry.filename, expectedName))
        if (!childEntry) break
        const childVf = await openContainerEntry(parent, childEntry)
        if (!childVf) break
        try {
          const childInfo = await MixParser.parseVirtualFile(childVf, childEntry.filename)
          restoredStack.push({
            name: childEntry.filename,
            info: childInfo,
            fileObj: childVf,
          })
        } catch {
          break
        }
      }

      const leaf = restoredStack[restoredStack.length - 1]
      const prefix = restoredStack.map((item) => item.name).join('/')
      const preferredLeafEntry = target.selectedLeafName
        ? leaf.info.files.find((entry) => sameMixEntryName(entry.filename, target.selectedLeafName as string))
        : null
      const selectedLeafEntry = preferredLeafEntry ?? leaf.info.files[0]

      setActiveTopMixName(restoredStack[0].name)
      setNavStack(restoredStack)
      setSelectedFile(selectedLeafEntry ? `${prefix}/${selectedLeafEntry.filename}` : null)
      return true
    },
    [openContainerEntry],
  )

  const reloadStudioData = useCallback(async (
    restoreTarget?: RestorableNavigationTarget,
    options?: {
      startup?: boolean
      skipUnsavedGuard?: boolean
      studioMode?: WorkspaceStudioMode
      activeProjectName?: string | null
      projectSelectionPath?: string | null
    },
  ) => {
    const isStartup = options?.startup === true
    if (!isStartup && !options?.skipUnsavedGuard) {
      const allowed = await confirmDiscardPktEdits()
      if (!allowed) return
    }
    if (isStartup) {
      setShowStartupLoadingScreen(false)
      setStartupLoadingStatus(t('mixEditor.readingResources'))
      setStartupTotalResourceCount(0)
      setStartupLoadedResourceCount(0)
      setStartupLoadedResourceNames([])
    }
    setLoading(true)
    setProgressMessage(t('mixEditor.readingResources'))
    setSearchLoading(true)
    try {
      const config = GameResBootstrap.loadConfig()
      const nextProjects = await ProjectService.listProjects()
      let nextActiveProjectName = options?.activeProjectName ?? config.activeProjectName ?? activeProjectName
      if (
        nextActiveProjectName
        && !nextProjects.some((project) => sameMixEntryName(project.name, nextActiveProjectName as string))
      ) {
        nextActiveProjectName = null
      }
      if (!nextActiveProjectName && nextProjects.length > 0) {
        nextActiveProjectName = nextProjects[0].name
      }

      if (config.activeProjectName !== nextActiveProjectName) {
        GameResConfig.save({
          activeProjectName: nextActiveProjectName,
          lastImportAt: config.lastImportAt,
        })
      }

      const nextStudioMode = options?.studioMode ?? studioMode
      const nextBaseContext = await GameResBootstrap.loadContext(
        null,
        isStartup ? handleStartupResourceProgress : undefined,
      )
      const nextProjectContext = nextActiveProjectName
        ? await GameResBootstrap.loadContext(nextActiveProjectName)
        : null
      const nextBaseMixFiles = nextBaseContext.toMixFileData()
      const nextProjectEntries = nextActiveProjectName
        ? await ProjectService.listProjectEntries(nextActiveProjectName)
        : []
      const nextProjectTree = nextActiveProjectName
        ? await ProjectService.listProjectTree(nextActiveProjectName)
        : []
      const nextProjectMixFiles = nextActiveProjectName
        ? await ProjectService.listProjectMixFiles(nextActiveProjectName)
        : []
      const nextVisibleMixFiles = nextStudioMode === 'base'
        ? nextBaseMixFiles
        : nextProjectMixFiles
      const nextSearchIndex = await GlobalSearchService.buildIndex()

      setProjects(nextProjects)
      setActiveProjectName(nextActiveProjectName)
      setBaseResourceContext(nextBaseContext)
      setProjectResourceContext(nextProjectContext)
      setBaseMixFiles(nextBaseMixFiles)
      setProjectEntries(nextProjectEntries)
      setProjectTree(nextProjectTree)
      setProjectMixFiles(nextProjectMixFiles)
      setStudioMode(nextStudioMode)
      setSearchIndex(nextSearchIndex)
      setResourceReady(nextBaseContext.readiness.ready)
      setMissingRequiredFiles(nextBaseContext.readiness.missingRequiredFiles)

      if (!nextBaseContext.readiness.ready) {
        setActiveTopMixName(null)
        setNavStack([])
        setSelectedFile(null)
        setProjectSelection(null)
        setMetadataDrawerOpen(false)
      } else {
        if (nextStudioMode === 'projects') {
          const requestedProjectPath = options?.projectSelectionPath
            ? normalizeResourcePath(options.projectSelectionPath)
            : null
          const requestedEntry = requestedProjectPath
            ? nextProjectEntries.find((entry) => entry.relativePath === requestedProjectPath)
            : null
          const restored = restoreTarget
            ? await restoreNavigation(nextProjectMixFiles, restoreTarget)
            : false

          if (requestedEntry) {
            if (requestedEntry.kind === 'directory') {
              setProjectSelection({
                kind: 'project-directory',
                projectName: nextActiveProjectName as string,
                relativePath: requestedEntry.relativePath,
                displayPath: requestedEntry.relativePath,
              })
              setSelectedFile(null)
            } else {
              setProjectSelection({
                kind: 'project-file',
                projectName: nextActiveProjectName as string,
                relativePath: requestedEntry.relativePath,
                displayPath: requestedEntry.relativePath,
                extension: requestedEntry.extension ?? getResourcePathExtension(requestedEntry.relativePath),
                isMixFile: isMixLikeFile(requestedEntry.relativePath),
              })
              setSelectedFile(requestedEntry.relativePath)
            }
          } else if (!restored) {
            const firstFilePath = findFirstProjectFilePath(nextProjectTree)
            const firstFileEntry = firstFilePath
              ? nextProjectEntries.find((entry) => entry.relativePath === firstFilePath)
              : null
            if (firstFileEntry && nextActiveProjectName) {
              setProjectSelection({
                kind: 'project-file',
                projectName: nextActiveProjectName,
                relativePath: firstFileEntry.relativePath,
                displayPath: firstFileEntry.relativePath,
                extension: firstFileEntry.extension ?? getResourcePathExtension(firstFileEntry.relativePath),
                isMixFile: isMixLikeFile(firstFileEntry.relativePath),
              })
              setSelectedFile(firstFileEntry.relativePath)
            } else {
              setProjectSelection(null)
              setSelectedFile(null)
            }
            setActiveTopMixName(null)
            setNavStack([])
          }
        } else {
          setProjectSelection(null)
          const restored = await restoreNavigation(nextVisibleMixFiles, restoreTarget)
          if (!restored) {
            initializeSelection(nextVisibleMixFiles)
          }
        }
      }
      setProgressMessage('')
    } catch (error) {
      console.error('Failed to load studio data:', error)
      setProgressMessage(t('mixEditor.readResourcesFailed'))
      setProjects([])
      setActiveProjectName(null)
      setBaseResourceContext(null)
      setProjectResourceContext(null)
      setBaseMixFiles([])
      setProjectEntries([])
      setProjectTree([])
      setProjectMixFiles([])
      setSearchIndex([])
      setResourceReady(false)
      setMissingRequiredFiles(['ra2.mix', 'language.mix', 'multi.mix'])
      setActiveTopMixName(null)
      setNavStack([])
      setSelectedFile(null)
      setProjectSelection(null)
      setMetadataDrawerOpen(false)
    } finally {
      setLoading(false)
      setSearchLoading(false)
      if (isStartup) setInitialBooting(false)
    }
  }, [
    activeProjectName,
    confirmDiscardPktEdits,
    handleStartupResourceProgress,
    initializeSelection,
    restoreNavigation,
    studioMode,
    t,
  ])

  useEffect(() => {
    if (didBootstrapRef.current) return
    didBootstrapRef.current = true
    void reloadStudioData(undefined, { startup: true, skipUnsavedGuard: true })
  }, [reloadStudioData])

  useEffect(() => {
    let cancelled = false
    if (!currentPreviewTarget || !isPktSelected) {
      setPktEditSession(null)
      return
    }

    setPktEditSession({
      filePath: currentPreviewTarget.displayPath,
      originalContent: '',
      draftContent: '',
      loading: true,
      error: null,
    })

    void (async () => {
      try {
        const content = await loadTextEntryContent()
        if (cancelled) return
        setPktEditSession({
          filePath: currentPreviewTarget.displayPath,
          originalContent: content,
          draftContent: content,
          loading: false,
          error: null,
        })
      } catch (error: any) {
        if (cancelled) return
        setPktEditSession({
          filePath: currentPreviewTarget.displayPath,
          originalContent: '',
          draftContent: '',
          loading: false,
          error: error?.message || t('mixEditor.readPktFailed'),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentPreviewTarget, isPktSelected, loadTextEntryContent, t])

  useEffect(() => {
    if (studioMode !== 'projects' || !activeProjectName || !navStack.length || !selectedFile) return
    const owningMixPath = navStack[0]?.name
    if (!owningMixPath || !selectedFile.startsWith(`${owningMixPath}/`)) return
    const containerChain = navStack.slice(1).map((node) => node.name)
    const entryName = selectedFile.slice(`${owningMixPath}/`.length).split('/').pop() ?? ''
    if (!entryName) return
    setProjectSelection((prev) => {
      if (
        prev?.kind === 'mix-entry'
        && prev.projectName === activeProjectName
        && prev.owningMixPath === owningMixPath
        && prev.displayPath === selectedFile
      ) {
        return prev
      }
      return {
        kind: 'mix-entry',
        projectName: activeProjectName,
        owningMixPath,
        displayPath: selectedFile,
        containerChain,
        entryName,
        extension: getResourcePathExtension(entryName),
      }
    })
  }, [activeProjectName, navStack, selectedFile, studioMode])

  const runWithPktDiscardGuard = useCallback(async (action: () => Promise<void> | void) => {
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return false
    await action()
    return true
  }, [confirmDiscardPktEdits])

  const openFilePicker = useCallback((
    options: {
      accept?: string
      multiple?: boolean
    },
    onPick: (files: File[]) => void,
  ) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (options.accept) input.accept = options.accept
    input.multiple = options.multiple ?? false
    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || [])
      onPick(files)
    }
    input.click()
  }, [])

  const handleReimportBaseDirectory = useCallback(async () => {
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return
    setLoading(true)
    resetImportProgress(t('importProgress.prepareReimportDir'))
    try {
      if (!FileSystemUtil.isOpfsSupported()) {
        await dialog.info(t('mixEditor.opfsNotSupported'))
        return
      }
      const dirHandle = await FileSystemUtil.showDirectoryPicker()
      const result = await GameResBootstrap.reimportBaseFromDirectory(
        dirHandle,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        await dialog.info(t('mixEditor.baseDirImportError', { errors: result.errors.slice(0, 8).join('\n') }))
      }
      await reloadStudioData(undefined, { skipUnsavedGuard: true, studioMode: 'base' })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: t('importProgress.importFailed'),
        message: e?.message || t('mixEditor.reimportBaseDirFailed'),
        errorMessage: e?.message || t('mixEditor.reimportBaseDirFailed'),
      })
      await dialog.info(e?.message || t('mixEditor.reimportBaseDirFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [confirmDiscardPktEdits, reloadStudioData, handleImportProgressEvent, resetImportProgress, dialog, t])

  const handleReimportBaseArchives = useCallback(async (files: File[]) => {
    if (!files.length) return
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return
    setLoading(true)
    resetImportProgress(t('importProgress.prepareReimportArchive'))
    try {
      const result = await GameResBootstrap.reimportBaseFromArchives(
        files,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        await dialog.info(t('mixEditor.baseArchiveImportError', { errors: result.errors.slice(0, 8).join('\n') }))
      }
      await reloadStudioData(undefined, { skipUnsavedGuard: true, studioMode: 'base' })
    } catch (e: any) {
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: t('importProgress.importFailed'),
        message: e?.message || t('mixEditor.reimportBaseArchiveFailed'),
        errorMessage: e?.message || t('mixEditor.reimportBaseArchiveFailed'),
      })
      await dialog.info(e?.message || t('mixEditor.reimportBaseArchiveFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [confirmDiscardPktEdits, reloadStudioData, handleImportProgressEvent, resetImportProgress, dialog, t])

  const setWorkspaceMix = useCallback((mixName: string, selectFirstFile: boolean) => {
    const mix = mixFiles.find((m) => m.info.name === mixName)
    if (!mix) return
    setActiveTopMixName(mix.info.name)
    setNavStack([{ name: mix.info.name, info: mix.info, fileObj: mix.file }])
    if (selectFirstFile) {
      if (mix.info.files.length > 0) {
        setSelectedFile(`${mix.info.name}/${mix.info.files[0].filename}`)
      } else {
        setSelectedFile(null)
      }
    }
  }, [mixFiles])

  const openProjectMixExplorer = useCallback(async (
    mixPath: string,
    options?: { selectFirstEntry?: boolean },
  ) => {
    if (!activeProjectName) return false
    const mixFile = await ProjectService.readProjectFile(activeProjectName, mixPath)
    const mixInfo = await MixParser.parseFile(mixFile)
    flushSync(() => {
      setActiveTopMixName(mixPath)
      setNavStack([{ name: mixPath, info: { ...mixInfo, name: mixPath }, fileObj: mixFile }])
      if (options?.selectFirstEntry && mixInfo.files.length > 0) {
        selectProjectMixEntry({
          projectName: activeProjectName,
          owningMixPath: mixPath,
          containerChain: [],
          entryName: mixInfo.files[0].filename,
          extension: mixInfo.files[0].extension.toLowerCase(),
        })
      }
    })
    return true
  }, [activeProjectName, selectProjectMixEntry])

  const selectFileWithGuard = useCallback(async (filePath: string): Promise<boolean> => {
    if (filePath === selectedFile) return true
    const allowed = await runWithPktDiscardGuard(() => {
      if (studioMode === 'projects' && activeProjectName) {
        const normalizedPath = normalizeResourcePath(filePath)
        const projectEntry = projectEntryMap.get(normalizedPath)
        if (projectEntry?.kind === 'directory') {
          flushSync(() => {
            selectProjectDirectory(activeProjectName, projectEntry.relativePath)
          })
          return
        }
        if (projectEntry?.kind === 'file') {
          flushSync(() => {
            selectProjectFile(activeProjectName, projectEntry.relativePath)
          })
          return
        }
        const owningMixPath = navStack[0]?.name
        if (owningMixPath && filePath.startsWith(`${owningMixPath}/`)) {
          const entryName = filePath.slice(`${owningMixPath}/`.length).split('/').pop() ?? ''
          flushSync(() => {
            selectProjectMixEntry({
              projectName: activeProjectName,
              owningMixPath,
              containerChain: navStack.slice(1).map((node) => node.name),
              entryName,
              extension: getResourcePathExtension(entryName),
            })
          })
        }
        return
      }
      flushSync(() => {
        setSelectedFile(filePath)
        const slash = filePath.indexOf('/')
        if (slash <= 0) return
        const mixName = filePath.substring(0, slash)
        if (mixName !== activeTopMixName) {
          setWorkspaceMix(mixName, false)
        }
      })
    })
    return allowed !== false
  }, [
    activeProjectName,
    activeTopMixName,
    navStack,
    projectEntryMap,
    runWithPktDiscardGuard,
    selectProjectDirectory,
    selectProjectFile,
    selectProjectMixEntry,
    selectedFile,
    setWorkspaceMix,
    studioMode,
  ])

  const setActiveMixWithGuard = useCallback(async (
    mixName: string,
    selectFirstFile: boolean,
  ): Promise<boolean> => {
    if (mixName === activeTopMixName && !selectFirstFile) return true
    const allowed = await runWithPktDiscardGuard(() => {
      flushSync(() => {
        setWorkspaceMix(mixName, selectFirstFile)
      })
    })
    return allowed !== false
  }, [activeTopMixName, runWithPktDiscardGuard, setWorkspaceMix])

  const openBaseArchivePicker = useCallback(() => {
    openFilePicker(
      {
        accept: '.tar.gz,.tgz,.exe,.7z,.zip,.mix',
        multiple: true,
      },
      (files) => {
        void handleReimportBaseArchives(files)
      },
    )
  }, [handleReimportBaseArchives, openFilePicker])

  const handleImportProjectArchives = useCallback(async (files: File[]) => {
    if (!files.length || !activeProjectName) return
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return
    setLoading(true)
    resetImportProgress(t('mixEditor.importingProjectFiles'))
    try {
      const result = await GameResBootstrap.importProjectFiles(
        files,
        activeProjectName,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        await dialog.info(t('mixEditor.projectImportError', { errors: result.errors.slice(0, 8).join('\n') }))
      }
      await reloadStudioData(undefined, {
        skipUnsavedGuard: true,
        studioMode: 'projects',
        activeProjectName,
      })
    } catch (e: any) {
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: t('importProgress.importFailed'),
        message: e?.message || t('mixEditor.importProjectFailed'),
        errorMessage: e?.message || t('mixEditor.importProjectFailed'),
      })
      await dialog.info(e?.message || t('mixEditor.importProjectFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    activeProjectName,
    confirmDiscardPktEdits,
    dialog,
    handleImportProgressEvent,
    reloadStudioData,
    resetImportProgress,
    t,
  ])

  const openProjectArchivePicker = useCallback(() => {
    openFilePicker(
      {
        accept: '.zip,.7z,.exe,.tgz,.tar.gz,.mix,.mmx,.yro,.ini,.txt,.pkt,.csf,.pcx,.shp,.vxl,.hva,.wav,.bik,.map,.mpr',
        multiple: true,
      },
      (files) => {
        void handleImportProjectArchives(files)
      },
    )
  }, [handleImportProjectArchives, openFilePicker])

  const ensureWritableProject = useCallback(async (): Promise<string | null> => {
    if (activeProjectName) return activeProjectName
    if (typeof window === 'undefined') return null
    const proposedName = window.prompt(t('mixEditor.createProjectPrompt'), t('mixEditor.defaultProjectName'))
    if (proposedName == null) return null
    const createdName = await ProjectService.createProject(proposedName)
    const config = GameResConfig.load()
    GameResConfig.save({
      activeProjectName: createdName,
      lastImportAt: config.lastImportAt,
    })
    return createdName
  }, [activeProjectName, t])

  const handleCreateProject = useCallback(async () => {
    if (typeof window === 'undefined') return
    const proposedName = window.prompt(t('mixEditor.createProjectPrompt'), t('mixEditor.defaultProjectName'))
    if (proposedName == null) return
    try {
      const createdName = await ProjectService.createProject(proposedName)
      await reloadStudioData(undefined, {
        skipUnsavedGuard: true,
        studioMode: 'projects',
        activeProjectName: createdName,
      })
    } catch (error: any) {
      await dialog.info(error?.message || t('mixEditor.createProjectFailed'))
    }
  }, [dialog, reloadStudioData, t])

  const handleRenameProject = useCallback(async () => {
    if (!activeProjectName || typeof window === 'undefined') return
    const proposedName = window.prompt(t('mixEditor.renameProjectPrompt', { name: activeProjectName }), activeProjectName)
    if (proposedName == null) return
    try {
      const renamedProject = await ProjectService.renameProject(activeProjectName, proposedName)
      await reloadStudioData(undefined, {
        skipUnsavedGuard: true,
        studioMode: 'projects',
        activeProjectName: renamedProject,
      })
    } catch (error: any) {
      await dialog.info(error?.message || t('mixEditor.renameProjectFailed'))
    }
  }, [activeProjectName, dialog, reloadStudioData, t])

  const handleDeleteProject = useCallback(async () => {
    if (!activeProjectName) return
    const confirmed = await dialog.confirmDanger({
      title: t('mixEditor.confirmDeleteProject'),
      message: t('mixEditor.confirmDeleteProjectMsg', { name: activeProjectName }),
      confirmText: t('common.confirm'),
    })
    if (!confirmed) return
    try {
      await ProjectService.deleteProject(activeProjectName)
      const remainingProjects = projects.filter((project) => !sameMixEntryName(project.name, activeProjectName))
      const nextProjectName = remainingProjects[0]?.name ?? null
      await reloadStudioData(undefined, {
        skipUnsavedGuard: true,
        studioMode: nextProjectName ? 'projects' : 'base',
        activeProjectName: nextProjectName,
      })
    } catch (error: any) {
      await dialog.info(error?.message || t('mixEditor.deleteProjectFailed'))
    }
  }, [activeProjectName, dialog, projects, reloadStudioData, t])

  const handleActiveProjectChange = useCallback((projectName: string) => {
    void runWithPktDiscardGuard(async () => {
      await reloadStudioData(undefined, {
        skipUnsavedGuard: true,
        studioMode: 'projects',
        activeProjectName: projectName,
      })
    })
  }, [reloadStudioData, runWithPktDiscardGuard])

  const handleExportProjectZip = useCallback(async () => {
    if (!activeProjectName) return
    try {
      await ProjectService.downloadProjectZip(activeProjectName)
    } catch (error: any) {
      await dialog.info(error?.message || t('mixEditor.exportProjectZipFailed'))
    }
  }, [activeProjectName, dialog, t])

  const handleFileSelect = useCallback((filePath: string) => {
    void selectFileWithGuard(filePath)
  }, [selectFileWithGuard])

  const handleOpenMetadataDrawer = useCallback(() => {
    setMetadataDrawerOpen(true)
  }, [])

  const handleCloseMetadataDrawer = useCallback(() => {
    setMetadataDrawerOpen(false)
  }, [])

  const handleStudioModeChange = useCallback((mode: StudioMode) => {
    if (mode === 'search') {
      setSearchViewOpen(true)
      return
    }
    void runWithPktDiscardGuard(() => {
      flushSync(() => {
        setStudioMode(mode)
        setSearchViewOpen(false)
      })
      if (mode === 'base') {
        initializeSelection(baseMixFiles)
        return
      }
      setNavStack([])
      setActiveTopMixName(null)
      if (activeProjectName) {
        const firstProjectFile = findFirstProjectFilePath(projectTree)
        if (firstProjectFile) {
          selectProjectFile(activeProjectName, firstProjectFile)
        } else {
          setProjectSelection(null)
          setSelectedFile(null)
        }
      }
    })
  }, [activeProjectName, baseMixFiles, initializeSelection, projectTree, runWithPktDiscardGuard, selectProjectFile])

  const handleSearchActivate = useCallback(() => {
    setSearchViewOpen(true)
  }, [])

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value)
    setSearchViewOpen(true)
  }, [])

  const handleSearchClear = useCallback(() => {
    setSearchQuery('')
    setSearchViewOpen(false)
  }, [])

  const handleActiveMixChange = useCallback((mixName: string) => {
    void setActiveMixWithGuard(mixName, true)
  }, [setActiveMixWithGuard])

  useEffect(() => {
    if (studioMode !== 'base') return
    if (!mixFiles.length) {
      setActiveTopMixName(null)
      return
    }
    if (!activeTopMixName || !mixFiles.some((m) => m.info.name === activeTopMixName)) {
      setActiveTopMixName(mixFiles[0].info.name)
    }
  }, [mixFiles, activeTopMixName, studioMode])

  const currentContainer = navStack.length > 0 ? navStack[navStack.length - 1] : null
  const currentPrefix = useMemo(() => navStack.map(n => n.name).join('/'), [navStack])

  const handleDrillDown = useCallback(async (filename: string) => {
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return
    if (!currentContainer) return
    try {
      let childVf: VirtualFile | null = null
      if (currentContainer.fileObj instanceof File) {
        // 从顶层 File 容器提取
        childVf = await MixParser.extractFile(currentContainer.fileObj, filename)
      } else {
        // 从 VirtualFile 容器提取
        const ds = currentContainer.fileObj.stream as DataStream
        ds.seek(0)
        const mix = new MixFileDataStream(ds)
        const containsByName = mix.containsFile(filename)
        if (!containsByName) {
          const idMatch = filename.match(/^([0-9A-Fa-f]{8})(?:\.[^.]+)?$/)
          if (idMatch) {
            const id = parseInt(idMatch[1], 16) >>> 0
            if (mix.containsId(id)) {
              childVf = mix.openById(id, filename)
            }
          }
        }
        if (containsByName) {
          childVf = mix.openFile(filename)
        }
      }
      if (!childVf) return
      // 解析子 MIX
      const childInfo = await MixParser.parseVirtualFile(childVf, filename)
      const newStack = [...navStack, { name: filename, info: childInfo, fileObj: childVf }]
      setNavStack(newStack)
      // 自动选择子容器中的第一个文件
      if (childInfo.files.length > 0) {
        const newPrefix = newStack.map(n => n.name).join('/')
        if (studioMode === 'projects' && activeProjectName) {
          selectProjectMixEntry({
            projectName: activeProjectName,
            owningMixPath: newStack[0].name,
            containerChain: newStack.slice(1).map((node) => node.name),
            entryName: childInfo.files[0].filename,
            extension: childInfo.files[0].extension.toLowerCase(),
          })
        } else {
          setSelectedFile(`${newPrefix}/${childInfo.files[0].filename}`)
        }
      } else {
        const newPrefix = newStack.map(n => n.name).join('/')
        if (studioMode === 'projects' && activeProjectName) {
          selectProjectFile(activeProjectName, newStack[0].name)
        } else {
          setSelectedFile(`${newPrefix}/`)
        }
      }
    } catch (e) {
      console.error('Drill down failed:', e)
    }
  }, [activeProjectName, confirmDiscardPktEdits, currentContainer, navStack, selectProjectFile, selectProjectMixEntry, studioMode])

  const handleBreadcrumbClick = useCallback((index: number) => {
    if (index < 0 || index >= navStack.length) return
    void runWithPktDiscardGuard(() => {
      const newStack = navStack.slice(0, index + 1)
      setNavStack(newStack)
      const top = newStack[newStack.length - 1]
      if (top && top.info.files.length > 0) {
        const prefix = newStack.map(n => n.name).join('/')
        if (studioMode === 'projects' && activeProjectName) {
          selectProjectMixEntry({
            projectName: activeProjectName,
            owningMixPath: newStack[0].name,
            containerChain: newStack.slice(1).map((node) => node.name),
            entryName: top.info.files[0].filename,
            extension: top.info.files[0].extension.toLowerCase(),
          })
        } else {
          setSelectedFile(`${prefix}/${top.info.files[0].filename}`)
        }
      } else {
        if (studioMode === 'projects' && activeProjectName) {
          selectProjectFile(activeProjectName, newStack[0].name)
        } else {
          setSelectedFile(null)
        }
      }
    })
  }, [activeProjectName, navStack, runWithPktDiscardGuard, selectProjectFile, selectProjectMixEntry, studioMode])

  const handleNavigateUp = useCallback(() => {
    if (navStack.length <= 1) return
    handleBreadcrumbClick(navStack.length - 2)
  }, [navStack, handleBreadcrumbClick])

  const selectedLeafName = useMemo(() => {
    if (!selectedFile) return ''
    const parts = selectedFile.split('/')
    return parts[parts.length - 1] || ''
  }, [selectedFile])

  const canEnterCurrentMix = useMemo(() => {
    if (studioMode === 'projects' && projectSelection?.kind === 'project-file') {
      return projectSelection.isMixFile
    }
    if (!selectedLeafName) return false
    const ext = selectedLeafName.split('.').pop()?.toLowerCase() || ''
    return ext === 'mix' || ext === 'mmx' || ext === 'yro'
  }, [projectSelection, selectedLeafName, studioMode])

  const canEditSelectedEntry = useMemo(() => {
    if (studioMode !== 'projects' || !projectSelection) return false
    return projectSelection.kind === 'project-file' || projectSelection.kind === 'mix-entry'
  }, [projectSelection, studioMode])

  const canAddSelectionToProject = useMemo(() => {
    if (studioMode === 'base' && navStack.length > 0) return true
    return contextMenuTarget?.kind === 'search-result' && contextMenuTarget.searchScope === 'base'
  }, [contextMenuTarget, navStack.length, studioMode])

  const handleAddSelectionToProject = useCallback(async (
    target?: {
      topLevelOwner?: string
      containerChain?: string[]
      selectedLeafName?: string
    },
  ) => {
    const projectName = await ensureWritableProject()
    if (!projectName) return
    const topLevelOwner = target?.topLevelOwner ?? navStack[0]?.name
    if (!topLevelOwner) return
    try {
      const containerChain = target?.containerChain ?? []
      const leafName = target?.selectedLeafName ?? selectedLeafName ?? ''
      const shouldCopyLeaf = Boolean(leafName)
        && (containerChain.length > 0 || !sameMixEntryName(leafName, topLevelOwner))

      if (shouldCopyLeaf) {
        const topFile = await FileSystemUtil.readImportedFile('base', topLevelOwner)
        const nestedPath = [...containerChain, leafName].join('/')
        const vf = await MixParser.extractFile(topFile, nestedPath)
        if (!vf) {
          throw new Error(t('mixEditor.selectedEntryNotFound'))
        }
        const leafFilename = normalizeResourceFilename(getResourcePathBasename(leafName))
        if (!leafFilename) {
          throw new Error(t('mixEditor.invalidFilename'))
        }
        await ProjectService.writeProjectFile(
          projectName,
          leafFilename,
          new File([toOwnedArrayBuffer(cloneBytes(vf.getBytes()))], leafFilename, { type: 'application/octet-stream' }),
        )
        await reloadStudioData(undefined, {
          skipUnsavedGuard: true,
          studioMode: 'projects',
          activeProjectName: projectName,
          projectSelectionPath: leafFilename,
        })
        return
      }

      const targetPath = normalizeResourcePath(topLevelOwner)
      await ProjectService.copyBaseFileToProject(projectName, topLevelOwner, targetPath)
      await reloadStudioData(undefined, {
        skipUnsavedGuard: true,
        studioMode: 'projects',
        activeProjectName: projectName,
        projectSelectionPath: targetPath,
      })
    } catch (error: any) {
      await dialog.info(error?.message || t('mixEditor.addToProjectFailed'))
    }
  }, [dialog, ensureWritableProject, navStack, reloadStudioData, selectedLeafName, t])

  const showInitialLoadingSplash = (
    !resourceReady
    && initialBooting
    && loading
    && showStartupLoadingScreen
  )
  const startupProgressPercent = startupTotalResourceCount > 0
    ? Math.max(0, Math.min(100, Math.round((startupLoadedResourceCount / startupTotalResourceCount) * 100)))
    : 0

  const handleEnterCurrentMix = useCallback(() => {
    if (!canEnterCurrentMix) return
    if (studioMode === 'projects' && projectSelection?.kind === 'project-file') {
      void openProjectMixExplorer(projectSelection.relativePath, { selectFirstEntry: true })
      return
    }
    if (!selectedLeafName) return
    void handleDrillDown(selectedLeafName)
  }, [canEnterCurrentMix, handleDrillDown, openProjectMixExplorer, projectSelection, selectedLeafName, studioMode])

  const readFileObjBytes = useCallback(async (fileObj: File | VirtualFile): Promise<Uint8Array> => {
    if (fileObj instanceof File) {
      return new Uint8Array(await fileObj.arrayBuffer())
    }
    return cloneBytes(fileObj.getBytes())
  }, [])

  const resolveTopArchiveSource = useCallback(() => {
    if (!resourceContext || navStack.length === 0) return null
    const topNode = navStack[0]
    if (topNode.fileObj instanceof File) {
      const byReference = resourceContext.archives.find((item) => item.file === topNode.fileObj)
      if (byReference) {
        return {
          bucket: byReference.bucket,
          modName: byReference.modName ?? null,
          topFilename: byReference.info.name,
        }
      }
    }
    const byName = resourceContext.archives.find((item) => sameMixEntryName(item.info.name, topNode.name))
    if (!byName) return null
    return {
      bucket: byName.bucket,
      modName: byName.modName ?? null,
      topFilename: byName.info.name,
    }
  }, [resourceContext, navStack])

  const rebuildTopMixBytesFromCurrent = useCallback(async (
    currentMixBytes: Uint8Array,
  ): Promise<{ topBytes: Uint8Array; parentLmdSummaries: LayerLmdSummary[] }> => {
    if (!navStack.length) {
      throw new Error('No MIX container to write back')
    }
    const parentLmdSummaries: LayerLmdSummary[] = []
    let replacementBytes = cloneBytes(currentMixBytes)
    let replacementName = navStack[navStack.length - 1].name
    for (let depth = navStack.length - 2; depth >= 0; depth--) {
      const parent = navStack[depth]
      const parentEntries = await readContainerEntries(parent)
      const targetIndex = parentEntries.findIndex((entry) => sameMixEntryName(entry.filename, replacementName))
      if (targetIndex < 0) {
        throw new Error(`Cannot locate sub-container in parent MIX: ${replacementName}`)
      }
      parentEntries[targetIndex] = {
        ...parentEntries[targetIndex],
        bytes: replacementBytes,
      }
      const parentLmd = MixArchiveBuilder.upsertLocalMixDatabaseWithSummary(parentEntries)
      parentLmdSummaries.push({
        layerName: parent.name,
        ...parentLmd.summary,
      })
      replacementBytes = MixArchiveBuilder.build(parentLmd.entries)
      replacementName = parent.name
    }
    return { topBytes: replacementBytes, parentLmdSummaries }
  }, [navStack, readContainerEntries])

  const buildLmdSummaryLines = useCallback((
    currentLayerName: string,
    currentSummary: MixArchiveLmdSummary,
    parentSummaries: LayerLmdSummary[],
  ): string[] => {
    const lmdLines: string[] = []
    const currentLmdAction = currentSummary.replacedExisting ? t('mixEditor.lmdReplaced') : t('mixEditor.lmdAdded')
    lmdLines.push(
      `- ${t('mixEditor.lmdCurrentLayer', { name: currentLayerName, action: currentLmdAction, count: String(currentSummary.fileNameCount) })}`,
    )
    if (currentSummary.skippedByHashMismatch > 0) {
      lmdLines.push(`  ${t('mixEditor.lmdSkippedHash', { count: String(currentSummary.skippedByHashMismatch) })}`)
    }
    for (const parentSummary of parentSummaries) {
      const parentAction = parentSummary.replacedExisting ? t('mixEditor.lmdReplaced') : t('mixEditor.lmdAdded')
      lmdLines.push(
        `- ${t('mixEditor.lmdParentLayer', { name: parentSummary.layerName, action: parentAction, count: String(parentSummary.fileNameCount) })}`,
      )
      if (parentSummary.skippedByHashMismatch > 0) {
        lmdLines.push(`  ${t('mixEditor.lmdSkippedHash', { count: String(parentSummary.skippedByHashMismatch) })}`)
      }
    }
    return lmdLines
  }, [t])

  const persistCurrentContainerEntries = useCallback(async (
    entries: MixArchiveBuilderEntry[],
    nextSelectedLeafName?: string,
  ): Promise<PersistEntriesResult> => {
    const currentLmd = MixArchiveBuilder.upsertLocalMixDatabaseWithSummary(entries)
    const rebuiltCurrentBytes = MixArchiveBuilder.build(currentLmd.entries)
    const rebuiltTop = await rebuildTopMixBytesFromCurrent(rebuiltCurrentBytes)
    const source = resolveTopArchiveSource()
    if (!source) {
      throw new Error('Cannot locate top MIX source bucket')
    }

    const topFilename = source.topFilename
    const persistedBuffer = new ArrayBuffer(rebuiltTop.topBytes.length)
    new Uint8Array(persistedBuffer).set(rebuiltTop.topBytes)
    const topFile = new File([persistedBuffer], topFilename, { type: 'application/octet-stream' })
    await FileSystemUtil.writeImportedFile(source.bucket, topFile, source.modName, topFilename)

    const restoreTarget: RestorableNavigationTarget = { stackNames: navStack.map((node) => node.name) }
    if (nextSelectedLeafName) {
      restoreTarget.selectedLeafName = nextSelectedLeafName
    }
    await reloadStudioData(restoreTarget, {
      skipUnsavedGuard: true,
      studioMode,
      activeProjectName,
    })

    return {
      currentLmdSummary: currentLmd.summary,
      parentLmdSummaries: rebuiltTop.parentLmdSummaries,
    }
  }, [activeProjectName, navStack, rebuildTopMixBytesFromCurrent, reloadStudioData, resolveTopArchiveSource, studioMode])

  const handleSaveSelectedPktFile = useCallback(async () => {
    if (!pktEditSession || pktEditSession.loading) return
    if (!hasUnsavedPktChanges) return
    setLoading(true)
    setProgressMessage(t('mixEditor.savingFile'))
    try {
      if (studioMode === 'projects' && projectSelection?.kind === 'project-file' && activeProjectName) {
        const fileName = getResourcePathBasename(projectSelection.relativePath)
        await ProjectService.writeProjectFile(
          activeProjectName,
          projectSelection.relativePath,
          new File([toOwnedArrayBuffer(encodeAsciiString(pktEditSession.draftContent))], fileName, {
            type: 'text/plain',
          }),
        )
        await reloadStudioData(undefined, {
          skipUnsavedGuard: true,
          studioMode: 'projects',
          activeProjectName,
          projectSelectionPath: projectSelection.relativePath,
        })
        setPktEditSession((prev) => {
          if (!prev || prev.filePath !== pktEditSession.filePath) return prev
          return {
            ...prev,
            originalContent: prev.draftContent,
            error: null,
          }
        })
        await dialog.info({
          title: t('mixEditor.saveComplete'),
          message: t('mixEditor.saveSummary', { name: fileName }),
        })
        return
      }

      if (!currentContainer || !selectedLeafName) return
      const currentEntries = await readContainerEntries(currentContainer)
      const selectedIndex = currentEntries.findIndex((entry) => sameMixEntryName(entry.filename, selectedLeafName))
      if (selectedIndex < 0) {
        await dialog.info(t('mixEditor.selectedEntryNotFound'))
        return
      }

      currentEntries[selectedIndex] = {
        ...currentEntries[selectedIndex],
        bytes: encodeAsciiString(pktEditSession.draftContent),
      }

      const persisted = await persistCurrentContainerEntries(currentEntries, selectedLeafName)
      setPktEditSession((prev) => {
        if (!prev || prev.filePath !== selectedFile) return prev
        return {
          ...prev,
          originalContent: prev.draftContent,
          error: null,
        }
      })
      const lmdLines = buildLmdSummaryLines(
        currentContainer.name,
        persisted.currentLmdSummary,
        persisted.parentLmdSummaries,
      )
      await dialog.info({
        title: t('mixEditor.saveComplete'),
        message: `${t('mixEditor.saveSummary', { name: selectedLeafName })}\n\n${t('mixEditor.lmdUpdateSummary')}\n${lmdLines.join('\n')}`,
      })
    } catch (err: any) {
      console.error('Save pkt in current MIX failed:', err)
      await dialog.info(err?.message || t('mixEditor.saveFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    buildLmdSummaryLines,
    activeProjectName,
    currentContainer,
    dialog,
    hasUnsavedPktChanges,
    persistCurrentContainerEntries,
    pktEditSession,
    projectSelection,
    readContainerEntries,
    reloadStudioData,
    selectedFile,
    selectedLeafName,
    studioMode,
    t,
  ])

  const handleDiscardSelectedPktFile = useCallback(async () => {
    if (!hasUnsavedPktChanges) return
    const confirmed = await dialog.confirmDanger({
      title: t('mixEditor.confirmDiscardPktChanges'),
      message: t('mixEditor.confirmDiscardPktChangesMsg'),
      confirmText: t('preview.discardChanges'),
    })
    if (!confirmed) return
    discardPktEdits()
  }, [dialog, discardPktEdits, hasUnsavedPktChanges, t])

  const handleImportFilesToCurrentMix = useCallback(async (files: File[]) => {
    if (!files.length || !navStack.length) return
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return
    const currentNode = navStack[navStack.length - 1]
    setLoading(true)
    setProgressMessage(t('mixEditor.importingFiles'))
    try {
      const currentEntries = await readContainerEntries(currentNode)
      const indexByName = new Map<string, number>()
      for (let i = 0; i < currentEntries.length; i++) {
        indexByName.set(normalizeMixEntryName(currentEntries[i].filename), i)
      }

      let importedCount = 0
      let skippedCount = 0
      for (const file of files) {
        const normalizedName = normalizeResourceFilename(file.name)
        if (!normalizedName) {
          skippedCount++
          continue
        }
        const key = normalizeMixEntryName(normalizedName)
        const bytes = cloneBytes(new Uint8Array(await file.arrayBuffer()))
        const existedIndex = indexByName.get(key)
        if (existedIndex != null) {
          const existedName = currentEntries[existedIndex].filename
          const replaceConfirmed = await dialog.confirmDanger({
            title: t('mixEditor.confirmReplace'),
            message: t('mixEditor.confirmReplaceMsg', { name: existedName }),
            confirmText: t('common.replace'),
          })
          if (!replaceConfirmed) {
            skippedCount++
            continue
          }
          currentEntries[existedIndex] = {
            ...currentEntries[existedIndex],
            filename: normalizedName,
            bytes,
          }
          importedCount++
          continue
        }

        const nextHash = MixArchiveBuilder.hashFilename(normalizedName)
        const hashConflictIndex = currentEntries.findIndex((entry) => (entry.hash ?? 0) === nextHash)
        if (hashConflictIndex >= 0) {
          const conflictName = currentEntries[hashConflictIndex].filename
          const hashConflictConfirmed = await dialog.confirmDanger({
            title: t('mixEditor.confirmHashConflict'),
            message: t('mixEditor.confirmHashConflictMsg', { name: normalizedName, conflict: conflictName }),
            confirmText: t('common.replace'),
          })
          if (!hashConflictConfirmed) {
            skippedCount++
            continue
          }
          currentEntries[hashConflictIndex] = {
            ...currentEntries[hashConflictIndex],
            filename: normalizedName,
            hash: nextHash,
            bytes,
          }
          indexByName.set(key, hashConflictIndex)
          importedCount++
          continue
        }

        currentEntries.push({
          filename: normalizedName,
          hash: nextHash,
          bytes,
        })
        indexByName.set(key, currentEntries.length - 1)
        importedCount++
      }

      if (importedCount <= 0) {
        await dialog.info(t('mixEditor.noFileImported'))
        return
      }

      const persisted = await persistCurrentContainerEntries(currentEntries, selectedLeafName || undefined)
      const lmdLines = buildLmdSummaryLines(
        currentNode.name,
        persisted.currentLmdSummary,
        persisted.parentLmdSummaries,
      )

      const importSummary = skippedCount > 0
        ? t('mixEditor.importSummaryWithSkipped', { imported: String(importedCount), skipped: String(skippedCount) })
        : t('mixEditor.importSummaryDone', { imported: String(importedCount) })
      await dialog.info({
        title: t('mixEditor.importComplete'),
        message: `${importSummary}\n\n${t('mixEditor.lmdUpdateSummary')}\n${lmdLines.join('\n')}`,
      })
    } catch (err: any) {
      console.error('Import to current MIX failed:', err)
      await dialog.info(err?.message || t('mixEditor.importFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    confirmDiscardPktEdits,
    navStack,
    readContainerEntries,
    selectedLeafName,
    persistCurrentContainerEntries,
    buildLmdSummaryLines,
    dialog,
    t,
  ])

  const openCurrentMixImportPicker = useCallback(() => {
    openFilePicker(
      {
        multiple: true,
      },
      (files) => {
        void handleImportFilesToCurrentMix(files)
      },
    )
  }, [handleImportFilesToCurrentMix, openFilePicker])

  const handleRenameSelectedFileInCurrentMix = useCallback(async () => {
    if (typeof window === 'undefined') return
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return
    setLoading(true)
    setProgressMessage(t('mixEditor.renamingFile'))
    try {
      if (studioMode === 'projects' && projectSelection?.kind === 'project-file' && activeProjectName) {
        const oldPath = projectSelection.relativePath
        const oldName = getResourcePathBasename(oldPath)
        const renameInput = window.prompt(t('mixEditor.renamePrompt', { name: oldName }), oldName)
        if (renameInput == null) return
        const trimmed = renameInput.trim()
        if (!trimmed) {
          await dialog.info(t('mixEditor.invalidFilename'))
          return
        }
        const parentSlash = oldPath.lastIndexOf('/')
        const parentDir = parentSlash >= 0 ? oldPath.slice(0, parentSlash) : ''
        const targetPath = trimmed.includes('/')
          ? normalizeResourcePath(trimmed)
          : normalizeResourcePath(parentDir ? `${parentDir}/${trimmed}` : trimmed)
        const nextPath = await ProjectService.renameProjectEntry(activeProjectName, oldPath, targetPath)
        await reloadStudioData(undefined, {
          skipUnsavedGuard: true,
          studioMode: 'projects',
          activeProjectName,
          projectSelectionPath: nextPath,
        })
        await dialog.info({
          title: t('mixEditor.renameComplete'),
          message: t('mixEditor.renameSummary', { from: oldName, to: getResourcePathBasename(nextPath) }),
        })
        return
      }

      if (!currentContainer || !selectedLeafName) return
      const currentEntries = await readContainerEntries(currentContainer)
      let selectedIndex = currentEntries.findIndex((entry) => sameMixEntryName(entry.filename, selectedLeafName))
      if (selectedIndex < 0) {
        await dialog.info(t('mixEditor.selectedEntryNotFound'))
        return
      }

      const oldName = currentEntries[selectedIndex].filename
      if (isLocalMixDatabaseEntry(oldName)) {
        await dialog.info(t('mixEditor.renameLmdForbidden'))
        return
      }

      const renameInput = window.prompt(t('mixEditor.renamePrompt', { name: oldName }), oldName)
      if (renameInput == null) return
      const nextName = normalizeResourceFilename(renameInput)
      if (!nextName) {
        await dialog.info(t('mixEditor.invalidFilename'))
        return
      }
      if (sameMixEntryName(nextName, oldName)) return

      const removeEntryAt = (index: number) => {
        currentEntries.splice(index, 1)
        if (index < selectedIndex) selectedIndex--
      }

      const nameConflictIndex = currentEntries.findIndex(
        (entry, index) => index !== selectedIndex && sameMixEntryName(entry.filename, nextName),
      )
      if (nameConflictIndex >= 0) {
        const conflictName = currentEntries[nameConflictIndex].filename
        const replaceByNameConfirmed = await dialog.confirmDanger({
          title: t('mixEditor.confirmReplace'),
          message: t('mixEditor.confirmReplaceMsg', { name: conflictName }),
          confirmText: t('common.replace'),
        })
        if (!replaceByNameConfirmed) return
        removeEntryAt(nameConflictIndex)
      }

      const nextHash = MixArchiveBuilder.hashFilename(nextName)
      const hashConflictIndex = currentEntries.findIndex((entry, index) => {
        if (index === selectedIndex) return false
        const entryHash = entry.hash == null ? MixArchiveBuilder.hashFilename(entry.filename) : (entry.hash >>> 0)
        return entryHash === nextHash
      })
      if (hashConflictIndex >= 0) {
        const conflictName = currentEntries[hashConflictIndex].filename
        const replaceByHashConfirmed = await dialog.confirmDanger({
          title: t('mixEditor.confirmHashConflict'),
          message: t('mixEditor.confirmHashConflictMsg', { name: nextName, conflict: conflictName }),
          confirmText: t('common.replace'),
        })
        if (!replaceByHashConfirmed) return
        removeEntryAt(hashConflictIndex)
      }

      const targetEntry = currentEntries[selectedIndex]
      if (!targetEntry) {
        throw new Error(t('mixEditor.selectedEntryNotFound'))
      }
      currentEntries[selectedIndex] = {
        ...targetEntry,
        filename: nextName,
        hash: nextHash,
      }

      const persisted = await persistCurrentContainerEntries(currentEntries, nextName)
      const lmdLines = buildLmdSummaryLines(
        currentContainer.name,
        persisted.currentLmdSummary,
        persisted.parentLmdSummaries,
      )
      await dialog.info({
        title: t('mixEditor.renameComplete'),
        message: `${t('mixEditor.renameSummary', { from: oldName, to: nextName })}\n\n${t('mixEditor.lmdUpdateSummary')}\n${lmdLines.join('\n')}`,
      })
    } catch (err: any) {
      console.error('Rename entry in current MIX failed:', err)
      await dialog.info(err?.message || t('mixEditor.renameFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    activeProjectName,
    confirmDiscardPktEdits,
    currentContainer,
    buildLmdSummaryLines,
    dialog,
    persistCurrentContainerEntries,
    projectSelection,
    readContainerEntries,
    reloadStudioData,
    selectedLeafName,
    studioMode,
    t,
  ])

  const handleDeleteSelectedFileInCurrentMix = useCallback(async () => {
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return
    setLoading(true)
    setProgressMessage(t('mixEditor.deletingFile'))
    try {
      if (studioMode === 'projects' && projectSelection?.kind === 'project-file' && activeProjectName) {
        const targetName = getResourcePathBasename(projectSelection.relativePath)
        const confirmed = await dialog.confirmDanger({
          title: t('mixEditor.confirmDelete'),
          message: t('mixEditor.confirmDeleteMsg', { name: targetName }),
          confirmText: t('common.confirm'),
        })
        if (!confirmed) return
        await ProjectService.deleteProjectEntry(activeProjectName, projectSelection.relativePath)
        await reloadStudioData(undefined, {
          skipUnsavedGuard: true,
          studioMode: 'projects',
          activeProjectName,
        })
        await dialog.info({
          title: t('mixEditor.deleteComplete'),
          message: t('mixEditor.deleteSummary', { name: targetName }),
        })
        return
      }

      if (!currentContainer || !selectedLeafName) return
      const currentEntries = await readContainerEntries(currentContainer)
      const selectedIndex = currentEntries.findIndex((entry) => sameMixEntryName(entry.filename, selectedLeafName))
      if (selectedIndex < 0) {
        await dialog.info(t('mixEditor.selectedEntryNotFound'))
        return
      }
      const targetName = currentEntries[selectedIndex].filename
      const confirmed = await dialog.confirmDanger({
        title: t('mixEditor.confirmDelete'),
        message: t('mixEditor.confirmDeleteMsg', { name: targetName }),
        confirmText: t('common.confirm'),
      })
      if (!confirmed) return

      currentEntries.splice(selectedIndex, 1)
      const nextSelectedName = currentEntries.length > 0
        ? currentEntries[Math.min(selectedIndex, currentEntries.length - 1)].filename
        : undefined

      const persisted = await persistCurrentContainerEntries(currentEntries, nextSelectedName)
      const lmdLines = buildLmdSummaryLines(
        currentContainer.name,
        persisted.currentLmdSummary,
        persisted.parentLmdSummaries,
      )
      await dialog.info({
        title: t('mixEditor.deleteComplete'),
        message: `${t('mixEditor.deleteSummary', { name: targetName })}\n\n${t('mixEditor.lmdUpdateSummary')}\n${lmdLines.join('\n')}`,
      })
    } catch (err: any) {
      console.error('Delete entry in current MIX failed:', err)
      await dialog.info(err?.message || t('mixEditor.deleteFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    activeProjectName,
    confirmDiscardPktEdits,
    currentContainer,
    buildLmdSummaryLines,
    dialog,
    persistCurrentContainerEntries,
    projectSelection,
    readContainerEntries,
    reloadStudioData,
    selectedLeafName,
    studioMode,
    t,
  ])

  const handleExportTopMix = useCallback(async () => {
    if (!navStack.length) return
    try {
      const topNode = navStack[0]
      const bytes = await readFileObjBytes(topNode.fileObj)
      triggerBrowserDownload(bytesToBlob(bytes, 'application/octet-stream'), topNode.name)
    } catch (err) {
      console.error('Export top MIX failed:', err)
    }
  }, [navStack, readFileObjBytes])

  const handleExportCurrentMix = useCallback(async () => {
    if (!currentContainer) return
    try {
      const bytes = await readFileObjBytes(currentContainer.fileObj)
      triggerBrowserDownload(bytesToBlob(bytes, 'application/octet-stream'), currentContainer.name)
    } catch (err) {
      console.error('Export current MIX failed:', err)
    }
  }, [currentContainer, readFileObjBytes])

  const handleOpenSearchResult = useCallback(async (result: GlobalSearchResult) => {
    const targetMode: WorkspaceStudioMode = result.scope === 'base' ? 'base' : 'projects'
    const restoreTarget: RestorableNavigationTarget | undefined = result.resultKind === 'mix-entry'
      ? {
          stackNames: [result.topLevelOwner, ...result.containerChain],
          selectedLeafName: result.displayName,
        }
      : undefined
    const allowed = await confirmDiscardPktEdits()
    if (!allowed) return

    if (result.scope === 'base') {
      flushSync(() => {
        setSearchViewOpen(false)
        setStudioMode('base')
      })
      if (result.resultKind === 'project-file') {
        const mixName = result.topLevelOwner
        if (isMixLikeFile(mixName)) {
          const switched = await setActiveMixWithGuard(mixName, true)
          if (!switched) return
        } else {
          initializeSelection(baseMixFiles)
        }
        return
      }
      const restored = await restoreNavigation(baseMixFiles, restoreTarget)
      if (!restored) initializeSelection(baseMixFiles)
      return
    }

    if (result.projectName && result.projectName === activeProjectName) {
      flushSync(() => {
        setSearchViewOpen(false)
        setStudioMode('projects')
      })
      if (result.resultKind === 'project-file') {
        selectProjectFile(result.projectName, result.path)
        if (isMixLikeFile(result.path)) {
          await openProjectMixExplorer(result.path)
        }
        return
      }
      const restored = await restoreNavigation(projectMixFiles, restoreTarget)
      if (!restored && result.owningProjectPath) {
        selectProjectFile(result.projectName, result.owningProjectPath)
        await openProjectMixExplorer(result.owningProjectPath)
      }
      return
    }

    setSearchViewOpen(false)
    await reloadStudioData(restoreTarget, {
      skipUnsavedGuard: true,
      studioMode: targetMode,
      activeProjectName: result.scope === 'project' ? (result.projectName ?? null) : activeProjectName,
      projectSelectionPath: result.resultKind === 'project-file' ? result.path : result.owningProjectPath,
    })
  }, [
    activeProjectName,
    baseMixFiles,
    confirmDiscardPktEdits,
    initializeSelection,
    openProjectMixExplorer,
    projectMixFiles,
    reloadStudioData,
    restoreNavigation,
    selectProjectFile,
    setActiveMixWithGuard,
  ])

  const canSaveSelectedPktFile = isPktSelected
    && canEditSelectedEntry
    && !!pktEditSession
    && !pktEditSession.loading
    && !pktEditSession.error

  const openExportDialog = useCallback((initialTab: ExportTab) => {
    setExportInitialTab(initialTab)
    setExportDialogOpen(true)
  }, [])

  const handleOpenRawExport = useCallback(async () => {
    if (studioMode === 'projects' && currentPreviewTarget) {
      const resolved = await resolvePreviewFile(currentPreviewTarget)
      const bytes = await resolved.readBytes()
      triggerBrowserDownload(bytesToBlob(bytes, 'application/octet-stream'), resolved.name)
      return
    }
    openExportDialog('raw')
  }, [currentPreviewTarget, openExportDialog, studioMode])

  const handleOpenImageExport = useCallback(async () => {
    if (studioMode === 'projects') {
      await dialog.info('项目视角下的 SHP 图片/GIF 导出还在接入新模型，当前请先使用原始导出。')
      return
    }
    openExportDialog('static')
  }, [dialog, openExportDialog, studioMode])

  const closeContextMenu = useCallback(() => {
    setContextMenuTarget(null)
  }, [])

  const executeInputContextCommand = useCallback(async (
    commandId: ContextMenuCommandId,
    input: HTMLInputElement | HTMLTextAreaElement,
  ) => {
    input.focus()
    const selection = getEditableSelection(input)
    switch (commandId) {
      case 'undo':
        document.execCommand('undo')
        break
      case 'redo':
        document.execCommand('redo')
        break
      case 'cut':
        if (selection) {
          await navigator.clipboard?.writeText(selection)
          replaceEditableSelection(input, '')
        }
        break
      case 'copy':
        if (selection) {
          await navigator.clipboard?.writeText(selection)
        }
        break
      case 'paste': {
        const text = await navigator.clipboard?.readText()
        if (text != null) {
          replaceEditableSelection(input, text)
        }
        break
      }
      case 'selectAll':
        focusEditableInput(input)
        break
      default:
        break
    }
  }, [])

  const contextMenuBuildState = useMemo<ContextMenuBuildState>(() => {
    const targetFilePath = contextMenuTarget?.filePath ?? selectedFile ?? ''
    const targetExt = targetFilePath.split('.').pop()?.toLowerCase() ?? ''
    const inputElement = contextMenuTarget?.editableKind === 'input' ? contextMenuTarget.inputElement : null
    const inputSelection = inputElement ? getEditableSelection(inputElement) : ''
    const monacoEditor = previewEditorRef.current

    return {
      studioMode,
      resourceReady,
      loading,
      hasMixFiles: studioMode === 'projects' ? navStack.length > 0 : mixFiles.length > 0,
      hasFileSelection: Boolean(contextMenuTarget?.filePath ?? selectedFile),
      fileExtension: targetExt,
      canEnterMixTarget:
        contextMenuTarget?.kind === 'file-tree-row'
          ? Boolean(contextMenuTarget.isMixFile)
          : canEnterCurrentMix,
      canModifyTarget: canEditSelectedEntry,
      canSaveTarget: canSaveSelectedPktFile,
      hasUnsavedChanges: hasUnsavedPktChanges,
      metadataDrawerOpen,
      canNavigateUp: navStack.length > 1,
      editableReadOnly:
        contextMenuTarget?.editableKind === 'input'
          ? Boolean(inputElement?.readOnly || inputElement?.disabled)
          : !(monacoEditor?.canEdit() ?? false),
      editableHasSelection:
        contextMenuTarget?.editableKind === 'input'
          ? inputSelection.length > 0
          : Boolean(monacoEditor?.hasSelection() ?? false),
      editableHasValue:
        contextMenuTarget?.editableKind === 'input'
          ? Boolean(inputElement?.value?.length)
          : true,
      editableCanCopyWithoutSelection: contextMenuTarget?.editableKind === 'monaco',
      hasProjects: projects.length > 0,
      hasActiveProject: Boolean(activeProjectName),
      canAddToProject: canAddSelectionToProject,
    }
  }, [
    activeProjectName,
    canAddSelectionToProject,
    canEditSelectedEntry,
    canEnterCurrentMix,
    canSaveSelectedPktFile,
    contextMenuTarget,
    hasUnsavedPktChanges,
    loading,
    metadataDrawerOpen,
    mixFiles.length,
    navStack.length,
    projects.length,
    resourceReady,
    selectedFile,
    studioMode,
  ])

  const contextMenuEntries = useMemo(() => {
    if (!contextMenuTarget) return []
    return buildContextMenuItems({
      t: (key) => t(key as any),
      target: contextMenuTarget,
      state: contextMenuBuildState,
      isMac: isMacLikePlatform,
    })
  }, [contextMenuBuildState, contextMenuTarget, isMacLikePlatform, t])

  const handleContextMenuCapture = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.shiftKey) {
      closeContextMenu()
      return
    }

    const target = resolveContextMenuTarget(
      event.target as HTMLElement | null,
      {
        clientX: event.clientX,
        clientY: event.clientY,
      },
      resourceReady ? 'global-shell' : 'import-shell',
    )

    event.preventDefault()

    if (target.kind === 'file-tree-row' && target.filePath) {
      const allowed = await selectFileWithGuard(target.filePath)
      if (!allowed) return
    }

    if (target.kind === 'editable-text' && target.editableKind === 'input') {
      target.inputElement?.focus()
    }

    if (target.kind === 'editable-text' && target.editableKind === 'monaco') {
      // Let Monaco finish applying any cursor/selection updates from this right click
      // before we snapshot editor state into the custom menu.
      requestAnimationFrame(() => {
        setContextMenuTarget(target)
      })
      return
    }

    setContextMenuTarget(target)
  }, [closeContextMenu, resourceReady, selectFileWithGuard])

  const handleContextMenuCommand = useCallback((commandId: ContextMenuCommandId) => {
    const target = contextMenuTarget
    closeContextMenu()

    const ensureTargetFileSelected = async (): Promise<boolean> => {
      if (!target?.filePath) return Boolean(selectedFile)
      return selectFileWithGuard(target.filePath)
    }

    void (async () => {
      switch (commandId) {
        case 'selectArchive':
        case 'reimportBaseArchives':
          openBaseArchivePicker()
          return
        case 'selectGameDirectory':
        case 'reimportBaseDirectory':
          await handleReimportBaseDirectory()
          return
        case 'createProject':
          await handleCreateProject()
          return
        case 'renameProject':
          await handleRenameProject()
          return
        case 'deleteProject':
          await handleDeleteProject()
          return
        case 'importProjectFiles':
          openProjectArchivePicker()
          return
        case 'importToCurrentMix':
          openCurrentMixImportPicker()
          return
        case 'exportTopMix':
          await handleExportTopMix()
          return
        case 'exportCurrentMix':
          await handleExportCurrentMix()
          return
        case 'exportProjectZip':
          await handleExportProjectZip()
          return
        case 'switchToBase':
          handleStudioModeChange('base')
          return
        case 'switchToProjects':
          handleStudioModeChange('projects')
          return
        case 'switchToSearch':
          handleStudioModeChange('search')
          return
        case 'navigateUp':
          handleNavigateUp()
          return
        case 'rawExport':
          if (await ensureTargetFileSelected()) {
            await handleOpenRawExport()
          }
          return
        case 'imageGifExport':
          if (await ensureTargetFileSelected()) {
            await handleOpenImageExport()
          }
          return
        case 'enterCurrentMix':
          if (await ensureTargetFileSelected()) {
            handleEnterCurrentMix()
          }
          return
        case 'openMetadata':
          if (await ensureTargetFileSelected()) {
            handleOpenMetadataDrawer()
          }
          return
        case 'closeMetadata':
          handleCloseMetadataDrawer()
          return
        case 'renameFile':
          if (await ensureTargetFileSelected()) {
            await handleRenameSelectedFileInCurrentMix()
          }
          return
        case 'deleteFile':
          if (await ensureTargetFileSelected()) {
            await handleDeleteSelectedFileInCurrentMix()
          }
          return
        case 'saveFile':
          if (await ensureTargetFileSelected()) {
            await handleSaveSelectedPktFile()
          }
          return
        case 'discardChanges':
          if (await ensureTargetFileSelected()) {
            await handleDiscardSelectedPktFile()
          }
          return
        case 'addToProject': {
          if (target?.kind === 'search-result') {
            await handleAddSelectionToProject({
              topLevelOwner: target.topLevelOwner,
              containerChain: target.containerChain,
              selectedLeafName: target.filePath?.split('/').pop(),
            })
            return
          }
          await handleAddSelectionToProject()
          return
        }
        case 'openSearchResult':
          if (target?.kind === 'search-result' && target.topLevelOwner && target.filePath) {
            await handleOpenSearchResult({
              id: `context:${target.filePath}`,
              scope: target.searchScope ?? 'base',
              resultKind: target.resultKind ?? 'mix-entry',
              projectName: target.projectName,
              topLevelOwner: target.topLevelOwner,
              path: target.filePath,
              containerChain: target.containerChain ?? [],
              isNestedMixHit: Boolean(target.containerChain?.length),
              extension: target.filePath.split('.').pop()?.toLowerCase() ?? '',
              size: 0,
              displayName: target.filePath.split('/').pop() ?? target.filePath,
            })
          }
          return
        case 'undo':
        case 'redo':
        case 'cut':
        case 'copy':
        case 'paste':
        case 'selectAll': {
          if (target?.editableKind === 'input' && target.inputElement) {
            await executeInputContextCommand(commandId, target.inputElement)
            return
          }

          const editor = previewEditorRef.current
          if (!editor) return
          if (commandId === 'undo') editor.undo()
          else if (commandId === 'redo') editor.redo()
          else if (commandId === 'cut') editor.cut()
          else if (commandId === 'copy') editor.copy()
          else if (commandId === 'paste') editor.paste()
          else if (commandId === 'selectAll') editor.selectAll()
          return
        }
        default:
          return
      }
    })()
  }, [
    closeContextMenu,
    contextMenuTarget,
    executeInputContextCommand,
    handleAddSelectionToProject,
    handleCloseMetadataDrawer,
    handleCreateProject,
    handleDeleteSelectedFileInCurrentMix,
    handleDeleteProject,
    handleDiscardSelectedPktFile,
    handleEnterCurrentMix,
    handleExportCurrentMix,
    handleExportProjectZip,
    handleExportTopMix,
    handleOpenMetadataDrawer,
    handleOpenSearchResult,
    handleReimportBaseDirectory,
    handleRenameProject,
    handleRenameSelectedFileInCurrentMix,
    handleSaveSelectedPktFile,
    handleStudioModeChange,
    handleNavigateUp,
    handleOpenImageExport,
    handleOpenRawExport,
    openBaseArchivePicker,
    openCurrentMixImportPicker,
    openProjectArchivePicker,
    selectFileWithGuard,
    selectedFile,
  ])

  const selectedProjectPath = useMemo(() => {
    if (projectSelection?.kind === 'project-file' || projectSelection?.kind === 'project-directory') {
      return projectSelection.relativePath
    }
    if (projectSelection?.kind === 'mix-entry') {
      return projectSelection.owningMixPath
    }
    return null
  }, [projectSelection])

  const selectedMixEntryName = useMemo(() => {
    if (projectSelection?.kind !== 'mix-entry') return null
    return projectSelection.entryName
  }, [projectSelection])

  const toolbarMixNames = useMemo(() => {
    if (studioMode === 'base') {
      return baseMixFiles.map((mix) => mix.file.name)
    }
    return navStack.length > 0 ? [navStack[0].name] : []
  }, [baseMixFiles, navStack, studioMode])

  const handleProjectTreeSelect = useCallback((path: string, kind: 'file' | 'directory') => {
    if (!activeProjectName) return
    void runWithPktDiscardGuard(() => {
      if (kind === 'directory') {
        selectProjectDirectory(activeProjectName, path)
        return
      }
      selectProjectFile(activeProjectName, path)
    })
  }, [activeProjectName, runWithPktDiscardGuard, selectProjectDirectory, selectProjectFile])

  const handleOpenProjectMixTree = useCallback((path: string) => {
    if (!activeProjectName) return
    void runWithPktDiscardGuard(async () => {
      selectProjectFile(activeProjectName, path)
      await openProjectMixExplorer(path)
    })
  }, [activeProjectName, openProjectMixExplorer, runWithPktDiscardGuard, selectProjectFile])

  const handleProjectMixEntrySelect = useCallback((entryName: string) => {
    if (!activeProjectName || !navStack.length) return
    void runWithPktDiscardGuard(() => {
      selectProjectMixEntry({
        projectName: activeProjectName,
        owningMixPath: navStack[0].name,
        containerChain: navStack.slice(1).map((node) => node.name),
        entryName,
        extension: getResourcePathExtension(entryName),
      })
    })
  }, [activeProjectName, navStack, runWithPktDiscardGuard, selectProjectMixEntry])

  const handleCloseProjectMixExplorer = useCallback(() => {
    const rootMixPath = navStack[0]?.name
    void runWithPktDiscardGuard(() => {
      setNavStack([])
      setActiveTopMixName(null)
      if (activeProjectName && rootMixPath) {
        selectProjectFile(activeProjectName, rootMixPath)
      }
    })
  }, [activeProjectName, navStack, runWithPktDiscardGuard, selectProjectFile])

  return (
    <div
      className="h-full flex flex-col"
      data-context-kind={resourceReady ? 'global-shell' : 'import-shell'}
      onContextMenuCapture={handleContextMenuCapture}
    >
      {/* 顶部工具栏（仅资源就绪后显示） */}
      {resourceReady && (
        <Toolbar
          studioMode={studioMode}
          onStudioModeChange={handleStudioModeChange}
          searchQuery={searchQuery}
          searchActive={searchViewOpen}
          onSearchQueryChange={handleSearchQueryChange}
          onSearchActivate={handleSearchActivate}
          onSearchClear={handleSearchClear}
          mixFiles={toolbarMixNames}
          loading={loading}
          onExportTopMix={handleExportTopMix}
          onExportCurrentMix={handleExportCurrentMix}
          onOpenCurrentMixImportPicker={openCurrentMixImportPicker}
          onReimportBaseDirectory={handleReimportBaseDirectory}
          onOpenBaseArchivePicker={openBaseArchivePicker}
          onOpenProjectArchivePicker={openProjectArchivePicker}
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onExportProjectZip={handleExportProjectZip}
          onAddSelectionToProject={() => {
            void handleAddSelectionToProject()
          }}
          canAddSelectionToProject={canAddSelectionToProject}
          projects={projects}
          activeProjectName={activeProjectName}
          onActiveProjectChange={handleActiveProjectChange}
        />
      )}

      {/* 主内容区域 */}
      {!resourceReady ? (
        showInitialLoadingSplash ? (
          <div className="flex-1 relative overflow-hidden">
            <img
              src="/game-bg.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/45" />
            <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/35 to-black/75" />
            <div className="absolute left-8 top-8 max-w-xl">
              <div className="text-2xl font-bold tracking-wide text-white drop-shadow-md">
                RA2Web Studio
              </div>
              <div className="mt-2 text-sm text-gray-200 drop-shadow">
                {startupLoadingStatus || t('mixEditor.readingResources')}
              </div>
              {startupTotalResourceCount > 0 && (
                <div className="mt-3 w-72">
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-200">
                    <span>{t('common.progress')}</span>
                    <span>{startupProgressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-black/45">
                    <div
                      className="h-full bg-blue-400 transition-all duration-200"
                      style={{ width: `${startupProgressPercent}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-300">
                    {`${startupLoadedResourceCount} / ${startupTotalResourceCount}`}
                  </div>
                </div>
              )}
            </div>

            <div className="absolute right-5 bottom-5 w-[min(30rem,90vw)] rounded-lg border border-gray-500/40 bg-black/45 backdrop-blur-sm shadow-2xl">
              <div className="px-3 py-2 border-b border-gray-500/30 text-xs font-semibold tracking-wide text-gray-200">
                Loaded Resources
              </div>
              <div className="max-h-44 overflow-y-auto px-3 py-2 space-y-1">
                {startupLoadedResourceNames.length > 0 ? (
                  startupLoadedResourceNames.map((name, idx) => (
                    <div
                      key={`${name}-${idx}`}
                      className={`text-xs truncate ${
                        idx === startupLoadedResourceNames.length - 1
                          ? 'text-emerald-200 animate-pulse'
                          : 'text-emerald-100/85'
                      }`}
                      title={name}
                    >
                      {name}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-300">{t('importProgress.waitStart')}</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div
              className="max-w-2xl w-full bg-gray-800 border border-gray-700 rounded-lg p-6"
              data-context-kind="import-shell"
            >
              <h2 className="text-xl font-semibold mb-3">{t('mixEditor.importGameRes')}</h2>
              <p className="text-gray-300 text-sm leading-6">
                {t('mixEditor.importHint')}
              </p>
              <div className="mt-4 text-sm text-yellow-300">
                {t('mixEditor.missingFiles', { files: missingRequiredFiles.join(', ') || t('mixEditor.unknownMissing') })}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                  onClick={openBaseArchivePicker}
                  disabled={loading}
                >
                  {t('mixEditor.selectArchive')}
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                  onClick={() => handleReimportBaseDirectory()}
                  disabled={loading}
                >
                  {t('mixEditor.selectGameDir')}
                </button>
              </div>
              <ImportProgressPanel
                steps={importProgressSteps}
                message={importProgressEvent?.message}
                currentItem={importProgressEvent?.currentItem}
                percentage={importProgressEvent?.percentage}
                fallbackMessage={loading ? progressMessage : t('mixEditor.selectToStart')}
              />
            </div>
          </div>
        )
      ) : (
        <div className="flex-1 flex min-h-0 relative">
          {studioMode === 'base' ? (
            <div className="w-80 bg-gray-800 border-r border-gray-700">
              <FileTree
                title={t('mixEditor.baseManagerTitle')}
                description={t('mixEditor.baseManagerDesc')}
                mixFiles={mixFiles}
                activeMixName={activeTopMixName}
                onActiveMixChange={handleActiveMixChange}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                container={currentContainer ? { info: currentContainer.info, name: currentContainer.name } : undefined}
                navPrefix={currentPrefix}
                onDrillDown={handleDrillDown}
                onNavigateUp={navStack.length > 1 ? handleNavigateUp : undefined}
                emptyText={t('fileTree.baseEmpty')}
                searchPlaceholder={t('fileTree.searchBasePlaceholder')}
              />
            </div>
          ) : (
            <div className="flex bg-gray-800 border-r border-gray-700">
              <div className="w-80 min-w-[20rem]">
                <ProjectExplorer
                  title={t('mixEditor.projectManagerTitle')}
                  description={activeProjectName
                    ? t('mixEditor.projectManagerDesc', { name: activeProjectName })
                    : t('mixEditor.projectEmptyDesc')}
                  projectName={activeProjectName}
                  tree={projectTree}
                  selectedPath={selectedProjectPath}
                  onSelectPath={handleProjectTreeSelect}
                  onOpenMix={handleOpenProjectMixTree}
                  emptyText={t('fileTree.projectEmpty')}
                  searchPlaceholder={t('fileTree.searchProjectPlaceholder')}
                />
              </div>
              {navStack.length > 0 && activeProjectName && (
                <div className="w-80 min-w-[20rem]">
                  <MixExplorer
                    mixPath={navStack[0].name}
                    navStack={navStack.map((node) => ({ name: node.name, info: node.info }))}
                    selectedEntryName={selectedMixEntryName}
                    onSelectEntry={handleProjectMixEntrySelect}
                    onDrillDown={(entryName) => {
                      void handleDrillDown(entryName)
                    }}
                    onNavigateUp={navStack.length > 1 ? handleNavigateUp : undefined}
                    onClose={handleCloseProjectMixExplorer}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0 min-h-0 bg-gray-900 overflow-hidden relative">
            {metadataDrawerOpen && (
              <button
                type="button"
                className="absolute inset-0 bg-black/25 z-10"
                aria-label={t('mixEditor.closeMetadataAria')}
                onClick={handleCloseMetadataDrawer}
              />
            )}
            <PreviewPanel
              selectedFile={selectedFile}
              mixFiles={mixFiles}
              target={currentPreviewTarget}
              breadcrumbs={projectSelection?.kind === 'mix-entry' || studioMode === 'base' ? navStack.map(n => n.name) : undefined}
              onBreadcrumbClick={projectSelection?.kind === 'mix-entry' || studioMode === 'base' ? handleBreadcrumbClick : undefined}
              resourceContext={resourceContext}
              onOpenMetadataDrawer={handleOpenMetadataDrawer}
              metadataDrawerOpen={metadataDrawerOpen}
              onEnterCurrentMix={handleEnterCurrentMix}
              canEnterCurrentMix={canEnterCurrentMix}
              onRenameFile={handleRenameSelectedFileInCurrentMix}
              onDeleteFile={handleDeleteSelectedFileInCurrentMix}
              canModifyFile={canEditSelectedEntry}
              actionsDisabled={loading}
              onSaveFile={handleSaveSelectedPktFile}
              onDiscardChanges={handleDiscardSelectedPktFile}
              canSaveSelectedFile={canSaveSelectedPktFile}
              hasUnsavedChanges={hasUnsavedPktChanges}
              textValue={pktEditSession?.draftContent ?? ''}
              textLoading={pktEditSession?.loading ?? false}
              textError={pktEditSession?.error ?? null}
              onTextChange={(next) => {
                setPktEditSession((prev) => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    draftContent: next,
                  }
                })
              }}
              onBeforeViewChange={async () => confirmDiscardPktEdits()}
              onOpenRawExport={() => {
                void handleOpenRawExport()
              }}
              onOpenImageExport={() => {
                void handleOpenImageExport()
              }}
              onEditorReady={(handle) => {
                previewEditorRef.current = handle
              }}
            />
            <div
              data-context-kind="metadata-drawer"
              data-file-path={selectedFile ?? ''}
              className={`absolute inset-y-0 right-0 w-80 bg-gray-800 border-l border-gray-700 shadow-2xl z-20 transform transition-transform duration-200 ${
                metadataDrawerOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className="h-full flex flex-col">
                <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-sm text-gray-300">{t('mixEditor.metadataDetail')}</span>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                    onClick={handleCloseMetadataDrawer}
                  >
                    {t('common.close')}
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <PropertiesPanel
                    selectedFile={selectedFile}
                    mixFiles={mixFiles}
                    target={currentPreviewTarget}
                  />
                </div>
              </div>
            </div>
          </div>

          {searchViewOpen && (
            <div className="absolute inset-0 z-30 flex items-start justify-center p-4 pt-5">
              <button
                type="button"
                className="absolute inset-0 bg-black/10"
                aria-label={t('common.close')}
                onClick={handleSearchClear}
              />
              <GlobalSearchPanel
                query={searchQuery}
                results={filteredSearchResults}
                loading={searchLoading}
                activeProjectName={activeProjectName}
                onOpenResult={(result) => {
                  void handleOpenSearchResult(result)
                }}
                onAddToProject={(result) => {
                  void handleAddSelectionToProject({
                    topLevelOwner: result.topLevelOwner,
                    containerChain: result.containerChain,
                    selectedLeafName: result.displayName,
                  })
                }}
              />
            </div>
          )}
        </div>
      )}

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        selectedFile={selectedFile ?? ''}
        mixFiles={mixFiles}
        resourceContext={resourceContext}
        initialTab={exportInitialTab}
      />

      <AppContextMenu
        entries={contextMenuEntries}
        target={contextMenuTarget}
        open={contextMenuTarget != null}
        onClose={closeContextMenu}
        onCommand={handleContextMenuCommand}
      />

      {/* 底部状态栏 */}
      <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center gap-4 px-4 text-sm text-gray-400 overflow-x-auto">
        <span className="flex-shrink-0">{t('mixEditor.appTitle')}</span>
        {resourceReady && (
          <>
            <span className="flex-shrink-0">
              {t(`toolbar.${studioMode === 'base' ? 'baseMode' : 'projectMode'}` as any)}
            </span>
            {studioMode === 'projects' && activeProjectName && (
              <span className="flex-shrink-0">
                {activeProjectName}
              </span>
            )}
            {searchViewOpen && searchQuery.trim().length > 0 && (
              <span className="flex-shrink-0">
                {t('mixEditor.searchReadyDetail', { count: filteredSearchResults.length })}
              </span>
            )}
            {mixFiles.length > 0 && (
              <span className="flex-shrink-0">
                {t('mixEditor.mixCount', {
                  mixCount: mixFiles.length,
                  fileCount: mixFiles.reduce((sum, mix) => sum + mix.info.files.length, 0),
                })}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default MixEditor
