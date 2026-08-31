import { PACK_LINE_WIDTH } from './constants'

export type MapIniEntry = { key: string; value: string }

export type MapIniSection = {
  name: string
  entries: MapIniEntry[]
}

const sectionRe = /^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/
const commentRe = /^\s*[;#]/

function stripInlineComment(value: string): string {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (!inSingle && !inDouble && (ch === ';' || ch === '#')) {
      return value.slice(0, i).trimEnd()
    }
  }
  return value.trimEnd()
}

export class MapIni {
  sections: MapIniSection[] = []

  static parse(text: string): MapIni {
    const ini = new MapIni()
    let current: MapIniSection | null = null
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || commentRe.test(line)) continue
      const sectionMatch = line.match(sectionRe)
      if (sectionMatch) {
        current = { name: sectionMatch[1].trim(), entries: [] }
        ini.sections.push(current)
        continue
      }
      const eq = line.indexOf('=')
      if (eq <= 0 || !current) continue
      const key = line.slice(0, eq).trim()
      const value = stripInlineComment(line.slice(eq + 1))
      if (key) current.entries.push({ key, value })
    }
    return ini
  }

  getSection(name: string): MapIniSection | undefined {
    const needle = name.toLowerCase()
    return this.sections.find((section) => section.name.toLowerCase() === needle)
  }

  getOrCreateSection(name: string): MapIniSection {
    const existing = this.getSection(name)
    if (existing) return existing
    const created = { name, entries: [] }
    this.sections.push(created)
    return created
  }

  getValue(section: string, key: string, fallback = ''): string {
    const found = this.getSection(section)
    if (!found) return fallback
    const needle = key.toLowerCase()
    const entry = found.entries.find((item) => item.key.toLowerCase() === needle)
    return entry?.value ?? fallback
  }

  setValue(section: string, key: string, value: string): void {
    const target = this.getOrCreateSection(section)
    const needle = key.toLowerCase()
    const existing = target.entries.find((item) => item.key.toLowerCase() === needle)
    if (existing) existing.value = value
    else target.entries.push({ key, value })
  }

  getConcatenated(section: string): string {
    const found = this.getSection(section)
    if (!found) return ''
    return found.entries.map((entry) => entry.value).join('')
  }

  setPackedSection(name: string, base64: string): void {
    const entries: MapIniEntry[] = []
    let line = 1
    for (let offset = 0; offset < base64.length; offset += PACK_LINE_WIDTH) {
      entries.push({
        key: String(line++),
        value: base64.slice(offset, offset + PACK_LINE_WIDTH),
      })
    }
    const existing = this.getSection(name)
    if (existing) existing.entries = entries
    else this.sections.push({ name, entries })
  }

  replaceSection(name: string, entries: MapIniEntry[]): void {
    const existing = this.getSection(name)
    if (existing) existing.entries = entries
    else this.sections.push({ name, entries })
  }

  removeSection(name: string): void {
    const needle = name.toLowerCase()
    this.sections = this.sections.filter((section) => section.name.toLowerCase() !== needle)
  }

  toString(): string {
    const parts: string[] = []
    for (const section of this.sections) {
      parts.push(`[${section.name}]`)
      for (const entry of section.entries) {
        parts.push(`${entry.key}=${entry.value}`)
      }
      parts.push('')
    }
    return parts.join('\r\n')
  }
}