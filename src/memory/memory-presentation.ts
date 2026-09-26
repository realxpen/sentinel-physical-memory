import type { SpatialObject } from '../domain/sentinel.js'
import { isUnconfirmedPersonObject } from '../domain/object-policy.js'

export interface MemoryObjectRow {
  object: SpatialObject
  count: number
  lowSalience: boolean
  score: number
}

export function buildMemoryObjectRows(objects: SpatialObject[]): MemoryObjectRow[] {
  const groups = new Map<string, MemoryObjectRow>()

  for (const object of objects) {
    if (isUnconfirmedPersonObject(object)) continue
    const key = `${normalize(object.category)}::${normalize(object.name)}`
    const lowSalience = isLowSalienceMemoryObject(object)
    const score = memoryObjectScore(object, lowSalience)
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, { object, count: 1, lowSalience, score })
      continue
    }

    const candidateIsStronger =
      object.confidence > existing.object.confidence ||
      (object.confidence === existing.object.confidence && new Date(object.lastSeenAt).getTime() > new Date(existing.object.lastSeenAt).getTime())

    groups.set(key, {
      object: candidateIsStronger ? object : existing.object,
      count: existing.count + 1,
      lowSalience: existing.lowSalience && lowSalience,
      score: Math.max(existing.score, score),
    })
  }

  return [...groups.values()].sort((a, b) => {
    if (a.lowSalience !== b.lowSalience) return a.lowSalience ? 1 : -1
    if (b.score !== a.score) return b.score - a.score
    if (b.object.confidence !== a.object.confidence) return b.object.confidence - a.object.confidence
    return a.object.name.localeCompare(b.object.name)
  })
}

export function primaryMemoryObjectRows(rows: MemoryObjectRow[], limit = 10): MemoryObjectRow[] {
  return rows.filter((row) => !row.lowSalience).slice(0, limit)
}

export function isLowSalienceMemoryObject(object: SpatialObject): boolean {
  const text = normalize(`${object.category} ${object.name}`)
  return /\b(?:floor|ceiling|wall|baseboard|trim|moulding|molding|door frame|doorframe|door knob|doorknob|knob handle|door handle|hinge|latch|door hardware|recessed light|ceiling light|light fixture)\b/.test(text)
}

function memoryObjectScore(object: SpatialObject, lowSalience: boolean): number {
  if (lowSalience) return 0

  const text = normalize(`${object.category} ${object.name} ${object.description ?? ''}`)
  let score = 20

  if (/\b(?:emergency|exit|fire extinguisher|extinguisher|obstruction|blocked|barrier|electrical panel|breaker|hazard|warning|caution)\b/.test(text)) score += 100
  if (/\b(?:door|doorway|sign|signage|chair|desk|table|plant|cart|box|boxes|package|cabinet|shelf|equipment|appliance|panel)\b/.test(text)) score += 50
  if (/\b(?:safety|electrical|equipment|furniture|door|signage|obstruction)\b/.test(normalize(object.category))) score += 35
  if (object.position?.description) score += 8
  if ((object.evidenceIds?.length ?? 0) > 0) score += 5

  return score
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
