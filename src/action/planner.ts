import type {
  ActionPlan,
  ActionPlanGrounding,
  ActionPlanningRequest,
  ActionPlanningResponse,
  ActionPriority,
  EnvironmentalCondition,
  EnvironmentalMemory,
  EnvironmentalState,
  EnvironmentalStateSnapshot,
  Evidence,
  Issue,
} from '../domain/sentinel.js'
import type { ActionPlanningDraftStep, ActionPlanningModelAdapter } from '../ai/model.js'
import { conditionTrustLabel } from '../perception/condition-model.js'
import type { EnvironmentalMemoryReader } from '../memory/repository.js'
import { collapseEquivalentConditionsForPresentation } from '../memory/memory-presentation.js'

const ACTIVE_ISSUES = new Set(['open', 'acknowledged', 'in_progress'])

export class ActionPlannerInputError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 422, code = 'ACTION_PLAN_NOT_GROUNDED') {
    super(message)
    this.name = 'ActionPlannerInputError'
    this.status = status
    this.code = code
  }
}

export class ActionPlannerService {
  constructor(
    private readonly memory: EnvironmentalMemoryReader,
    private readonly model: ActionPlanningModelAdapter,
  ) {}

  async create(request: ActionPlanningRequest): Promise<ActionPlanningResponse> {
    const memory = await this.memory.get(request.environmentId)
    if (!memory) throw new ActionPlannerInputError('This location has no persisted SENTINEL memory.', 404, 'ENVIRONMENT_NOT_FOUND')
    if (!memory.states.length) throw new ActionPlannerInputError('This location does not have a grounded environmental state yet.', 422, 'MEMORY_NOT_READY')
    const state = resolveState(memory, request.stateId)
    const snapshot = snapshotFor(memory, state)
    const conditions = selectConditions(snapshot.conditions, request.relatedConditionIds)
    const issues = selectIssues(snapshot.issues, request.relatedIssueIds)
    if (!conditions.length && !issues.length) {
      throw new ActionPlannerInputError(`State v${state.version} has no grounded actionable condition or active issue to plan from.`)
    }

    const objectIds = new Set([
      ...(request.relatedObjectIds ?? []),
      ...conditions.flatMap((item) => item.objectIds),
      ...issues.flatMap((item) => item.objectIds),
    ])
    const objects = snapshot.objects.filter((item) => objectIds.has(item.id))
    if ((request.relatedObjectIds ?? []).some((id) => !snapshot.objects.some((item) => item.id === id))) {
      throw new ActionPlannerInputError('A requested object does not belong to the selected immutable state.')
    }

    const claimEvidenceIds = [
      ...conditions.flatMap((item) => item.evidenceIds),
      ...issues.flatMap((item) => item.evidenceIds),
    ]
    const evidenceIdSet = new Set(
      claimEvidenceIds.length > 0
        ? claimEvidenceIds
        : objects.flatMap((item) => item.evidenceIds),
    )
    const evidence = memory.evidence.filter((item) => evidenceIdSet.has(item.id))
    const context = buildContext(memory, state, conditions, issues, objects, evidence, request.goal)

    const draft = await this.model.plan({
      role: 'action',
      request: { ...request, stateId: state.id },
      context,
    })
    return groundPlan(memory, state, conditions, issues, objects, evidence, draft)
  }
}

function selectConditions(items: EnvironmentalCondition[], requested?: string[]): EnvironmentalCondition[] {
  if (requested?.length) {
    const selected = items.filter((item) => requested.includes(item.id))
    if (selected.length !== new Set(requested).size) throw new ActionPlannerInputError('A requested condition does not belong to the selected immutable state.')
    return collapseEquivalentConditionsForPresentation(selected)
  }
  return collapseEquivalentConditionsForPresentation(
    items.filter((item) => item.kind !== 'normal'),
  ).slice(0, 16)
}

function selectIssues(items: Issue[], requested?: string[]): Issue[] {
  if (requested?.length) {
    const selected = items.filter((item) => requested.includes(item.id))
    if (selected.length !== new Set(requested).size) throw new ActionPlannerInputError('A requested issue does not belong to the selected immutable state.')
    return selected
  }
  return items.filter((item) => ACTIVE_ISSUES.has(item.status)).slice(0, 16)
}

function buildContext(
  memory: EnvironmentalMemory,
  state: EnvironmentalState,
  conditions: EnvironmentalCondition[],
  issues: Issue[],
  objects: EnvironmentalStateSnapshot['objects'],
  evidence: Evidence[],
  goal?: string,
): string {
  return [
    `ENVIRONMENT ${memory.environment.id}: ${memory.environment.name}`,
    `STATE_ID ${state.id} VERSION ${state.version} CAPTURED_AT ${state.capturedAt} CURRENT=${state.id === memory.environment.currentStateId}`,
    `GOAL: ${goal?.trim() || 'Create the smallest safe evidence-backed plan for the grounded condition(s) in this state.'}`,
    'RULES:',
    '- Recommendations only. Do not claim work is completed, resolved, or verified.',
    '- Use only supplied IDs. Every step must cite a condition or issue and evidence.',
    '- No costs, marketplace, contractor search, payments, procurement, invented diagnosis, or invented measurements.',
    '- Hazardous/specialist work: recommend safe isolation when directly possible and a qualified professional; do not give unqualified repair instructions.',
    '- Uncertain conditions: inspect or re-observe rather than assert a repair.',
    '- Do not add a generic rescan/verification handoff step; SENTINEL appends one deterministic verification handoff after grounding. If observation itself is the corrective action for an uncertain condition, describe that specific inspection rather than generic post-work verification.',
    '- Do not state that a path, repair, clearance, or action is legally/code required unless the supplied grounded condition or evidence explicitly says so.',
    'CONDITIONS:',
    ...conditions.map((item) => `- ${item.id} | ${item.title} | trust=${conditionTrustLabel(item)} | kind=${item.kind} | status=${item.status} | confidence=${item.confidence} | objects=${item.objectIds.join(',')} | evidence=${item.evidenceIds.join(',')} | ${item.description}`),
    'ISSUES:',
    ...issues.map((item) => `- ${item.id} | ${item.title} | type=${item.type} | severity=${item.severity} | status=${item.status} | objects=${item.objectIds.join(',')} | evidence=${item.evidenceIds.join(',')} | ${item.description}`),
    'OBJECTS:',
    ...objects.map((item) => `- ${item.id} | ${item.name} | category=${item.category} | state=${item.state ?? 'unknown'} | position=${item.position?.description ?? 'unknown'} | confidence=${item.confidence}`),
    'EVIDENCE:',
    ...evidence.map((item) => `- ${item.id} | ${item.description}`),
  ].join('\n')
}

function groundPlan(
  memory: EnvironmentalMemory,
  state: EnvironmentalState,
  conditions: EnvironmentalCondition[],
  issues: Issue[],
  objects: EnvironmentalStateSnapshot['objects'],
  evidence: Evidence[],
  draft: { goal: string; rationale: string; steps: ActionPlanningDraftStep[] },
): ActionPlanningResponse {
  const allowedConditions = new Set(conditions.map((item) => item.id))
  const allowedIssues = new Set(issues.map((item) => item.id))
  const allowedObjects = new Set(objects.map((item) => item.id))
  const allowedEvidence = new Set(evidence.map((item) => item.id))

  const groundedDraftSteps = draft.steps.slice(0, 3).flatMap((raw, index) => {
    const relatedConditionIds = uniq(raw.relatedConditionIds.filter((id) => allowedConditions.has(id)))
    const relatedIssueIds = uniq(raw.relatedIssueIds.filter((id) => allowedIssues.has(id)))
    if (!relatedConditionIds.length && !relatedIssueIds.length) return []
    const relatedObjectIds = uniq(raw.relatedObjectIds.filter((id) => allowedObjects.has(id)))
    const groundedEvidence = new Set(raw.evidenceIds.filter((id) => allowedEvidence.has(id)))
    relatedConditionIds.forEach((id) => conditions.find((item) => item.id === id)?.evidenceIds.forEach((e) => allowedEvidence.has(e) && groundedEvidence.add(e)))
    relatedIssueIds.forEach((id) => issues.find((item) => item.id === id)?.evidenceIds.forEach((e) => allowedEvidence.has(e) && groundedEvidence.add(e)))
    if (!groundedEvidence.size) return []

    return [{
      id: `action_${crypto.randomUUID()}`,
      title: clean(raw.title, `Recommended action ${index + 1}`),
      description: clean(raw.description, 'Take the smallest safe corrective action supported by the selected state.'),
      priority: capPriority(raw.priority, relatedConditionIds, relatedIssueIds, conditions, issues),
      status: 'recommended' as const,
      relatedConditionIds,
      relatedIssueIds,
      relatedObjectIds,
      ...(raw.requiredSpecialist?.trim() ? { requiredSpecialist: raw.requiredSpecialist.trim().slice(0, 120) } : {}),
      evidenceIds: [...groundedEvidence],
    }]
  })
  if (!groundedDraftSteps.length) throw new ActionPlannerInputError('No evidence-backed action step survived SENTINEL grounding validation.')

  // The service owns the final verification handoff. If the model repeats a
  // generic "verify/rescan" step after a real corrective action, drop that
  // duplicate rather than presenting two verification steps to the user.
  const correctiveSteps = groundedDraftSteps.filter((item) => !isGenericVerificationHandoff(item))
  const groundingSteps = correctiveSteps.length > 0 ? correctiveSteps : groundedDraftSteps
  const steps = [...correctiveSteps]

  const evidenceIds = uniq(groundingSteps.flatMap((item) => item.evidenceIds))
  const relatedConditionIds = uniq(groundingSteps.flatMap((item) => item.relatedConditionIds))
  const relatedIssueIds = uniq(groundingSteps.flatMap((item) => item.relatedIssueIds))
  const relatedObjectIds = uniq(groundingSteps.flatMap((item) => item.relatedObjectIds))
  steps.push({
    id: `action_${crypto.randomUUID()}`,
    title: 'Rescan to verify',
    description: 'After the recommended physical work is complete, capture a new observation. SENTINEL must compare the new state before any condition is treated as resolved.',
    priority: 'low',
    status: 'recommended',
    relatedConditionIds,
    relatedIssueIds,
    relatedObjectIds,
    evidenceIds,
  })

  const plan: ActionPlan = {
    id: `plan_${crypto.randomUUID()}`,
    environmentId: memory.environment.id,
    stateId: state.id,
    createdAt: new Date().toISOString(),
    goal: clean(draft.goal, 'Resolve the grounded condition safely.'),
    steps,
    rationale: clean(draft.rationale, 'This plan is limited to evidence grounded in the selected environmental state.'),
    evidenceIds,
  }

  return {
    plan,
    grounding: buildGrounding(memory, state, conditions, issues, objects, evidence, relatedConditionIds, relatedIssueIds, relatedObjectIds, evidenceIds),
  }
}

function buildGrounding(
  memory: EnvironmentalMemory,
  state: EnvironmentalState,
  conditions: EnvironmentalCondition[],
  issues: Issue[],
  objects: EnvironmentalStateSnapshot['objects'],
  evidence: Evidence[],
  conditionIds: string[],
  issueIds: string[],
  objectIds: string[],
  evidenceIds: string[],
): ActionPlanGrounding {
  const current = memory.snapshots.find((item) => item.stateId === memory.environment.currentStateId)
  return {
    state: { id: state.id, version: state.version, capturedAt: state.capturedAt, summary: state.summary, isCurrent: state.id === memory.environment.currentStateId },
    evidence: evidence.filter((item) => evidenceIds.includes(item.id)).map((item) => ({
      id: item.id, sourceId: item.sourceId, type: item.type, capturedAt: item.capturedAt, description: item.description,
      ...(item.frameIndex === undefined ? {} : { frameIndex: item.frameIndex }),
      ...(item.timestampMs === undefined ? {} : { timestampMs: item.timestampMs }),
      ...(item.uri ? { uri: item.uri } : {}),
      stateIds: memory.states.filter((candidate) => candidate.sourceIds.includes(item.sourceId)).map((candidate) => candidate.id),
    })),
    conditions: conditions.filter((item) => conditionIds.includes(item.id)).map((item) => ({
      id: item.id, title: item.title, description: item.description, kind: item.kind, basis: item.basis, status: item.status,
      confidence: item.confidence, objectIds: item.objectIds, evidenceIds: item.evidenceIds.filter((id) => evidenceIds.includes(id)),
    })),
    issues: issues.filter((item) => issueIds.includes(item.id)).map((item) => ({
      id: item.id, title: item.title, severity: item.severity, status: item.status, confidence: item.confidence,
      stateIds: [state.id], isCurrent: Boolean(current?.issues.some((candidate) => candidate.id === item.id)),
    })),
    objects: objects.filter((item) => objectIds.includes(item.id)).map((item) => ({
      id: item.id, name: item.name, category: item.category, state: item.state, position: item.position?.description,
      confidence: item.confidence, stateIds: [state.id], isCurrent: Boolean(current?.objects.some((candidate) => candidate.id === item.id)),
    })),
  }
}

function resolveState(memory: EnvironmentalMemory, stateId?: string): EnvironmentalState {
  if (stateId) {
    const selected = memory.states.find((item) => item.id === stateId)
    if (!selected) throw new ActionPlannerInputError('The requested remembered state was not found in this location.', 404, 'STATE_NOT_FOUND')
    return selected
  }
  const current = memory.environment.currentStateId ? memory.states.find((item) => item.id === memory.environment.currentStateId) : undefined
  return current ?? [...memory.states].sort((a, b) => b.version - a.version)[0]
}

function snapshotFor(memory: EnvironmentalMemory, state: EnvironmentalState): EnvironmentalStateSnapshot {
  const snapshot = memory.snapshots.find((item) => item.stateId === state.id && item.environmentId === memory.environment.id)
  if (!snapshot) {
    throw new ActionPlannerInputError(
      'The selected state exists, but its immutable snapshot is unavailable. SENTINEL stopped instead of reconstructing history from newer data.',
      409,
      'HISTORICAL_SNAPSHOT_UNAVAILABLE',
    )
  }
  return snapshot
}

function isGenericVerificationHandoff(step: { title: string; description: string }): boolean {
  const text = `${step.title} ${step.description}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return /\b(?:rescan|re scan|scan again)\b/.test(text)
    || /\bverify (?:clearance|resolution|that .*\b(?:removed|resolved|clear|unobstructed)\b)/.test(text)
    || /\bconfirm (?:that )?.*\b(?:removed|resolved|clear|unobstructed)\b/.test(text)
}

function capPriority(requested: ActionPriority, conditionIds: string[], issueIds: string[], conditions: EnvironmentalCondition[], issues: Issue[]): ActionPriority {
  let max: ActionPriority = 'low'
  issues.filter((item) => issueIds.includes(item.id)).forEach((item) => { max = maxPriority(max, item.severity === 'info' ? 'low' : item.severity) })
  conditions.filter((item) => conditionIds.includes(item.id)).forEach((item) => {
    const allowed: ActionPriority = item.basis === 'inferred' ? 'medium' : item.kind === 'hazard' ? 'high' : ['damage', 'maintenance', 'access', 'compliance'].includes(item.kind) ? 'medium' : 'low'
    max = maxPriority(max, allowed)
  })
  return rank(requested) <= rank(max) ? requested : max
}

function clean(value: string | undefined, fallback: string): string { return (value?.trim() || fallback).slice(0, 1200) }
function uniq(values: string[]): string[] { return [...new Set(values)] }
function rank(value: ActionPriority): number { return value === 'critical' ? 4 : value === 'high' ? 3 : value === 'medium' ? 2 : 1 }
function maxPriority(a: ActionPriority, b: ActionPriority): ActionPriority { return rank(a) >= rank(b) ? a : b }
