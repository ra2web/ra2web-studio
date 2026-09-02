/** FA2 `GetUnitName`：rules `UIName` → CSF，否则 rules `Name`。展示为 `译名 [代号]`。 */

import { MapIni } from './MapIni'

export type ObjectNameLookup = {
  csf: Record<string, string>
  uiName: Record<string, string>
  rulesName: Record<string, string>
}

export function emptyObjectNameLookup(): ObjectNameLookup {
  return { csf: {}, uiName: {}, rulesName: {} }
}

export function collectRulesObjectNames(ini: MapIni): Pick<ObjectNameLookup, 'uiName' | 'rulesName'> {
  const uiName: Record<string, string> = {}
  const rulesName: Record<string, string> = {}
  for (const section of ini.sections) {
    const ui = ini.getValue(section.name, 'UIName').trim()
    const name = ini.getValue(section.name, 'Name').trim()
    if (ui) uiName[section.name] = ui
    if (name) rulesName[section.name] = name
  }
  return { uiName, rulesName }
}

function lookupKey(table: Record<string, string>, key: string): string | undefined {
  if (!key) return undefined
  if (table[key]) return table[key]
  return table[key.toUpperCase()]
}

export function lookupObjectTitle(code: string, names: ObjectNameLookup): string {
  const ui = lookupKey(names.uiName, code)
  const fromCsf = (ui ? lookupKey(names.csf, ui) : undefined)
    || lookupKey(names.csf, `NAME:${code}`)
  const fromRules = lookupKey(names.rulesName, code)
  return (fromCsf || fromRules || '').trim()
}

export function formatObjectLabel(
  code: string,
  names: ObjectNameLookup,
  options: { missingArt?: boolean; missingText?: string } = {},
): string {
  const title = lookupObjectTitle(code, names)
  const base = title && title.toLowerCase() !== code.toLowerCase()
    ? `${title} [${code}]`
    : code
  if (!options.missingArt) return base
  const missing = options.missingText || '素材丢失'
  return `${base} (${missing})`
}
