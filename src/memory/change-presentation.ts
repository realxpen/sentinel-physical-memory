import type { Change, Observation, SpatialObject } from '../domain/sentinel.js'
import { isLowSalienceObjectChange } from './change-salience.js'
import { hasGroundedExplicitExitSignMention, isExitSignObject } from './object-identity.js'

/**
 * Historical diffs are immutable. This presentation projection prevents an
 * already-persisted still-photo surface duplicate from rendering twice while
 * retaining the underlying evidence and conservative verification status.
 */
export interface ChangePresentationContext {
  previousObjects?: SpatialObject[]
  currentObjects?: SpatialObject[]
  currentObservations?: Observation[]
}

export function changesForPresentation(changes: Change[], context: ChangePresentationContext = {}): Change[] {
  const presented: Change[] = []
  const structuralVerification = new Map<string, Change[]>()

  for (const change of changes) {
    if (isHistoricalExitSignRepresentationRefinement(change, context)) continue
    if (isDirectlyReobservedObjectOmission(change, context)) continue
    // Historical diffs are immutable. Hide already-persisted raw inventory
    // churn without mutating the underlying audit trail.
    if (isLowSalienceObjectChange(change)) continue

    const key = structuralVerificationKey(change)
    if (!key) {
      presented.push(cloneChange(change))
      continue
    }

    const candidates = structuralVerification.get(key) ?? []
    const existing = candidates.find((candidate) => sharesEvidence(candidate, change))
    if (!existing) {
      const copy = cloneChange(change)
      candidates.push(copy)
      structuralVerification.set(key, candidates)
      presented.push(copy)
      continue
    }

    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...change.evidenceIds])]
    existing.confidence = Math.max(existing.confidence, change.confidence)
  }

  return presented
}

function isHistoricalExitSignRepresentationRefinement(
  change: Change,
  context: ChangePresentationContext,
): boolean {
  if (change.type !== 'added') return false
  if (change.entityKind && change.entityKind !== 'object') return false
  if (!change.entityId) return false

  const current = context.currentObjects?.find((item) => item.id === change.entityId)
  if (!current || !isExitSignObject(current)) return false
  return hasGroundedExplicitExitSignMention(context.previousObjects ?? [])
}

function isDirectlyReobservedObjectOmission(
  change: Change,
  context: ChangePresentationContext,
): boolean {
  if (change.type !== 'uncertain') return false
  if (change.entityKind && change.entityKind !== 'object') return false
  if (!change.entityId) return false

  const previous = context.previousObjects?.find((item) => item.id === change.entityId)
  if (!previous) return false
  const expected = normalize(previous.name)

  return (context.currentObservations ?? []).some((observation) =>
    observation.basis === 'observed'
      && observation.confidence >= 0.9
      && observation.evidenceIds.length > 0
      && normalize(observation.label) === expected,
  )
}

function sharesEvidence(a: Change, b: Change): boolean {
  return a.evidenceIds.some((id) => b.evidenceIds.includes(id))
}

export function presentedChangeSummary(changes: Change[]): string {
  if (changes.length === 0) return 'No material environmental changes detected.'

  const counts = new Map<Change['type'], number>()
  for (const change of changes) counts.set(change.type, (counts.get(change.type) ?? 0) + 1)
  const details = (['added', 'removed', 'moved', 'changed', 'resolved', 'uncertain'] as Change['type'][])
    .filter((type) => counts.has(type))
    .map((type) => `${counts.get(type)} ${type}`)
  return `${changes.length} environmental change(s): ${details.join(', ')}.`
}

function structuralVerificationKey(change: Change): string | undefined {
  if (change.type !== 'uncertain') return undefined
  if (change.entityKind && change.entityKind !== 'object') return undefined

  const title = normalize(change.title).replace(/^not re observed /, '')
  if (!/\b(?:wall|walls|floor|ceiling)\b/.test(title)) return undefined
  return `${change.type}:${change.entityKind ?? 'object'}:${title}`
}

function cloneChange(change: Change): Change {
  return { ...change, evidenceIds: [...change.evidenceIds] }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
