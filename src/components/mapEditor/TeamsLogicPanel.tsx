import React from 'react'
import { getFreeFa2Id } from '../../data/map/fa2UserScript'
import { FA2_SCRIPT_MISSIONS } from '../../data/map/fa2ScriptMissions'
import { MapDocument } from '../../data/map/MapDocument'
import { defaultTeamType, TEAM_BOOL_FLAGS, type MapTeamType } from '../../data/map/types'
import { useLocale } from '../../i18n/LocaleContext'

type TeamsLogicPanelProps = {
  doc: MapDocument
  owner: string
  bump: (doc: MapDocument) => void
}

const TeamsLogicPanel: React.FC<TeamsLogicPanelProps> = ({ doc, owner, bump }) => {
  const { t } = useLocale()

  const addScript = () => {
    const id = getFreeFa2Id(doc)
    doc.scripts.push({ id, name: 'New script', actions: [{ type: 0, argument: '0' }] })
    bump(doc)
  }

  const addTaskForce = () => {
    const id = getFreeFa2Id(doc)
    doc.taskForces.push({ id, name: 'New task force', group: -1, entries: [{ count: 1, objectName: 'E1' }] })
    bump(doc)
  }

  const addTeam = () => {
    const team: MapTeamType = defaultTeamType(getFreeFa2Id(doc), owner)
    team.script = doc.scripts[0]?.id ?? '<none>'
    team.taskForce = doc.taskForces[0]?.id ?? '<none>'
    doc.teams.push(team)
    bump(doc)
  }

  return (
    <div className="space-y-2 text-sm" data-testid="map-teams-panel">
      <div className="flex flex-wrap gap-1">
        <button type="button" className="rounded bg-gray-800 px-2 py-1" data-testid="map-add-team" onClick={addTeam}>
          {t('mapEditor.addTeam')}
        </button>
        <button type="button" className="rounded bg-gray-800 px-2 py-1" data-testid="map-add-script" onClick={addScript}>
          {t('mapEditor.addScript')}
        </button>
        <button type="button" className="rounded bg-gray-800 px-2 py-1" data-testid="map-add-taskforce" onClick={addTaskForce}>
          {t('mapEditor.addTaskForce')}
        </button>
      </div>
      {doc.teams.map((team) => (
        <div key={team.id} className="space-y-1 rounded border border-gray-800 p-2">
          <input className="w-full rounded bg-gray-800 px-2 py-1" value={team.name} onChange={(event) => { team.name = event.target.value; bump(doc) }} />
          <label className="block text-[11px] text-gray-400">House
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.houseName} onChange={(event) => { team.houseName = event.target.value; bump(doc) }}>
              {doc.houses.map((house) => <option key={house.name} value={house.name}>{house.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">Script
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.script} onChange={(event) => { team.script = event.target.value; bump(doc) }}>
              <option value="<none>">&lt;none&gt;</option>
              {doc.scripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">TaskForce
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.taskForce} onChange={(event) => { team.taskForce = event.target.value; bump(doc) }}>
              <option value="<none>">&lt;none&gt;</option>
              {doc.taskForces.map((force) => <option key={force.id} value={force.id}>{force.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-gray-400">Tag
            <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={team.tag} onChange={(event) => { team.tag = event.target.value; bump(doc) }}>
              <option value="<none>">&lt;none&gt;</option>
              {doc.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1">
            {([
              ['waypoint', team.waypoint],
              ['transportWaypoint', team.transportWaypoint],
              ['veteranLevel', team.veteranLevel],
              ['max', team.max],
              ['priority', team.priority],
              ['techLevel', team.techLevel],
              ['group', team.group],
              ['mindControlDecision', team.mindControlDecision],
            ] as const).map(([key, value]) => (
              <label key={key} className="block text-[11px] text-gray-400">{key}
                <input
                  type="number"
                  className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1"
                  value={value}
                  onChange={(event) => { team[key] = Number(event.target.value); bump(doc) }}
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2">
            {TEAM_BOOL_FLAGS.map((flag) => (
              <label key={flag} className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                <input type="checkbox" checked={team[flag]} onChange={(event) => { team[flag] = event.target.checked; bump(doc) }} />
                {flag}
              </label>
            ))}
          </div>
          <div className="text-[11px] text-gray-500">{team.id}</div>
        </div>
      ))}
      {doc.scripts.map((script) => (
        <div key={script.id} className="rounded border border-gray-800 p-2 text-xs">
          <input className="w-full rounded bg-gray-800 px-2 py-1 font-medium" value={script.name} onChange={(event) => { script.name = event.target.value; bump(doc) }} />
          {script.actions.map((action, actionIndex) => (
            <div key={actionIndex} className="mt-1 flex gap-1">
              <select
                className="min-w-0 flex-1 rounded bg-gray-800 px-1"
                data-testid={actionIndex === 0 ? 'map-script-mission' : undefined}
                value={action.type}
                title={FA2_SCRIPT_MISSIONS[action.type]?.help}
                onChange={(event) => { action.type = Number(event.target.value); bump(doc) }}
              >
                {FA2_SCRIPT_MISSIONS.map((mission) => (
                  <option key={mission.id} value={mission.id}>{mission.id} {mission.name}</option>
                ))}
              </select>
              <input className="w-20 rounded bg-gray-800 px-1" value={action.argument} onChange={(event) => { action.argument = event.target.value; bump(doc) }} />
            </div>
          ))}
          <button type="button" className="mt-1 text-sky-400" onClick={() => { script.actions.push({ type: 0, argument: '0' }); bump(doc) }}>+ action</button>
        </div>
      ))}
      {doc.taskForces.map((force) => (
        <div key={force.id} className="rounded border border-gray-800 p-2 text-xs">
          <input className="w-full rounded bg-gray-800 px-2 py-1 font-medium" value={force.name} onChange={(event) => { force.name = event.target.value; bump(doc) }} />
          <label className="mt-1 block text-[11px] text-gray-400">Group
            <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={force.group} onChange={(event) => { force.group = Number(event.target.value); bump(doc) }} />
          </label>
          {force.entries.map((entry, entryIndex) => (
            <div key={entryIndex} className="mt-1 flex gap-1">
              <input type="number" className="w-12 rounded bg-gray-800 px-1" value={entry.count} onChange={(event) => { entry.count = Number(event.target.value); bump(doc) }} />
              <input className="flex-1 rounded bg-gray-800 px-1" value={entry.objectName} onChange={(event) => { entry.objectName = event.target.value; bump(doc) }} />
            </div>
          ))}
          <button type="button" className="mt-1 text-sky-400" onClick={() => { force.entries.push({ count: 1, objectName: 'E1' }); bump(doc) }}>+ unit</button>
        </div>
      ))}
    </div>
  )
}

export default TeamsLogicPanel
