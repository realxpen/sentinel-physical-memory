import type { Change, EnvironmentalCondition, EnvironmentalDiff, Issue, SpatialObject } from '../domain/sentinel'
import { matchObjectsConservatively, semanticObjectIdentityKey } from './object-identity.js'

export interface EnvironmentalSnapshot {
  stateId: string
  environmentId: string
  objects: SpatialObject[]
  conditions: EnvironmentalCondition[]
  issues: Issue[]
}

export interface DiffEngine {
  compare(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot): EnvironmentalDiff
}

export interface DiffEngineOptions {
  now?: () => Date
  id?: () => string
}

const makeId = () => `change_${crypto.randomUUID()}`

/** Deterministic, model-agnostic comparison of two environmental snapshots. */
export class EnvironmentalDiffEngine implements DiffEngine {
  private readonly now: () => Date
  private readonly id: () => string

  constructor(options: DiffEngineOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? makeId
  }

  compare(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot): EnvironmentalDiff {
    if (from.environmentId !== to.environmentId) throw new Error('Cannot compare states from different environments')
    const changes: Change[] = []
    const currentToPrevious = matchObjectsConservatively(from.objects, to.objects)
    const matchedPrevious = new Set(currentToPrevious.values())

    for (const [currentIndex, current] of to.objects.entries()) {
      const previousIndex = currentToPrevious.get(currentIndex)
      const previous = previousIndex === undefined ? undefined : from.objects[previousIndex]
      if (!previous) {
        if (hasUnresolvedFamilyCounterpart(current, from.objects)) continue
        changes.push(this.change(from, to, 'added', current.id, `New: ${current.name}`, `${current.name} was not present in the previous state.`, current.confidence, current.evidenceIds))
        continue
      }
      if (current.state !== previous.state) {
        changes.push(this.change(from, to, 'changed', current.id, `Changed: ${current.name}`, `${current.name} changed from ${previous.state ?? 'unknown'} to ${current.state ?? 'unknown'}.`, Math.min(current.confidence, previous.confidence), [...previous.evidenceIds, ...current.evidenceIds]))
      }
      if (this.positionChanged(current, previous)) {
        changes.push(this.change(from, to, 'moved', current.id, `Moved: ${current.name}`, `${current.name} appears to have moved relative to its previous position.`, Math.min(current.confidence, previous.confidence), [...previous.evidenceIds, ...current.evidenceIds]))
      }
    }

    for (const [previousIndex, previous] of from.objects.entries()) {
      if (!matchedPrevious.has(previousIndex)) {
        if (hasUnresolvedFamilyCounterpart(previous, to.objects)) continue
        changes.push(this.change(from, to, 'uncertain', previous.id, `Not re-observed: ${previous.name}`, `${previous.name} was present previously but was not re-observed in the current scan. Absence alone is not sufficient evidence that it was removed.`, Math.min(previous.confidence, 0.5), previous.evidenceIds))
      }
    }

    for (const currentIssue of to.issues) {
      const previousIssue = from.issues.find((issue) => this.sameIssue(issue, currentIssue))
      if (!previousIssue) changes.push(this.change(from, to, 'added', currentIssue.id, `New issue: ${currentIssue.title}`, currentIssue.description, currentIssue.confidence, currentIssue.evidenceIds))
      else if (previousIssue.status !== currentIssue.status) {
        const type = currentIssue.status === 'resolved' ? 'resolved' : 'changed'
        changes.push(this.change(from, to, type, currentIssue.id, `${type === 'resolved' ? 'Resolved' : 'Changed'} issue: ${currentIssue.title}`, `Issue status changed from ${previousIssue.status} to ${currentIssue.status}.`, Math.min(previousIssue.confidence, currentIssue.confidence), [...previousIssue.evidenceIds, ...currentIssue.evidenceIds]))
      }
    }

    for (const previousIssue of from.issues) {
      if (!to.issues.some((issue) => this.sameIssue(issue, previousIssue))) {
        changes.push(this.change(from, to, 'uncertain', previousIssue.id, `Not re-observed: ${previousIssue.title}`, `${previousIssue.title} was previously observed but was not re-observed in the current scan. A later verification step must confirm whether it is resolved.`, Math.min(previousIssue.confidence, 0.5), previousIssue.evidenceIds))
      }
    }

    return { id: `diff_${crypto.randomUUID()}`, environmentId: from.environmentId, fromStateId: from.stateId, toStateId: to.stateId, createdAt: this.now().toISOString(), changes, summary: changes.length ? `${changes.length} environmental change(s) detected.` : 'No material environmental changes detected.' }
  }

  private sameIssue(a: Issue, b: Issue): boolean { return a.id === b.id || (a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && (a.roomId ?? '') === (b.roomId ?? '')) }

  private positionChanged(a: SpatialObject, b: SpatialObject): boolean {
    const pa = a.position
    const pb = b.position
    if (!pa || !pb) return false

    // Structured anchors are the strongest deterministic movement evidence.
    if (pa.roomId && pb.roomId && pa.roomId !== pb.roomId) return true
    if (pa.relativeToId && pb.relativeToId && pa.relativeToId !== pb.relativeToId) return true

    // Some vision providers place bounding-box-like coordinate tuples in the
    // free-text position.description field (for example "0 200 700 800").
    // Those values move when the camera framing changes and are not physical
    // world coordinates, so they must never produce a Reality Diff movement.
    const descriptionA = semanticPositionDescription(pa.description)
    const descriptionB = semanticPositionDescription(pb.description)
    return Boolean(descriptionA && descriptionB && descriptionA !== descriptionB)
  }

  private change(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot, type: Change['type'], entityId: string, title: string, description: string, confidence: number, evidenceIds: string[]): Change { return { id: this.id(), environmentId: from.environmentId, fromStateId: from.stateId, toStateId: to.stateId, type, entityId, title, description, confidence, evidenceIds: [...new Set(evidenceIds)] } }
}

function hasUnresolvedFamilyCounterpart(item: SpatialObject, candidates: SpatialObject[]): boolean {
  const key = semanticObjectIdentityKey(item)
  if (!key.startsWith('family:')) return false

  // When a provider changes granularity between scans (for example several
  // per-frame "green door" mentions vs one durable green door), SENTINEL does
  // not have enough instance identity to claim additions/removals inside that
  // family. Suppress the noisy claim instead of pretending multiplicity is
  // known. Rich repeated-instance identity remains a later spatial-memory job.
  return candidates.some((candidate) => semanticObjectIdentityKey(candidate) === key)
}

function semanticPositionDescription(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, ' ')
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
