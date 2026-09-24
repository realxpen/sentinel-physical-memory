import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const [{ EnvironmentalDiffEngine }, presentation, candidateModule] = await Promise.all([
    vite.ssrLoadModule('/src/memory/diff-engine.ts'),
    vite.ssrLoadModule('/src/memory/change-presentation.ts'),
    vite.ssrLoadModule('/src/verification/candidate.ts'),
  ])

  const before = stableSnapshot('state_a', 'evidence_a')
  const after = stableSnapshot('state_b', 'evidence_b')
  const diff = new EnvironmentalDiffEngine({
    now: () => new Date('2026-09-24T12:10:00.000Z'),
    id: () => 'change_should_not_exist',
  }).compare(before, after)

  expect(diff.changes.length === 0, `stable equivalent states must have zero material changes, got ${diff.changes.map((item) => item.title).join(' | ')}`)
  expect(diff.summary === 'No material environmental changes detected.', `unexpected stable diff summary: ${diff.summary}`)
  expect(presentation.changesForPresentation(diff.changes).length === 0, 'stable diff must stay empty in Reality Diff presentation')
  expect(presentation.presentedChangeSummary([]) === 'No material environmental changes detected.', 'presentation must use canonical stable-state summary')

  const memory = stableMemory(before, after, diff)
  const candidate = candidateModule.findPriorConditionVerificationCandidate(memory, 'state_b')
  expect(candidate === undefined, 'a stable normal environment must not manufacture a verification candidate')

  const [main, client] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/reliability/api-client.ts', import.meta.url), 'utf8'),
  ])

  expect(main.includes('No material change detected.'), 'Changes UI must expose an explicit stable-state result')
  expect(main.includes('The building state is materially consistent with the previous observation.'), 'stable-state UI must explain that no material change was found')
  expect(main.includes("readSentinelApiResponse<ScanResponse>(response, 'observation')"), 'Scan must use the shared failure parser')
  expect(main.includes("readSentinelApiResponse<AskBuildingResponse>(response, 'ask')"), 'Ask must use the shared failure parser')
  expect(main.includes("readSentinelApiResponse<ActionPlanningResponse>(response, 'action-plan')"), 'Action Plan must use the shared failure parser')
  expect(main.includes("readSentinelApiResponse<VerificationResult>(response, 'verification')"), 'Verification must use the shared failure parser')
  expect(client.includes('No result was confirmed'), 'network fallback must explicitly state that no result was confirmed')
  expect(client.includes('Nothing was accepted as complete'), 'empty/malformed success responses must fail closed rather than render')

  console.log('PASS  equivalent environmental snapshots produce zero material changes')
  console.log('PASS  stable Reality Diff summary and presentation stay explicitly empty')
  console.log('PASS  stable normal states do not manufacture prior verification work')
  console.log('PASS  Scan / Ask / Action Plan / Verification share the same browser failure parser')
  console.log('SENTINEL PHASE 15 STABILITY + FALLBACK CONSISTENCY VERIFIED')
} finally {
  await vite.close()
}

function stableSnapshot(stateId, evidenceId) {
  const environmentId = 'phase15-stable'
  const observedAt = stateId === 'state_a'
    ? '2026-09-24T12:00:00.000Z'
    : '2026-09-24T12:05:00.000Z'

  return {
    stateId,
    environmentId,
    objects: [
      {
        id: 'door',
        environmentId,
        category: 'door',
        name: 'hallway exit door',
        description: 'Black-framed exit door at the end of the hallway.',
        state: 'closed',
        position: { description: 'at the end of the hallway' },
        confidence: 0.98,
        firstSeenAt: '2026-09-24T12:00:00.000Z',
        lastSeenAt: observedAt,
        evidenceIds: [evidenceId],
      },
      {
        id: 'extinguisher',
        environmentId,
        category: 'safety',
        name: 'fire extinguisher',
        description: 'Red fire extinguisher mounted on the right wall.',
        position: { description: 'on right wall beside exit route' },
        confidence: 0.97,
        firstSeenAt: '2026-09-24T12:00:00.000Z',
        lastSeenAt: observedAt,
        evidenceIds: [evidenceId],
      },
    ],
    conditions: [],
    issues: [],
    relations: [],
  }
}

function stableMemory(before, after, diff) {
  const environmentId = before.environmentId
  const stateA = {
    id: before.stateId, environmentId, capturedAt: '2026-09-24T12:00:00.000Z',
    sourceIds: ['source_a'], objectIds: before.objects.map((item) => item.id),
    conditionIds: [], issueIds: [], relationIds: [], summary: 'Stable hallway', version: 1,
  }
  const stateB = {
    id: after.stateId, environmentId, capturedAt: '2026-09-24T12:05:00.000Z',
    sourceIds: ['source_b'], objectIds: after.objects.map((item) => item.id),
    conditionIds: [], issueIds: [], relationIds: [], summary: 'Stable hallway', version: 2,
  }

  return {
    environment: {
      id: environmentId, name: 'Stable hallway', type: 'office',
      createdAt: stateA.capturedAt, updatedAt: stateB.capturedAt,
      currentStateId: stateB.id, stateIds: [stateA.id, stateB.id],
      roomIds: [], objectIds: after.objects.map((item) => item.id), issueIds: [],
    },
    states: [stateA, stateB],
    snapshots: [before, after],
    objects: after.objects,
    conditions: [],
    issues: [],
    observations: [],
    evidence: [
      { id: 'evidence_a', type: 'frame', sourceId: 'source_a', capturedAt: stateA.capturedAt, description: 'Baseline stable hallway.' },
      { id: 'evidence_b', type: 'frame', sourceId: 'source_b', capturedAt: stateB.capturedAt, description: 'Current stable hallway.' },
    ],
    relations: [],
    sources: [
      { id: 'source_a', environmentId, modality: 'image', uri: 'data:image/jpeg;base64,a', capturedAt: stateA.capturedAt },
      { id: 'source_b', environmentId, modality: 'image', uri: 'data:image/jpeg;base64,b', capturedAt: stateB.capturedAt },
    ],
    diffs: [diff],
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
