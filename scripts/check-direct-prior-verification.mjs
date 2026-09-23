import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { findPriorConditionVerificationCandidate } = await vite.ssrLoadModule('/src/verification/candidate.ts')

  const environmentId = 'candidate-test'
  const states = [
    state('a', 1),
    state('b', 2),
    state('c', 3),
    state('d', 4),
  ]

  const blocked = condition('blocked-exit', 'Emergency exit access obstructed', ['exit-area'])
  const memory = {
    environment: {
      id: environmentId, name: 'Candidate test', type: 'office',
      createdAt: states[0].capturedAt, updatedAt: states.at(-1).capturedAt,
      currentStateId: 'd', stateIds: states.map((item) => item.id),
      roomIds: [], objectIds: ['exit-area'], issueIds: [],
    },
    states,
    snapshots: [
      snapshot('a', []),
      snapshot('b', [blocked]),
      snapshot('c', []),
      snapshot('d', []),
    ],
    objects: [], conditions: [], issues: [], observations: [], evidence: [], relations: [], sources: [], diffs: [],
  }

  const candidate = findPriorConditionVerificationCandidate(memory, 'd')
  if (!candidate) throw new Error('expected prior verification candidate across intervening clean state')
  if (candidate.previousState.id !== 'b') throw new Error(`expected obstructed State b, got ${candidate.previousState.id}`)
  if (candidate.currentState.id !== 'd') throw new Error(`expected current State d, got ${candidate.currentState.id}`)
  if (candidate.conditions.length !== 1 || candidate.conditions[0].id !== blocked.id) {
    throw new Error('expected blocked-exit condition to remain available for direct verification')
  }

  const stillBlocked = {
    ...memory,
    snapshots: [
      snapshot('a', []),
      snapshot('b', [blocked]),
      snapshot('c', []),
      snapshot('d', [{ ...blocked, id: 'blocked-exit-current' }]),
    ],
  }
  if (findPriorConditionVerificationCandidate(stillBlocked, 'd')) {
    throw new Error('current same-title present condition must not be treated as a prior resolved candidate')
  }

  const normalOnly = {
    ...memory,
    snapshots: [
      snapshot('a', []),
      snapshot('b', [{ ...blocked, id: 'normal', kind: 'normal' }]),
      snapshot('c', []),
      snapshot('d', []),
    ],
  }
  if (findPriorConditionVerificationCandidate(normalOnly, 'd')) {
    throw new Error('normal conditions must not become verification candidates')
  }

  console.log('PASS  earlier non-normal condition survives intervening clean scans as a verification candidate')
  console.log('PASS  current still-present condition blocks false resolution candidate')
  console.log('PASS  normal conditions are ignored')
  console.log('SENTINEL DIRECT PRIOR-CONDITION VERIFICATION CANDIDATE VERIFIED')
} finally {
  await vite.close()
}

function state(id, version) {
  return {
    id,
    environmentId: 'candidate-test',
    capturedAt: `2026-09-23T1${version}:00:00.000Z`,
    sourceIds: [`source_${id}`],
    objectIds: [],
    conditionIds: [],
    issueIds: [],
    relationIds: [],
    summary: `State ${version}`,
    version,
  }
}

function condition(id, title, objectIds) {
  return {
    id,
    environmentId: 'candidate-test',
    kind: 'access',
    title,
    description: title,
    status: 'present',
    basis: 'observed',
    confidence: 0.96,
    objectIds,
    evidenceIds: [`e_${id}`],
    observedAt: '2026-09-23T12:00:00.000Z',
  }
}

function snapshot(stateId, conditions) {
  return {
    stateId,
    environmentId: 'candidate-test',
    objects: [],
    conditions,
    issues: [],
    relations: [],
  }
}
