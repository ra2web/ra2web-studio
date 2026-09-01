import React from 'react'
import { getFaData, paramTypeName, type FaActionDef, type FaEventDef } from '../../data/map/faData'
import { createMapObjectId, MapDocument } from '../../data/map/MapDocument'
import type { MapTriggerAction, MapTriggerEvent } from '../../data/map/types'
import { useLocale } from '../../i18n/LocaleContext'

type TriggerLogicPanelProps = {
  doc: MapDocument
  owner: string
  bump: (doc: MapDocument) => void
}

function ParamField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options?: Array<{ value: string; label: string }>
}) {
  if (options && options.length > 0) {
    return (
      <label className="mt-1 block text-[11px] text-gray-400">
        {label}
        <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          {!options.some((option) => option.value === value) && <option value={value}>{value}</option>}
        </select>
      </label>
    )
  }
  return (
    <label className="mt-1 block text-[11px] text-gray-400">
      {label}
      <input className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1 text-xs" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function optionsForParam(doc: MapDocument, typeId: number): Array<{ value: string; label: string }> | undefined {
  const id = Math.abs(typeId)
  switch (id) {
    case 2: return doc.houses.map((house) => ({ value: house.name, label: house.name }))
    case 3: return doc.variables.map((item) => ({ value: String(item.index), label: item.name }))
    case 7: return doc.teams.map((item) => ({ value: item.id, label: item.name }))
    case 14: return doc.triggers.map((item) => ({ value: item.id, label: item.name }))
    case 30: return doc.waypoints.map((item) => ({ value: String(item.number), label: `🚩 ${item.number}` }))
    case 38: return doc.tags.map((item) => ({ value: item.id, label: item.name }))
    case 15:
    case 37: return [{ value: '0', label: 'No' }, { value: '1', label: 'Yes' }]
    default: return undefined
  }
}

function eventParamCount(event: FaEventDef): { kind: number; count: number } {
  const count = (event.p1 !== 0 ? 1 : 0) + (event.p2 !== 0 ? 1 : 0)
  return { kind: count >= 2 ? 2 : event.p1 !== 0 || event.p2 !== 0 ? 1 : 0, count: Math.max(1, count || 1) }
}

const TriggerLogicPanel: React.FC<TriggerLogicPanelProps> = ({ doc, owner, bump }) => {
  const catalog = getFaData()
  const { t } = useLocale()

  const addTrigger = () => {
    const id = createMapObjectId()
    doc.triggers.push({
      id, houseName: owner, attachedTriggerId: '<none>', name: 'New Trigger',
      disabled: false, easy: true, medium: true, hard: true,
      events: [{ type: 13, paramKind: 1, params: ['10'] }],
      actions: [{ type: 11, params: ['0', '0', '0', '0', '0', '0', '0'] }],
    })
    doc.tags.push({ id: createMapObjectId(), repeatType: 2, name: 'New Tag', triggerId: id })
    bump(doc)
  }

  const setEventType = (event: MapTriggerEvent, type: number) => {
    const def = catalog.events.find((item) => item.id === type)
    const { kind, count } = def ? eventParamCount(def) : { kind: 1, count: 1 }
    event.type = type
    event.paramKind = kind
    event.params = Array.from({ length: count }, (_, index) => event.params[index] ?? '0')
    bump(doc)
  }

  const setActionType = (action: MapTriggerAction, type: number) => {
    action.type = type
    while (action.params.length < 7) action.params.push('0')
    bump(doc)
  }

  return (
    <div className="space-y-2 text-sm" data-testid="map-trigger-panel">
      <button type="button" className="rounded bg-gray-800 px-2 py-1" onClick={addTrigger}>{t('mapEditor.addTrigger')}</button>
      {doc.triggers.map((trigger, triggerIndex) => (
        <div key={trigger.id} className="rounded border border-gray-800 p-2">
          <input className="w-full rounded bg-gray-800 px-2 py-1" value={trigger.name} onChange={(event) => { doc.triggers[triggerIndex].name = event.target.value; bump(doc) }} />
          <label className="mt-1 block text-[11px] text-gray-400">House
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.houseName} onChange={(event) => { trigger.houseName = event.target.value; bump(doc) }}>
              {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
            </select>
          </label>
          <label className="mt-1 block text-[11px] text-gray-400">Attached
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.attachedTriggerId} onChange={(event) => { trigger.attachedTriggerId = event.target.value; bump(doc) }}>
              <option value="<none>">&lt;none&gt;</option>
              {doc.triggers.filter((item) => item.id !== trigger.id).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className="mt-1 flex gap-2 text-[11px] text-gray-400">
            {(['easy', 'medium', 'hard', 'disabled'] as const).map((key) => (
              <label key={key} className="flex items-center gap-1">
                <input type="checkbox" checked={trigger[key]} onChange={(event) => { trigger[key] = event.target.checked; bump(doc) }} />
                {key}
              </label>
            ))}
          </div>
          <div className="mt-2 text-xs font-medium text-gray-300">Events</div>
          {trigger.events.map((event, eventIndex) => {
            const def = catalog.events.find((item) => item.id === event.type)
            return (
              <div key={`${trigger.id}-e-${eventIndex}`} className="mt-1 rounded bg-gray-950 p-1">
                <select
                  className="w-full rounded bg-gray-800 px-1 py-1 text-xs"
                  data-testid="map-event-type"
                  value={event.type}
                  onChange={(item) => setEventType(event, Number(item.target.value))}
                >
                  {catalog.events.map((item) => <option key={item.id} value={item.id}>{item.id}: {item.name}</option>)}
                </select>
                {def && [def.p1, def.p2].filter((type) => type !== 0).map((type, paramIndex) => (
                  <ParamField
                    key={paramIndex}
                    label={paramTypeName(catalog, type)}
                    value={event.params[paramIndex] ?? '0'}
                    options={optionsForParam(doc, type)}
                    onChange={(value) => { event.params[paramIndex] = value; bump(doc) }}
                  />
                ))}
              </div>
            )
          })}
          <button type="button" className="mt-1 text-[11px] text-sky-400" onClick={() => { trigger.events.push({ type: 0, paramKind: 0, params: ['0'] }); bump(doc) }}>+ event</button>
          <div className="mt-2 text-xs font-medium text-gray-300">Actions</div>
          {trigger.actions.map((action, actionIndex) => {
            const def: FaActionDef | undefined = catalog.actions.find((item) => item.id === action.type)
            return (
              <div key={`${trigger.id}-a-${actionIndex}`} className="mt-1 rounded bg-gray-950 p-1">
                <select
                  className="w-full rounded bg-gray-800 px-1 py-1 text-xs"
                  data-testid="map-action-type"
                  value={action.type}
                  onChange={(item) => setActionType(action, Number(item.target.value))}
                >
                  {catalog.actions.map((item) => <option key={item.id} value={item.id}>{item.id}: {item.name}</option>)}
                </select>
                {def?.params.map((type, paramIndex) => type === 0 ? null : (
                  <ParamField
                    key={paramIndex}
                    label={paramTypeName(catalog, type)}
                    value={action.params[paramIndex] ?? '0'}
                    options={optionsForParam(doc, type)}
                    onChange={(value) => { action.params[paramIndex] = value; bump(doc) }}
                  />
                ))}
                {def?.usesWaypoint && (
                  <ParamField
                    label={t('mapEditor.toolWaypoint')}
                    value={action.params[6] ?? '0'}
                    options={optionsForParam(doc, 30)}
                    onChange={(value) => { action.params[6] = value; bump(doc) }}
                  />
                )}
              </div>
            )
          })}
          <button type="button" className="mt-1 text-[11px] text-sky-400" onClick={() => { trigger.actions.push({ type: 0, params: ['0', '0', '0', '0', '0', '0', '0'] }); bump(doc) }}>+ action</button>
        </div>
      ))}
      <div className="pt-2 text-xs font-medium text-gray-300">{t('mapEditor.tags')}</div>
      <div className="space-y-1" data-testid="map-tags-panel">
        {doc.tags.map((tag, index) => (
          <div key={tag.id} className="rounded bg-gray-950 p-1 text-[11px]">
            <input className="w-full rounded bg-gray-800 px-1 py-1" value={tag.name} onChange={(event) => { tag.name = event.target.value; bump(doc) }} />
            <div className="mt-1 flex gap-1">
              <select className="min-w-0 flex-1 rounded bg-gray-800 px-1 py-1" value={tag.triggerId} onChange={(event) => { tag.triggerId = event.target.value; bump(doc) }}>
                {doc.triggers.map((trigger) => <option key={trigger.id} value={trigger.id}>{trigger.name}</option>)}
              </select>
              <select className="w-16 rounded bg-gray-800 px-1 py-1" value={tag.repeatType} onChange={(event) => { tag.repeatType = Number(event.target.value); bump(doc) }}>
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
              <button type="button" className="text-red-400" onClick={() => { doc.tags.splice(index, 1); bump(doc) }}>×</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="rounded bg-gray-800 px-2 py-1 text-xs"
          onClick={() => {
            doc.tags.push({
              id: createMapObjectId(),
              repeatType: 2,
              name: 'New Tag',
              triggerId: doc.triggers[0]?.id ?? '',
            })
            bump(doc)
          }}
          data-testid="map-add-tag"
        >
          {t('mapEditor.addTag')}
        </button>
      </div>
    </div>
  )
}

export default TriggerLogicPanel
