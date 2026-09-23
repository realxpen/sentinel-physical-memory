import type {
  EnvironmentalCondition,
  EnvironmentalMemory,
  EnvironmentalState,
  EnvironmentalStateSnapshot,
} from '../domain/sentinel.js'

export interface PriorConditionVerificationCandidate {
  previousState: EnvironmentalState
  currentState: EnvironmentalState
  conditions: EnvironmentalCondition[]
}

export function findPriorConditionVerificationCandidate(
  memory: EnvironmentalMemory,
  currentStateId: string,
): PriorConditionVerificationCandidate | undefined {
  const currentState = memory.states.find((item) => item.id === currentStateId)
  const currentSnapshot = memory.snapshots.find((item) => item.stateId === currentStateId)
  if (!currentState || !currentSnapshot) return undefined

  const priorStates = memory.states
    .filter((item) => item.version < currentState.version)
    .sort((a, b) => b.version - a.version)

  for (const previousState of priorStates) {
    const previousSnapshot = memory.snapshots.find((item) => item.stateId === previousState.id)
    if (!previousSnapshot) continue

    const candidates = previousSnapshot.conditions.filter((condition) =>
      condition.kind !== 'normal' &&
      condition.status === 'present' &&
      !conditionStillPresent(condition, currentSnapshot),
    )

    if (candidates.length === 0) continue
    return { previousState, currentState, conditions: candidates }
  }

  return undefined
}

function conditionStillPresent(
  previous: EnvironmentalCondition,
  currentSnapshot: EnvironmentalStateSnapshot,
): boolean {
  const previousTitle = normalize(previous.title)
  return currentSnapshot.conditions.some((current) => {
    if (current.kind === 'normal') return false
    if (normalize(current.title) !== previousTitle) return false

    if (previous.objectIds.length === 0 || current.objectIds.length === 0) return true
    const currentObjectIds = new Set(current.objectIds)
    return previous.objectIds.some((id) => currentObjectIds.has(id))
  })
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
