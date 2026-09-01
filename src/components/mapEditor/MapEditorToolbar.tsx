import React from 'react'
import { Loader2, Redo2, Save, Undo2, X } from 'lucide-react'
import { useLocale } from '../../i18n/LocaleContext'
import type { MapEditorTool } from '../../data/map/mapTools'
import {
  CLIFF_TOOLBAR,
  FA2_BRUSH_SIZES,
  TERRAIN_TOOLBAR,
  toolUsesBrush,
  type Fa2BrushSizeId,
} from './fa2Layout'

export type MapLogicTab = 'houses' | 'triggers' | 'teams' | 'ai' | 'lighting' | 'tubes' | 'basic' | 'maptools'

const LOGIC_TABS: MapLogicTab[] = ['basic', 'houses', 'triggers', 'teams', 'ai', 'lighting', 'tubes', 'maptools']

type MapEditorToolbarProps = {
  filePath: string
  saving?: boolean
  tool: MapEditorTool
  brushSizeId: Fa2BrushSizeId
  marbleMadness: boolean
  logicTab: MapLogicTab
  logicOpen: boolean
  onTool: (tool: MapEditorTool) => void
  onBrushSizeId: (id: Fa2BrushSizeId) => void
  onMarbleMadness: (value: boolean) => void
  onShowAllTilesets: () => void
  onShowAllFields: () => void
  onAutoLevel: () => void
  onAutoShore: () => void
  onOpenLogic: (tab: MapLogicTab) => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onExit: () => void
  extraOptions?: React.ReactNode
}

const toolButtonClass = (active: boolean) => (
  `rounded px-2 py-1 text-[11px] ${active ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`
)

const MapEditorToolbar: React.FC<MapEditorToolbarProps> = ({
  filePath,
  saving,
  tool,
  brushSizeId,
  marbleMadness,
  logicTab,
  logicOpen,
  onTool,
  onBrushSizeId,
  onMarbleMadness,
  onShowAllTilesets,
  onShowAllFields,
  onAutoLevel,
  onAutoShore,
  onOpenLogic,
  onUndo,
  onRedo,
  onSave,
  onExit,
  extraOptions,
}) => {
  const { t } = useLocale()
  const brushEnabled = toolUsesBrush(tool)

  return (
    <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900">
      <div className="flex h-10 items-center gap-1 px-2">
        <div className="min-w-0 flex-1 truncate text-sm" title={filePath}>{filePath}</div>
        <button type="button" className="rounded p-2 hover:bg-gray-800" onClick={onUndo} title={t('mapEditor.undo')} aria-label={t('mapEditor.undo')}><Undo2 size={16} /></button>
        <button type="button" className="rounded p-2 hover:bg-gray-800" onClick={onRedo} title={t('mapEditor.redo')} aria-label={t('mapEditor.redo')}><Redo2 size={16} /></button>
        <button type="button" className="rounded bg-blue-600 px-3 py-1 text-sm disabled:opacity-50" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="inline animate-spin" size={14} /> : <Save className="mr-1 inline" size={14} />}
          {t('mapEditor.save')}
        </button>
        <button type="button" className="rounded p-2 hover:bg-gray-800" onClick={onExit} aria-label={t('mapEditor.exit')}><X size={16} /></button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-gray-800 px-2 py-1" data-testid="map-menu-bar">
        {LOGIC_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={toolButtonClass(logicOpen && logicTab === tab)}
            onClick={() => onOpenLogic(tab)}
          >
            {t(`mapEditor.tab_${tab}` as never)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-gray-800 px-2 py-1" data-testid="map-terrain-toolbar">
        {TERRAIN_TOOLBAR.map((id) => (
          <button
            key={id}
            type="button"
            className={toolButtonClass(tool === id)}
            onClick={() => onTool(id)}
          >
            {t(`mapEditor.${id === 'raise' ? 'toolRaise' : id === 'lower' ? 'toolLower' : id === 'flatten' ? 'toolFlatten' : id === 'hideTileset' ? 'toolHideTileset' : id === 'hideField' ? 'toolHideField' : id === 'raiseTile' ? 'toolRaiseTile' : 'toolLowerTile'}` as never)}
          </button>
        ))}
        <button type="button" className={toolButtonClass(false)} data-testid="map-show-tilesets" onClick={onShowAllTilesets}>
          {t('mapEditor.showAllTilesets')}
        </button>
        <button type="button" className={toolButtonClass(false)} data-testid="map-show-fields" onClick={onShowAllFields}>
          {t('mapEditor.showAllFields')}
        </button>
        <label className="ml-1 flex items-center gap-1 text-[11px] text-gray-400">
          <input type="checkbox" checked={marbleMadness} onChange={(event) => onMarbleMadness(event.target.checked)} data-testid="map-marble-toggle" />
          {t('mapEditor.marbleMadness')}
        </label>
        <span className="mx-1 h-4 w-px bg-gray-700" />
        {CLIFF_TOOLBAR.map((id) => (
          <button key={id} type="button" className={toolButtonClass(tool === id)} onClick={() => onTool(id)}>
            {t(id === 'cliffFront' ? 'mapEditor.toolCliffFront' : 'mapEditor.toolCliffBack')}
          </button>
        ))}
        <button type="button" className={toolButtonClass(false)} data-testid="map-auto-level" onClick={onAutoLevel}>
          {t('mapEditor.autoLevel')}
        </button>
        <button type="button" className={toolButtonClass(false)} data-testid="map-auto-shore" onClick={onAutoShore}>
          {t('mapEditor.autoCreateShores')}
        </button>
        <span className="mx-1 h-4 w-px bg-gray-700" />
        <label className="flex items-center gap-1 text-[11px] text-gray-400" data-testid="map-brush-bar">
          {t('mapEditor.brush')}
          <select
            className="rounded bg-gray-800 px-1 py-0.5 text-gray-100 disabled:opacity-40"
            value={brushSizeId}
            disabled={!brushEnabled}
            data-testid="map-brush-size"
            onChange={(event) => onBrushSizeId(event.target.value as Fa2BrushSizeId)}
          >
            {FA2_BRUSH_SIZES.map((size) => (
              <option key={size.id} value={size.id}>{size.label}</option>
            ))}
          </select>
          {!brushEnabled && <span className="text-gray-500">{t('mapEditor.brushNone')}</span>}
        </label>
        {extraOptions}
      </div>
    </div>
  )
}

export default MapEditorToolbar
