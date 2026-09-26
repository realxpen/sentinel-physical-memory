import type {
  AskBuildingGrounding,
  AskBuildingIntent,
  AskBuildingRequest,
  AskBuildingResponse,
  EnvironmentalCondition,
  EnvironmentalDiff,
  EnvironmentalMemory,
  EnvironmentalState,
  EnvironmentalStateSnapshot,
  Evidence,
  Issue,
  SpatialObject,
} from '../domain/sentinel.js'
import type { ReasoningModelAdapter } from '../ai/model.js'
import { conditionTrustLabel } from '../perception/condition-model.js'
import type { EnvironmentalMemoryReader } from './repository.js'
import { isUnconfirmedPersonObject } from '../domain/object-policy.js'
import { changesForPresentation } from './change-presentation.js'
import { collapseEquivalentConditionsForPresentation } from './memory-presentation.js'

const MAX_HISTORY_STATES = 12
const MAX_CONTEXT_OBJECTS = 30
const MAX_CONTEXT_CONDITIONS = 30
const MAX_CONTEXT_ISSUES = 30
const MAX_CONTEXT_RELATIONS = 40
const MAX_CONTEXT_EVIDENCE = 80
const MAX_CONTEXT_DIFFS = 8

export class AskBuildingInputError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 422, code = 'ASK_NOT_GROUNDED') {
    super(message)
    this.name = 'AskBuildingInputError'
    this.status = status
    this.code = code
  }
}

interface AskContextScope {
  text: string
  intent: AskBuildingIntent
  evidenceIds: Set<string>
  objectIds: Set<string>
  issueIds: Set<string>
  historyStateIds: string[]
}

export class AskBuildingService {
  constructor(private readonly memory: EnvironmentalMemoryReader, private readonly model: ReasoningModelAdapter) {}

  async ask(request: AskBuildingRequest): Promise<AskBuildingResponse> {
    const environment = await this.memory.get(request.environmentId)
    if (!environment) throw new AskBuildingInputError('This location has no persisted SENTINEL memory.', 404, 'ENVIRONMENT_NOT_FOUND')
    if (!environment.states.length) throw new AskBuildingInputError('This location does not have a grounded environmental state yet.', 422, 'MEMORY_NOT_READY')

    const state = this.resolveState(environment, request.stateId)
    const context = this.buildContext(environment, state, request.question)
    const answer = await this.model.reason({
      role: 'reasoning',
      request: { ...request, stateId: state.id },
      context: context.text,
    })
    return this.validateAndGround(answer, environment, state, context)
  }

  private resolveState(memory: EnvironmentalMemory, requestedStateId?: string): EnvironmentalState {
    if (requestedStateId) {
      const selected = memory.states.find((item) => item.id === requestedStateId)
      if (!selected) throw new AskBuildingInputError('The requested remembered state was not found in this location.', 404, 'STATE_NOT_FOUND')
      return selected
    }

    const currentId = memory.environment.currentStateId
    const current = currentId ? memory.states.find((item) => item.id === currentId) : undefined
    if (current) return current

    return [...memory.states].sort((a, b) => b.version - a.version || Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0]
  }

  private buildContext(memory: EnvironmentalMemory, state: EnvironmentalState, question: string): AskContextScope {
    const intent = classifyAskBuildingIntent(question)
    const tokens = questionTokens(question)
    const orderedStates = [...memory.states]
      .filter((item) => item.version <= state.version)
      .sort((a, b) => a.version - b.version || Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
      .slice(-MAX_HISTORY_STATES)
    const allowedStateIds = new Set(orderedStates.map((item) => item.id))
    const snapshot = this.snapshotForState(memory, state)
    const historySnapshots = orderedStates
      .map((item) => memory.snapshots.find((snapshotItem) => snapshotItem.stateId === item.id))
      .filter((item): item is EnvironmentalStateSnapshot => Boolean(item))

    const hiddenPersonIds = new Set(
      historySnapshots.flatMap((item) => item.objects.filter(isUnconfirmedPersonObject).map((object) => object.id)),
    )
    const stateObjects = snapshot.objects.filter((item) => !isUnconfirmedPersonObject(item))
    const allowedObjectIds = new Set(stateObjects.map((item) => item.id))
    const stateConditions = collapseEquivalentConditionsForPresentation(
      snapshot.conditions.filter((item) => !item.objectIds.some((id) => hiddenPersonIds.has(id))),
    )
    const stateIssues = snapshot.issues.filter((item) => !item.objectIds.some((id) => hiddenPersonIds.has(id)))
    const objects = [...stateObjects]
      .sort((a, b) => this.objectRelevance(b, tokens, stateIssues, stateConditions, intent) - this.objectRelevance(a, tokens, stateIssues, stateConditions, intent) || a.name.localeCompare(b.name))
      .slice(0, MAX_CONTEXT_OBJECTS)
    const conditions = [...stateConditions]
      .sort((a, b) => this.claimRelevance(b, tokens, intent) - this.claimRelevance(a, tokens, intent) || b.confidence - a.confidence)
      .slice(0, MAX_CONTEXT_CONDITIONS)
    const issues = [...stateIssues]
      .sort((a, b) => this.issueRelevance(b, tokens, intent) - this.issueRelevance(a, tokens, intent) || severityScore(b.severity) - severityScore(a.severity))
      .slice(0, MAX_CONTEXT_ISSUES)

    const primaryObjectIds = new Set(objects.slice(0, 16).map((item) => item.id))
    const relations = snapshot.relations
      .filter((relation) => allowedObjectIds.has(relation.fromId) && allowedObjectIds.has(relation.toId))
      .filter((relation) => primaryObjectIds.has(relation.fromId) || primaryObjectIds.has(relation.toId) || tokens.length === 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CONTEXT_RELATIONS)

    const historyObjectIds = new Set(objects.slice(0, 14).map((item) => item.id))
    const objectHistoryLines = [...historyObjectIds].flatMap((objectId) => {
      const appearances = orderedStates.flatMap((historyState) => {
        const historySnapshot = historySnapshots.find((item) => item.stateId === historyState.id)
        const object = historySnapshot?.objects.find((item) => item.id === objectId)
        if (!object) return []
        return [{ version: historyState.version, stateId: historyState.id, object }]
      })
      if (appearances.length === 0) return []
      const latest = appearances.at(-1)!.object
      return [`- OBJECT_HISTORY ${objectId}: ${latest.name} | ${appearances.map((entry) =>
        `v${entry.version}[state=${entry.object.state ?? 'unknown'}; position=${entry.object.position?.description ?? 'unknown'}; confidence=${entry.object.confidence}]`,
      ).join(' -> ')}`]
    })

    // The selected state's claims already have dedicated CURRENT sections below.
    // Historical sections should contain only earlier snapshots; repeating the
    // selected claims there gives the reasoning model artificial extra weight.
    const priorHistorySnapshots = historySnapshots.filter((item) => item.stateId !== state.id)
    const historicalIssues = uniqueById(priorHistorySnapshots.flatMap((item) => item.issues))
      .filter((item) => !item.objectIds.some((id) => hiddenPersonIds.has(id)))
      .sort((a, b) => this.issueRelevance(b, tokens, intent) - this.issueRelevance(a, tokens, intent) || b.confidence - a.confidence)
      .slice(0, MAX_CONTEXT_ISSUES)
    const historicalConditions = collapseEquivalentConditionsForPresentation(
      uniqueById(priorHistorySnapshots.flatMap((item) => item.conditions))
        .filter((item) => !item.objectIds.some((id) => hiddenPersonIds.has(id))),
    )
      .sort((a, b) => this.claimRelevance(b, tokens, intent) - this.claimRelevance(a, tokens, intent) || b.confidence - a.confidence)
      .slice(0, MAX_CONTEXT_CONDITIONS)

    const diffHistory = memory.diffs
      .filter((diff) => allowedStateIds.has(diff.toStateId) && allowedStateIds.has(diff.fromStateId))
      .sort((a, b) => stateVersion(memory, a.toStateId) - stateVersion(memory, b.toStateId))
      .slice(-MAX_CONTEXT_DIFFS)

    const evidenceCandidateIds = new Set<string>()
    for (const item of objects) item.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))
    for (const item of conditions) item.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))
    for (const item of issues) item.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))
    for (const item of historicalConditions) item.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))
    for (const item of historicalIssues) item.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))
    for (const relation of relations) relation.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))
    for (const historySnapshot of historySnapshots) {
      for (const object of historySnapshot.objects) {
        if (historyObjectIds.has(object.id)) object.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))
      }
    }
    for (const diff of diffHistory) for (const change of diff.changes) change.evidenceIds.forEach((id) => evidenceCandidateIds.add(id))

    const evidence = memory.evidence
      .filter((item) => evidenceCandidateIds.has(item.id))
      .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
      .slice(0, MAX_CONTEXT_EVIDENCE)
    const renderedEvidenceIds = new Set(evidence.map((item) => item.id))

    const renderedObjectIds = new Set<string>(objects.map((item) => item.id))
    for (const objectId of historyObjectIds) renderedObjectIds.add(objectId)
    const renderedIssueIds = new Set<string>([...issues, ...historicalIssues].map((item) => item.id))

    const selectedDiff = diffHistory.find((item) => item.toStateId === state.id)
    const previousState = orderedStates.find((item) => item.version === state.version - 1)

    const context = [
      `ENVIRONMENT ${memory.environment.id}: ${memory.environment.name}`,
      `ASK_INTENT: ${intent}`,
      `SELECTED_STATE_ID ${state.id} VERSION ${state.version} CAPTURED_AT ${state.capturedAt}`,
      `SELECTED_STATE_SUMMARY: ${state.summary}`,
      `QUESTION: ${question}`,
      'TRUST_RULES:',
      '- Treat Observed claims as direct environmental evidence.',
      '- Treat Inferred claims as lower-authority interpretation.',
      '- Historical state lines describe immutable past snapshots. Do not project later states backward.',
      '- Absence from a later scan does not prove removal or resolution unless a persisted diff/issue status supports it.',
      '- Do not invent metric distance, room identity, geometry, diagnosis, cause, or completed action.',
      '- Recommendations are recommendations, not observed facts.',
      'STATE HISTORY:',
      ...orderedStates.map((item) => {
        const historySnapshot = historySnapshots.find((snapshotItem) => snapshotItem.stateId === item.id)
        const visibleObjectCount = historySnapshot?.objects.filter((object) => !isUnconfirmedPersonObject(object)).length ?? 0
        const visibleConditionCount = historySnapshot
          ? collapseEquivalentConditionsForPresentation(
              historySnapshot.conditions.filter((condition) => !condition.objectIds.some((id) => hiddenPersonIds.has(id))),
            ).length
          : 0
        return `- STATE v${item.version} ${item.id} captured=${item.capturedAt} current=${item.id === memory.environment.currentStateId} | ${item.summary} | objects=${visibleObjectCount} conditions=${visibleConditionCount} issues=${historySnapshot?.issues.length ?? 0} relations=${historySnapshot?.relations.length ?? 0}`
      }),
      'RELEVANT OBJECTS IN SELECTED STATE:',
      ...objects.map((item) => this.objectLine(item)),
      'RELEVANT RELATIONS IN SELECTED STATE:',
      ...relations.map((item) => {
        const from = snapshot.objects.find((object) => object.id === item.fromId)?.name ?? item.fromId
        const to = snapshot.objects.find((object) => object.id === item.toId)?.name ?? item.toId
        return `- RELATION ${item.id}: ${from} [${item.fromId}] --${item.type}--> ${to} [${item.toId}] | confidence=${item.confidence} | evidence=${item.evidenceIds.filter((id) => renderedEvidenceIds.has(id)).join(',')}`
      }),
      'RELEVANT CONDITIONS IN SELECTED STATE:',
      ...conditions.map((item) => this.conditionLine(item)),
      'RELEVANT ISSUES IN SELECTED STATE:',
      ...issues.map((item) => this.issueLine(item)),
      'OBJECT HISTORY UP TO SELECTED STATE:',
      ...objectHistoryLines,
      'HISTORICAL CONDITIONS UP TO SELECTED STATE:',
      ...historicalConditions.map((item) => this.conditionLine(item)),
      'HISTORICAL ISSUES UP TO SELECTED STATE:',
      ...historicalIssues.map((item) => this.issueLine(item)),
      'EVIDENCE AVAILABLE TO REASONING:',
      ...evidence.map((item) => this.evidenceLine(item)),
      previousState ? `PREVIOUS_STATE_ID ${previousState.id} VERSION ${previousState.version}` : 'NO_PREVIOUS_STATE',
      selectedDiff ? `SELECTED_STATE_DIFF ${selectedDiff.id}: ${selectedDiff.summary}\n${this.presentedDiffChanges(memory, selectedDiff).map((change) => `- ${change.type}: ${change.title} | ${change.description} | confidence=${change.confidence} | evidence=${change.evidenceIds.filter((id) => renderedEvidenceIds.has(id)).join(',')}`).join('\n')}` : 'NO_DIFF_INTO_SELECTED_STATE',
      'DIFF HISTORY UP TO SELECTED STATE:',
      ...diffHistory.map((diff) => this.diffLine(memory, diff, renderedEvidenceIds)),
    ].join('\n')

    return { text: context, intent, evidenceIds: renderedEvidenceIds, objectIds: renderedObjectIds, issueIds: renderedIssueIds, historyStateIds: orderedStates.map((item) => item.id) }
  }

  private snapshotForState(memory: EnvironmentalMemory, state: EnvironmentalState): EnvironmentalStateSnapshot {
    const snapshot = memory.snapshots.find((item) => item.stateId === state.id && item.environmentId === memory.environment.id)
    if (!snapshot) {
      throw new AskBuildingInputError(
        'The selected state exists, but its immutable snapshot is unavailable. SENTINEL stopped instead of reconstructing history from newer data.',
        409,
        'HISTORICAL_SNAPSHOT_UNAVAILABLE',
      )
    }
    return snapshot
  }

  private objectRelevance(item: SpatialObject, tokens: string[], issues: Issue[], conditions: EnvironmentalCondition[], intent: AskBuildingIntent): number {
    const text = `${item.name} ${item.description ?? ''} ${item.position?.description ?? ''} ${item.category}`.toLowerCase()
    let score = tokenScore(text, tokens) * 10
    if (issues.some((issue) => issue.objectIds.includes(item.id) && issue.status !== 'resolved' && issue.status !== 'dismissed')) score += intent === 'attention' || intent === 'priority' || intent === 'action' ? 14 : 5
    if (conditions.some((condition) => condition.objectIds.includes(item.id) && condition.kind !== 'normal')) score += 4
    if ((intent === 'location' || intent === 'nearby') && item.position?.description) score += 3
    return score + item.confidence
  }

  private claimRelevance(item: EnvironmentalCondition, tokens: string[], intent: AskBuildingIntent): number {
    let score = tokenScore(`${item.title} ${item.description} ${item.kind} ${item.status}`.toLowerCase(), tokens) * 10
    if (item.kind !== 'normal' && (intent === 'attention' || intent === 'priority' || intent === 'action' || intent === 'resolution')) score += 10
    if (item.basis === 'observed') score += 1
    return score + item.confidence
  }

  private issueRelevance(item: Issue, tokens: string[], intent: AskBuildingIntent): number {
    let score = tokenScore(`${item.title} ${item.description} ${item.type} ${item.status}`.toLowerCase(), tokens) * 10
    if (intent === 'attention' || intent === 'priority' || intent === 'action' || intent === 'resolution') score += 12
    if (item.status === 'open' || item.status === 'in_progress') score += 3
    return score + severityScore(item.severity) + item.confidence
  }

  private objectLine(item: SpatialObject): string { return `- OBJECT ${item.id}: ${item.name} | category=${item.category} | state=${item.state ?? 'unknown'} | confidence=${item.confidence} | position=${item.position?.description ?? 'unknown'} | evidence=${item.evidenceIds.join(',')}` }
  private conditionLine(item: EnvironmentalCondition): string { return `- CONDITION ${item.id}: ${item.title} | trust=${conditionTrustLabel(item)} | kind=${item.kind} | status=${item.status} | confidence=${item.confidence} | description=${item.description} | objects=${item.objectIds.join(',')} | evidence=${item.evidenceIds.join(',')}` }
  private issueLine(item: Issue): string { return `- ISSUE ${item.id}: ${item.title} | severity=${item.severity} | status=${item.status} | confidence=${item.confidence} | description=${item.description} | objects=${item.objectIds.join(',')} | evidence=${item.evidenceIds.join(',')}` }
  private evidenceLine(item: Evidence): string { return `- EVIDENCE ${item.id}: type=${item.type} source=${item.sourceId} captured=${item.capturedAt} description=${item.description} frame=${item.frameIndex ?? 'n/a'} timestampMs=${item.timestampMs ?? 'n/a'}` }
  private presentedDiffChanges(memory: EnvironmentalMemory, diff: EnvironmentalDiff) {
    const previousSnapshot = memory.snapshots.find((snapshot) => snapshot.stateId === diff.fromStateId)
    const currentSnapshot = memory.snapshots.find((snapshot) => snapshot.stateId === diff.toStateId)
    const currentState = memory.states.find((state) => state.id === diff.toStateId)
    const currentObservations = currentState
      ? memory.observations.filter((observation) => currentState.sourceIds.includes(observation.sourceId))
      : []
    return changesForPresentation(diff.changes, {
      previousObjects: previousSnapshot?.objects,
      currentObjects: currentSnapshot?.objects,
      currentObservations,
    }).slice(0, 24)
  }

  private diffLine(memory: EnvironmentalMemory, diff: EnvironmentalDiff, renderedEvidenceIds: Set<string>): string {
    const visibleChanges = this.presentedDiffChanges(memory, diff)
    return `- DIFF ${diff.id} ${diff.fromStateId}->${diff.toStateId}: ${diff.summary}\n${visibleChanges.map((change) => `  - ${change.type}: ${change.title} | ${change.description} | confidence=${change.confidence} | evidence=${change.evidenceIds.filter((id) => renderedEvidenceIds.has(id)).join(',')}`).join('\n')}`
  }

  private validateAndGround(answer: AskBuildingResponse, memory: EnvironmentalMemory, state: EnvironmentalState, context: AskContextScope): AskBuildingResponse {
    const evidenceIds = uniqueStrings(answer.evidenceIds.filter((id) => context.evidenceIds.has(id)))
    const relatedObjectIds = uniqueStrings(answer.relatedObjectIds.filter((id) => context.objectIds.has(id)))
    const relatedIssueIds = uniqueStrings(answer.relatedIssueIds.filter((id) => context.issueIds.has(id)))
    const grounding = this.buildGrounding(memory, state, context, evidenceIds, relatedObjectIds, relatedIssueIds)
    const confidence = evidenceIds.length > 0 ? answer.confidence : Math.min(answer.confidence, 0.35)
    return { ...answer, confidence, stateId: state.id, evidenceIds, relatedObjectIds, relatedIssueIds, grounding }
  }

  private buildGrounding(memory: EnvironmentalMemory, state: EnvironmentalState, context: AskContextScope, evidenceIds: string[], objectIds: string[], issueIds: string[]): AskBuildingGrounding {
    const selectedEvidence = evidenceIds.map((id) => memory.evidence.find((item) => item.id === id)).filter((item): item is Evidence => Boolean(item))
    const snapshots = memory.snapshots.filter((snapshot) => context.historyStateIds.includes(snapshot.stateId))
    const selectedSnapshot = snapshots.find((snapshot) => snapshot.stateId === state.id)
    const currentSnapshot = memory.snapshots.find((snapshot) => snapshot.stateId === memory.environment.currentStateId)

    return {
      intent: context.intent,
      state: { id: state.id, version: state.version, capturedAt: state.capturedAt, summary: state.summary, isCurrent: state.id === memory.environment.currentStateId },
      historyStateIds: [...context.historyStateIds],
      evidence: selectedEvidence.map((item) => ({
        id: item.id, sourceId: item.sourceId, type: item.type, capturedAt: item.capturedAt, description: item.description,
        ...(item.frameIndex === undefined ? {} : { frameIndex: item.frameIndex }),
        ...(item.timestampMs === undefined ? {} : { timestampMs: item.timestampMs }),
        ...(item.uri ? { uri: item.uri } : {}),
        stateIds: memory.states.filter((candidate) => candidate.sourceIds.includes(item.sourceId)).map((candidate) => candidate.id),
      })),
      objects: objectIds.flatMap((id) => {
        const appearances = snapshots.flatMap((snapshot) => {
          const item = snapshot.objects.find((candidate) => candidate.id === id)
          return item ? [{ stateId: snapshot.stateId, item }] : []
        })
        const current = selectedSnapshot?.objects.find((item) => item.id === id) ?? appearances.at(-1)?.item
        if (!current) return []
        return [{ id, name: current.name, category: current.category, state: current.state, position: current.position?.description, confidence: current.confidence, stateIds: appearances.map((entry) => entry.stateId), isCurrent: Boolean(currentSnapshot?.objects.some((item) => item.id === id)) }]
      }),
      issues: issueIds.flatMap((id) => {
        const appearances = snapshots.flatMap((snapshot) => {
          const item = snapshot.issues.find((candidate) => candidate.id === id)
          return item ? [{ stateId: snapshot.stateId, item }] : []
        })
        const current = selectedSnapshot?.issues.find((item) => item.id === id) ?? appearances.at(-1)?.item
        if (!current) return []
        return [{ id, title: current.title, severity: current.severity, status: current.status, confidence: current.confidence, stateIds: appearances.map((entry) => entry.stateId), isCurrent: Boolean(currentSnapshot?.issues.some((item) => item.id === id)) }]
      }),
    }
  }
}

export function classifyAskBuildingIntent(question: string): AskBuildingIntent {
  const normalized = question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (/\b(has|have|is|was|were)\b.*\b(resolved|fixed|cleared|gone)\b|\bstill (there|present|blocked|open)\b/.test(normalized)) return 'resolution'
  if (/\bwhat should i do\b|\bwhat do i do\b|\bhow should (i|we)\b|\bnext steps?\b|\bhow (do|can) (i|we) (fix|resolve|clear)\b/.test(normalized)) return 'action'
  if (/\bwhich change\b.*\b(matters|important|priority|urgent)\b|\bmost important change\b/.test(normalized)) return 'priority'
  if (/\bwhat changed\b|\bsince (the )?(last|previous) scan\b|\bwhat is different\b|\bcompare\b/.test(normalized)) return 'change'
  if (/\bwhere (is|are|was|were)\b|\blocation of\b|\bfind\b/.test(normalized)) return 'location'
  if (/\bnear\b|\baround\b|\bbeside\b|\bnext to\b|\bclose to\b/.test(normalized)) return 'nearby'
  if (/\battention\b|\burgent\b|\bissue\b|\bproblem\b|\bhazard\b|\brisk\b/.test(normalized)) return 'attention'
  return 'general'
}

function questionTokens(question: string): string[] {
  const stop = new Set(['what', 'where', 'when', 'which', 'this', 'that', 'there', 'have', 'has', 'been', 'with', 'from', 'into', 'about', 'should', 'could', 'would', 'does', 'did', 'since', 'last', 'scan', 'most', 'near'])
  return uniqueStrings(question.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !stop.has(token)))
}
function tokenScore(text: string, tokens: string[]): number { return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0) }
function severityScore(severity: Issue['severity']): number { if (severity === 'critical') return 5; if (severity === 'high') return 4; if (severity === 'medium') return 3; if (severity === 'low') return 2; return 1 }
function stateVersion(memory: EnvironmentalMemory, stateId: string): number { return memory.states.find((item) => item.id === stateId)?.version ?? -1 }
function uniqueById<T extends { id: string }>(items: T[]): T[] { const seen = new Set<string>(); return items.filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true }) }
function uniqueStrings(items: string[]): string[] { return [...new Set(items)] }
