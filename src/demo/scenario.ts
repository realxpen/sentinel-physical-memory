import type {
  Change,
  EnvironmentalDiff,
  EnvironmentalMemory,
  EnvironmentalState,
  EnvironmentalStateSnapshot,
  VerificationResult,
} from '../domain/sentinel'

export type DemoSignalId =
  | 'exit_obstruction_added'
  | 'extinguisher_moved'
  | 'prior_condition_resolved'
  | 'verification_passed'

export type DemoSignalStatus = 'pass' | 'pending' | 'fail'

export interface DemoSignal {
  id: DemoSignalId
  status: DemoSignalStatus
  label: string
  detail: string
  changeId?: string
}

export interface DemoScenarioOptions {
  baselineStateId?: string
  changedStateId?: string
  verificationStateId?: string
  verification?: VerificationResult
  maxUncertainChanges?: number
  maxUnrelatedSupportedChanges?: number
}

export interface DemoScenarioAssessment {
  environmentId: string
  stateIds: {
    baseline?: string
    changed?: string
    verification?: string
  }
  diffId?: string
  comparisonReady: boolean
  verificationReady: boolean
  ready: boolean
  supportedChangeCount: number
  uncertainChangeCount: number
  unrelatedSupportedChangeCount: number
  signals: DemoSignal[]
  problems: string[]
}

const OBSTRUCTION_TERMS = /\b(obstruction|obstructed|blocking|blocked|boxes?|crates?|cart|pallet|package|bag)\b/i
const EXIT_TERMS = /\b(exit|egress|emergency|door|route|path)\b/i
const EXTINGUISHER_TERMS = /\b(fire\s+extinguisher|extinguisher)\b/i
const ACCESS_RELATIONS = new Set(['in_front_of', 'near', 'adjacent_to'])

export function assessDemoScenario(
  memory: EnvironmentalMemory,
  options: DemoScenarioOptions = {},
): DemoScenarioAssessment {
  const orderedStates = [...memory.states].sort(compareStates)
  const selection = selectStates(orderedStates, options)
  const problems: string[] = []
  const signals: DemoSignal[] = []

  if (!selection.baseline || !selection.changed) {
    problems.push('A reproducible demo requires at least a baseline Scan A and changed Scan B.')
    return {
      environmentId: memory.environment.id,
      stateIds: {
        baseline: selection.baseline?.id,
        changed: selection.changed?.id,
        verification: selection.verification?.id,
      },
      comparisonReady: false,
      verificationReady: false,
      ready: false,
      supportedChangeCount: 0,
      uncertainChangeCount: 0,
      unrelatedSupportedChangeCount: 0,
      signals: [
        signal('exit_obstruction_added', 'pending', 'Exit obstruction added', 'Waiting for Scan A → Scan B.'),
        signal('extinguisher_moved', 'pending', 'Extinguisher moved', 'Waiting for Scan A → Scan B.'),
        signal('prior_condition_resolved', 'pending', 'Prior condition resolved', 'Waiting for Scan A → Scan B.'),
        signal('verification_passed', 'pending', 'Verification passed', 'Waiting for Scan C + Verification.'),
      ],
      problems,
    }
  }

  const diff = findDiff(memory.diffs, selection.baseline.id, selection.changed.id)
  if (!diff) {
    problems.push(`No persisted Reality Diff exists for ${selection.baseline.id} → ${selection.changed.id}.`)
  }

  const baselineSnapshot = findSnapshot(memory, selection.baseline.id)
  const changedSnapshot = findSnapshot(memory, selection.changed.id)
  if (!baselineSnapshot) problems.push('Baseline immutable snapshot is missing.')
  if (!changedSnapshot) problems.push('Changed immutable snapshot is missing.')

  const changes = diff?.changes ?? []
  const supportedChanges = changes.filter((item) => item.type !== 'uncertain' && item.type !== 'unchanged')
  const uncertainChanges = changes.filter((item) => item.type === 'uncertain')
  const targetChangeIds = new Set<string>()

  const obstruction = changedSnapshot && diff
    ? diff.changes.find((item) => isExitObstructionAdded(item, changedSnapshot))
    : undefined
  if (obstruction) targetChangeIds.add(obstruction.id)

  signals.push(obstruction
    ? signal('exit_obstruction_added', 'pass', 'Exit obstruction added', obstruction.title, obstruction.id)
    : signal('exit_obstruction_added', diff ? 'fail' : 'pending', 'Exit obstruction added', diff
      ? 'No supported added obstruction is grounded to an exit/egress context.'
      : 'Waiting for a persisted Scan A → Scan B Reality Diff.'))

  const movedExtinguisher = changedSnapshot && diff
    ? diff.changes.find((item) => isMovedExtinguisher(item, changedSnapshot))
    : undefined
  if (movedExtinguisher) targetChangeIds.add(movedExtinguisher.id)

  signals.push(movedExtinguisher
    ? signal('extinguisher_moved', 'pass', 'Extinguisher moved', movedExtinguisher.title, movedExtinguisher.id)
    : signal('extinguisher_moved', diff ? 'fail' : 'pending', 'Extinguisher moved', diff
      ? 'No supported moved fire-extinguisher change was found.'
      : 'Waiting for a persisted Scan A → Scan B Reality Diff.'))

  const resolved = diff?.changes.find((item) => item.type === 'resolved')
  if (resolved) targetChangeIds.add(resolved.id)

  signals.push(resolved
    ? signal('prior_condition_resolved', 'pass', 'Prior condition resolved', resolved.title, resolved.id)
    : signal('prior_condition_resolved', diff ? 'fail' : 'pending', 'Prior condition resolved', diff
      ? 'No explicit resolved change is grounded. Non-observation is intentionally not accepted as resolution.'
      : 'Waiting for a persisted Scan A → Scan B Reality Diff.'))

  const maxUncertainChanges = options.maxUncertainChanges ?? 2
  const maxUnrelatedSupportedChanges = options.maxUnrelatedSupportedChanges ?? 2
  const unrelatedSupported = supportedChanges.filter((item) => !targetChangeIds.has(item.id))

  if (uncertainChanges.length > maxUncertainChanges) {
    problems.push(`Reality Diff contains ${uncertainChanges.length} uncertain changes; demo budget is ${maxUncertainChanges}.`)
  }
  if (unrelatedSupported.length > maxUnrelatedSupportedChanges) {
    problems.push(`Reality Diff contains ${unrelatedSupported.length} unrelated supported changes; demo budget is ${maxUnrelatedSupportedChanges}.`)
  }

  const comparisonReady = Boolean(
    diff
      && baselineSnapshot
      && changedSnapshot
      && obstruction
      && movedExtinguisher
      && resolved
      && uncertainChanges.length <= maxUncertainChanges
      && unrelatedSupported.length <= maxUnrelatedSupportedChanges,
  )

  if (!comparisonReady && diff) {
    problems.push('Scan A → Scan B is not yet clean enough for the canonical three-change demo.')
  }

  const verificationState = selection.verification
  const verification = options.verification
  let verificationReady = false

  if (!verificationState) {
    signals.push(signal('verification_passed', 'pending', 'Verification passed', 'Scan C has not been selected yet.'))
  } else if (!verification) {
    signals.push(signal('verification_passed', 'pending', 'Verification passed', 'Scan C exists; run the Verification Agent against the changed state.'))
  } else {
    const statePairMatches = verification.previousStateId === selection.changed.id
      && verification.currentStateId === verificationState.id
    verificationReady = statePairMatches && verification.status === 'passed'

    if (!statePairMatches) {
      problems.push('Verification result does not belong to the selected Scan B → Scan C state pair.')
    } else if (verification.status !== 'passed') {
      problems.push(`Verification status is ${verification.status}; the canonical demo requires passed.`)
    }

    signals.push(verificationReady
      ? signal('verification_passed', 'pass', 'Verification passed', verification.summary)
      : signal('verification_passed', 'fail', 'Verification passed', statePairMatches
        ? verification.summary
        : 'Verification result is attached to a different state pair.'))
  }

  return {
    environmentId: memory.environment.id,
    stateIds: {
      baseline: selection.baseline.id,
      changed: selection.changed.id,
      verification: verificationState?.id,
    },
    diffId: diff?.id,
    comparisonReady,
    verificationReady,
    ready: comparisonReady && verificationReady,
    supportedChangeCount: supportedChanges.length,
    uncertainChangeCount: uncertainChanges.length,
    unrelatedSupportedChangeCount: unrelatedSupported.length,
    signals,
    problems: unique(problems),
  }
}

function selectStates(states: EnvironmentalState[], options: DemoScenarioOptions) {
  const byId = (id: string | undefined) => id ? states.find((item) => item.id === id) : undefined
  const explicitBaseline = byId(options.baselineStateId)
  const explicitChanged = byId(options.changedStateId)
  const explicitVerification = byId(options.verificationStateId)

  if (options.baselineStateId || options.changedStateId || options.verificationStateId) {
    return {
      baseline: explicitBaseline,
      changed: explicitChanged,
      verification: explicitVerification,
    }
  }

  if (states.length >= 3) {
    return {
      baseline: states.at(-3),
      changed: states.at(-2),
      verification: states.at(-1),
    }
  }

  return {
    baseline: states.at(-2),
    changed: states.at(-1),
    verification: undefined,
  }
}

function findDiff(diffs: EnvironmentalDiff[], fromStateId: string, toStateId: string) {
  return [...diffs]
    .reverse()
    .find((item) => item.fromStateId === fromStateId && item.toStateId === toStateId)
}

function findSnapshot(memory: EnvironmentalMemory, stateId: string) {
  return memory.snapshots.find((item) => item.environmentId === memory.environment.id && item.stateId === stateId)
}

function isExitObstructionAdded(change: Change, snapshot: EnvironmentalStateSnapshot): boolean {
  if (!['added', 'changed'].includes(change.type)) return false

  const entityText = entityTextForChange(change, snapshot)
  if (!OBSTRUCTION_TERMS.test(entityText)) return false
  if (EXIT_TERMS.test(entityText)) return true

  if (!change.entityId) return false
  const accessCondition = snapshot.conditions.find((item) =>
    item.kind === 'access'
      && item.objectIds.includes(change.entityId!)
      && EXIT_TERMS.test(`${item.title} ${item.description}`),
  )
  if (accessCondition) return true

  return snapshot.relations.some((relation) => {
    if (relation.fromId !== change.entityId || !ACCESS_RELATIONS.has(relation.type)) return false
    const target = snapshot.objects.find((item) => item.id === relation.toId)
    return Boolean(target && EXIT_TERMS.test(`${target.name} ${target.description ?? ''} ${target.position?.description ?? ''}`))
  })
}

function isMovedExtinguisher(change: Change, snapshot: EnvironmentalStateSnapshot): boolean {
  if (change.type !== 'moved') return false
  return EXTINGUISHER_TERMS.test(entityTextForChange(change, snapshot))
}

function entityTextForChange(change: Change, snapshot: EnvironmentalStateSnapshot): string {
  const object = change.entityId ? snapshot.objects.find((item) => item.id === change.entityId) : undefined
  const condition = change.entityId ? snapshot.conditions.find((item) => item.id === change.entityId) : undefined
  const issue = change.entityId ? snapshot.issues.find((item) => item.id === change.entityId) : undefined

  return [
    change.title,
    change.description,
    object?.name,
    object?.description,
    object?.position?.description,
    condition?.title,
    condition?.description,
    issue?.title,
    issue?.description,
  ].filter(Boolean).join(' ')
}

function compareStates(a: EnvironmentalState, b: EnvironmentalState): number {
  if (a.version !== b.version) return a.version - b.version
  return Date.parse(a.capturedAt) - Date.parse(b.capturedAt)
}

function signal(
  id: DemoSignalId,
  status: DemoSignalStatus,
  label: string,
  detail: string,
  changeId?: string,
): DemoSignal {
  return { id, status, label, detail, ...(changeId ? { changeId } : {}) }
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}
