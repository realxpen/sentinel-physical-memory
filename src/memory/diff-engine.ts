import type { Change, EnvironmentalDiff, Issue, SpatialObject } from '../domain/sentinel'

export interface EnvironmentalSnapshot {
  stateId: string
  environmentId: string
  objects: SpatialObject[]
  issues: Issue[]
}

export interface DiffEngineOptions {
  now?: () => Date
  id?: () => string
}

const makeId = () => `change_${crypto.randomUUID()}`

/** Deterministic, model-agnostic comparison of two environmental snapshots. */
export class EnvironmentalDiffEngine {
  private readonly now: () => Date
  private readonly id: () => string

  constructor(options: DiffEngineOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.id = options.id ?? makeId
  }

  compare(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot): EnvironmentalDiff {
    if (from.environmentId !== to.environmentId) throw new Error('Cannot compare states from different environments')
    const changes: Change[] = []

    for (const current of to.objects) {
      const previous = this.matchObject(current, from.objects)
      if (!previous) {
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

    for (const previous of from.objects) {
      if (!this.matchObject(previous, to.objects)) changes.push(this.change(from, to, 'removed', previous.id, `Removed: ${previous.name}`, `${previous.name} was present previously but is not present in the current state.`, previous.confidence, previous.evidenceIds))
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
      if (!to.issues.some((issue) => this.sameIssue(issue, previousIssue))) changes.push(this.change(from, to, 'resolved', previousIssue.id, `Issue no longer observed: ${previousIssue.title}`, `${previousIssue.title} was not observed in the current state.`, previousIssue.confidence, previousIssue.evidenceIds))
    }

    return { id: `diff_${crypto.randomUUID()}`, environmentId: from.environmentId, fromStateId: from.stateId, toStateId: to.stateId, createdAt: this.now().toISOString(), changes, summary: changes.length ? `${changes.length} environmental change(s) detected.` : 'No material environmental changes detected.' }
  }

  private matchObject(item: SpatialObject, candidates: SpatialObject[]): SpatialObject | undefined {
    return candidates.find((candidate) => candidate.id === item.id) ?? candidates.find((candidate) => candidate.category === item.category && candidate.name.trim().toLowerCase() === item.name.trim().toLowerCase())
  }

  private sameIssue(a: Issue, b: Issue): boolean { return a.id === b.id || (a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && (a.roomId ?? '') === (b.roomId ?? '')) }
  private positionChanged(a: SpatialObject, b: SpatialObject): boolean { const pa = a.position; const pb = b.position; if (!pa || !pb) return false; return pa.roomId !== pb.roomId || pa.relativeToId !== pb.relativeToId || pa.description !== pb.description }
  private change(from: EnvironmentalSnapshot, to: EnvironmentalSnapshot, type: Change['type'], entityId: string, title: string, description: string, confidence: number, evidenceIds: string[]): Change { return { id: this.id(), environmentId: from.environmentId, fromStateId: from.stateId, toStateId: to.stateId, type, entityId, title, description, confidence, evidenceIds: [...new Set(evidenceIds)] } }
}
