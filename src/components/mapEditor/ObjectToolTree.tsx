import React, { useMemo } from 'react'
import { useLocale } from '../../i18n/LocaleContext'
import type { TheaterIndex } from '../../data/map/theaterIndex'
import type { RulesObjectLists } from '../../data/map/rulesObjects'
import { buildObjectToolTree, type ObjectTreeAction, type ObjectTreeNode } from './fa2Layout'
import { emptyObjectNameLookup, formatObjectLabel, type ObjectNameLookup } from '../../data/map/fa2ObjectLabel'
import type { TheaterArt } from '../../data/map/TheaterArt'
import type { ObjectSpriteKind } from '../../data/map/fa2Facing'
import type { MapEditorTool } from '../../data/map/mapTools'
import type { MapTheater } from '../../data/map/constants'

type ObjectToolTreeProps = {
  theater?: TheaterIndex | null
  theaterName?: MapTheater | null
  theaterArt?: TheaterArt | null
  artRevision?: number
  rulesLists: RulesObjectLists
  objectNames?: ObjectNameLookup
  selectedId?: string | null
  multiplayerOnly?: boolean
  onSelect: (id: string, action: ObjectTreeAction) => void
}

function spriteKindForTool(tool: MapEditorTool | undefined): ObjectSpriteKind | undefined {
  if (tool === 'infantry') return 'infantry'
  if (tool === 'unit' || tool === 'aircraft') return 'unit'
  if (tool === 'structure') return 'building'
  if (tool === 'terrain' || tool === 'randomTerrain') return 'terrain'
  if (tool === 'smudge') return 'smudge'
  return undefined
}

function nodeLabel(
  node: ObjectTreeNode,
  t: (key: string) => string,
  names: ObjectNameLookup,
  missingText: string,
  theaterArt?: TheaterArt | null,
): string {
  const objectName = node.action?.objectName
  if (objectName) {
    const kind = spriteKindForTool(node.action?.tool)
    let missing = false
    if (theaterArt && kind) {
      const peek = theaterArt.peekObject(objectName, 0, 0, undefined, kind)
      missing = peek === null
    }
    const formatted = formatObjectLabel(objectName, names, { missingArt: missing, missingText })
    if (node.labelKey === 'bridgeRepairHut' && (formatted === objectName || formatted.startsWith(`${objectName} (`))) {
      const hut = t(`mapEditor.${node.labelKey}`)
      return missing ? `${hut} [${objectName}] (${missingText})` : `${hut} [${objectName}]`
    }
    return formatted
  }
  const base = t(`mapEditor.${node.labelKey}`)
  if (node.label == null || node.label === '') return base
  if (node.labelKey === 'treeStartPlayer') return `${base} ${node.label}`
  if (node.labelKey === 'toolEraseOverlay') return `${base} ${node.label}`
  return node.label
}

const TreeItems: React.FC<{
  nodes: ObjectTreeNode[]
  selectedId?: string | null
  onSelect: (id: string, action: ObjectTreeAction) => void
  t: (key: string) => string
  names: ObjectNameLookup
  missingText: string
  theaterArt?: TheaterArt | null
}> = ({ nodes, selectedId, onSelect, t, names, missingText, theaterArt }) => (
  <ul className="ml-2 border-l border-gray-800 pl-1">
    {nodes.map((node) => {
      const label = nodeLabel(node, t, names, missingText, theaterArt)
      const selected = selectedId === node.id
      if (node.children?.length) {
        return (
          <li key={node.id}>
            <details open={node.id === 'overlay' || node.id === 'ground'}>
              <summary className="cursor-pointer truncate px-1 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800">
                {label}
              </summary>
              <TreeItems
                nodes={node.children}
                selectedId={selectedId}
                onSelect={onSelect}
                t={t}
                names={names}
                missingText={missingText}
                theaterArt={theaterArt}
              />
            </details>
          </li>
        )
      }
      return (
        <li key={node.id}>
          <button
            type="button"
            className={`block w-full truncate px-1 py-0.5 text-left text-[11px] ${selected ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-800'}`}
            onClick={() => node.action && onSelect(node.id, node.action)}
          >
            {label}
          </button>
        </li>
      )
    })}
  </ul>
)

const ObjectToolTree: React.FC<ObjectToolTreeProps> = ({
  theater,
  theaterName,
  theaterArt,
  artRevision = 0,
  rulesLists,
  objectNames = emptyObjectNameLookup(),
  selectedId,
  multiplayerOnly,
  onSelect,
}) => {
  const { t } = useLocale()
  const nodes = useMemo(
    () => buildObjectToolTree({
      theater,
      theaterName,
      infantry: rulesLists.infantry,
      units: rulesLists.units,
      aircraft: rulesLists.aircraft,
      structures: rulesLists.structures,
      terrain: rulesLists.terrain,
      smudges: rulesLists.smudges,
      overlays: rulesLists.overlays,
      multiplayerOnly,
    }),
    [theater, theaterName, rulesLists, multiplayerOnly],
  )
  const missingText = t('mapEditor.missingArt')

  return (
    <nav className="h-full overflow-y-auto py-1 text-xs" data-testid="map-tool-rail" aria-label={t('mapEditor.objectTree')} data-art-revision={artRevision}>
      <TreeItems
        nodes={nodes}
        selectedId={selectedId}
        onSelect={onSelect}
        t={(key) => t(key as never)}
        names={objectNames}
        missingText={missingText}
        theaterArt={theaterArt}
      />
    </nav>
  )
}

export default React.memo(ObjectToolTree)
