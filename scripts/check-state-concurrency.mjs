import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
try {
  const { InMemoryEnvironmentalMemoryRepository } = await vite.ssrLoadModule('/src/memory/repository.ts')
  const repository = new InMemoryEnvironmentalMemoryRepository()
  const environmentId = 'concurrency-test'
  const base = {
    environment: { id: environmentId, name: 'Concurrency', type: 'office', createdAt: '2026-09-20T01:00:00Z', updatedAt: '2026-09-20T01:00:00Z', stateIds: [], roomIds: [], objectIds: [], issueIds: [] },
    states: [], snapshots: [], objects: [], conditions: [], issues: [], observations: [], evidence: [], relations: [], sources: [], diffs: [],
  }
  if (!(await repository.saveIfCurrent(base, undefined))) throw new Error('first compare-and-swap save should succeed')
  const winner = structuredClone(base)
  winner.environment.currentStateId = 'state_1'
  winner.environment.stateIds = ['state_1']
  winner.states = [{ id: 'state_1', environmentId, capturedAt: '2026-09-20T01:01:00Z', sourceIds: ['source_1'], objectIds: [], conditionIds: [], issueIds: [], relationIds: [], summary: 'winner', version: 1 }]
  winner.snapshots = [{ stateId: 'state_1', environmentId, objects: [], conditions: [], issues: [], relations: [] }]
  if (!(await repository.saveIfCurrent(winner, undefined))) throw new Error('winner should save against the expected empty current state')
  const stale = structuredClone(winner)
  stale.environment.currentStateId = 'state_stale'
  stale.environment.stateIds = ['state_stale']
  stale.states[0] = { ...stale.states[0], id: 'state_stale', summary: 'stale' }
  stale.snapshots[0] = { ...stale.snapshots[0], stateId: 'state_stale' }
  if (await repository.saveIfCurrent(stale, undefined)) throw new Error('stale writer must be rejected')
  const persisted = await repository.get(environmentId)
  if (persisted?.environment.currentStateId !== 'state_1' || persisted.states.length !== 1) throw new Error('stale writer changed canonical memory')
  console.log('PASS  compare-and-swap rejects stale environmental-memory writers')
  console.log('PASS  winning immutable state remains canonical')
  console.log('SENTINEL STATE CONCURRENCY VERIFIED')
} finally { await vite.close() }
