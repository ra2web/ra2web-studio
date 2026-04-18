export type StudioMode = 'base' | 'projects' | 'search'

export type SearchScope = 'base' | 'project'

export type ProjectEntryKind = 'file' | 'directory'
export type SearchResultKind = 'project-file' | 'mix-entry'

export interface ProjectSummary {
  name: string
  fileCount: number
  lastModified: number | null
}

export interface ProjectFileEntry {
  relativePath: string
  name: string
  kind: ProjectEntryKind
  size: number
  lastModified: number
  extension?: string
  depth?: number
  parentPath?: string | null
}

export type ProjectSelectionTarget =
  | {
      kind: 'project-directory'
      projectName: string
      relativePath: string
      displayPath: string
    }
  | {
      kind: 'project-file'
      projectName: string
      relativePath: string
      displayPath: string
      extension: string
      isMixFile: boolean
    }
  | {
      kind: 'mix-entry'
      projectName: string
      owningMixPath: string
      displayPath: string
      containerChain: string[]
      entryName: string
      extension: string
    }

export interface MixBrowseState {
  projectName: string
  owningMixPath: string
  containerChain: string[]
  selectedEntryName: string | null
}

export type ProjectDestinationTarget =
  | {
      kind: 'directory'
      projectName: string
      relativePath: string
    }
  | {
      kind: 'mix'
      projectName: string
      owningMixPath: string
      containerChain: string[]
    }

export interface ProjectTreeNode {
  path: string
  name: string
  kind: ProjectEntryKind
  size: number
  lastModified: number
  extension?: string
  children?: ProjectTreeNode[]
}

export interface GlobalSearchResult {
  id: string
  scope: SearchScope
  resultKind: SearchResultKind
  projectName?: string
  topLevelOwner: string
  path: string
  containerChain: string[]
  isNestedMixHit: boolean
  extension: string
  size: number
  displayName: string
  owningProjectPath?: string
}
