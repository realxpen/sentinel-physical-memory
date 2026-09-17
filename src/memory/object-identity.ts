import type { SpatialObject } from '../domain/sentinel.js'

type ObjectFamily = 'shelving' | 'box' | 'floor' | 'ceiling' | 'fire-extinguisher' | 'exit-sign'

/**
 * Conservative semantic identity for recurring provider naming variance.
 *
 * This is intentionally a small whitelist, not fuzzy matching. It only merges
 * object families where different surface descriptions routinely refer to the
 * same durable scene concept (for example "metal shelving" vs "shelves").
 * Ambiguous instance-heavy objects such as chairs, desks, people, and generic
 * doors are deliberately excluded; Phase 7 instance identity will handle them.
 */
export function objectsSemanticallyMatch(a: SpatialObject, b: SpatialObject): boolean {
  if (a.id === b.id) return true

  const nameA = normalize(a.name)
  const nameB = normalize(b.name)
  if (nameA === nameB && categoriesCompatibleForExactName(a, b)) return true

  const familyA = semanticFamily(a)
  const familyB = semanticFamily(b)
  return Boolean(familyA && familyB && familyA === familyB)
}

export function semanticObjectIdentityKey(item: SpatialObject): string {
  const family = semanticFamily(item)
  if (family) return `family:${family}`
  return `${item.category}:${normalize(item.name)}`
}

function semanticFamily(item: SpatialObject): ObjectFamily | undefined {
  const text = normalize(`${item.name} ${item.description ?? ''}`)

  if (/\bfire extinguisher\b/.test(text)) return 'fire-extinguisher'
  if (/\b(?:emergency )?exit\b/.test(text) && /\bsign\b|\bsymbol\b/.test(text)) return 'exit-sign'
  if (/\b(?:shelf|shelves|shelving|rack|racks|racking)\b/.test(text)) return 'shelving'
  if (/\b(?:box|boxes|carton|cartons)\b/.test(text)) return 'box'
  if (/\b(?:concrete |warehouse )?floor\b/.test(text)) return 'floor'
  if (/\b(?:white |warehouse |high )?ceiling\b/.test(text)) return 'ceiling'

  return undefined
}

function categoriesCompatibleForExactName(a: SpatialObject, b: SpatialObject): boolean {
  if (a.category === b.category) return true

  const name = normalize(a.name)
  if (name === 'fire extinguisher') {
    return new Set([a.category, b.category]).size <= 2 &&
      [a.category, b.category].every((category) => category === 'equipment' || category === 'safety')
  }

  return false
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
