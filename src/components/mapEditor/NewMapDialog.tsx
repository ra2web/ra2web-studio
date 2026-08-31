import React, { useMemo, useState } from 'react'
import { THEATERS, validateMapSize, type MapTheater } from '../../data/map/constants'
import { useLocale } from '../../i18n/LocaleContext'

export type NewMapDialogResult = {
  fileName: string
  width: number
  height: number
  theater: MapTheater
  groundHeight: number
  multiplayer: boolean
  name: string
  yuriRevenge: boolean
}

type NewMapDialogProps = {
  open: boolean
  onCancel: () => void
  onCreate: (result: NewMapDialogResult) => void
}

const NewMapDialog: React.FC<NewMapDialogProps> = ({ open, onCancel, onCreate }) => {
  const { t } = useLocale()
  const [fileName, setFileName] = useState('new-map.map')
  const [width, setWidth] = useState(50)
  const [height, setHeight] = useState(50)
  const [theater, setTheater] = useState<MapTheater>('TEMPERATE')
  const [groundHeight, setGroundHeight] = useState(0)
  const [multiplayer, setMultiplayer] = useState(true)
  const [yuriRevenge, setYuriRevenge] = useState(true)
  const [name, setName] = useState('No name')
  const error = useMemo(() => validateMapSize(width, height), [width, height])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" data-testid="new-map-dialog">
      <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-gray-900 p-4 text-gray-100 shadow-xl">
        <h2 className="text-lg font-semibold">{t('mapEditor.newMapTitle')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t('mapEditor.fileName')}
            <input className="mt-1 w-full rounded bg-gray-800 px-2 py-2" value={fileName} onChange={(event) => setFileName(event.target.value)} />
          </label>
          <label className="text-sm">
            {t('mapEditor.mapName')}
            <input className="mt-1 w-full rounded bg-gray-800 px-2 py-2" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-sm">
            {t('mapEditor.width')}
            <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-2" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <label className="text-sm">
            {t('mapEditor.height')}
            <input type="number" className="mt-1 w-full rounded bg-gray-800 px-2 py-2" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
          </label>
          <label className="text-sm">
            {t('mapEditor.theater')}
            <select className="mt-1 w-full rounded bg-gray-800 px-2 py-2" value={theater} onChange={(event) => setTheater(event.target.value as MapTheater)}>
              {THEATERS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm">
            {t('mapEditor.groundHeight')}
            <input type="number" min={0} max={14} className="mt-1 w-full rounded bg-gray-800 px-2 py-2" value={groundHeight} onChange={(event) => setGroundHeight(Number(event.target.value))} />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={multiplayer} onChange={(event) => setMultiplayer(event.target.checked)} />
          {t('mapEditor.multiplayer')}
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={yuriRevenge}
            onChange={(event) => setYuriRevenge(event.target.checked)}
            data-testid="new-map-yuri"
          />
          {t('mapEditor.yuriRevenge')}
        </label>
        {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded bg-gray-700 px-3 py-2" onClick={onCancel}>{t('common.cancel')}</button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-2 disabled:opacity-40"
            disabled={!!error || !fileName.trim()}
            onClick={() => onCreate({ fileName: fileName.trim(), width, height, theater, groundHeight, multiplayer, name, yuriRevenge })}
          >
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NewMapDialog
