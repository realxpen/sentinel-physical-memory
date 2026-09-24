import type { EnvironmentalCondition } from '../domain/sentinel.js'

/**
 * Collapse provider/audit duplicates only when they describe the same semantic
 * condition AND share direct grounding. This is a read/projection rule: it does
 * not rewrite immutable historical snapshots.
 */
export function dedupeVerificationConditions(
  conditions: EnvironmentalCondition[],
): EnvironmentalCondition[] {
  const groups: EnvironmentalCondition[][] = []

  for (const condition of conditions) {
    const group = groups.find((items) => conditionsEquivalentForVerification(items[0], condition))
    if (group) group.push(condition)
    else groups.push([condition])
  }

  return groups.map(mergeConditionGroup)
}

export function conditionsEquivalentForVerification(
  a: EnvironmentalCondition,
  b: EnvironmentalCondition,
): boolean {
  if (normalize(a.title) !== normalize(b.title)) return false
  if (a.kind !== b.kind || a.status !== b.status) return false

  const evidenceOverlap = intersects(a.evidenceIds, b.evidenceIds)
  const objectOverlap = intersects(a.objectIds, b.objectIds)

  // Require shared grounding so two same-named conditions in different places
  // do not collapse merely because the provider reused a generic title.
  return evidenceOverlap || objectOverlap
}

function mergeConditionGroup(items: EnvironmentalCondition[]): EnvironmentalCondition {
  if (items.length === 1) return items[0]

  const representative = [...items].sort((a, b) => {
    const basis = basisRank(b.basis) - basisRank(a.basis)
    if (basis !== 0) return basis
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.evidenceIds.length - a.evidenceIds.length
  })[0]

  return {
    ...representative,
    confidence: Math.max(...items.map((item) => item.confidence)),
    basis: items.some((item) => item.basis === 'observed') ? 'observed' : representative.basis,
    objectIds: unique(items.flatMap((item) => item.objectIds)),
    evidenceIds: unique(items.flatMap((item) => item.evidenceIds)),
  }
}

function basisRank(value: EnvironmentalCondition['basis']): number {
  return value === 'observed' ? 2 : 1
}

function intersects(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false
  const values = new Set(b)
  return a.some((item) => values.has(item))
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
