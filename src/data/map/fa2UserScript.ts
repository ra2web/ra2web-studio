import { MapDocument, createMapObjectId } from './MapDocument'
import { MapIni } from './MapIni'
import { resizeMap } from './resizeMap'
import type { MapSmudge, MapTechno, MapTerrainObject } from './types'

/** FA2 UserScriptsDlg 解析出的一条命令。 */
export type UserScriptFn = {
  name: string
  params: string[]
}

export type ParsedUserScript = {
  functions: UserScriptFn[]
  /** 标签名 → 下一条命令下标（FA2 `jumplinedata = functioncount`）。 */
  labels: Map<string, number>
}

export type UserScriptResult = {
  ok: boolean
  report: string
  error?: string
}

const NO_REPLACE_FIRST = new Set([
  'SetVariable', 'Add', 'Substract', 'Multi', 'Divide', 'Mod',
  'LowerCase', 'UpperCase', 'GetFreeWaypoint', 'JumpTo',
  'GetRandom', 'GetIniKey', 'Insert', 'Length', 'Trim', 'GetChar',
  'Replace', 'Remove', 'GetParam', 'SetParam', 'GetParamCount',
  'IsInfantryDeleted', 'IsTerrainDeleted', 'GetInfantry', 'GetAircraft',
  'GetStructure', 'GetVehicle', 'GetHouse', 'GetCountry', 'GetHouseIndex',
  'Or', 'And', 'Not',
])

const UI_COMMANDS = new Set([
  'AskContinue', 'Message', 'Ask', 'UInputGetInteger', 'UInputGetString',
  'UInputGetHouse', 'UInputGetCountry', 'UInputGetTrigger', 'UInputGetTag',
  'UInputSelect', 'AddTrigger', 'AddAITrigger', 'AddTag',
])

export function isValSet(value: string): boolean {
  const lower = value.toLowerCase()
  if (lower === 'false' || lower === 'no') return false
  if (lower === 'true' || lower === 'yes') return true
  return atoi(value) !== 0
}

export function atoi(value: string): number {
  const match = String(value).trim().match(/^[-+]?\d+/)
  return match ? Number(match[0]) : 0
}

export function csvParamCount(value: string): number {
  let count = 1
  for (const ch of value) {
    if (ch === ',') count++
  }
  return count
}

export function getParam(data: string, index: number): string {
  let pos = 0
  let remain = index
  while (remain--) {
    const comma = data.indexOf(',', pos)
    if (comma < 0) return ''
    pos = comma + 1
  }
  const comma = data.indexOf(',', pos)
  return comma < 0 ? data.slice(pos) : data.slice(pos, comma)
}

export function setParam(data: string, index: number, value: string): string {
  if (index < 0) return data
  const parts = data.length ? data.split(',') : []
  while (parts.length <= index) parts.push('')
  parts[index] = value
  return parts.join(',')
}

function isAlnum(ch: string): boolean {
  return /[0-9A-Za-z]/.test(ch)
}

/**
 * FA2 `CUserScript::LoadFile`：`//` 注释、`:label:`、`Func("a","b")`。
 * `""` 为转义引号；`\n`/`\r` 为换行。
 */
export function parseUserScript(source: string): ParsedUserScript {
  const functions: UserScriptFn[] = []
  const labels = new Map<string, number>()
  let inFunction = false
  let inParam = false
  let inComment = false
  let inFunctionHead = false
  let inJumpLine = false
  let jumplinename = ''

  const last = () => functions[functions.length - 1]

  for (let i = 0; i < source.length; i++) {
    const ch = source[i] ?? ''
    const next = source[i + 1] ?? ''

    if (inComment) {
      if (ch === '\n') {
        inComment = false
        inJumpLine = false
        jumplinename = ''
      }
      continue
    }

    if (!inFunction && !inFunctionHead && !inJumpLine) {
      if (ch === '/' && next === '/') {
        inComment = true
        continue
      }
      if (ch === ';') continue
      if (ch === ':') {
        inJumpLine = true
        jumplinename = ''
        continue
      }
      if (isAlnum(ch)) {
        inFunction = true
        functions.push({ name: ch, params: [] })
      }
      continue
    }

    if (ch === '(' && !inParam) {
      inFunctionHead = true
      continue
    }

    if (inFunctionHead && inParam) {
      const fn = last()
      const pi = fn.params.length - 1
      if (ch === '\\' && (next === 'n' || next === 'N')) {
        fn.params[pi] += '\n'
        i++
        continue
      }
      if (ch === '\\' && (next === 'r' || next === 'R')) {
        fn.params[pi] += '\r'
        i++
        continue
      }
      if (ch === '"' && next !== '"') {
        inParam = false
        continue
      }
      fn.params[pi] += ch
      if (ch === '"' && next === '"') i++
      continue
    }

    if (inFunction && !inParam && !inFunctionHead) {
      if (isAlnum(ch)) last().name += ch
      else inFunction = false
      continue
    }

    if (inFunctionHead && !inParam) {
      if (ch === '"') {
        inParam = true
        last().params.push('')
      }
      if (ch === ')') inFunctionHead = false
      continue
    }

    if (inJumpLine) {
      if (ch !== ':') jumplinename += ch
      else {
        labels.set(jumplinename, functions.length)
        jumplinename = ''
        inJumpLine = false
      }
    }
  }

  return { functions, labels }
}

function skipBool(params: string[], index: number): boolean {
  const flag = params[index]
  return Boolean(flag && flag.length > 0 && !isValSet(flag))
}

function replaceParams(fn: UserScriptFn, vars: Map<string, string>): string[] {
  return fn.params.map((param, index) => {
    if (NO_REPLACE_FIRST.has(fn.name) && index === 0) return param
    if (fn.name === 'GetWaypointPos' && (index === 1 || index === 2)) return param
    if (fn.name === 'Is' && index === 3) return param
    let next = param
    for (const [name, value] of vars) next = next.split(name).join(value)
    return next
  })
}

function builtinVars(doc: MapDocument): Map<string, string> {
  const vars = new Map<string, string>()
  vars.set('%Width%', String(doc.width))
  vars.set('%Height%', String(doc.height))
  vars.set('%IsoSize%', String(doc.isoSize))
  vars.set('%WaypointCount%', String(doc.waypoints.length))
  vars.set('%UnitCount%', String(doc.units.length))
  vars.set('%InfantryCount%', String(doc.infantry.length))
  vars.set('%StructureCount%', String(doc.structures.length))
  vars.set('%AircraftCount%', String(doc.aircraft.length))
  vars.set('%TerrainCount%', String(doc.terrains.length))
  vars.set('%Theater%', doc.theater)
  vars.set('%PlayerCount%', doc.basic.multiplayerOnly
    ? String(doc.waypoints.filter((item) => item.number >= 0 && item.number <= 7).length)
    : '1')
  vars.set('%HousesCount%', String(doc.houses.length))
  vars.set('%CountriesCount%', String(doc.countries.length))
  return vars
}

function nextWaypointNumber(doc: MapDocument): number {
  const used = new Set(doc.waypoints.map((item) => item.number))
  let n = 0
  while (used.has(n)) n++
  return n
}

function applyIniKey(doc: MapDocument, section: string, key: string, value: string): void {
  const ini = MapIni.parse(doc.toIniString())
  ini.setValue(section, key, value)
  doc.copyFrom(MapDocument.parse(ini.toString()))
}

function readIniKey(doc: MapDocument, section: string, key: string): string {
  return MapIni.parse(doc.toIniString()).getValue(section, key, '')
}

function technoLine(item: MapTechno, infantry: boolean): string {
  if (infantry) {
    return [
      item.owner, item.name, String(item.health), String(item.rx), String(item.ry),
      String(item.subCell ?? 0), item.mission, String(item.direction), item.tag || 'none',
      String(item.veterancy), String(item.group), item.onBridge ? '1' : '0',
      item.recruitable ? '1' : '0', item.aiRecruitable ? '1' : '0',
      ...item.extra,
    ].join(',')
  }
  return [
    item.owner, item.name, String(item.health), String(item.rx), String(item.ry),
    String(item.direction), item.mission, item.tag || 'none', String(item.veterancy),
    String(item.group), item.onBridge ? '1' : '0', '0',
    item.recruitable ? '1' : '0', item.aiRecruitable ? '1' : '0',
    ...item.extra,
  ].join(',')
}

function structureLine(item: MapTechno): string {
  return [
    item.owner, item.name, String(item.health), String(item.rx), String(item.ry),
    String(item.direction), item.tag || 'none', '1', '0', item.poweredOn === false ? '0' : '1',
    String(item.upgradeCount ?? 0), item.spotlight || '0',
    item.upgrade1 || 'none', item.upgrade2 || 'none', item.upgrade3 || 'none',
    '0', '0',
    ...item.extra,
  ].join(',')
}

function parseTechno(data: string, infantry: boolean): MapTechno {
  const fields = data.split(',')
  return {
    id: createMapObjectId(),
    owner: fields[0] || 'Neutral',
    name: fields[1] || '',
    health: Number(fields[2]) || 256,
    rx: Number(fields[3]) || 0,
    ry: Number(fields[4]) || 0,
    subCell: infantry ? Number(fields[5]) || 0 : undefined,
    mission: infantry ? (fields[6] || 'Guard') : (fields[6] || 'Guard'),
    direction: infantry ? Number(fields[7]) || 0 : Number(fields[5]) || 0,
    tag: infantry ? (fields[8] || 'none') : (fields[7] || 'none'),
    veterancy: infantry ? Number(fields[9]) || 0 : Number(fields[8]) || 0,
    group: infantry ? Number(fields[10]) || -1 : Number(fields[9]) || -1,
    onBridge: infantry ? fields[11] === '1' : fields[10] === '1',
    recruitable: infantry ? fields[12] === '1' : fields[12] === '1',
    aiRecruitable: infantry ? fields[13] === '1' : fields[13] === '1',
    extra: fields.slice(14),
  }
}

function parseStructure(data: string): MapTechno {
  const fields = data.split(',')
  return {
    id: createMapObjectId(),
    owner: fields[0] || 'Neutral',
    name: fields[1] || '',
    health: Number(fields[2]) || 256,
    rx: Number(fields[3]) || 0,
    ry: Number(fields[4]) || 0,
    direction: Number(fields[5]) || 0,
    tag: fields[6] || 'none',
    extra: fields.slice(17),
    poweredOn: fields[9] !== '0',
    upgradeCount: Number(fields[10]) || 0,
    spotlight: fields[11] || '0',
    upgrade1: fields[12] || 'none',
    upgrade2: fields[13] || 'none',
    upgrade3: fields[14] || 'none',
    mission: 'Guard',
    veterancy: 0,
    group: -1,
    onBridge: false,
    recruitable: false,
    aiRecruitable: false,
  }
}

function occupiedTechno(list: Array<{ rx: number; ry: number }>, rx: number, ry: number): boolean {
  return list.some((item) => item.rx === rx && item.ry === ry)
}

export type RunUserScriptOptions = {
  random?: () => number
  maxLoops?: number
}

/**
 * FA2 `CUserScriptsDlg::OnOK` 无交互子集。
 * 默认 SafeMode；`AllowAdd`/`AllowDelete`/`SetSafeMode("false")` 后才改图。
 */
export function runUserScript(
  doc: MapDocument,
  source: string,
  options: RunUserScriptOptions = {},
): UserScriptResult {
  const parsed = parseUserScript(source)
  const lines: string[] = []
  const vars = new Map<string, string>()
  const random = options.random ?? Math.random
  const maxLoops = options.maxLoops ?? 10000
  let safeMode = true
  let addAllowed = false
  let deleteAllowed = false
  let loops = 0

  const fail = (message: string): UserScriptResult => ({
    ok: false,
    report: [...lines, message].join('\n'),
    error: message,
  })

  for (let i = 0; i < parsed.functions.length; i++) {
    const fn = parsed.functions[i]
    if (!fn) continue
    const env = builtinVars(doc)
    env.set('%DeleteAllowed%', deleteAllowed ? '1' : '0')
    env.set('%AddAllowed%', addAllowed ? '1' : '0')
    env.set('%SafeMode%', safeMode ? '1' : '0')
    for (const [key, value] of env) vars.set(key, value)
    const params = replaceParams(fn, vars)
    const name = fn.name

    if (UI_COMMANDS.has(name)) {
      lines.push(`${name} skipped (interactive)`)
      continue
    }

    const need = (count: number) => params.length < count

    switch (name) {
      case 'SetSafeMode': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const lower = params[0].toLowerCase()
        safeMode = !(lower === 'false' || lower === 'no')
        lines.push(safeMode ? 'INI Protection enabled' : 'INI Protection disabled')
        break
      }
      case 'AllowAdd': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        addAllowed = true
        break
      }
      case 'AllowDelete': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        deleteAllowed = true
        break
      }
      case 'SetAutoUpdate':
        if (need(1)) return fail(`script error at ${name}`)
        break
      case 'SetVariable': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        vars.set(params[0], params[1])
        break
      }
      case 'Add':
      case 'Substract':
      case 'Multi':
      case 'Divide':
      case 'Mod': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const left = atoi(vars.get(params[0]) ?? '')
        const right = atoi(params[1])
        if ((name === 'Divide' || name === 'Mod') && right === 0) return fail('Division through 0')
        let next = left
        if (name === 'Add') next = left + right
        else if (name === 'Substract') next = left - right
        else if (name === 'Multi') next = left * right
        else if (name === 'Divide') next = Math.trunc(left / right)
        else next = left % right
        vars.set(params[0], String(next))
        break
      }
      case 'Is': {
        if (need(4)) return fail(`script error at ${name}`)
        if (skipBool(params, 4)) break
        const a = params[0]
        const op = params[1]
        const b = params[2]
        let ok = false
        if (op === '<') ok = atoi(a) < atoi(b)
        else if (op === '<=') ok = atoi(a) <= atoi(b)
        else if (op === '=') ok = atoi(a) === atoi(b) || a === b
        else if (op === '>=') ok = atoi(a) >= atoi(b)
        else if (op === '>') ok = atoi(a) > atoi(b)
        else if (op === '!=') ok = atoi(a) !== atoi(b) || a !== b
        vars.set(params[3], ok ? '1' : '0')
        break
      }
      case 'And': {
        if (need(2)) return fail(`script error at ${name}`)
        vars.set(params[0], params.slice(1).every(isValSet) ? '1' : '0')
        break
      }
      case 'Or': {
        if (need(2)) return fail(`script error at ${name}`)
        vars.set(params[0], params.slice(1).some(isValSet) ? '1' : '0')
        break
      }
      case 'Not': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        vars.set(params[0], isValSet(vars.get(params[0]) ?? '') ? '0' : '1')
        break
      }
      case 'LowerCase':
      case 'UpperCase':
      case 'Trim': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        let text = vars.get(params[0]) ?? ''
        if (name === 'LowerCase') text = text.toLowerCase()
        else if (name === 'UpperCase') text = text.toUpperCase()
        else text = text.trim()
        vars.set(params[0], text)
        break
      }
      case 'Length': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        vars.set(params[0], String(params[1].length))
        break
      }
      case 'Insert': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        const current = vars.get(params[0]) ?? ''
        let pos = atoi(params[2])
        if (pos < 0) pos = current.length
        vars.set(params[0], current.slice(0, pos) + params[1] + current.slice(pos))
        break
      }
      case 'Replace': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        vars.set(params[0], (vars.get(params[0]) ?? '').split(params[1]).join(params[2]))
        break
      }
      case 'Remove': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const current = vars.get(params[0]) ?? ''
        const pos = atoi(params[1])
        const len = atoi(params[2])
        if (pos < 0 || len < 0 || pos >= current.length) return fail('Invalid index or length for remove')
        vars.set(params[0], current.slice(0, pos) + current.slice(pos + len))
        break
      }
      case 'GetChar': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        const idx = atoi(params[2])
        if (idx < 0 || idx >= params[1].length) return fail('Invalid index for GetChar')
        vars.set(params[0], params[1][idx] ?? '')
        break
      }
      case 'GetParam': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        vars.set(params[0], getParam(params[1], atoi(params[2])))
        break
      }
      case 'SetParam': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        vars.set(params[0], setParam(vars.get(params[0]) ?? '', atoi(params[1]), params[2]))
        break
      }
      case 'GetParamCount': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        vars.set(params[0], String(csvParamCount(params[1])))
        break
      }
      case 'Print': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        lines.push(params[0])
        break
      }
      case 'Cancel': {
        if (params[0] && params[0].length > 0 && !isValSet(params[0])) break
        return { ok: true, report: lines.join('\n') }
      }
      case 'JumpTo': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        const target = parsed.labels.get(params[0])
        if (target == null || target < 0 || target > parsed.functions.length) {
          return fail(`script error at ${name}`)
        }
        loops++
        if (loops > maxLoops) return fail('Loop limit exceeded')
        i = target - 1
        break
      }
      case 'GetRandom': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        vars.set(params[0], String(Math.floor(random() * 32768)))
        break
      }
      case 'SetIniKey': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        if (safeMode) break
        applyIniKey(doc, params[0], params[1], params[2])
        lines.push(`${params[0]}->${params[1]} set to "${params[2]}"`)
        break
      }
      case 'GetIniKey': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        vars.set(params[0], readIniKey(doc, params[1], params[2]))
        break
      }
      case 'SetWaypoint': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        const n = atoi(params[0])
        if (safeMode && n >= 0 && doc.waypoints.some((item) => item.number === n)) break
        const number = n < 0 ? nextWaypointNumber(doc) : n
        const rx = atoi(params[1])
        const ry = atoi(params[2])
        if (rx + ry * doc.isoSize >= doc.isoSize * doc.isoSize) {
          lines.push(`Waypoint ${number} moving failed!`)
          break
        }
        const existing = doc.waypoints.find((item) => item.number === number)
        if (existing) {
          existing.rx = rx
          existing.ry = ry
        } else {
          doc.waypoints.push({ number, rx, ry })
        }
        lines.push(`Waypoint ${number} set.`)
        break
      }
      case 'GetWaypointPos': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        const found = doc.waypoints.find((item) => String(item.number) === params[0])
        vars.set(params[1], found ? String(found.rx) : '0')
        vars.set(params[2], found ? String(found.ry) : '0')
        break
      }
      case 'GetFreeWaypoint': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        vars.set(params[0], String(nextWaypointNumber(doc)))
        break
      }
      case 'RequiresMP': {
        if (params[0] && params[0].length > 0 && !isValSet(params[0])) break
        if (!doc.basic.multiplayerOnly) return fail('This script requires a multiplayer map')
        break
      }
      case 'RequiresSP': {
        if (params[0] && params[0].length > 0 && !isValSet(params[0])) break
        if (doc.basic.multiplayerOnly) return fail('This script requires a singleplayer map')
        break
      }
      case 'Resize': {
        if (need(4)) return fail(`script error at ${name}`)
        if (skipBool(params, 4)) break
        const width = atoi(params[2])
        const height = atoi(params[3])
        if (width > 200 || height > 200) return fail('Resizing map failed')
        const error = resizeMap(doc, width, height, { left: atoi(params[0]), top: atoi(params[1]) })
        if (error) return fail(error)
        break
      }
      case 'AddTerrain': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        if (!addAllowed) break
        const rx = atoi(params[1])
        const ry = atoi(params[2])
        if (doc.terrains.some((item) => item.rx === rx && item.ry === ry)) break
        const item: MapTerrainObject = { id: createMapObjectId(), name: params[0], rx, ry }
        doc.terrains.push(item)
        lines.push(`Terrain added: ${params[0]} at ${rx}/${ry}`)
        break
      }
      case 'AddSmudge': {
        if (need(3)) return fail(`script error at ${name}`)
        if (skipBool(params, 3)) break
        const rx = atoi(params[1])
        const ry = atoi(params[2])
        if (doc.smudges.some((item) => item.rx === rx && item.ry === ry)) break
        const item: MapSmudge = { id: createMapObjectId(), name: params[0], rx, ry, extra: 0 }
        doc.smudges.push(item)
        lines.push(`Smudge added: ${params[0]} at ${rx}/${ry}`)
        break
      }
      case 'AddInfantry': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        if (csvParamCount(params[0]) !== 14) {
          lines.push('AddInfantry failed')
          break
        }
        doc.infantry.push(parseTechno(params[0], true))
        lines.push('Infantry added')
        break
      }
      case 'AddVehicle': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        if (csvParamCount(params[0]) !== 14) {
          lines.push('AddVehicle failed')
          break
        }
        const unit = parseTechno(params[0], false)
        if (occupiedTechno(doc.units, unit.rx, unit.ry)) {
          lines.push('AddVehicle failed')
          break
        }
        doc.units.push(unit)
        lines.push('Vehicle added')
        break
      }
      case 'AddAircraft': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        if (csvParamCount(params[0]) !== 12) {
          lines.push('AddAircraft failed')
          break
        }
        const air = parseTechno(params[0], false)
        if (occupiedTechno(doc.aircraft, air.rx, air.ry)) {
          lines.push('AddAircraft failed')
          break
        }
        doc.aircraft.push(air)
        lines.push('Aircraft added')
        break
      }
      case 'AddStructure': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        if (csvParamCount(params[0]) !== 17) {
          lines.push('AddStructure failed')
          break
        }
        const building = parseStructure(params[0])
        if (occupiedTechno(doc.structures, building.rx, building.ry)) {
          lines.push('AddStructure failed')
          break
        }
        doc.structures.push(building)
        lines.push('Structure added')
        break
      }
      case 'DeleteTerrain':
      case 'DeleteInfantry':
      case 'DeleteVehicle':
      case 'DeleteAircraft':
      case 'DeleteStructure': {
        if (need(1)) return fail(`script error at ${name}`)
        if (skipBool(params, 1)) break
        if (!deleteAllowed) break
        const index = atoi(params[0])
        const list = name === 'DeleteTerrain' ? doc.terrains
          : name === 'DeleteInfantry' ? doc.infantry
            : name === 'DeleteVehicle' ? doc.units
              : name === 'DeleteAircraft' ? doc.aircraft
                : doc.structures
        if (index < 0 || index >= list.length) {
          lines.push(`${name.replace('Delete', '')} deletion failed, invalid index`)
          break
        }
        list.splice(index, 1)
        lines.push(`${name.replace('Delete', '')} deleted`)
        break
      }
      case 'IsInfantryDeleted':
      case 'IsTerrainDeleted': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const index = atoi(params[1])
        const list = name === 'IsInfantryDeleted' ? doc.infantry : doc.terrains
        vars.set(params[0], index >= 0 && index < list.length ? '0' : '1')
        break
      }
      case 'GetInfantry':
      case 'GetVehicle':
      case 'GetAircraft':
      case 'GetStructure': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const index = atoi(params[1])
        let line = ''
        if (name === 'GetInfantry' && index >= 0 && index < doc.infantry.length) {
          line = technoLine(doc.infantry[index], true)
        } else if (name === 'GetVehicle' && index >= 0 && index < doc.units.length) {
          line = technoLine(doc.units[index], false)
        } else if (name === 'GetAircraft' && index >= 0 && index < doc.aircraft.length) {
          line = technoLine(doc.aircraft[index], false)
        } else if (name === 'GetStructure' && index >= 0 && index < doc.structures.length) {
          line = structureLine(doc.structures[index])
        }
        vars.set(params[0], line)
        break
      }
      case 'GetHouse': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const index = atoi(params[1])
        vars.set(params[0], doc.houses[index]?.name ?? '')
        break
      }
      case 'GetCountry': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const index = atoi(params[1])
        vars.set(params[0], doc.countries[index] ?? '')
        break
      }
      case 'GetHouseIndex': {
        if (need(2)) return fail(`script error at ${name}`)
        if (skipBool(params, 2)) break
        const index = doc.houses.findIndex((house) => house.name === params[1])
        vars.set(params[0], index >= 0 ? String(index) : '')
        break
      }
      default:
        return fail(`script error at ${name}`)
    }
  }

  return { ok: true, report: lines.join('\n') }
}
