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

/**
 * Produces one-to-one matches only when both sides have a unique compatible
 * candidate. Repeated generic objects therefore stay unmatched instead of one
 * shelf/box candidate being reused to hide several distinct instances.
 */
export function matchObjectsConservatively(
  previous: SpatialObject[],
  current: SpatialObject[],
): Map<number, number> {
  const currentToPrevious = new Map<number, number>()
  const usedPrevious = new Set<number>()

  for (let currentIndex = 0; currentIndex < current.length; currentIndex += 1) {
    const previousIndex = previous.findIndex((candidate, index) =>
      !usedPrevious.has(index) && candidate.id === current[currentIndex].id,
    )
    if (previousIndex < 0) continue
    currentToPrevious.set(currentIndex, previousIndex)
    usedPrevious.add(previousIndex)
  }

  let matched = true
  while (matched) {
    matched = false
    for (let currentIndex = 0; currentIndex < current.length; currentIndex += 1) {
      if (currentToPrevious.has(currentIndex)) continue
      const previousCandidates = previous
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate, index }) => !usedPrevious.has(index) && objectsSemanticallyMatch(candidate, current[currentIndex]))
      if (previousCandidates.length !== 1) continue

      const [{ index: previousIndex }] = previousCandidates
      const currentCandidates = current
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate, index }) => !currentToPrevious.has(index) && objectsSemanticallyMatch(previous[previousIndex], candidate))
      if (currentCandidates.length !== 1) continue

      currentToPrevious.set(currentIndex, previousIndex)
      usedPrevious.add(previousIndex)
      matched = true
    }
  }

  return currentToPrevious
}

function semanticFamily(item: SpatialObject): ObjectFamily | undefined {
  const name = normalize(item.name)
  const description = normalize(item.description ?? '')

  if (/\bfire extinguisher\b/.test(name)) return 'fire-extinguisher'
  if (/\b(?:emergency )?exit\b/.test(name) && /\bsign\b|\bsymbol\b/.test(name)) return 'exit-sign'
  if (item.category === 'signage' && /\b(?:emergency )?exit\b/.test(description) && /\bsign\b|\bsymbol\b/.test(description)) return 'exit-sign'
  if (/\b(?:shelves|shelving|racks|racking)\b/.test(name)) return 'shelving'
  if (/\b(?:boxes|cartons)\b/.test(name)) return 'box'
  if (/\b(?:concrete |warehouse )?floor\b/.test(name)) return 'floor'
  if (/\b(?:white |warehouse |high )?ceiling\b/.test(name)) return 'ceiling'

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
