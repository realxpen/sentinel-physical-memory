import type { EnvironmentalDiff, EnvironmentalMemory, EnvironmentalState, Environment, EnvironmentRelation, Evidence, Issue, Observation, ScanSource, SpatialObject, PerceptionResult } from '../domain/sentinel'
import { EnvironmentalDiffEngine } from './diff-engine'

export interface MemoryIds { state: () => string; object: () => string; issue: () => string; relation: () => string; evidence: () => string; diff: () => string }
export interface MemoryStoreDependencies { now?: () => Date; ids?: Partial<MemoryIds> }
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

export class EnvironmentalMemoryStore {
  private readonly now: () => Date
  private readonly ids: MemoryIds
  private readonly memories = new Map<string, EnvironmentalMemory>()
  private readonly snapshots = new Map<string, { objects: SpatialObject[]; issues: Issue[] }>()

  constructor(deps: MemoryStoreDependencies = {}) {
    this.now = deps.now ?? (() => new Date())
    this.ids = {
      state: deps.ids?.state ?? (() => makeId('state')), object: deps.ids?.object ?? (() => makeId('object')),
      issue: deps.ids?.issue ?? (() => makeId('issue')), relation: deps.ids?.relation ?? (() => makeId('relation')),
      evidence: deps.ids?.evidence ?? (() => makeId('evidence')), diff: deps.ids?.diff ?? (() => makeId('diff')),
    }
  }

  /** Restore a serialized memory and rebuild immutable historical snapshots for diffing. */
  hydrate(memory: EnvironmentalMemory): void {
    const copy = this.clone(memory)
    this.memories.set(copy.environment.id, copy)
    for (const state of copy.states) {
      this.snapshots.set(state.id, {
        objects: copy.objects.filter((item) => state.objectIds.includes(item.id)).map((item) => this.clone(item)),
        issues: copy.issues.filter((item) => state.issueIds.includes(item.id)).map((item) => this.clone(item)),
      })
    }
  }

  createEnvironment(environment: Environment): EnvironmentalMemory {
    if (this.memories.has(environment.id)) throw new Error(`Environment ${environment.id} already exists`)
    const memory: EnvironmentalMemory = { environment: { ...environment, stateIds: [...environment.stateIds], roomIds: [...environment.roomIds], objectIds: [...environment.objectIds], issueIds: [...environment.issueIds] }, states: [], objects: [], issues: [], observations: [], evidence: [], relations: [], sources: [], diffs: [] }
    this.memories.set(environment.id, memory)
    return this.clone(memory)
  }

  get(environmentId: string): EnvironmentalMemory | undefined { const memory = this.memories.get(environmentId); return memory ? this.clone(memory) : undefined }

  ingestScan(environmentId: string, source: ScanSource, perception: PerceptionResult, summary?: string): EnvironmentalState {
    const memory = this.require(environmentId)
    this.assertPerceptionIdentity(environmentId, source.id, perception)
    const capturedAt = source.capturedAt || this.now().toISOString()
    this.upsertSource(memory, source)
    this.upsertEvidence(memory, perception.evidence)
    const objects = perception.objects.map((item) => this.upsertObject(memory, item, capturedAt))
    const issues = this.upsertIssues(memory, perception.observations, capturedAt)
    const relations = perception.relations.map((item) => this.upsertRelation(memory, item))
    memory.observations.push(...perception.observations.map((item) => ({ ...item, evidenceIds: [...item.evidenceIds] })))
    const state: EnvironmentalState = { id: this.ids.state(), environmentId, capturedAt, sourceIds: [source.id], objectIds: objects.map((item) => item.id), issueIds: issues.map((item) => item.id), relationIds: relations.map((item) => item.id), summary: summary ?? this.defaultSummary(objects, issues, relations), version: memory.states.length + 1 }
    memory.states.push(state)
    this.snapshots.set(state.id, { objects: this.clone(objects), issues: this.clone(issues) })
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
    const diff = new EnvironmentalDiffEngine({ now: this.now, id: () => this.ids.diff().replace(/^diff_/, 'change_') }).compare(
      { stateId: from.id, environmentId, objects: fromSnapshot.objects, issues: fromSnapshot.issues },
      { stateId: to.id, environmentId, objects: toSnapshot.objects, issues: toSnapshot.issues },
    )
    memory.diffs = [...memory.diffs.filter((item) => !(item.fromStateId === from.id && item.toStateId === to.id)), diff]
    return this.clone(diff)
  }

  private upsertObject(memory: EnvironmentalMemory, incoming: SpatialObject, capturedAt: string): SpatialObject {
    const existing = memory.objects.find((item) => item.name.toLowerCase() === incoming.name.toLowerCase() && item.category === incoming.category)
    if (!existing) { const created = { ...incoming, id: incoming.id || this.ids.object(), firstSeenAt: incoming.firstSeenAt || capturedAt, lastSeenAt: capturedAt, evidenceIds: [...incoming.evidenceIds] }; memory.objects.push(created); return created }
    existing.description = incoming.description ?? existing.description; existing.position = incoming.position ?? existing.position; existing.boundingBox = incoming.boundingBox ?? existing.boundingBox; existing.state = incoming.state ?? existing.state; existing.confidence = incoming.confidence; existing.lastSeenAt = capturedAt; existing.evidenceIds = unique([...existing.evidenceIds, ...incoming.evidenceIds]); return existing
  }
  private upsertIssues(memory: EnvironmentalMemory, observations: Observation[], capturedAt: string): Issue[] {
    const detected = observations.filter((item) => /issue|hazard|damage|leak|blocked|broken|exposed|missing|overdue/i.test(`${item.label} ${item.description}`))
    return detected.map((observation) => { const existing = memory.issues.find((item) => item.title.toLowerCase() === observation.label.toLowerCase()); if (existing) { existing.lastObservedAt = capturedAt; existing.confidence = Math.max(existing.confidence, observation.confidence); existing.evidenceIds = unique([...existing.evidenceIds, ...observation.evidenceIds]); return existing } const issue: Issue = { id: this.ids.issue(), environmentId: observation.environmentId, type: 'unknown', title: observation.label, description: observation.description, severity: 'medium', status: 'open', confidence: observation.confidence, objectIds: [], roomId: observation.position?.roomId, evidenceIds: [...observation.evidenceIds], firstDetectedAt: capturedAt, lastObservedAt: capturedAt }; memory.issues.push(issue); return issue })
  }
  private upsertRelation(memory: EnvironmentalMemory, incoming: EnvironmentRelation): EnvironmentRelation { const existing = memory.relations.find((item) => item.fromId === incoming.fromId && item.toId === incoming.toId && item.type === incoming.type); if (existing) { existing.confidence = Math.max(existing.confidence, incoming.confidence); existing.evidenceIds = unique([...existing.evidenceIds, ...incoming.evidenceIds]); return existing } const relation = { ...incoming, id: incoming.id || this.ids.relation(), evidenceIds: [...incoming.evidenceIds] }; memory.relations.push(relation); return relation }
  private upsertEvidence(memory: EnvironmentalMemory, evidence: Evidence[]): void { for (const incoming of evidence) { const existing = memory.evidence.find((item) => item.id === incoming.id); if (existing) Object.assign(existing, incoming); else memory.evidence.push({ ...incoming, id: incoming.id || this.ids.evidence(), boundingBox: incoming.boundingBox ? { ...incoming.boundingBox } : undefined }) } }
  private upsertSource(memory: EnvironmentalMemory, source: ScanSource): void { if (!memory.sources.some((item) => item.id === source.id)) memory.sources.push({ ...source, metadata: source.metadata ? { ...source.metadata } : undefined }) }
  private require(environmentId: string): EnvironmentalMemory { const memory = this.memories.get(environmentId); if (!memory) throw new Error(`Environment ${environmentId} not found`); return memory }
  private requireState(memory: EnvironmentalMemory, stateId: string): EnvironmentalState { const state = memory.states.find((item) => item.id === stateId); if (!state) throw new Error(`State ${stateId} not found`); return state }
  private assertPerceptionIdentity(environmentId: string, sourceId: string, perception: PerceptionResult): void { if (perception.sourceId !== sourceId) throw new Error(`Perception sourceId must equal ${sourceId}`); for (const object of perception.objects) if (object.environmentId !== environmentId) throw new Error(`Object ${object.id} has the wrong environmentId`); for (const observation of perception.observations) if (observation.environmentId !== environmentId || observation.sourceId !== sourceId) throw new Error(`Observation ${observation.id} has invalid scan identity`) }
  private defaultSummary(objects: SpatialObject[], issues: Issue[], relations: EnvironmentRelation[]): string { return `${objects.length} object(s), ${issues.length} issue(s), ${relations.length} relation(s) recorded.` }
  private clone<T>(value: T): T { return structuredClone(value) }
}
function unique(values: string[]): string[] { return [...new Set(values)] }
