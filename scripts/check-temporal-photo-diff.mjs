import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { InMemoryEnvironmentalMemoryRepository } = await vite.ssrLoadModule('/src/memory/repository.ts')

  const environmentId = 'temporal-photo-proof'
  const repository = new InMemoryEnvironmentalMemoryRepository()
  const calls = []

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const prompt = request.prompt
      calls.push(prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('expected frame evidence')

      const sourceId = prompt.match(/The scan source id is\s+([^\n.]+)/i)?.[1]?.trim() ?? 'unknown'
      const current = sourceId === 'source_v2'

      if (prompt.includes('Targeted openable-object state verification')) {
        return {
          sourceId,
          observations: [],
          objects: [{
            id: 'door-audit',
            environmentId,
            category: 'door',
            name: 'white door',
            position: { description: 'center of back wall' },
            confidence: 0.95,
            firstSeenAt: '2026-09-20T16:00:00.000Z',
            lastSeenAt: '2026-09-20T16:00:00.000Z',
            evidenceIds: [frameId],
          }],
          conditions: [],
          relations: [],
          evidence: [],
        }
      }

      if (prompt.includes('Condition audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      return {
        sourceId,
        observations: [],
        objects: [
          {
            id: 'door-scene',
            environmentId,
            category: 'door',
            name: 'white door',
            description: 'white door with silver handle',
            position: { description: current ? 'center back of room' : 'center of back wall' },
            confidence: 0.95,
            firstSeenAt: '2026-09-20T16:00:00.000Z',
            lastSeenAt: '2026-09-20T16:00:00.000Z',
            evidenceIds: [frameId],
          },
          {
            id: 'chair-scene',
            environmentId,
            category: 'furniture',
            name: 'office chair',
            description: 'black mesh office chair with wheels',
            position: { description: current ? 'center of room' : 'in front of desk' },
            confidence: 0.95,
            firstSeenAt: '2026-09-20T16:00:00.000Z',
            lastSeenAt: '2026-09-20T16:00:00.000Z',
            evidenceIds: [frameId],
          },
          ...(current ? [{
            id: 'bag-scene',
            environmentId,
            category: 'other',
            name: 'duffle bag',
            description: 'green duffle bag on floor',
            position: { description: 'floor right of office chair' },
            confidence: 0.95,
            firstSeenAt: '2026-09-20T16:05:00.000Z',
            lastSeenAt: '2026-09-20T16:05:00.000Z',
            evidenceIds: [frameId],
          }] : []),
        ],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
    async verifyTemporal(request) {
      if (request.artifacts.length !== 2) throw new Error('temporal verification must receive previous + current images')
      const door = request.candidates.find((candidate) => candidate.currentObjectName === 'white door')
      const chair = request.candidates.find((candidate) => candidate.currentObjectName === 'office chair')
      if (!door || !chair) throw new Error('expected door and chair temporal candidates')
      return {
        changes: [
          { candidateKey: door.key, kind: 'state_change', previousState: 'closed', currentState: 'open', confidence: 0.98 },
          { candidateKey: chair.key, kind: 'moved', confidence: 0.96 },
        ],
      }
    },
  }

  const pipeline = new ScanPipeline({ model, memoryRepository: repository })
  const makeInput = (sourceId, capturedAt) => ({
    environmentId,
    source: {
      id: sourceId,
      environmentId,
      modality: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      capturedAt,
      metadata: { name: 'Temporal photo proof', environmentType: 'office' },
    },
    media: {
      kind: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
    },
  })

  const first = await pipeline.run(makeInput('source_v1', '2026-09-20T16:00:00.000Z'))
  if (first.diff) throw new Error('baseline scan must not create a diff')

  const second = await pipeline.run(makeInput('source_v2', '2026-09-20T16:05:00.000Z'))
  if (!second.diff) throw new Error('update scan must create a diff')

  const titles = second.diff.changes.map((change) => change.title)
  for (const expected of ['Changed: white door', 'Moved: office chair', 'New: duffle bag']) {
    if (!titles.includes(expected)) throw new Error(`missing verified temporal change: ${expected}; got ${titles.join(' | ')}`)
  }
  if (second.diff.changes.length !== 3) {
    throw new Error(`expected exactly 3 supported changes, got ${second.diff.changes.length}: ${titles.join(' | ')}`)
  }

  const doorChange = second.diff.changes.find((change) => change.title === 'Changed: white door')
  if (!doorChange || !/closed to open/.test(doorChange.description) || doorChange.confidence < 0.9) {
    throw new Error('door transition must be a high-confidence closed→open temporal verification')
  }

  const memory = await repository.get(environmentId)
  const currentSnapshot = memory?.snapshots.find((snapshot) => snapshot.stateId === second.state.id)
  const currentDoor = currentSnapshot?.objects.find((item) => item.name === 'white door')
  if (currentDoor?.state !== 'open') throw new Error(`temporal verification should refine current door state to open, got ${currentDoor?.state ?? 'unknown'}`)

  const previousSnapshot = memory?.snapshots.find((snapshot) => snapshot.stateId === first.state.id)
  const previousDoor = previousSnapshot?.objects.find((item) => item.name === 'white door')
  if (previousDoor?.state !== undefined) throw new Error('temporal verification must not rewrite immutable historical baseline state')

  console.log('PASS  update photo receives previous + current images in one temporal verification pass')
  console.log('PASS  temporal verifier recovers closed→open without rewriting historical state')
  console.log('PASS  temporal verifier confirms grounded chair movement')
  console.log('PASS  ordinary diff still owns new-object detection')
  console.log('PASS  exact supported output is door changed + chair moved + duffle bag added')
  console.log('SENTINEL TEMPORAL PHOTO DIFF VERIFIED')
} finally {
  await vite.close()
}
