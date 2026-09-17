import type { EnvironmentalCondition, EnvironmentalDiff, EnvironmentalMemory, EnvironmentalState, EnvironmentalStateSnapshot, Environment, EnvironmentRelation, Evidence, Issue, ScanSource, SpatialObject, PerceptionResult } from '../domain/sentinel.js'
import { assessCondition } from '../perception/condition-model.js'
import { EnvironmentalDiffEngine, type DiffEngine } from './diff-engine.js'
import { matchObjectsConservatively } from './object-identity.js'

export interface MemoryIds { state: () => string; object: () => string; issue: () => string; relation: () => string; evidence: () => string; diff: () => string }
export interface MemoryStoreDependencies { now?: () => Date; ids?: Partial<MemoryIds>; diffEngine?: DiffEngine }
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

export class EnvironmentalMemoryStore {
  private readonly now: () => Date
  private readonly ids: MemoryIds
  private readonly diffEngine: DiffEngine
  private readonly memories = new Map<string, EnvironmentalMemory>()
  private readonly snapshots = new Map<string, { objects: SpatialObject[]; conditions: EnvironmentalCondition[]; issues: Issue[] }>()

  constructor(deps: MemoryStoreDependencies = {}) {
    this.now = deps.now ?? (() => new Date())
    this.ids = {
      state: deps.ids?.state ?? (() => makeId('state')),
      object: deps.ids?.object ?? (() => makeId('object')),
      issue: deps.ids?.issue ?? (() => makeId('issue')),
      relation: deps.ids?.relation ?? (() => makeId('relation')),
      evidence: deps.ids?.evidence ?? (() => makeId('evidence')),
      diff: deps.ids?.diff ?? (() => makeId('diff')),
    }
    this.diffEngine = deps.diffEngine ?? new EnvironmentalDiffEngine({ now: this.now })
  }

  /** Restore serialized memory and rebuild the immutable snapshot index used by historical diff/retrieval. */
  hydrate(memory: EnvironmentalMemory): void {
    const copy = this.clone(memory)
    copy.conditions = Array.isArray(copy.conditions) ? copy.conditions : []
    copy.observations = Array.isArray(copy.observations)
      ? copy.observations.map((item) => ({ ...item, basis: 'observed' as const }))
      : []
    copy.states = Array.isArray(copy.states)
      ? copy.states.map((state) => ({ ...state, conditionIds: Array.isArray(state.conditionIds) ? state.conditionIds : [] }))
      : []

    const persistedSnapshots = Array.isArray(copy.snapshots) ? copy.snapshots : []
    const normalizedSnapshots: EnvironmentalStateSnapshot[] = []

    for (const state of copy.states) {
      const persisted = persistedSnapshots.find((snapshot) => snapshot.stateId === state.id && snapshot.environmentId === copy.environment.id)
      const snapshot: EnvironmentalStateSnapshot = persisted
        ? {
            ...this.clone(persisted),
            conditions: Array.isArray(persisted.conditions) ? this.clone(persisted.conditions) : [],
          }
        : {
            stateId: state.id,
            environmentId: copy.environment.id,
            objects: copy.objects.filter((item) => state.objectIds.includes(item.id)).map((item) => this.clone(item)),
            conditions: copy.conditions.filter((item) => state.conditionIds.includes(item.id)).map((item) => this.clone(item)),
            issues: copy.issues.filter((item) => state.issueIds.includes(item.id)).map((item) => this.clone(item)),
          }

      normalizedSnapshots.push(snapshot)
      this.snapshots.set(state.id, { objects: this.clone(snapshot.objects), conditions: this.clone(snapshot.conditions), issues: this.clone(snapshot.issues) })
    }

    copy.snapshots = normalizedSnapshots
    this.memories.set(copy.environment.id, copy)
  }

  createEnvironment(environment: Environment): EnvironmentalMemory {
    if (this.memories.has(environment.id)) throw new Error(`Environment ${environment.id} already exists`)
    const memory: EnvironmentalMemory = { environment: { ...environment, stateIds: [...environment.stateIds], roomIds: [...environment.roomIds], objectIds: [...environment.objectIds], issueIds: [...environment.issueIds] }, states: [], snapshots: [], objects: [], conditions: [], issues: [], observations: [], evidence: [], relations: [], sources: [], diffs: [] }
    this.memories.set(environment.id, memory)
    return this.clone(memory)
  }

  get(environmentId: string): EnvironmentalMemory | undefined { const memory = this.memories.get(environmentId); return memory ? this.clone(memory) : undefined }

  ingestScan(environmentId: string, source: ScanSource, perception: PerceptionResult, summary?: string): EnvironmentalState {
    const memory = this.require(environmentId)
    this.assertPerceptionIdentity(environmentId, source.id, perception)
    const capturedAt = source.capturedAt || this.now().toISOString()
    this.upsertSource(memory, source)

    // Model IDs are scan-local aliases, not durable primary keys. Temporal provenance
    // is also request-owned: a vision model cannot know when the source was captured.
    const evidenceIdMap = new Map(perception.evidence.map((item) => [item.id, sourceScopedId(source.id, 'evidence', item.id)]))
    const remapEvidenceIds = (ids: string[]) => ids.map((id) => evidenceIdMap.get(id) ?? id)

    const evidence = perception.evidence.map((item) => ({
      ...item,
      id: evidenceIdMap.get(item.id) ?? sourceScopedId(source.id, 'evidence', item.id),
      sourceId: source.id,
      capturedAt,
    }))
    this.upsertEvidence(memory, evidence)

    const normalizedObjects = perception.objects.map((item) => ({ ...item, evidenceIds: remapEvidenceIds(item.evidenceIds) }))
    const canonicalObjectsByInput = this.upsertObjects(memory, normalizedObjects, capturedAt)
    const objectIdMap = new Map(perception.objects.map((item, index) => [item.id, canonicalObjectsByInput[index].id]))
    const objects = uniqueById(canonicalObjectsByInput)

    const observations = perception.observations.map((item) => ({
      ...item,
      id: sourceScopedId(source.id, 'observation', item.id),
      environmentId,
      sourceId: source.id,
      capturedAt,
      basis: 'observed' as const,
      evidenceIds: remapEvidenceIds(item.evidenceIds),
    }))

    const conditions = uniqueById(perception.conditions.map((item) => ({
      ...item,
      id: sourceScopedId(source.id, 'condition', item.id),
      environmentId,
      observedAt: capturedAt,
      objectIds: item.objectIds.map((id) => objectIdMap.get(id) ?? id),
      evidenceIds: remapEvidenceIds(item.evidenceIds),
    })))
    memory.conditions.push(...conditions.map((item) => ({ ...item, objectIds: [...item.objectIds], evidenceIds: [...item.evidenceIds] })))
    const issues = uniqueById(this.upsertIssuesFromConditions(memory, conditions, capturedAt))

    const normalizedRelations = perception.relations.map((item) => ({
      ...item,
      id: sourceScopedId(source.id, 'relation', item.id),
      environmentId,
      fromId: objectIdMap.get(item.fromId) ?? item.fromId,
      toId: objectIdMap.get(item.toId) ?? item.toId,
      evidenceIds: remapEvidenceIds(item.evidenceIds),
    }))
    const relations = uniqueById(normalizedRelations.map((item) => this.upsertRelation(memory, item)))
    memory.observations.push(...observations.map((item) => ({ ...item, evidenceIds: [...item.evidenceIds] })))

    const state: EnvironmentalState = { id: this.ids.state(), environmentId, capturedAt, sourceIds: [source.id], objectIds: objects.map((item) => item.id), conditionIds: conditions.map((item) => item.id), issueIds: issues.map((item) => item.id), relationIds: relations.map((item) => item.id), summary: summary ?? this.defaultSummary(objects, conditions, issues, relations), version: memory.states.length + 1 }
    memory.states.push(state)

    const snapshot: EnvironmentalStateSnapshot = { stateId: state.id, environmentId, objects: this.clone(objects), conditions: this.clone(conditions), issues: this.clone(issues) }
    this.snapshots.set(state.id, { objects: this.clone(snapshot.objects), conditions: this.clone(snapshot.conditions), issues: this.clone(snapshot.issues) })
    memory.snapshots = [...memory.snapshots.filter((item) => item.stateId !== state.id), this.clone(snapshot)]

    memory.environment.currentStateId = state.id
    memory.environment.stateIds.push(state.id)
    memory.environment.updatedAt = capturedAt
    memory.environment.objectIds = unique([...memory.environment.objectIds, ...objects.map((item) => item.id)])
    memory.environment.issueIds = unique([...memory.environment.issueIds, ...issues.map((item) => item.id)])
    memory.environment.roomIds = unique([...memory.environment.roomIds, ...objects.filter((item) => item.category === 'room').map((item) => item.id)])
    return this.clone(state)
  }

  compare(environmentId: string, fromStateId: string, toStateId: string): EnvironmentalDiff {
    const memory = this.require(environmentId)
    const from = this.requireState(memory, fromStateId); const to = this.requireState(memory, toStateId)
    const fromSnapshot = this.snapshots.get(from.id); const toSnapshot = this.snapshots.get(to.id)
    if (!fromSnapshot || !toSnapshot) throw new Error('Historical snapshot unavailable for one or both states')
    const diff = this.diffEngine.compare(
      { stateId: from.id, environmentId, objects: uniqueById(fromSnapshot.objects), conditions: uniqueById(fromSnapshot.conditions), issues: uniqueById(fromSnapshot.issues) },
      { stateId: to.id, environmentId, objects: uniqueById(toSnapshot.objects), conditions: uniqueById(toSnapshot.conditions), issues: uniqueById(toSnapshot.issues) },
    )
    memory.diffs = [...memory.diffs.filter((item) => !(item.fromStateId === from.id && item.toStateId === to.id)), diff]
    return this.clone(diff)
  }

  private upsertObjects(memory: EnvironmentalMemory, incoming: SpatialObject[], capturedAt: string): SpatialObject[] {
    const existing = [...memory.objects]
    const matches = matchObjectsConservatively(existing, incoming)

    return incoming.map((item, index) => {
      const previousIndex = matches.get(index)
      if (previousIndex === undefined) {
        const created = { ...item, id: this.ids.object(), firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [...item.evidenceIds] }
        memory.objects.push(created)
        return created
      }

      const matched = existing[previousIndex]
      matched.description = item.description ?? matched.description
      matched.position = item.position ?? matched.position
      matched.boundingBox = item.boundingBox ?? matched.boundingBox
      matched.state = item.state ?? matched.state
      matched.confidence = item.confidence
      matched.lastSeenAt = capturedAt
      matched.evidenceIds = unique([...matched.evidenceIds, ...item.evidenceIds])
      return matched
    })
  }

  private upsertIssuesFromConditions(memory: EnvironmentalMemory, conditions: EnvironmentalCondition[], capturedAt: string): Issue[] {
    const promoted: Issue[] = []
    for (const condition of conditions) {
      const assessment = assessCondition(condition)
      if (!assessment.operational || !assessment.issueType || !assessment.severity) continue

      const existing = memory.issues.find((item) => item.title.toLowerCase() === condition.title.toLowerCase() && item.type === assessment.issueType)
      if (existing) {
        existing.lastObservedAt = capturedAt
        existing.description = condition.description
        existing.confidence = condition.confidence
        existing.severity = assessment.severity
        existing.objectIds = unique([...existing.objectIds, ...condition.objectIds])
        existing.evidenceIds = unique([...existing.evidenceIds, ...condition.evidenceIds])
        if (existing.status === 'resolved' || existing.status === 'dismissed') existing.status = 'open'
        promoted.push(existing)
        continue
      }

      const issue: Issue = {
        id: this.ids.issue(),
        environmentId: condition.environmentId,
        type: assessment.issueType,
        title: condition.title,
        description: condition.description,
        severity: assessment.severity,
        status: 'open',
        confidence: condition.confidence,
        objectIds: [...condition.objectIds],
        evidenceIds: [...condition.evidenceIds],
        firstDetectedAt: capturedAt,
        lastObservedAt: capturedAt,
      }
      memory.issues.push(issue)
      promoted.push(issue)
    }
    return promoted
  }

  private upsertRelation(memory: EnvironmentalMemory, incoming: EnvironmentRelation): EnvironmentRelation { const existing = memory.relations.find((item) => item.fromId === incoming.fromId && item.toId === incoming.toId && item.type === incoming.type); if (existing) { existing.confidence = Math.max(existing.confidence, incoming.confidence); existing.evidenceIds = unique([...existing.evidenceIds, ...incoming.evidenceIds]); return existing } const relation = { ...incoming, id: this.ids.relation(), evidenceIds: [...incoming.evidenceIds] }; memory.relations.push(relation); return relation }
  private upsertEvidence(memory: EnvironmentalMemory, evidence: Evidence[]): void { for (const incoming of evidence) { const existing = memory.evidence.find((item) => item.id === incoming.id); if (existing) Object.assign(existing, incoming); else memory.evidence.push({ ...incoming, id: incoming.id || this.ids.evidence(), boundingBox: incoming.boundingBox ? { ...incoming.boundingBox } : undefined }) } }
  private upsertSource(memory: EnvironmentalMemory, source: ScanSource): void { if (!memory.sources.some((item) => item.id === source.id)) memory.sources.push({ ...source, metadata: source.metadata ? { ...source.metadata } : undefined }) }
  private require(environmentId: string): EnvironmentalMemory { const memory = this.memories.get(environmentId); if (!memory) throw new Error(`Environment ${environmentId} not found`); return memory }
  private requireState(memory: EnvironmentalMemory, stateId: string): EnvironmentalState { const state = memory.states.find((item) => item.id === stateId); if (!state) throw new Error(`State ${stateId} not found`); return state }
  private assertPerceptionIdentity(environmentId: string, sourceId: string, perception: PerceptionResult): void { if (perception.sourceId !== sourceId) throw new Error(`Perception sourceId must equal ${sourceId}`); for (const object of perception.objects) if (object.environmentId !== environmentId) throw new Error(`Object ${object.id} has the wrong environmentId`); for (const observation of perception.observations) if (observation.environmentId !== environmentId || observation.sourceId !== sourceId) throw new Error(`Observation ${observation.id} has invalid scan identity`); for (const condition of perception.conditions) if (condition.environmentId !== environmentId) throw new Error(`Condition ${condition.id} has the wrong environmentId`) }
  private defaultSummary(objects: SpatialObject[], conditions: EnvironmentalCondition[], issues: Issue[], relations: EnvironmentRelation[]): string { return `${objects.length} object(s), ${conditions.length} condition(s), ${issues.length} issue(s), ${relations.length} relation(s) recorded.` }
  private clone<T>(value: T): T { return structuredClone(value) }
}
function sourceScopedId(sourceId: string, kind: string, rawId: string): string { return `${sourceId}:${kind}:${rawId}` }
function unique(values: string[]): string[] { return [...new Set(values)] }
function uniqueById<T extends { id: string }>(values: T[]): T[] { const seen = new Set<string>(); return values.filter((value) => { if (seen.has(value.id)) return false; seen.add(value.id); return true }) }
