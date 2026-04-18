import React from 'react'
import type { GameResImportStepState } from '../services/gameRes/types'
import { useLocale } from '../i18n/LocaleContext'

interface ImportProgressPanelProps {
  steps: GameResImportStepState[]
  message?: string
  currentItem?: string
  percentage?: number
  fallbackMessage?: string
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

function getStatusClass(status: GameResImportStepState['status']): string {
  if (status === 'completed') return 'text-green-400'
  if (status === 'active') return 'text-blue-300'
  if (status === 'error') return 'text-red-400'
  return 'text-gray-500'
}

function getDotClass(status: GameResImportStepState['status']): string {
  if (status === 'completed') return 'bg-green-500'
  if (status === 'active') return 'bg-blue-500 animate-pulse'
  if (status === 'error') return 'bg-red-500'
  return 'bg-gray-600'
}

const ImportProgressPanel: React.FC<ImportProgressPanelProps> = ({
  steps,
  message,
  currentItem,
  percentage,
  fallbackMessage,
}) => {
  const { t } = useLocale()
  const normalizedPercent = typeof percentage === 'number' ? clampPercent(percentage) : null

  return (
    <div className="mt-4 rounded border border-gray-700 bg-gray-900/50 p-4">
      <div className="text-sm font-semibold text-gray-200">{t('importProgress.stepsTitle')}</div>
      <div className="mt-3 grid gap-1">
        {steps.map((step) => (
          <div key={step.id} className={`flex items-center gap-2 text-xs ${getStatusClass(step.status)}`}>
            <span className={`h-2 w-2 rounded-full ${getDotClass(step.status)}`} />
            <span>{t(`gameRes.${step.id}` as 'gameRes.prepare')}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 text-sm text-yellow-300">
        {message || fallbackMessage || t('importProgress.waitStart')}
      </div>

      {currentItem && (
        <div className="mt-1 text-xs text-gray-400 break-all">
          {t('importProgress.currentItem')}: {currentItem}
        </div>
      )}

      {normalizedPercent !== null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
            <span>{t('common.progress')}</span>
            <span>{normalizedPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-700">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${normalizedPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ImportProgressPanel
