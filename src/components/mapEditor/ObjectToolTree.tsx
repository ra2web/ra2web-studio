import React, { useMemo } from 'react'
import { useLocale } from '../../i18n/LocaleContext'
import type { TheaterIndex } from '../../data/map/theaterIndex'
import type { RulesObjectLists } from '../../data/map/rulesObjects'
import { buildObjectToolTree, type ObjectTreeAction, type ObjectTreeNode } from './fa2Layout'

type ObjectToolTreeProps = {
  theater?: TheaterIndex | null
  rulesLists: RulesObjectLists
  selectedId?: string | null
  multiplayerOnly?: boolean
  onSelect: (id: string, action: ObjectTreeAction) => void
}

function nodeLabel(
  node: ObjectTreeNode,
  t: (key: string) => string,
): string {
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
}> = ({ nodes, selectedId, onSelect, t }) => (
  <ul className="ml-2 border-l border-gray-800 pl-1">
    {nodes.map((node) => {
      const label = nodeLabel(node, t)
      const selected = selectedId === node.id
      if (node.children?.length) {
        return (
          <li key={node.id}>
            <details open={node.id === 'overlay' || node.id === 'ground'}>
              <summary className="cursor-pointer truncate px-1 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800">
                {label}
              </summary>
              <TreeItems nodes={node.children} selectedId={selectedId} onSelect={onSelect} t={t} />
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

const ObjectToolTree: React.FC<ObjectToolTreeProps> = ({ theater, rulesLists, selectedId, multiplayerOnly, onSelect }) => {
  const { t } = useLocale()
  const nodes = useMemo(
    () => buildObjectToolTree({
      theater,
      infantry: rulesLists.infantry,
      units: rulesLists.units,
      aircraft: rulesLists.aircraft,
      structures: rulesLists.structures,
      terrain: rulesLists.terrain,
      smudges: rulesLists.smudges,
      overlays: rulesLists.overlays,
      multiplayerOnly,
    }),
    [theater, rulesLists, multiplayerOnly],
  )

  return (
    <nav className="h-full overflow-y-auto py-1 text-xs" data-testid="map-tool-rail" aria-label={t('mapEditor.objectTree')}>
      <TreeItems nodes={nodes} selectedId={selectedId} onSelect={onSelect} t={(key) => t(key as never)} />
    </nav>
  )
}

export default ObjectToolTree
