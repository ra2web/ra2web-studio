import React from 'react'
import { MapDocument } from '../../data/map/MapDocument'
import type { MapTechno } from '../../data/map/types'

type ObjectInspectorProps = {
  doc: MapDocument
  selected: { rx: number; ry: number } | null
  bump: (doc: MapDocument) => void
}

const MISSIONS = ['Guard', 'Sleep', 'Attack', 'Move', 'Harvest', 'Area Guard', 'Patrol', 'Ambush']

function TechnoFields({
  item,
  houses,
  tags,
  bump,
}: {
  item: MapTechno
  houses: string[]
  tags: Array<{ id: string; name: string }>
  bump: () => void
}) {
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium text-gray-200">{item.name}</div>
      <label className="block text-gray-400">Owner
        <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.owner} onChange={(event) => { item.owner = event.target.value; bump() }}>
          {houses.map((house) => <option key={house} value={house}>{house}</option>)}
        </select>
      </label>
      <label className="block text-gray-400">Health
        <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.health} onChange={(event) => { item.health = Number(event.target.value); bump() }} />
      </label>
      <label className="block text-gray-400">Facing
        <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.direction} onChange={(event) => { item.direction = Number(event.target.value); bump() }} />
      </label>
      <label className="block text-gray-400">Mission
        <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.mission} onChange={(event) => { item.mission = event.target.value; bump() }}>
          {MISSIONS.map((mission) => <option key={mission} value={mission}>{mission}</option>)}
        </select>
      </label>
      <label className="block text-gray-400">Tag
        <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.tag} onChange={(event) => { item.tag = event.target.value; bump() }}>
          <option value="none">none</option>
          {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
      </label>
      <label className="block text-gray-400">Veterancy
        <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.veterancy} onChange={(event) => { item.veterancy = Number(event.target.value); bump() }} />
      </label>
      {item.subCell !== undefined && (
        <label className="block text-gray-400">SubCell
          <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.subCell} onChange={(event) => { item.subCell = Number(event.target.value); bump() }} />
        </label>
      )}
      {item.upgrade1 !== undefined && (
        <>
          <label className="block text-gray-400">Upgrade 1
            <input className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.upgrade1} onChange={(event) => { item.upgrade1 = event.target.value; bump() }} />
          </label>
          <label className="block text-gray-400">Upgrade 2
            <input className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.upgrade2 ?? ''} onChange={(event) => { item.upgrade2 = event.target.value; bump() }} />
          </label>
          <label className="block text-gray-400">Upgrade 3
            <input className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.upgrade3 ?? ''} onChange={(event) => { item.upgrade3 = event.target.value; bump() }} />
          </label>
        </>
      )}
    </div>
  )
}

const ObjectInspector: React.FC<ObjectInspectorProps> = ({ doc, selected, bump }) => {
  if (!selected) return <p className="text-xs text-gray-500">选择格子以编辑对象属性。</p>
  const bumpDoc = () => bump(doc)
  const houses = doc.houses.map((house) => house.name)
  const tags = doc.tags.map((tag) => ({ id: tag.id, name: tag.name }))
  const unit = doc.units.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const inf = doc.infantry.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const air = doc.aircraft.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const building = doc.structures.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const terrain = doc.terrains.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const waypoint = doc.waypoints.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  if (!unit && !inf && !air && !building && !terrain && !waypoint) {
    return <p className="text-xs text-gray-500">此格没有对象。</p>
  }
  return (
    <div className="space-y-3" data-testid="map-object-inspector">
      {unit && <TechnoFields item={unit} houses={houses} tags={tags} bump={bumpDoc} />}
      {inf && <TechnoFields item={inf} houses={houses} tags={tags} bump={bumpDoc} />}
      {air && <TechnoFields item={air} houses={houses} tags={tags} bump={bumpDoc} />}
      {building && <TechnoFields item={building} houses={houses} tags={tags} bump={bumpDoc} />}
      {terrain && (
        <label className="block text-xs text-gray-400">Terrain
          <input className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={terrain.name} onChange={(event) => { terrain.name = event.target.value; bumpDoc() }} />
        </label>
      )}
      {waypoint && (
        <label className="block text-xs text-gray-400">Waypoint #
          <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={waypoint.number} onChange={(event) => { waypoint.number = Number(event.target.value); bumpDoc() }} />
        </label>
      )}
    </div>
  )
}

export default ObjectInspector
