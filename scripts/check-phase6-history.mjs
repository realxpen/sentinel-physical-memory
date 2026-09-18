import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { EnvironmentalMemoryStore } = await vite.ssrLoadModule('/src/memory/store.ts')
  const { listEnvironmentalStateHistory, selectEnvironmentalState } = await vite.ssrLoadModule('/src/memory/history.ts')

  let stateCounter = 0
  let objectCounter = 0
  let issueCounter = 0
  let relationCounter = 0
  let evidenceCounter = 0
  let diffCounter = 0

  const store = new EnvironmentalMemoryStore({
    now: () => new Date('2026-09-18T12:00:00.000Z'),
    ids: {
      state: () => `state_${++stateCounter}`,
      object: () => `object_${++objectCounter}`,
      issue: () => `issue_${++issueCounter}`,
      relation: () => `relation_${++relationCounter}`,
      evidence: () => `evidence_${++evidenceCounter}`,
      diff: () => `diff_${++diffCounter}`,
    },
  })

  const environmentId = 'phase6-history-test'
  store.createEnvironment({
    id: environmentId,
    name: 'Phase 6 History Test',
    type: 'office',
    createdAt: '2026-09-18T10:00:00.000Z',
    updatedAt: '2026-09-18T10:00:00.000Z',
    stateIds: [],
    roomIds: [],
    objectIds: [],
    issueIds: [],
  })

  const scan = (sourceId, capturedAt, panelDescription, panelConfidence, relationConfidence, evidenceId) => ({
    source: {
      id: sourceId,
      environmentId,
      modality: 'video',
      uri: `https://local.sentinel/${sourceId}.mp4`,
      capturedAt,
    },
    perception: {
      sourceId,
      observations: [{
        id: `obs_${sourceId}`,
        environmentId,
        sourceId,
        modality: 'video',
        capturedAt,
        label: 'Electrical panel',
        description: panelDescription,
        confidence: panelConfidence,
        basis: 'observed',
        evidenceIds: [evidenceId],
      }],
      objects: [{
        id: 'panel',
        environmentId,
        category: 'electrical',
        name: 'electrical panel',
        description: panelDescription,
        confidence: panelConfidence,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        evidenceIds: [evidenceId],
      }, {
        id: 'door',
        environmentId,
        category: 'door',
        name: 'blue access door',
        description: 'blue access door',
        confidence: 0.9,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        evidenceIds: [evidenceId],
      }],
      conditions: [],
      relations: [{
        id: 'panel-near-door',
        environmentId,
        fromId: 'panel',
        toId: 'door',
        type: 'near',
        confidence: relationConfidence,
        evidenceIds: [evidenceId],
      }],
      evidence: [{
        id: evidenceId,
        type: 'frame',
        sourceId,
        capturedAt,
        frameIndex: 0,
        timestampMs: 1000,
        description: `Frame for ${sourceId}`,
      }],
    },
  })

  const first = scan('source_v1', '2026-09-18T10:00:00.000Z', 'Electrical panel cabinet is closed.', 0.91, 0.7, 'frame_v1')
  const state1 = store.ingestScan(environmentId, first.source, first.perception, 'Baseline electrical-panel state.')

  const second = scan('source_v2', '2026-09-18T11:00:00.000Z', 'Electrical panel cabinet is open.', 0.97, 0.95, 'frame_v2')
  const state2 = store.ingestScan(environmentId, second.source, second.perception, 'Updated electrical-panel state.')

  const memory = store.get(environmentId)
  if (!memory) throw new Error('history test memory was not created')

  const timeline = listEnvironmentalStateHistory(memory)
  if (timeline.length !== 2) throw new Error(`expected two history entries, got ${timeline.length}`)
  if (timeline[0].stateId !== state2.id || !timeline[0].isCurrent) throw new Error('timeline must return current state first')
  if (timeline[1].stateId !== state1.id || timeline[1].isCurrent) throw new Error('older timeline state ordering is incorrect')
  if (timeline[1].relationCount !== 1) throw new Error('historical relation count must come from the immutable snapshot')

  const current = selectEnvironmentalState(memory, { selector: 'current' })
  const previous = selectEnvironmentalState(memory, { selector: 'previous' })
  const byId = selectEnvironmentalState(memory, { stateId: state1.id })
  const byDate = selectEnvironmentalState(memory, { at: '2026-09-18T10:30:00.000Z' })
  const exactSecond = selectEnvironmentalState(memory, { at: '2026-09-18T11:00:00.000Z' })
  const beforeFirst = selectEnvironmentalState(memory, { at: '2026-09-18T09:59:59.000Z' })

  if (current?.state.id !== state2.id) throw new Error('current selector did not return State v2')
  if (previous?.state.id !== state1.id) throw new Error('previous selector did not return State v1')
  if (byId?.state.id !== state1.id) throw new Error('stateId selector did not return State v1')
  if (byDate?.state.id !== state1.id) throw new Error('date selector must return the latest state at or before the requested time')
  if (exactSecond?.state.id !== state2.id) throw new Error('date selector must include a state captured exactly at the requested time')
  if (beforeFirst !== undefined) throw new Error('date selector before the first state must return no state')

  const oldPanel = byId.snapshot.objects.find((item) => item.name === 'electrical panel')
  const currentPanel = current.snapshot.objects.find((item) => item.name === 'electrical panel')
  if (oldPanel?.description !== 'Electrical panel cabinet is closed.') throw new Error('State v1 object value was mutated by State v2')
  if (currentPanel?.description !== 'Electrical panel cabinet is open.') throw new Error('State v2 did not retain its own object value')

  const oldRelation = byId.snapshot.relations[0]
  const currentRelation = current.snapshot.relations[0]
  if (oldRelation?.confidence !== 0.7) throw new Error('State v1 relation confidence was mutated by State v2')
  if (currentRelation?.confidence !== 0.95) throw new Error('State v2 relation confidence was not captured')
  if (oldRelation.evidenceIds.some((id) => id.includes('source_v2'))) throw new Error('State v1 relation leaked later evidence')

  byId.snapshot.objects[0].description = 'MUTATED CLIENT COPY'
  const byIdAgain = selectEnvironmentalState(memory, { stateId: state1.id })
  if (byIdAgain.snapshot.objects[0].description === 'MUTATED CLIENT COPY') throw new Error('history selector must return defensive clones')

  let invalidDateRejected = false
  try {
    selectEnvironmentalState(memory, { at: 'not-a-date' })
  } catch {
    invalidDateRejected = true
  }
  if (!invalidDateRejected) throw new Error('invalid state-history dates must fail closed')

  console.log('PASS  current / previous / state-by-ID / state-by-date selectors')
  console.log('PASS  historical object values remain immutable after later canonical updates')
  console.log('PASS  historical relation values/evidence remain immutable across scans')
  console.log('PASS  returned history records are defensive clones')
  console.log('SENTINEL PHASE 6 STATE HISTORY VERIFIED')
} finally {
  await vite.close()
}
