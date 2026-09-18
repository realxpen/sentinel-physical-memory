import type {
  EnvironmentalMemory,
  EnvironmentalState,
  EnvironmentalStateSnapshot,
  Evidence,
  Observation,
  ScanSource,
} from '../domain/sentinel.js'

export type EnvironmentalStateSelector =
  | { selector: 'current' | 'previous' }
  | { stateId: string }
  | { at: string }

export interface EnvironmentalStateHistoryEntry {
  stateId: string
  version: number
  capturedAt: string
  summary: string
  sourceIds: string[]
  objectCount: number
  conditionCount: number
  issueCount: number
  relationCount: number
  isCurrent: boolean
}

export interface EnvironmentalStateHistoryRecord {
  environmentId: string
  state: EnvironmentalState
  snapshot: EnvironmentalStateSnapshot
  observations: Observation[]
  evidence: Evidence[]
  sources: ScanSource[]
  isCurrent: boolean
  previousStateId?: string
  nextStateId?: string
}

/**
 * Phase 6 historical retrieval always reads immutable state snapshots.
 * It intentionally never reconstructs past object/condition/relation values
 * from today's mutable canonical records.
 */
export function listEnvironmentalStateHistory(memory: EnvironmentalMemory): EnvironmentalStateHistoryEntry[] {
  const ordered = orderedStates(memory)
  return [...ordered].reverse().map((state) => {
    const snapshot = requireSnapshot(memory, state.id)
    return {
      stateId: state.id,
      version: state.version,
      capturedAt: state.capturedAt,
      summary: state.summary,
      sourceIds: [...state.sourceIds],
      objectCount: snapshot.objects.length,
      conditionCount: snapshot.conditions.length,
      issueCount: snapshot.issues.length,
      relationCount: snapshot.relations.length,
      isCurrent: state.id === memory.environment.currentStateId,
    }
  })
}

export function selectEnvironmentalState(
  memory: EnvironmentalMemory,
  query: EnvironmentalStateSelector,
): EnvironmentalStateHistoryRecord | undefined {
  const ordered = orderedStates(memory)
  if (ordered.length === 0) return undefined

  let state: EnvironmentalState | undefined
  if ('stateId' in query) {
    const stateId = query.stateId.trim()
    if (!stateId) throw new Error('stateId is required')
    state = ordered.find((item) => item.id === stateId)
  } else if ('at' in query) {
    const target = parseTimestamp(query.at)
    state = [...ordered]
      .reverse()
      .find((item) => Date.parse(item.capturedAt) <= target)
  } else if (query.selector === 'previous') {
    const currentIndex = resolveCurrentIndex(memory, ordered)
    state = currentIndex > 0 ? ordered[currentIndex - 1] : undefined
  } else {
    state = ordered[resolveCurrentIndex(memory, ordered)]
  }

  if (!state) return undefined
  const snapshot = requireSnapshot(memory, state.id)
  const index = ordered.findIndex((item) => item.id === state!.id)
  const sourceIds = new Set(state.sourceIds)

  return structuredClone({
    environmentId: memory.environment.id,
    state,
    snapshot,
    observations: memory.observations.filter((item) => sourceIds.has(item.sourceId)),
    evidence: memory.evidence.filter((item) => sourceIds.has(item.sourceId)),
    sources: memory.sources.filter((item) => sourceIds.has(item.id)),
    isCurrent: state.id === memory.environment.currentStateId,
    previousStateId: index > 0 ? ordered[index - 1].id : undefined,
    nextStateId: index >= 0 && index < ordered.length - 1 ? ordered[index + 1].id : undefined,
  })
}

function orderedStates(memory: EnvironmentalMemory): EnvironmentalState[] {
  return [...memory.states].sort((a, b) => {
    if (a.version !== b.version) return a.version - b.version
    return Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
  })
}

function resolveCurrentIndex(memory: EnvironmentalMemory, ordered: EnvironmentalState[]): number {
  const explicit = memory.environment.currentStateId
    ? ordered.findIndex((item) => item.id === memory.environment.currentStateId)
    : -1
  return explicit >= 0 ? explicit : ordered.length - 1
}

function requireSnapshot(memory: EnvironmentalMemory, stateId: string): EnvironmentalStateSnapshot {
  const snapshot = memory.snapshots.find((item) => item.stateId === stateId && item.environmentId === memory.environment.id)
  if (!snapshot) {
    throw new Error(`Historical snapshot unavailable for state ${stateId}`)
  }
  return structuredClone({
    ...snapshot,
    objects: snapshot.objects ?? [],
    conditions: snapshot.conditions ?? [],
    issues: snapshot.issues ?? [],
    relations: snapshot.relations ?? [],
  })
}

function parseTimestamp(value: string): number {
  const normalized = value.trim()
  const timestamp = Date.parse(normalized)
  if (!normalized || !Number.isFinite(timestamp)) throw new Error('at must be a valid ISO date/time')
  return timestamp
}
