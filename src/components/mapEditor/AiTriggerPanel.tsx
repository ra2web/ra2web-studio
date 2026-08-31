import React from 'react'
import {
  FA2_AI_COMPARISONS,
  FA2_AI_SIDES,
  FA2_AI_TRIGGER_KINDS,
  defaultAiTrigger,
  syncAiComparator,
} from '../../data/map/fa2AiTriggers'
import { getFreeFa2Id } from '../../data/map/fa2UserScript'
import { MapDocument } from '../../data/map/MapDocument'
import { useLocale } from '../../i18n/LocaleContext'

type AiTriggerPanelProps = {
  doc: MapDocument
  bump: (doc: MapDocument) => void
  objectNames: string[]
}

const AiTriggerPanel: React.FC<AiTriggerPanelProps> = ({ doc, bump, objectNames }) => {
  const { t } = useLocale()

  return (
    <div className="space-y-2 text-sm" data-testid="map-ai-panel">
      <button
        type="button"
        className="rounded bg-gray-800 px-2 py-1"
        data-testid="map-add-ai-trigger"
        onClick={() => {
          const id = getFreeFa2Id(doc)
          doc.aiTriggers.push(defaultAiTrigger(id, doc.teams[0]?.id ?? '<none>'))
          doc.aiTriggerEnable[id] = true
          bump(doc)
        }}
      >
        {t('mapEditor.addAiTrigger')}
      </button>
      {doc.aiTriggers.map((trigger, index) => (
        <div key={trigger.id} className="space-y-1 rounded border border-gray-800 p-2">
          <input className="w-full rounded bg-gray-800 px-2 py-1" value={trigger.name} onChange={(event) => { trigger.name = event.target.value; bump(doc) }} />
          <label className="block text-[11px] text-gray-400">Type
            <select
              className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1"
              data-testid="map-ai-type"
              value={trigger.conditionType}
              onChange={(event) => { trigger.conditionType = Number(event.target.value); bump(doc) }}
            >
              {FA2_AI_TRIGGER_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">Team 1
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.team1} onChange={(event) => { trigger.team1 = event.target.value; bump(doc) }}>
              <option value="<none>">&lt;none&gt;</option>
              {doc.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">Team 2
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.team2} onChange={(event) => { trigger.team2 = event.target.value; bump(doc) }}>
              <option value="<none>">&lt;none&gt;</option>
              {doc.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">House
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.ownerHouse} onChange={(event) => { trigger.ownerHouse = event.target.value; bump(doc) }}>
              <option value="<all>">&lt;all&gt;</option>
              {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">Multi-Side
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.multiSide} onChange={(event) => { trigger.multiSide = event.target.value; bump(doc) }}>
              {FA2_AI_SIDES.map((side) => <option key={side.value} value={side.value}>{side.label}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">Unittype (X)
            <input list="map-ai-objects" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.conditionObject} onChange={(event) => { trigger.conditionObject = event.target.value; bump(doc) }} />
            <datalist id="map-ai-objects">
              <option value="<none>" />
              {objectNames.map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
          <label className="block text-[11px] text-gray-400">Condition
            <select
              className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1"
              data-testid="map-ai-condition"
              value={trigger.conditionCmp}
              onChange={(event) => {
                trigger.conditionCmp = Number(event.target.value)
                syncAiComparator(trigger)
                bump(doc)
              }}
            >
              {FA2_AI_COMPARISONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">Number (N)
            <input
              type="number"
              className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1"
              data-testid="map-ai-number"
              value={trigger.conditionNumber}
              onChange={(event) => {
                trigger.conditionNumber = Number(event.target.value) || 0
                syncAiComparator(trigger)
                bump(doc)
              }}
            />
          </label>
          <label className="block text-[11px] text-gray-400">Weight
            <input type="number" step="0.01" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.weight} onChange={(event) => { trigger.weight = Number(event.target.value); bump(doc) }} />
          </label>
          <div className="flex gap-1">
            <label className="block flex-1 text-[11px] text-gray-400">MinWeight
              <input type="number" step="0.01" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.minWeight} onChange={(event) => { trigger.minWeight = Number(event.target.value); bump(doc) }} />
            </label>
            <label className="block flex-1 text-[11px] text-gray-400">MaxWeight
              <input type="number" step="0.01" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.maxWeight} onChange={(event) => { trigger.maxWeight = Number(event.target.value); bump(doc) }} />
            </label>
          </div>
          <label className="block text-[11px] text-gray-400">TechLevel
            <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={trigger.techLevel} onChange={(event) => { trigger.techLevel = Number(event.target.value); bump(doc) }} />
          </label>
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
            {([
              ['skirmish', 'Skirmish'],
              ['baseDefense', 'Base defense'],
              ['enabledEasy', 'Easy'],
              ['enabledMedium', 'Medium'],
              ['enabledHard', 'Hard'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1">
                <input type="checkbox" checked={trigger[key]} onChange={(event) => { trigger[key] = event.target.checked; bump(doc) }} />
                {label}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-400">
            <input
              type="checkbox"
              data-testid="map-ai-enable"
              checked={doc.aiTriggerEnable[trigger.id] !== false}
              onChange={(event) => {
                doc.aiTriggerEnable[trigger.id] = event.target.checked
                bump(doc)
              }}
            />
            {t('mapEditor.aiTriggerEnable')}
          </label>
          <button
            type="button"
            className="text-[11px] text-red-400"
            onClick={() => {
              doc.aiTriggers.splice(index, 1)
              delete doc.aiTriggerEnable[trigger.id]
              bump(doc)
            }}
          >
            {t('mapEditor.deleteAiTrigger')}
          </button>
        </div>
      ))}
    </div>
  )
}

export default AiTriggerPanel
