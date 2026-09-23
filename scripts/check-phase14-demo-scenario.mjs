import { createServer } from 'vite'

const live = process.argv.includes('--live')
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { assessDemoScenario } = await vite.ssrLoadModule('/src/demo/scenario.ts')

  if (live) {
    await runLive(assessDemoScenario)
  } else {
    const { EnvironmentalDiffEngine } = await vite.ssrLoadModule('/src/memory/diff-engine.ts')
    await runDeterministic(assessDemoScenario, EnvironmentalDiffEngine)
  }
} finally {
  await vite.close()
}

async function runDeterministic(assessDemoScenario, EnvironmentalDiffEngine) {
  const fixture = demoFixture(EnvironmentalDiffEngine)
  const assessment = assessDemoScenario(fixture.memory, { verification: fixture.verification })

  expect(assessment.comparisonReady, 'canonical Scan A → Scan B must pass the three-change comparison gate')
  expect(assessment.verificationReady, 'canonical Scan C verification must pass')
  expect(assessment.ready, 'canonical demo fixture must be fully ready')
  expect(assessment.uncertainChangeCount === 0, 'canonical demo fixture should contain no uncertainty noise')
  expect(assessment.unrelatedSupportedChangeCount === 0, 'canonical demo fixture should contain only the three intended supported changes')
  expect(assessment.signals.every((item) => item.status === 'pass'), 'all canonical demo signals must pass')

  const noisy = noisyFixture()
  const noisyAssessment = assessDemoScenario(noisy.memory)
  expect(!noisyAssessment.comparisonReady, '11 uncertain changes must fail the demo comparison gate')
  expect(noisyAssessment.uncertainChangeCount === 11, 'uncertainty budget regression fixture must remain explicit')
  expect(noisyAssessment.problems.some((item) => /uncertain changes/i.test(item)), 'noise failure must explain the uncertainty budget')

  console.log('PASS  canonical Scan A → Scan B proves added exit obstruction + moved extinguisher + explicit resolution')
  console.log('PASS  canonical Scan C + Verification Agent result closes the physical loop')
  console.log('PASS  unrelated/uncertain Reality Diff noise is budgeted and fails closed')
  console.log('PASS  non-observation is never promoted to a fake resolution')
  console.log('SENTINEL PHASE 14 DEMO SCENARIO ENGINEERING VERIFIED')
}

async function runLive(assessDemoScenario) {
  const baseUrl = argument('base-url') || process.env.SENTINEL_DEMO_BASE_URL || 'https://sentinel-physical-memory.vercel.app'
  const environmentId = argument('environment-id') || process.env.SENTINEL_DEMO_ENVIRONMENT_ID
  const baselineStateId = argument('baseline-state') || process.env.SENTINEL_DEMO_BASELINE_STATE_ID
  const changedStateId = argument('changed-state') || process.env.SENTINEL_DEMO_CHANGED_STATE_ID
  const verificationStateId = argument('verification-state') || process.env.SENTINEL_DEMO_VERIFICATION_STATE_ID

  if (!environmentId) {
    throw new Error('Live rehearsal requires --environment-id=<id> or SENTINEL_DEMO_ENVIRONMENT_ID.')
  }

  const url = new URL('/api/memory', baseUrl)
  url.searchParams.set('environmentId', environmentId)
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Memory request failed: HTTP ${response.status} ${await response.text()}`)

  const payload = await response.json()
  if (!payload.memory) throw new Error(`No environmental memory exists for ${environmentId}.`)

  const assessment = assessDemoScenario(payload.memory, {
    baselineStateId,
    changedStateId,
    verificationStateId,
  })

  printAssessment(assessment)

  if (!assessment.comparisonReady) {
    process.exitCode = 1
  }
}

function printAssessment(assessment) {
  console.log(`Environment: ${assessment.environmentId}`)
  console.log(`Scan A: ${assessment.stateIds.baseline ?? 'missing'}`)
  console.log(`Scan B: ${assessment.stateIds.changed ?? 'missing'}`)
  console.log(`Scan C: ${assessment.stateIds.verification ?? 'not selected'}`)
  console.log(`Reality Diff: ${assessment.diffId ?? 'missing'}`)
  console.log(`Supported changes: ${assessment.supportedChangeCount}`)
  console.log(`Uncertain changes: ${assessment.uncertainChangeCount}`)
  console.log(`Unrelated supported changes: ${assessment.unrelatedSupportedChangeCount}`)
  for (const item of assessment.signals) console.log(`${item.status.toUpperCase().padEnd(7)} ${item.label}: ${item.detail}`)
  if (assessment.problems.length) {
    console.log('Problems:')
    assessment.problems.forEach((item) => console.log(`- ${item}`))
  }
  console.log(`Comparison ready: ${assessment.comparisonReady ? 'YES' : 'NO'}`)
  console.log('Verification readiness is intentionally confirmed by the real /api/verify path after Scan C.')
}

function demoFixture(EnvironmentalDiffEngine) {
  const environmentId = 'phase14-demo'
  const a = state('state_a', 1, '2026-09-23T08:00:00.000Z')
  const b = state('state_b', 2, '2026-09-23T08:05:00.000Z')
  const c = state('state_c', 3, '2026-09-23T08:10:00.000Z')

  const exitA = object(environmentId, 'exit', 'door', 'emergency exit door', 'rear wall', a.capturedAt)
  const extinguisherA = object(environmentId, 'extinguisher', 'safety', 'fire extinguisher', 'left of reception desk', a.capturedAt)
  const panelA = object(environmentId, 'panel', 'electrical', 'electrical outlet', 'east wall', a.capturedAt)

  const exitB = object(environmentId, 'exit', 'door', 'emergency exit door', 'rear wall', b.capturedAt)
  const extinguisherB = object(environmentId, 'extinguisher', 'safety', 'fire extinguisher', 'beside storage cabinet', b.capturedAt)
  const panelB = object(environmentId, 'panel', 'electrical', 'electrical outlet', 'east wall', b.capturedAt)
  const boxesB = object(environmentId, 'boxes', 'obstruction', 'boxes', 'in front of emergency exit door', b.capturedAt)

  const issueOpen = issue(environmentId, 'issue_visible', 'Visible test condition', 'A safe staged condition is visibly present.', 'open', a.capturedAt)
  const issueResolved = { ...issueOpen, status: 'resolved', lastObservedAt: b.capturedAt, resolvedAt: b.capturedAt, resolutionNote: 'Current evidence explicitly supports resolution.' }

  const snapshots = [
    snapshot(environmentId, a.id, [exitA, extinguisherA, panelA], [issueOpen]),
    snapshot(environmentId, b.id, [exitB, extinguisherB, panelB, boxesB], [issueResolved]),
    snapshot(environmentId, c.id, [
      object(environmentId, 'exit', 'door', 'emergency exit door', 'rear wall', c.capturedAt),
      object(environmentId, 'extinguisher', 'safety', 'fire extinguisher', 'beside storage cabinet', c.capturedAt),
      object(environmentId, 'panel', 'electrical', 'electrical outlet', 'east wall', c.capturedAt),
      object(environmentId, 'boxes', 'obstruction', 'boxes', 'beside storage cabinet away from exit route', c.capturedAt),
    ], [issueResolved]),
  ]

  const ids = ['change_added', 'change_moved', 'change_resolved']
  let index = 0
  const diff = new EnvironmentalDiffEngine({
    now: () => new Date('2026-09-23T08:06:00.000Z'),
    id: () => ids[index++] || `change_extra_${index}`,
  }).compare(snapshots[0], snapshots[1])

  const memory = {
    environment: {
      id: environmentId,
      name: 'SENTINEL Demo Office',
      type: 'office',
      createdAt: a.capturedAt,
      updatedAt: c.capturedAt,
      currentStateId: c.id,
      stateIds: [a.id, b.id, c.id],
      roomIds: [],
      objectIds: ['exit', 'extinguisher', 'panel', 'boxes'],
      issueIds: ['issue_visible'],
    },
    states: [a, b, c],
    snapshots,
    objects: snapshots[2].objects,
    conditions: [],
    issues: snapshots[2].issues,
    observations: [],
    evidence: [],
    relations: [],
    sources: [],
    diffs: [diff],
  }

  const verification = {
    id: 'verification_demo',
    environmentId,
    previousStateId: b.id,
    currentStateId: c.id,
    verifiedAt: '2026-09-23T08:11:00.000Z',
    status: 'passed',
    resolvedConditionIds: ['condition_exit_obstruction'],
    remainingConditionIds: [],
    inconclusiveConditionIds: [],
    newConditionIds: [],
    verdicts: [],
    changes: [],
    summary: 'Verified. The emergency route is clear again.',
    evidenceIds: ['e_c'],
    grounding: {
      previousState: { id: b.id, version: b.version, capturedAt: b.capturedAt, summary: b.summary, isCurrent: false },
      currentState: { id: c.id, version: c.version, capturedAt: c.capturedAt, summary: c.summary, isCurrent: true },
      evidence: [],
      baselineConditions: [],
      currentConditions: [],
      objects: [],
    },
  }

  return { memory, verification }
}

function noisyFixture() {
  const environmentId = 'phase14-noisy'
  const a = state('noisy_a', 1, '2026-09-23T09:00:00.000Z', environmentId)
  const b = state('noisy_b', 2, '2026-09-23T09:05:00.000Z', environmentId)
  const changes = Array.from({ length: 11 }, (_, index) => ({
    id: `uncertain_${index}`,
    environmentId,
    fromStateId: a.id,
    toStateId: b.id,
    type: 'uncertain',
    entityKind: 'object',
    entityId: `ghost_${index}`,
    title: `Not re-observed: object ${index + 1}`,
    description: 'Present previously but not re-observed in the current scan.',
    confidence: 0.5,
    evidenceIds: [],
  }))

  return {
    memory: {
      environment: {
        id: environmentId, name: 'Noisy office', type: 'office',
        createdAt: a.capturedAt, updatedAt: b.capturedAt, currentStateId: b.id,
        stateIds: [a.id, b.id], roomIds: [], objectIds: [], issueIds: [],
      },
      states: [a, b],
      snapshots: [snapshot(environmentId, a.id, [], []), snapshot(environmentId, b.id, [], [])],
      objects: [], conditions: [], issues: [], observations: [], evidence: [], relations: [], sources: [],
      diffs: [{
        id: 'diff_noisy', environmentId, fromStateId: a.id, toStateId: b.id,
        createdAt: b.capturedAt, changes, summary: '11 uncertain changes',
      }],
    },
  }
}

function state(id, version, capturedAt, environmentId = 'phase14-demo') {
  return {
    id, environmentId, capturedAt, sourceIds: [`source_${id}`],
    objectIds: [], conditionIds: [], issueIds: [], relationIds: [],
    summary: `Demo state ${version}`, version,
  }
}

function object(environmentId, id, category, name, position, capturedAt) {
  return {
    id, environmentId, category, name, description: name,
    position: { description: position }, confidence: 0.98,
    firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [`e_${id}_${capturedAt}`],
  }
}

function issue(environmentId, id, title, description, status, capturedAt) {
  return {
    id, environmentId, type: 'maintenance', title, description, severity: 'low', status,
    confidence: 0.95, objectIds: ['panel'], evidenceIds: ['e_panel'],
    firstDetectedAt: capturedAt, lastObservedAt: capturedAt,
  }
}

function snapshot(environmentId, stateId, objects, issues) {
  return { stateId, environmentId, objects, conditions: [], issues, relations: [] }
}

function argument(name) {
  const prefix = `--${name}=`
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
