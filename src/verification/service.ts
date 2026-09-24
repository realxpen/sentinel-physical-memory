import type {
  ActionPlanConditionReference,
  AskBuildingEvidenceReference,
  AskBuildingObjectReference,
  EnvironmentalCondition,
  EnvironmentalDiff,
  EnvironmentalMemory,
  EnvironmentalState,
  EnvironmentalStateSnapshot,
  Evidence,
  SpatialObject,
  VerificationConditionVerdict,
  VerificationGrounding,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
} from '../domain/sentinel.js'
import type { VerificationDraftVerdict, VerificationModelAdapter } from '../ai/model.js'
import type { ScanArtifact } from '../scan/types.js'
import { EnvironmentalDiffEngine } from '../memory/diff-engine.js'
import { matchObjectsConservatively } from '../memory/object-identity.js'
import type { EnvironmentalMemoryReader } from '../memory/repository.js'
import { dedupeVerificationConditions } from './condition-equivalence.js'

const RESOLVED_MIN_CONFIDENCE = 0.75
const REMAINING_MIN_CONFIDENCE = 0.6
const MAX_MODEL_CONDITIONS = 8

export class VerificationInputError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 422, code = 'VERIFICATION_NOT_GROUNDED') {
    super(message)
    this.name = 'VerificationInputError'
    this.status = status
    this.code = code
  }
}

interface VerificationScope {
  memory: EnvironmentalMemory
  previousState: EnvironmentalState
  currentState: EnvironmentalState
  previousSnapshot: EnvironmentalStateSnapshot
  currentSnapshot: EnvironmentalStateSnapshot
  targetConditions: EnvironmentalCondition[]
  currentConditions: EnvironmentalCondition[]
  currentEvidence: Evidence[]
  diff: EnvironmentalDiff
  conditionMatches: Map<number, number>
  newConditions: EnvironmentalCondition[]
}

export class VerificationAgentService {
  constructor(
    private readonly memory: EnvironmentalMemoryReader,
    private readonly model: VerificationModelAdapter,
  ) {}

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const memory = await this.memory.get(request.environmentId)
    if (!memory) throw new VerificationInputError('This location has no persisted SENTINEL memory.', 404, 'ENVIRONMENT_NOT_FOUND')
    if (!memory.states.length) throw new VerificationInputError('This location does not have a grounded environmental state yet.', 422, 'MEMORY_NOT_READY')

    const previousState = requireState(memory, request.previousStateId, 'previousStateId')
    const currentState = requireState(memory, request.currentStateId, 'currentStateId')
    if (currentState.version <= previousState.version) {
      throw new VerificationInputError('currentStateId must be a later immutable environmental state than previousStateId.')
    }

    const previousSnapshot = requireSnapshot(memory, previousState.id)
    const currentSnapshot = requireSnapshot(memory, currentState.id)
    const previousActionableRaw = previousSnapshot.conditions.filter((item) => item.kind !== 'normal')

    let selectedPrevious = previousActionableRaw
    if (request.conditionIds?.length) {
      const requested = new Set(request.conditionIds)
      const knownPreviousIds = new Set(previousActionableRaw.map((item) => item.id))
      if ([...requested].some((id) => !knownPreviousIds.has(id))) {
        throw new VerificationInputError('One or more requested conditions do not belong to the previous immutable state.')
      }
      selectedPrevious = previousActionableRaw.filter((item) => requested.has(item.id))
    }

    // Historical snapshots remain immutable. Verification projects duplicate
    // provider/audit condition records into one grounded semantic condition so
    // users never receive duplicate verdicts for the same physical problem.
    const previousActionable = dedupeVerificationConditions(previousActionableRaw)
    const targetConditions = dedupeVerificationConditions(selectedPrevious)
    if (!targetConditions.length) {
      throw new VerificationInputError('The previous state has no grounded non-normal condition to verify.')
    }

    const currentConditions = dedupeVerificationConditions(
      currentSnapshot.conditions.filter((item) => item.kind !== 'normal'),
    )
    const conditionMatches = matchConditionSets(previousActionable, currentConditions)
    const matchedCurrent = new Set(conditionMatches.values())
    const newConditions = currentConditions.filter((_, index) => !matchedCurrent.has(index))
    const currentEvidence = evidenceForState(memory, currentState)
    const persistedDiff = memory.diffs.find((item) => item.fromStateId === previousState.id && item.toStateId === currentState.id)
    const diff = persistedDiff ?? new EnvironmentalDiffEngine({ now: () => new Date(currentState.capturedAt) }).compare(previousSnapshot, currentSnapshot)

    const scope: VerificationScope = {
      memory,
      previousState,
      currentState,
      previousSnapshot,
      currentSnapshot,
      targetConditions,
      currentConditions,
      currentEvidence,
      diff,
      conditionMatches,
      newConditions,
    }

    const verdicts: VerificationConditionVerdict[] = []
    const pending: EnvironmentalCondition[] = []

    for (const condition of targetConditions) {
      const previousIndex = previousActionable.findIndex((item) => item.id === condition.id)
      const currentIndex = previousIndex >= 0 ? conditionMatches.get(previousIndex) : undefined
      const currentCondition = currentIndex === undefined ? undefined : currentConditions[currentIndex]

      if (currentCondition) {
        const evidenceIds = stateLocalEvidenceIds(currentCondition.evidenceIds, currentEvidence)
        if (currentCondition.status === 'present') {
          verdicts.push({
            conditionId: condition.id,
            currentConditionId: currentCondition.id,
            status: 'remaining',
            confidence: Math.min(condition.confidence, currentCondition.confidence),
            reason: 'A grounded equivalent condition is still present in the new environmental state.',
            relatedObjectIds: intersection(condition.objectIds, currentCondition.objectIds),
            evidenceIds,
          })
        } else {
          verdicts.push({
            conditionId: condition.id,
            currentConditionId: currentCondition.id,
            status: 'inconclusive',
            confidence: Math.min(0.5, currentCondition.confidence),
            reason: 'The new state still contains an uncertain form of the condition, so resolution cannot be confirmed.',
            relatedObjectIds: intersection(condition.objectIds, currentCondition.objectIds),
            evidenceIds,
          })
        }
        continue
      }

      const continued = deterministicContinuedSupport(condition, scope)
      if (continued) {
        verdicts.push(continued)
        continue
      }

      pending.push(condition)
    }

    if (pending.length > 0) {
      const draft = await this.model.verifyConditions({
        role: 'verification',
        request,
        context: buildVerificationContext(scope, pending.slice(0, MAX_MODEL_CONDITIONS)),
        artifacts: verificationArtifactsForComparison(scope.memory, scope.previousState, scope.currentState),
      })

      for (const condition of pending) {
        const selection = selectModelVerdict(draft.verdicts, condition.id)
        if (selection.conflict) {
          verdicts.push(inconclusive(
            condition,
            'The verification model returned conflicting verdicts for the same condition, so SENTINEL failed closed.',
          ))
          continue
        }
        verdicts.push(validateModelVerdict(condition, selection.verdict, scope))
      }
    }

    const resolvedConditionIds = verdicts.filter((item) => item.status === 'resolved').map((item) => item.conditionId)
    const remainingConditionIds = verdicts.filter((item) => item.status === 'remaining').map((item) => item.conditionId)
    const inconclusiveConditionIds = verdicts.filter((item) => item.status === 'inconclusive').map((item) => item.conditionId)
    const newConditionIds = newConditions.map((item) => item.id)
    const status = classifyStatus(targetConditions.length, resolvedConditionIds, remainingConditionIds, inconclusiveConditionIds, newConditionIds)
    const evidenceIds = unique([
      ...targetConditions.flatMap((item) => item.evidenceIds),
      ...verdicts.flatMap((item) => item.evidenceIds),
      ...newConditions.flatMap((item) => stateLocalEvidenceIds(item.evidenceIds, currentEvidence)),
    ])

    const result: VerificationResult = {
      id: `verification_${crypto.randomUUID()}`,
      environmentId: memory.environment.id,
      ...(request.actionPlanId ? { actionPlanId: request.actionPlanId } : {}),
      previousStateId: previousState.id,
      currentStateId: currentState.id,
      verifiedAt: new Date().toISOString(),
      status,
      resolvedConditionIds,
      remainingConditionIds,
      inconclusiveConditionIds,
      newConditionIds,
      verdicts,
      changes: diff.changes,
      summary: summarizeVerification(status, verdicts, newConditions, targetConditions),
      evidenceIds,
      grounding: buildGrounding(scope, verdicts, evidenceIds),
    }

    return result
  }
}


function selectModelVerdict(
  verdicts: VerificationDraftVerdict[],
  conditionId: string,
): { verdict?: VerificationDraftVerdict; conflict: boolean } {
  const candidates = verdicts.filter((item) => item.conditionId === conditionId)
  if (candidates.length === 0) return { conflict: false }

  const statuses = new Set(candidates.map((item) => item.status))
  if (statuses.size > 1) return { conflict: true }

  const verdict = [...candidates].sort((a, b) => {
    const confidence = clamp01(b.confidence) - clamp01(a.confidence)
    if (confidence !== 0) return confidence
    return (b.evidenceIds?.length ?? 0) - (a.evidenceIds?.length ?? 0)
  })[0]

  return { verdict, conflict: false }
}

function validateModelVerdict(
  condition: EnvironmentalCondition,
  raw: VerificationDraftVerdict | undefined,
  scope: VerificationScope,
): VerificationConditionVerdict {
  if (!raw) return inconclusive(condition, 'The verification model did not return a grounded verdict for this condition.')

  const currentEvidenceIds = new Set(scope.currentEvidence.map((item) => item.id))
  const currentObjects = new Set(scope.currentSnapshot.objects.map((item) => item.id))
  const evidenceIds = unique(raw.evidenceIds.filter((id) => currentEvidenceIds.has(id)))
  const relatedObjectIds = unique(raw.relatedObjectIds.filter((id) => currentObjects.has(id)))
  const allowedContextIds = currentContextObjectIds(condition, scope)
  const samePhysicalContext = condition.objectIds.length === 0 || relatedObjectIds.some((id) => allowedContextIds.has(id))
  const confidence = clamp01(raw.confidence)

  if (raw.status === 'resolved') {
    const continued = deterministicContinuedSupport(condition, scope)
    if (continued) return continued
    if (confidence < RESOLVED_MIN_CONFIDENCE || evidenceIds.length === 0 || !samePhysicalContext) {
      return inconclusive(
        condition,
        'The new state does not contain enough positive same-object/area evidence to confirm resolution.',
        evidenceIds,
        relatedObjectIds,
      )
    }
    return {
      conditionId: condition.id,
      status: 'resolved',
      confidence,
      reason: cleanReason(raw.reason, 'Current evidence positively supports that the earlier condition is no longer present.'),
      relatedObjectIds,
      evidenceIds,
    }
  }

  if (raw.status === 'remaining') {
    if (confidence < REMAINING_MIN_CONFIDENCE || evidenceIds.length === 0 || !samePhysicalContext) {
      return inconclusive(
        condition,
        'The new state does not contain enough grounded same-object/area evidence to confirm that the condition remains.',
        evidenceIds,
        relatedObjectIds,
      )
    }
    return {
      conditionId: condition.id,
      status: 'remaining',
      confidence,
      reason: cleanReason(raw.reason, 'Current evidence still supports the earlier condition.'),
      relatedObjectIds,
      evidenceIds,
    }
  }

  return inconclusive(
    condition,
    cleanReason(raw.reason, 'The new state is insufficient to confirm either resolution or persistence.'),
    evidenceIds,
    relatedObjectIds,
  )
}


function currentContextObjectIds(
  condition: EnvironmentalCondition,
  scope: VerificationScope,
): Set<string> {
  const allowed = new Set<string>()
  const baselineIds = new Set(condition.objectIds)

  for (const current of scope.currentSnapshot.objects) {
    if (baselineIds.has(current.id)) allowed.add(current.id)
  }

  const matches = matchObjectsConservatively(scope.previousSnapshot.objects, scope.currentSnapshot.objects)
  for (const [currentIndex, previousIndex] of matches.entries()) {
    const previous = scope.previousSnapshot.objects[previousIndex]
    const current = scope.currentSnapshot.objects[currentIndex]
    if (!previous || !current) continue

    if (baselineIds.has(previous.id)) {
      allowed.add(current.id)
      continue
    }

    if (isAccessAreaAnchor(condition, previous) && isAccessAreaAnchor(condition, current)) {
      allowed.add(current.id)
    }
  }

  return allowed
}

function isAccessAreaAnchor(condition: EnvironmentalCondition, item: SpatialObject): boolean {
  if (condition.kind !== 'access') return false
  if (!/\b(?:exit|egress|access|door|doorway|hallway|walkway|corridor|passage|path)\b/i.test(`${condition.title} ${condition.description}`)) return false

  const text = `${item.name} ${item.description ?? ''} ${item.position?.description ?? ''}`
  if (item.category === 'door') return /\b(?:exit|emergency|door|doorway)\b/i.test(text)
  if (item.category === 'signage') return /\b(?:exit|egress|emergency)\b/i.test(text)
  if (item.category === 'room') return /\b(?:hallway|walkway|corridor|passage|exit|egress)\b/i.test(text)
  return false
}

function deterministicContinuedSupport(
  condition: EnvironmentalCondition,
  scope: VerificationScope,
): VerificationConditionVerdict | undefined {
  if (condition.kind !== 'access') return undefined
  if (!/obstruct|block|access|exit/i.test(`${condition.title} ${condition.description}`)) return undefined

  const currentEvidenceIds = new Set(scope.currentEvidence.map((item) => item.id))
  const relatedCurrentObjects = scope.currentSnapshot.objects.filter((item) => condition.objectIds.includes(item.id))
  const obstruction = relatedCurrentObjects.find((item) => {
    const text = `${item.name} ${item.description ?? ''} ${item.position?.description ?? ''}`.toLowerCase()
    return /\bobstruct|\bblock|\bacross\b|\bin front of\b/.test(text)
      && item.evidenceIds.some((id) => currentEvidenceIds.has(id))
  })

  const relation = scope.currentSnapshot.relations.find((item) =>
    item.type === 'in_front_of'
      && condition.objectIds.includes(item.fromId)
      && condition.objectIds.includes(item.toId)
      && item.evidenceIds.some((id) => currentEvidenceIds.has(id)),
  )

  if (!obstruction && !relation) return undefined

  const evidenceIds = unique([
    ...(obstruction?.evidenceIds ?? []),
    ...(relation?.evidenceIds ?? []),
  ].filter((id) => currentEvidenceIds.has(id)))

  return {
    conditionId: condition.id,
    status: 'remaining',
    confidence: Math.min(1, Math.max(condition.confidence, obstruction?.confidence ?? 0, relation?.confidence ?? 0)),
    reason: 'The new state still grounds the same obstruction geometry, so disappearance of the old issue/condition record is not treated as resolution.',
    relatedObjectIds: relatedCurrentObjects.map((item) => item.id),
    evidenceIds,
  }
}

function buildVerificationContext(scope: VerificationScope, pending: EnvironmentalCondition[]): string {
  const currentEvidenceIds = new Set(scope.currentEvidence.map((item) => item.id))
  const targetObjectIds = new Set(pending.flatMap((item) => item.objectIds))
  const currentContextIds = new Set(pending.flatMap((condition) => [...currentContextObjectIds(condition, scope)]))
  const currentObjects = scope.currentSnapshot.objects.filter((item) => targetObjectIds.has(item.id) || currentContextIds.has(item.id))
  const currentObservations = scope.memory.observations.filter((item) =>
    scope.currentState.sourceIds.includes(item.sourceId)
      && (item.evidenceIds.some((id) => currentEvidenceIds.has(id)) || !targetObjectIds.size),
  )

  return [
    `ENVIRONMENT ${scope.memory.environment.id}: ${scope.memory.environment.name}`,
    `PREVIOUS_STATE ${scope.previousState.id} VERSION ${scope.previousState.version} CAPTURED_AT ${scope.previousState.capturedAt}`,
    `CURRENT_STATE ${scope.currentState.id} VERSION ${scope.currentState.version} CAPTURED_AT ${scope.currentState.capturedAt}`,
    'VERIFICATION_RULES:',
    '- Verify the earlier condition against the CURRENT state only.',
    '- Missing from the current condition list is NOT evidence of resolution.',
    '- resolved requires positive current evidence from the same physical object/area showing the earlier condition is no longer present.',
    '- For access obstruction, a durable current area anchor (for example the same EXIT sign or exit door) may establish the same physical area even when the former obstacle itself is absent.',
    '- remaining requires positive current evidence that the earlier condition is still present.',
    '- inconclusive when the relevant object/area was not clearly re-observed or the evidence does not distinguish resolved from remaining.',
    '- Cite only CURRENT_EVIDENCE IDs and CURRENT_OBJECT IDs supplied below.',
    '- Never infer work completion from an action plan, issue disappearance, or generic normal wording.',
    'BASELINE CONDITIONS TO VERIFY:',
    ...pending.map((item) => `- CONDITION ${item.id}: ${item.title} | kind=${item.kind} | basis=${item.basis} | confidence=${item.confidence} | objects=${item.objectIds.join(',')} | ${item.description}`),
    'CURRENT NON-NORMAL CONDITIONS:',
    ...scope.currentConditions.map((item) => `- CONDITION ${item.id}: ${item.title} | kind=${item.kind} | status=${item.status} | confidence=${item.confidence} | objects=${item.objectIds.join(',')} | evidence=${stateLocalEvidenceIds(item.evidenceIds, scope.currentEvidence).join(',')} | ${item.description}`),
    'CURRENT OBJECTS FROM THE SAME PHYSICAL/AREA CONTEXT:',
    ...currentObjects.map((item) => `- OBJECT ${item.id}: ${item.name} | category=${item.category} | state=${item.state ?? 'unknown'} | position=${item.position?.description ?? 'unknown'} | description=${item.description ?? 'none'} | evidence=${stateLocalEvidenceIds(item.evidenceIds, scope.currentEvidence).join(',')}`),
    'CURRENT OBSERVATIONS:',
    ...currentObservations.slice(0, 16).map((item) => `- OBSERVATION ${item.id}: ${item.label} | confidence=${item.confidence} | evidence=${stateLocalEvidenceIds(item.evidenceIds, scope.currentEvidence).join(',')} | ${item.description}`),
    'CURRENT EVIDENCE:',
    ...scope.currentEvidence.slice(0, 20).map((item) => `- EVIDENCE ${item.id} | source=${item.sourceId}: ${item.description}`),
    'PERSISTED REALITY DIFF:',
    ...scope.diff.changes.slice(0, 20).map((item) => `- ${item.type} ${item.entityKind ?? 'unknown'} ${item.entityId ?? ''}: ${item.title} | ${item.description}`),
  ].join('\n')
}

function buildGrounding(
  scope: VerificationScope,
  verdicts: VerificationConditionVerdict[],
  evidenceIds: string[],
): VerificationGrounding {
  const referencedObjectIds = unique([
    ...scope.targetConditions.flatMap((item) => item.objectIds),
    ...verdicts.flatMap((item) => item.relatedObjectIds),
    ...scope.newConditions.flatMap((item) => item.objectIds),
  ])
  const currentObjectIds = new Set(scope.currentSnapshot.objects.map((item) => item.id))
  const objectMap = new Map<string, SpatialObject>()
  scope.previousSnapshot.objects.forEach((item) => objectMap.set(item.id, item))
  scope.currentSnapshot.objects.forEach((item) => objectMap.set(item.id, item))

  return {
    previousState: stateRef(scope.memory, scope.previousState),
    currentState: stateRef(scope.memory, scope.currentState),
    evidence: evidenceIds.flatMap((id) => {
      const item = scope.memory.evidence.find((candidate) => candidate.id === id)
      return item ? [evidenceRef(scope.memory, item)] : []
    }),
    baselineConditions: scope.targetConditions.map(conditionRef),
    currentConditions: uniqueConditions([
      ...scope.currentConditions.filter((item) => verdicts.some((verdict) => verdict.currentConditionId === item.id)),
      ...scope.newConditions,
    ]).map(conditionRef),
    objects: referencedObjectIds.flatMap((id): AskBuildingObjectReference[] => {
      const item = objectMap.get(id)
      if (!item) return []
      const stateIds = [scope.previousState, scope.currentState]
        .filter((state) => requireSnapshot(scope.memory, state.id).objects.some((object) => object.id === id))
        .map((state) => state.id)
      return [{
        id: item.id,
        name: item.name,
        category: item.category,
        ...(item.state ? { state: item.state } : {}),
        ...(item.position?.description ? { position: item.position.description } : {}),
        confidence: item.confidence,
        stateIds,
        isCurrent: currentObjectIds.has(id) && scope.currentState.id === scope.memory.environment.currentStateId,
      }]
    }),
    diffId: scope.diff.id,
  }
}

function classifyStatus(
  targetCount: number,
  resolved: string[],
  remaining: string[],
  inconclusiveIds: string[],
  newIds: string[],
): VerificationStatus {
  if (remaining.length > 0) return resolved.length > 0 ? 'partial' : 'failed'
  if (inconclusiveIds.length > 0) return resolved.length > 0 ? 'partial' : 'inconclusive'
  if (resolved.length === targetCount) return newIds.length > 0 ? 'partial' : 'passed'
  return 'inconclusive'
}

function summarizeVerification(
  status: VerificationStatus,
  verdicts: VerificationConditionVerdict[],
  newConditions: EnvironmentalCondition[],
  targets: EnvironmentalCondition[],
): string {
  const titleById = new Map(targets.map((item) => [item.id, item.title]))
  const resolved = verdicts.filter((item) => item.status === 'resolved').map((item) => titleById.get(item.conditionId) ?? item.conditionId)
  const remaining = verdicts.filter((item) => item.status === 'remaining').map((item) => titleById.get(item.conditionId) ?? item.conditionId)
  const uncertain = verdicts.filter((item) => item.status === 'inconclusive').map((item) => titleById.get(item.conditionId) ?? item.conditionId)

  if (status === 'passed') {
    return `Verified. ${joinTitles(resolved)} ${resolved.length === 1 ? 'is' : 'are'} no longer supported by the new state, with positive current evidence from the same physical context.`
  }
  if (status === 'failed') {
    return `Not resolved. ${joinTitles(remaining)} ${remaining.length === 1 ? 'remains' : 'remain'} supported by the new observation.`
  }
  if (status === 'partial') {
    const open = [...remaining, ...uncertain, ...newConditions.map((item) => item.title)]
    return `Partially resolved. ${resolved.length ? joinTitles(resolved) + ' cleared, but ' : ''}${joinTitles(open)} still requires attention or confirmation.`
  }
  return `Verification inconclusive. The new observation does not contain enough positive evidence to confirm resolution of ${joinTitles(uncertain.length ? uncertain : targets.map((item) => item.title))}.`
}

function matchConditionSets(previous: EnvironmentalCondition[], current: EnvironmentalCondition[]): Map<number, number> {
  const matches = new Map<number, number>()
  const used = new Set<number>()

  previous.forEach((before, beforeIndex) => {
    const candidates = current
      .map((after, afterIndex) => ({ after, afterIndex, score: conditionScore(before, after) }))
      .filter((item) => !used.has(item.afterIndex) && item.score >= 5)
      .sort((a, b) => b.score - a.score)

    if (!candidates.length) return
    if (candidates.length > 1 && candidates[0].score === candidates[1].score) return
    matches.set(beforeIndex, candidates[0].afterIndex)
    used.add(candidates[0].afterIndex)
  })

  return matches
}

function conditionScore(a: EnvironmentalCondition, b: EnvironmentalCondition): number {
  let score = 0
  if (normalize(a.title) === normalize(b.title)) score += 6
  if (a.kind === b.kind) score += 2
  const overlap = intersection(a.objectIds, b.objectIds).length
  score += Math.min(4, overlap * 2)
  return score
}

function requireState(memory: EnvironmentalMemory, stateId: string, path: string): EnvironmentalState {
  const state = memory.states.find((item) => item.id === stateId)
  if (!state) throw new VerificationInputError(`${path} does not identify a state in this environment.`, 404, 'STATE_NOT_FOUND')
  return state
}

function requireSnapshot(memory: EnvironmentalMemory, stateId: string): EnvironmentalStateSnapshot {
  const snapshot = memory.snapshots.find((item) => item.stateId === stateId && item.environmentId === memory.environment.id)
  if (!snapshot) throw new VerificationInputError(`Immutable snapshot unavailable for state ${stateId}.`, 409, 'HISTORICAL_SNAPSHOT_UNAVAILABLE')
  return snapshot
}

function evidenceForState(memory: EnvironmentalMemory, state: EnvironmentalState): Evidence[] {
  const sources = new Set(state.sourceIds)
  return memory.evidence.filter((item) => sources.has(item.sourceId))
}

function verificationArtifactsForComparison(
  memory: EnvironmentalMemory,
  previousState: EnvironmentalState,
  currentState: EnvironmentalState,
): ScanArtifact[] {
  const artifactsFor = (state: EnvironmentalState, role: 'previous' | 'current') => {
    const sourceIds = new Set(state.sourceIds)
    return memory.sources
      .filter((source) => sourceIds.has(source.id))
      .filter((source) => source.modality === 'image' && /^data:image\//i.test(source.uri))
      .slice(0, 3)
      .map((source) => ({
        artifactId: `verification_${role}_${source.id}`,
        frameId: `verification_${role}_${source.id}`,
        kind: 'frame' as const,
        uri: source.uri,
      }))
  }

  // Baseline images are sent first only to localize the exact physical area.
  // Current images follow and remain the only admissible proof of resolution.
  return [
    ...artifactsFor(previousState, 'previous'),
    ...artifactsFor(currentState, 'current'),
  ]
}

function stateLocalEvidenceIds(ids: string[], stateEvidence: Evidence[]): string[] {
  const allowed = new Set(stateEvidence.map((item) => item.id))
  return unique(ids.filter((id) => allowed.has(id)))
}

function stateRef(memory: EnvironmentalMemory, state: EnvironmentalState) {
  return {
    id: state.id,
    version: state.version,
    capturedAt: state.capturedAt,
    summary: state.summary,
    isCurrent: state.id === memory.environment.currentStateId,
  }
}

function evidenceRef(memory: EnvironmentalMemory, item: Evidence): AskBuildingEvidenceReference {
  return {
    id: item.id,
    sourceId: item.sourceId,
    type: item.type,
    capturedAt: item.capturedAt,
    description: item.description,
    ...(item.frameIndex === undefined ? {} : { frameIndex: item.frameIndex }),
    ...(item.timestampMs === undefined ? {} : { timestampMs: item.timestampMs }),
    ...(item.uri ? { uri: item.uri } : {}),
    stateIds: memory.states.filter((state) => state.sourceIds.includes(item.sourceId)).map((state) => state.id),
  }
}

function conditionRef(item: EnvironmentalCondition): ActionPlanConditionReference {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    kind: item.kind,
    basis: item.basis,
    status: item.status,
    confidence: item.confidence,
    objectIds: [...item.objectIds],
    evidenceIds: [...item.evidenceIds],
  }
}

function inconclusive(
  condition: EnvironmentalCondition,
  reason: string,
  evidenceIds: string[] = [],
  relatedObjectIds: string[] = [],
): VerificationConditionVerdict {
  return {
    conditionId: condition.id,
    status: 'inconclusive',
    confidence: Math.min(0.5, condition.confidence),
    reason,
    relatedObjectIds,
    evidenceIds,
  }
}

function cleanReason(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).slice(0, 700)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

function intersection(a: string[], b: string[]): string[] {
  const set = new Set(b)
  return unique(a.filter((item) => set.has(item)))
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function uniqueConditions(items: EnvironmentalCondition[]): EnvironmentalCondition[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function joinTitles(items: string[]): string {
  if (!items.length) return 'the selected condition'
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}
