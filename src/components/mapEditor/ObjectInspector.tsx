import React from 'react'
import { MapDocument } from '../../data/map/MapDocument'
import type { MapTechno } from '../../data/map/types'
import { structureAt } from '../../data/map/fa2Occupy'
import { infantryAtSubCell } from '../../data/map/fa2Infantry'
import { emptyObjectNameLookup, formatObjectLabel, type ObjectNameLookup } from '../../data/map/fa2ObjectLabel'
import type { BuildingFoundation } from '../../data/map/rulesObjects'
import type { MapSelection } from '../../data/map/types'
import type { ObjectSpriteKind } from '../../data/map/fa2Facing'
import type { TheaterArt } from '../../data/map/TheaterArt'
import { useLocale } from '../../i18n/LocaleContext'

type ObjectInspectorProps = {
  doc: MapDocument
  selected: MapSelection | null
  bump: (doc: MapDocument) => void
  foundations?: Record<string, BuildingFoundation>
  objectNames?: ObjectNameLookup
  theaterArt?: TheaterArt | null
}

const MISSIONS = ['Guard', 'Sleep', 'Attack', 'Move', 'Harvest', 'Area Guard', 'Patrol', 'Ambush']
const FACINGS = [0, 32, 64, 96, 128, 160, 192, 224]
const FACING_LABELS: Record<number, string> = {
  0: '0 北/右上',
  32: '32 东北/右',
  64: '64 东/右下',
  96: '96 东南/下',
  128: '128 南/左下',
  160: '160 西南/左',
  192: '192 西/左上',
  224: '224 西北/上',
}

function TechnoFields({
  item,
  houses,
  tags,
  bump,
  title,
}: {
  item: MapTechno
  houses: string[]
  tags: Array<{ id: string; name: string }>
  bump: () => void
  title: string
}) {
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium text-gray-200">{title}</div>
      <label className="block text-gray-400">Owner
        <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.owner} onChange={(event) => { item.owner = event.target.value; bump() }}>
          {houses.map((house) => <option key={house} value={house}>{house}</option>)}
        </select>
      </label>
      <label className="block text-gray-400">Health
        <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.health} onChange={(event) => { item.health = Number(event.target.value); bump() }} />
      </label>
      <label className="block text-gray-400">Facing
        <select className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.direction} onChange={(event) => { item.direction = Number(event.target.value); bump() }}>
          {[...new Set([...FACINGS, item.direction])].map((facing) => (
            <option key={facing} value={facing}>{FACING_LABELS[facing] ?? facing}</option>
          ))}
        </select>
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
      <label className="block text-gray-400">Group
        <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.group} onChange={(event) => { item.group = Number(event.target.value); bump() }} />
      </label>
      <label className="flex items-center gap-2 text-gray-400">
        <input type="checkbox" checked={item.onBridge} onChange={(event) => { item.onBridge = event.target.checked; bump() }} />
        OnBridge
      </label>
      <label className="flex items-center gap-2 text-gray-400">
        <input type="checkbox" checked={item.recruitable} onChange={(event) => { item.recruitable = event.target.checked; bump() }} />
        Recruitable
      </label>
      <label className="flex items-center gap-2 text-gray-400">
        <input type="checkbox" checked={item.aiRecruitable} onChange={(event) => { item.aiRecruitable = event.target.checked; bump() }} />
        AIRecruitable
      </label>
      {item.poweredOn !== undefined && (
        <label className="flex items-center gap-2 text-gray-400">
          <input type="checkbox" checked={item.poweredOn} onChange={(event) => { item.poweredOn = event.target.checked; bump() }} />
          Powered
        </label>
      )}
      {item.subCell !== undefined && (
        <label className="block text-gray-400">SubCell
          <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.subCell} onChange={(event) => { item.subCell = Number(event.target.value); bump() }} />
        </label>
      )}
      {item.upgrade1 !== undefined && (
        <>
          <label className="block text-gray-400">Spotlight
            <input className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={item.spotlight ?? '0'} onChange={(event) => { item.spotlight = event.target.value; bump() }} />
          </label>
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

const ObjectInspector: React.FC<ObjectInspectorProps> = ({
  doc,
  selected,
  bump,
  foundations = {},
  objectNames = emptyObjectNameLookup(),
  theaterArt,
}) => {
  const { t } = useLocale()
  const titleOf = (code: string, kind?: ObjectSpriteKind) => {
    let missing = false
    if (theaterArt && kind) {
      const peek = theaterArt.peekObject(code, 0, 0, undefined, kind)
      missing = peek === null
    }
    return formatObjectLabel(code, objectNames, { missingArt: missing, missingText: t('mapEditor.missingArt') })
  }
  if (!selected) return <p className="text-xs text-gray-500">选择格子以编辑对象属性。</p>
  const bumpDoc = () => bump(doc)
  const byId = selected.objectId
  const unit = byId
    ? doc.units.find((item) => item.id === byId)
    : doc.units.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const pickedInfantry = byId
    ? doc.infantry.find((item) => item.id === byId)
    : infantryAtSubCell(doc.infantry, selected.rx, selected.ry, selected.subCell)
  const infantry = pickedInfantry ? [pickedInfantry] : []
  const air = byId
    ? doc.aircraft.find((item) => item.id === byId)
    : doc.aircraft.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const building = byId
    ? doc.structures.find((item) => item.id === byId)
    : structureAt(doc, selected.rx, selected.ry, foundations)
      ?? doc.structures.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const terrain = byId
    ? doc.terrains.find((item) => item.id === byId)
    : doc.terrains.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const waypoint = byId && /^\d+$/.test(byId)
    ? doc.waypoints.find((item) => item.number === Number(byId))
    : doc.waypoints.find((item) => item.rx === selected.rx && item.ry === selected.ry)
  const houses = [...new Set([
    ...doc.houses.map((house) => house.name),
    unit?.owner,
    air?.owner,
    building?.owner,
    ...infantry.map((item) => item.owner),
  ].filter((name): name is string => Boolean(name)))]
  const tags = doc.tags.map((tag) => ({ id: tag.id, name: tag.name }))
  if (!unit && infantry.length === 0 && !air && !building && !terrain && !waypoint) {
    return <p className="text-xs text-gray-500">此格没有对象。用地图树「无」点选步兵或建筑。</p>
  }
  return (
    <div className="space-y-3" data-testid="map-object-inspector">
      {unit && <TechnoFields item={unit} houses={houses} tags={tags} bump={bumpDoc} title={titleOf(unit.name, 'unit')} />}
      {infantry.map((item) => (
        <TechnoFields key={item.id} item={item} houses={houses} tags={tags} bump={bumpDoc} title={titleOf(item.name, 'infantry')} />
      ))}
      {air && <TechnoFields item={air} houses={houses} tags={tags} bump={bumpDoc} title={titleOf(air.name, 'unit')} />}
      {building && <TechnoFields item={building} houses={houses} tags={tags} bump={bumpDoc} title={titleOf(building.name, 'building')} />}
      {terrain && (
        <label className="block text-xs text-gray-400">{titleOf(terrain.name, 'terrain')}
          <input className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={terrain.name} onChange={(event) => { terrain.name = event.target.value; bumpDoc() }} />
        </label>
      )}
      {waypoint && (
        <label className="block text-xs text-gray-400">{t('mapEditor.toolWaypoint')} #
          <input type="number" className="mt-0.5 w-full rounded bg-gray-800 px-1 py-1" value={waypoint.number} onChange={(event) => { waypoint.number = Number(event.target.value); bumpDoc() }} />
        </label>
      )}
    </div>
  )
}

export default ObjectInspector
