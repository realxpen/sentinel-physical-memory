import type { SpatialObject } from '../domain/sentinel.js'

type DoorColor = 'green' | 'red' | 'blue' | 'orange' | 'yellow' | 'white' | 'black' | 'brown' | 'gray'
type ObjectFamily = 'shelving' | 'box' | 'floor' | 'ceiling' | 'fire-extinguisher' | 'exit-sign' | `door:${DoorColor}`

/**
 * Conservative semantic identity for recurring provider naming variance.
 *
 * This is intentionally a small whitelist, not fuzzy matching. It only merges
 * object families where different surface descriptions routinely refer to the
 * same durable scene concept (for example "metal shelving" vs "shelves").
 * Ambiguous instance-heavy objects such as chairs, desks, and people are
 * deliberately excluded. Doors are matched only through a visible color
 * anchor (for example "green emergency exit door" vs "green door") and still
 * depend on the one-to-one uniqueness rule below.
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
 * Same-scan aliases may collapse only when they are semantic variants, share
 * at least one trusted evidence frame, and do not contradict structured or
 * semantic position. This is intentionally stricter than cross-scan matching:
 * two detections in the same frame can still be different physical instances,
 * so identical name/category pairs are collapsed only across distinct
 * SENTINEL perception passes (scene / condition-audit / identity / geometry).
 */
export function sameScanObjectsCanConsolidate(a: SpatialObject, b: SpatialObject): boolean {
  if (!objectsSemanticallyMatch(a, b)) return false

  const sameSurfaceIdentity = normalize(a.name) === normalize(b.name) && a.category === b.category
  if (sameSurfaceIdentity && !isCrossPassAlias(a, b)) return false

  if (!a.evidenceIds.some((id) => b.evidenceIds.includes(id))) return false
  return positionsCompatible(a, b)
}

/**
 * Produces one-to-one matches only when both sides have a unique compatible
 * candidate. Repeated generic objects therefore stay unmatched instead of one
 * shelf/box/door candidate being reused to hide several distinct instances.
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
  if (/\b(?:box|boxes|carton|cartons|boxed items|boxed goods)\b/.test(name)) return 'box'
  if (/\b(?:concrete |warehouse )?floor\b/.test(name)) return 'floor'
  if (/\b(?:white |warehouse |high )?ceiling\b/.test(name)) return 'ceiling'

  if (item.category === 'door' && /\bdoor\b/.test(name)) {
    const color = doorColor(name)
    if (color) return `door:${color}`
  }

  return undefined
}

function doorColor(value: string): DoorColor | undefined {
  const match = value.match(/\b(green|red|blue|orange|yellow|white|black|brown|gray|grey)\b/)
  if (!match) return undefined
  return match[1] === 'grey' ? 'gray' : match[1] as DoorColor
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

function isCrossPassAlias(a: SpatialObject, b: SpatialObject): boolean {
  return perceptionPass(a.id) !== perceptionPass(b.id)
}

function perceptionPass(id: string): 'scene' | 'audit' | 'identity' | 'geometry' {
  if (id.startsWith('audit_')) return 'audit'
  if (id.startsWith('identity_')) return 'identity'
  if (id.startsWith('geometry_')) return 'geometry'
  return 'scene'
}

function positionsCompatible(a: SpatialObject, b: SpatialObject): boolean {
  const positionA = a.position
  const positionB = b.position
  if (!positionA || !positionB) return true

  if (positionA.roomId && positionB.roomId && positionA.roomId !== positionB.roomId) return false
  if (positionA.relativeToId && positionB.relativeToId && positionA.relativeToId !== positionB.relativeToId) return false

  const descriptionA = semanticPositionDescription(positionA.description)
  const descriptionB = semanticPositionDescription(positionB.description)
  if (descriptionA && descriptionB && descriptionA !== descriptionB) return false

  return true
}

function semanticPositionDescription(value: string | undefined): string | undefined {
  const normalized = normalize(value ?? '')
  if (!normalized) return undefined

  const coordinateTokens = normalized
    .replace(/[\[\](),;:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (coordinateTokens.length >= 2 && coordinateTokens.every((token) => /^-?\d+(?:\.\d+)?(?:px|%)?$/.test(token))) {
    return undefined
  }

  return normalized
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
