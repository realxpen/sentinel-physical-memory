import type {
  Change,
  EnvironmentalCondition,
  EnvironmentalDiff,
  EnvironmentRelation,
  Issue,
  SpatialObject,
} from '../domain/sentinel'
import {
  matchObjectsConservatively,
  objectsSemanticallyMatch,
  semanticObjectIdentityKey,
} from './object-identity.js'

export interface EnvironmentalSnapshot {
  stateId: string
  environmentId: string
  objects: SpatialObject[]
  conditions: EnvironmentalCondition[]
  issues: Issue[]
  relations: EnvironmentRelation[]
}

export interface DiffEngine {
  compare(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot): EnvironmentalDiff
}

export interface DiffEngineOptions {
  now?: () => Date
  id?: () => string
}

type ChangeEntityKind = NonNullable<Change['entityKind']>
type ObjectMatch = Map<number, number>

const makeId = () => `change_${crypto.randomUUID()}`
const EXPLICIT_REMOVED_STATES = new Set(['removed', 'absent', 'not present', 'no longer present'])
const RELATION_CONTEXT_MIN_CONFIDENCE = 0.6
const LOCATION_RELATION_MIN_CONFIDENCE = 0.7
const CONTEXT_MATCH_THRESHOLD = 6
const CONTEXT_MATCH_MARGIN = 1.5
const LOCATION_RELATION_TYPES = new Set<EnvironmentRelation['type']>([
  'located_in',
  'adjacent_to',
  'near',
  'attached_to',
  'on',
  'above',
  'below',
  'in_front_of',
  'behind',
  'left_of',
  'right_of',
])

/**
 * Deterministic, model-agnostic comparison of two immutable environmental snapshots.
 *
 * Phase 7 rules:
 * - stable IDs win;
 * - conservative semantic identity remains the default;
 * - repeated instances may be disambiguated only by mutually distinctive
 *   location / relationship context;
 * - missing current evidence alone is never removal or resolution;
 * - condition transitions are first-class without duplicating promoted issues.
 */
export class EnvironmentalDiffEngine implements DiffEngine {
  private readonly now: () => Date
  private readonly id: () => string

  constructor(options: DiffEngineOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? makeId
  }

  compare(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot): EnvironmentalDiff {
    if (from.environmentId !== to.environmentId) throw new Error('Cannot compare states from different environments')

    const normalizedFrom = normalizeSnapshot(from)
    const normalizedTo = normalizeSnapshot(to)
    const changes: Change[] = []

    const currentToPrevious = matchObjectsForDiff(normalizedFrom, normalizedTo)
    const matchedPrevious = new Set(currentToPrevious.values())
    const currentIdToPreviousId = new Map<string, string>()

    for (const [currentIndex, previousIndex] of currentToPrevious.entries()) {
      currentIdToPreviousId.set(normalizedTo.objects[currentIndex].id, normalizedFrom.objects[previousIndex].id)
    }

    for (const [currentIndex, current] of normalizedTo.objects.entries()) {
      const previousIndex = currentToPrevious.get(currentIndex)
      const previous = previousIndex === undefined ? undefined : normalizedFrom.objects[previousIndex]

      if (!previous) {
        if (hasUnresolvedFamilyCounterpart(current, normalizedFrom.objects)) continue
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          'added',
          'object',
          current.id,
          `New: ${current.name}`,
          `${current.name} was not present in the previous state.`,
          current.confidence,
          current.evidenceIds,
        ))
        continue
      }

      const removed = explicitlyRemoved(current) && !explicitlyRemoved(previous)
      if (removed) {
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          'removed',
          'object',
          current.id,
          `Removed: ${current.name}`,
          `${current.name} is explicitly represented as ${current.state ?? 'removed'} in the current state.`,
          Math.min(current.confidence, previous.confidence),
          [...previous.evidenceIds, ...current.evidenceIds],
        ))
        continue
      }

      if (normalizedObjectState(current.state) !== normalizedObjectState(previous.state)) {
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          'changed',
          'object',
          current.id,
          `Changed: ${current.name}`,
          `${current.name} changed from ${previous.state ?? 'unknown'} to ${current.state ?? 'unknown'}.`,
          Math.min(current.confidence, previous.confidence),
          [...previous.evidenceIds, ...current.evidenceIds],
        ))
      }

      const movedByPosition = this.positionChanged(previous, current)
      const movedByRelation = relationshipLocationChanged(
        previous,
        current,
        normalizedFrom,
        normalizedTo,
        currentIdToPreviousId,
      )
      if (movedByPosition || movedByRelation) {
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          'moved',
          'object',
          current.id,
          `Moved: ${current.name}`,
          movedByRelation
            ? `${current.name} changed its grounded relationship context relative to the previous state.`
            : `${current.name} appears to have moved relative to its previous position.`,
          Math.min(current.confidence, previous.confidence),
          [...previous.evidenceIds, ...current.evidenceIds],
        ))
      }
    }

    for (const [previousIndex, previous] of normalizedFrom.objects.entries()) {
      if (matchedPrevious.has(previousIndex)) continue
      if (hasUnresolvedFamilyCounterpart(previous, normalizedTo.objects)) continue
      changes.push(this.change(
        normalizedFrom,
        normalizedTo,
        'uncertain',
        'object',
        previous.id,
        `Not re-observed: ${previous.name}`,
        `${previous.name} was present previously but was not re-observed in the current scan. Absence alone is not sufficient evidence that it was removed.`,
        Math.min(previous.confidence, 0.5),
        previous.evidenceIds,
      ))
    }

    const conditionMatches = matchConditions(
      normalizedFrom.conditions,
      normalizedTo.conditions,
      currentIdToPreviousId,
    )
    const matchedPreviousConditions = new Set(conditionMatches.values())

    for (const [currentIndex, currentCondition] of normalizedTo.conditions.entries()) {
      if (currentCondition.kind === 'normal') continue

      const previousIndex = conditionMatches.get(currentIndex)
      const previousCondition = previousIndex === undefined ? undefined : normalizedFrom.conditions[previousIndex]
      const currentIssue = findIssueForCondition(currentCondition, normalizedTo.issues)
      const previousIssue = previousCondition
        ? findIssueForCondition(previousCondition, normalizedFrom.issues)
        : undefined

      if (!previousCondition) {
        // A promoted current condition already appears as "New issue". Avoid
        // saying the same semantic event twice.
        if (currentIssue && !normalizedFrom.issues.some((item) => sameIssue(item, currentIssue))) continue

        const type: Change['type'] = currentCondition.status === 'uncertain' ? 'uncertain' : 'added'
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          type,
          'condition',
          currentCondition.id,
          `${type === 'added' ? 'New condition' : 'Uncertain condition'}: ${currentCondition.title}`,
          currentCondition.description,
          currentCondition.confidence,
          currentCondition.evidenceIds,
        ))
        continue
      }

      const transition = conditionTransition(previousCondition, currentCondition)
      if (transition) {
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          'changed',
          'condition',
          currentCondition.id,
          `Changed condition: ${currentCondition.title}`,
          transition,
          Math.min(previousCondition.confidence, currentCondition.confidence),
          [...previousCondition.evidenceIds, ...currentCondition.evidenceIds],
        ))
      }

      // If a prior promoted issue is now explicitly resolved, the issue loop
      // below owns the resolution card rather than the condition loop.
      if (previousIssue && currentIssue?.status === 'resolved') continue
    }

    for (const [previousIndex, previousCondition] of normalizedFrom.conditions.entries()) {
      if (previousCondition.kind === 'normal' || matchedPreviousConditions.has(previousIndex)) continue

      const previousIssue = findIssueForCondition(previousCondition, normalizedFrom.issues)
      const currentIssue = previousIssue
        ? normalizedTo.issues.find((item) => sameIssue(item, previousIssue))
        : undefined

      if (currentIssue?.status === 'resolved') continue
      if (previousIssue && !currentIssue) {
        // The issue loop produces the single uncertainty event for a promoted
        // operational condition that disappeared from the scan.
        continue
      }

      changes.push(this.change(
        normalizedFrom,
        normalizedTo,
        'uncertain',
        'condition',
        previousCondition.id,
        `Condition not re-observed: ${previousCondition.title}`,
        `${previousCondition.title} was present previously but is not grounded in the current state. A later verification step must confirm resolution.`,
        Math.min(previousCondition.confidence, 0.5),
        previousCondition.evidenceIds,
      ))
    }

    for (const currentIssue of normalizedTo.issues) {
      const previousIssue = normalizedFrom.issues.find((issue) => sameIssue(issue, currentIssue))
      if (!previousIssue) {
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          'added',
          'issue',
          currentIssue.id,
          `New issue: ${currentIssue.title}`,
          currentIssue.description,
          currentIssue.confidence,
          currentIssue.evidenceIds,
        ))
        continue
      }

      if (previousIssue.status !== currentIssue.status) {
        const type: Change['type'] = currentIssue.status === 'resolved' ? 'resolved' : 'changed'
        changes.push(this.change(
          normalizedFrom,
          normalizedTo,
          type,
          'issue',
          currentIssue.id,
          `${type === 'resolved' ? 'Resolved' : 'Changed'} issue: ${currentIssue.title}`,
          `Issue status changed from ${previousIssue.status} to ${currentIssue.status}.`,
          Math.min(previousIssue.confidence, currentIssue.confidence),
          [...previousIssue.evidenceIds, ...currentIssue.evidenceIds],
        ))
      }
    }

    for (const previousIssue of normalizedFrom.issues) {
      if (normalizedTo.issues.some((issue) => sameIssue(issue, previousIssue))) continue

      const currentCondition = normalizedTo.conditions.find((condition) =>
        normalizedConditionTitle(condition.title) === normalizedConditionTitle(previousIssue.title),
      )
      if (currentCondition?.status === 'uncertain') {
        // The condition transition already explains that the signal weakened;
        // do not add a second "issue missing" card.
        continue
      }

      changes.push(this.change(
        normalizedFrom,
        normalizedTo,
        'uncertain',
        'issue',
        previousIssue.id,
        `Not re-observed: ${previousIssue.title}`,
        `${previousIssue.title} was previously observed but was not re-observed in the current scan. A later verification step must confirm whether it is resolved.`,
        Math.min(previousIssue.confidence, 0.5),
        previousIssue.evidenceIds,
      ))
    }

    return {
      id: `diff_${crypto.randomUUID()}`,
      environmentId: normalizedFrom.environmentId,
      fromStateId: normalizedFrom.stateId,
      toStateId: normalizedTo.stateId,
      createdAt: this.now().toISOString(),
      changes,
      summary: summarizeChanges(changes),
    }
  }

  private positionChanged(previous: SpatialObject, current: SpatialObject): boolean {
    const pa = previous.position
    const pb = current.position
    if (!pa || !pb) return false

    if (pa.roomId && pb.roomId && pa.roomId !== pb.roomId) return true
    if (pa.relativeToId && pb.relativeToId && pa.relativeToId !== pb.relativeToId) return true

    const descriptionA = semanticPositionDescription(pa.description)
    const descriptionB = semanticPositionDescription(pb.description)
    return Boolean(descriptionA && descriptionB && descriptionA !== descriptionB)
  }

  private change(
    from: EnvironmentalSnapshot,
    to: EnvironmentalSnapshot,
    type: Change['type'],
    entityKind: ChangeEntityKind,
    entityId: string,
    title: string,
    description: string,
    confidence: number,
    evidenceIds: string[],
  ): Change {
    return {
      id: this.id(),
      environmentId: from.environmentId,
      fromStateId: from.stateId,
      toStateId: to.stateId,
      type,
      entityId,
      entityKind,
      title,
      description,
      confidence,
      evidenceIds: [...new Set(evidenceIds)],
    }
  }
}

function normalizeSnapshot(snapshot: EnvironmentalSnapshot): EnvironmentalSnapshot {
  return {
    ...snapshot,
    objects: snapshot.objects ?? [],
    conditions: snapshot.conditions ?? [],
    issues: snapshot.issues ?? [],
    relations: snapshot.relations ?? [],
  }
}

function matchObjectsForDiff(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot): ObjectMatch {
  const matches = matchObjectsConservatively(from.objects, to.objects)
  let progress = true

  while (progress) {
    progress = false
    const usedPrevious = new Set(matches.values())
    const unmatchedCurrent = to.objects
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => !matches.has(index))
    const unmatchedPrevious = from.objects
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => !usedPrevious.has(index))

    const scored = unmatchedCurrent.flatMap(({ item: current, index: currentIndex }) =>
      unmatchedPrevious
        .filter(({ item: previous }) => objectsSemanticallyMatch(previous, current))
        .map(({ item: previous, index: previousIndex }) => ({
          currentIndex,
          previousIndex,
          score: objectContextScore(previous, current, from, to),
        })),
    )

    const accepted = scored.filter((candidate) => {
      if (candidate.score < CONTEXT_MATCH_THRESHOLD) return false
      const currentAlternatives = scored
        .filter((item) => item.currentIndex === candidate.currentIndex)
        .sort((a, b) => b.score - a.score)
      const previousAlternatives = scored
        .filter((item) => item.previousIndex === candidate.previousIndex)
        .sort((a, b) => b.score - a.score)

      const currentBest = currentAlternatives[0]
      const previousBest = previousAlternatives[0]
      if (currentBest !== candidate || previousBest !== candidate) return false

      const currentMargin = candidate.score - (currentAlternatives[1]?.score ?? 0)
      const previousMargin = candidate.score - (previousAlternatives[1]?.score ?? 0)
      return currentMargin >= CONTEXT_MATCH_MARGIN && previousMargin >= CONTEXT_MATCH_MARGIN
    })

    if (accepted.length > 0) {
      for (const candidate of accepted.sort((a, b) => b.score - a.score)) {
        if (matches.has(candidate.currentIndex)) continue
        if ([...matches.values()].includes(candidate.previousIndex)) continue
        matches.set(candidate.currentIndex, candidate.previousIndex)
        progress = true
      }
    }

    if (progress) {
      // Context may disambiguate one repeated instance and leave another as a
      // unique semantic pair. The conservative matcher can safely close that
      // remaining one-to-one pair without fuzzy guessing.
      const usedAfterContext = new Set(matches.values())
      let uniqueProgress = true
      while (uniqueProgress) {
        uniqueProgress = false
        for (let currentIndex = 0; currentIndex < to.objects.length; currentIndex += 1) {
          if (matches.has(currentIndex)) continue
          const candidates = from.objects
            .map((item, index) => ({ item, index }))
            .filter(({ item, index }) => !usedAfterContext.has(index) && objectsSemanticallyMatch(item, to.objects[currentIndex]))
          if (candidates.length !== 1) continue

          const [{ index: previousIndex }] = candidates
          const reverse = to.objects
            .map((item, index) => ({ item, index }))
            .filter(({ item, index }) => !matches.has(index) && objectsSemanticallyMatch(from.objects[previousIndex], item))
          if (reverse.length !== 1) continue

          matches.set(currentIndex, previousIndex)
          usedAfterContext.add(previousIndex)
          uniqueProgress = true
        }
      }
    }
  }

  return matches
}

function objectContextScore(
  previous: SpatialObject,
  current: SpatialObject,
  from: EnvironmentalSnapshot,
  to: EnvironmentalSnapshot,
): number {
  let score = 0
  const previousName = normalize(previous.name)
  const currentName = normalize(current.name)

  if (previousName === currentName) score += 3
  if (previous.category === current.category) score += 1.5
  if (semanticObjectIdentityKey(previous) === semanticObjectIdentityKey(current)) score += 1

  if (previous.position?.roomId && current.position?.roomId && previous.position.roomId === current.position.roomId) score += 3
  if (previous.position?.relativeToId && current.position?.relativeToId) {
    const previousAnchor = objectIdentityById(previous.position.relativeToId, from.objects)
    const currentAnchor = objectIdentityById(current.position.relativeToId, to.objects)
    if (previousAnchor && currentAnchor && previousAnchor === currentAnchor) score += 3
  }

  const previousDescription = semanticPositionDescription(previous.position?.description)
  const currentDescription = semanticPositionDescription(current.position?.description)
  if (previousDescription && currentDescription && previousDescription === currentDescription) score += 2.5

  const previousRelations = relationshipContext(previous.id, from)
  const currentRelations = relationshipContext(current.id, to)
  const overlap = intersectionCount(previousRelations, currentRelations)
  score += Math.min(6, overlap * 3)

  // Confidence is intentionally only a weak tie-breaker; it must never turn
  // two otherwise ambiguous repeated objects into a confident identity match.
  score += Math.max(0, 1 - Math.abs(previous.confidence - current.confidence)) * 0.5
  return score
}

function relationshipContext(objectId: string, snapshot: EnvironmentalSnapshot): Set<string> {
  const context = new Set<string>()

  for (const relation of snapshot.relations) {
    if (relation.confidence < RELATION_CONTEXT_MIN_CONFIDENCE) continue
    if (relation.fromId !== objectId && relation.toId !== objectId) continue

    const outgoing = relation.fromId === objectId
    const counterpartId = outgoing ? relation.toId : relation.fromId
    const counterpart = snapshot.objects.find((item) => item.id === counterpartId)
    if (!counterpart) continue

    context.add(`${outgoing ? 'out' : 'in'}:${relation.type}:${semanticObjectIdentityKey(counterpart)}`)
  }

  return context
}

function relationshipLocationChanged(
  previous: SpatialObject,
  current: SpatialObject,
  from: EnvironmentalSnapshot,
  to: EnvironmentalSnapshot,
  currentIdToPreviousId: Map<string, string>,
): boolean {
  const previousRelations = locationRelations(previous.id, from)
  const currentRelations = locationRelations(current.id, to)

  if (previousRelations.length === 0 || currentRelations.length === 0) return false

  for (const previousRelation of previousRelations) {
    const previousTargetId = relationCounterpart(previousRelation, previous.id)
    const previousTarget = from.objects.find((item) => item.id === previousTargetId)
    if (!previousTarget) continue

    const currentSameType = currentRelations.filter((relation) =>
      relation.type === previousRelation.type &&
      relationDirection(relation, current.id) === relationDirection(previousRelation, previous.id),
    )
    if (currentSameType.length !== 1) continue

    const currentRelation = currentSameType[0]
    const currentTargetId = relationCounterpart(currentRelation, current.id)
    const mappedCurrentTarget = currentIdToPreviousId.get(currentTargetId) ?? currentTargetId

    if (mappedCurrentTarget === previousTarget.id) continue

    const currentTarget = to.objects.find((item) => item.id === currentTargetId)
    if (!currentTarget) continue
    if (semanticObjectIdentityKey(currentTarget) !== semanticObjectIdentityKey(previousTarget)) return true
  }

  return false
}

function locationRelations(objectId: string, snapshot: EnvironmentalSnapshot): EnvironmentRelation[] {
  return snapshot.relations.filter((relation) =>
    relation.confidence >= LOCATION_RELATION_MIN_CONFIDENCE &&
    LOCATION_RELATION_TYPES.has(relation.type) &&
    (relation.fromId === objectId || relation.toId === objectId),
  )
}

function relationCounterpart(relation: EnvironmentRelation, objectId: string): string {
  return relation.fromId === objectId ? relation.toId : relation.fromId
}

function relationDirection(relation: EnvironmentRelation, objectId: string): 'out' | 'in' {
  return relation.fromId === objectId ? 'out' : 'in'
}

function matchConditions(
  previous: EnvironmentalCondition[],
  current: EnvironmentalCondition[],
  currentIdToPreviousId: Map<string, string>,
): Map<number, number> {
  const result = new Map<number, number>()
  const usedPrevious = new Set<number>()

  for (let currentIndex = 0; currentIndex < current.length; currentIndex += 1) {
    const currentKey = conditionIdentity(current[currentIndex], currentIdToPreviousId)
    const candidates = previous
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) =>
        !usedPrevious.has(index) &&
        conditionIdentity(item) === currentKey,
      )

    if (candidates.length !== 1) continue
    const [{ index: previousIndex }] = candidates

    const reverse = current
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) =>
        !result.has(index) &&
        conditionIdentity(item, currentIdToPreviousId) === conditionIdentity(previous[previousIndex]),
      )
    if (reverse.length !== 1) continue

    result.set(currentIndex, previousIndex)
    usedPrevious.add(previousIndex)
  }

  return result
}

function conditionIdentity(
  condition: EnvironmentalCondition,
  objectIdMap: Map<string, string> = new Map(),
): string {
  const objectIds = condition.objectIds
    .map((id) => objectIdMap.get(id) ?? id)
    .sort()
    .join('|')
  return `${normalizedConditionTitle(condition.title)}::${objectIds}`
}

function conditionTransition(
  previous: EnvironmentalCondition,
  current: EnvironmentalCondition,
): string | undefined {
  const changes: string[] = []
  if (previous.kind !== current.kind) changes.push(`kind ${previous.kind} → ${current.kind}`)
  if (previous.status !== current.status) changes.push(`status ${previous.status} → ${current.status}`)
  if (previous.basis !== current.basis) changes.push(`trust ${previous.basis} → ${current.basis}`)
  return changes.length > 0 ? `Condition changed: ${changes.join(', ')}.` : undefined
}

function findIssueForCondition(condition: EnvironmentalCondition, issues: Issue[]): Issue | undefined {
  const title = normalizedConditionTitle(condition.title)
  return issues.find((issue) =>
    normalizedConditionTitle(issue.title) === title &&
    objectSetsOverlap(issue.objectIds, condition.objectIds),
  )
}

function objectSetsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true
  const right = new Set(b)
  return a.some((id) => right.has(id))
}

function sameIssue(a: Issue, b: Issue): boolean {
  return a.id === b.id ||
    (
      normalizedConditionTitle(a.title) === normalizedConditionTitle(b.title) &&
      (a.roomId ?? '') === (b.roomId ?? '')
    )
}

function explicitlyRemoved(item: SpatialObject): boolean {
  const state = normalizedObjectState(item.state)
  return Boolean(state && EXPLICIT_REMOVED_STATES.has(state))
}

function normalizedObjectState(value: string | undefined): string | undefined {
  const normalized = normalize(value ?? '')
  return normalized || undefined
}

function hasUnresolvedFamilyCounterpart(item: SpatialObject, candidates: SpatialObject[]): boolean {
  const key = semanticObjectIdentityKey(item)
  if (!key.startsWith('family:')) return false
  return candidates.some((candidate) => semanticObjectIdentityKey(candidate) === key)
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

function objectIdentityById(id: string, objects: SpatialObject[]): string | undefined {
  const item = objects.find((candidate) => candidate.id === id)
  return item ? semanticObjectIdentityKey(item) : undefined
}

function intersectionCount(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const value of a) if (b.has(value)) count += 1
  return count
}

function normalizedConditionTitle(value: string): string {
  return normalize(value)
}

function summarizeChanges(changes: Change[]): string {
  if (changes.length === 0) return 'No material environmental changes detected.'

  const orderedTypes: Change['type'][] = ['added', 'removed', 'moved', 'changed', 'resolved', 'uncertain']
  const labels: Record<Change['type'], string> = {
    added: 'added',
    removed: 'removed',
    moved: 'moved',
    changed: 'changed',
    resolved: 'resolved',
    unchanged: 'unchanged',
    uncertain: 'uncertain',
  }

  const parts = orderedTypes
    .map((type) => ({ type, count: changes.filter((change) => change.type === type).length }))
    .filter(({ count }) => count > 0)
    .map(({ type, count }) => `${count} ${labels[type]}`)

  return `${changes.length} environmental change(s): ${parts.join(', ')}.`
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
