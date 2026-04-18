import type { GameResPersistedConfig, ImportedResourceFile, ResourceReadiness } from './types'

const STORAGE_KEY = 'ra2web-studio.gameResConfig'

export const REQUIRED_BASE_MIXES = ['ra2.mix', 'language.mix', 'multi.mix'] as const

function toLowerSet(values: readonly string[]): Set<string> {
  return new Set(values.map((v) => v.toLowerCase()))
}

export class GameResConfig {
  static load(): GameResPersistedConfig {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
      if (!raw) {
        return {
          activeProjectName: null,
          lastImportAt: null,
        }
      }
      const parsed = JSON.parse(raw) as Partial<GameResPersistedConfig> & {
        activeModName?: string | null
      }
      return {
        activeProjectName: parsed.activeProjectName ?? parsed.activeModName ?? null,
        lastImportAt: typeof parsed.lastImportAt === 'number' ? parsed.lastImportAt : null,
      }
    } catch {
      return {
        activeProjectName: null,
        lastImportAt: null,
      }
    }
  }

  static save(config: GameResPersistedConfig): void {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(config))
  }

  static markImported(activeProjectName: string | null): void {
    this.save({
      activeProjectName,
      lastImportAt: Date.now(),
    })
  }

  static checkReadiness(files: ImportedResourceFile[]): ResourceReadiness {
    const baseNames = toLowerSet(
      files.filter((f) => f.bucket === 'base').map((f) => f.name),
    )
    const missing = REQUIRED_BASE_MIXES.filter((name) => !baseNames.has(name.toLowerCase()))
    return {
      ready: missing.length === 0,
      missingRequiredFiles: missing,
    }
  }
}
