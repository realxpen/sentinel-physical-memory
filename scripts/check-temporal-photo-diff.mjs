import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { InMemoryEnvironmentalMemoryRepository } = await vite.ssrLoadModule('/src/memory/repository.ts')

  const environmentId = 'temporal-photo-proof'
  const repository = new InMemoryEnvironmentalMemoryRepository()
  const temporalCandidatesSeen = []

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const prompt = request.prompt
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('expected frame evidence')

      const sourceId = prompt.match(/The scan source id is\s+([^\n.]+)/i)?.[1]?.trim() ?? 'unknown'
      const current = sourceId === 'source_v2'
      const capturedAt = current ? '2026-09-20T16:05:00.000Z' : '2026-09-20T16:00:00.000Z'

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
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
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

      const object = (id, category, name, position, description, state) => ({
        id, environmentId, category, name,
        ...(position ? { position: { description: position } } : {}),
        ...(description ? { description } : {}),
        ...(state ? { state } : {}),
        confidence: 0.95,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        evidenceIds: [frameId],
      })

      return {
        sourceId,
        observations: [],
        objects: [
          object('door-scene', 'door', 'white door', current ? 'center back of room' : 'center of back wall', 'white door with silver handle', current ? 'closed' : undefined),
          object('closet-scene', 'furniture', 'closet', 'right of bookshelf', 'white closet with two doors', current ? 'open' : undefined),
          object('chair-scene', 'furniture', 'office chair', current ? 'center of room' : 'in front of desk', 'black mesh office chair with wheels'),
          object('globe-scene', 'other', 'globe', current ? 'on bookshelf' : 'on shelf', 'small globe'),
          object('books-scene', 'document', 'books', current ? 'on bookshelf' : 'on shelf', 'books'),
          object('pen-scene', 'furniture', 'pen holder', 'on desk', 'pen holder'),
          ...(current ? [
            object('bag-scene', 'other', 'duffle bag', 'floor right of office chair', 'green duffle bag on floor'),
            object('floor-scene', 'other', 'wooden floor', undefined, 'wooden floor in room'),
            object('wall-scene', 'other', 'white wall', undefined, 'white wall in room'),
          ] : [
            object('picture-scene', 'signage', 'picture frame', 'on wall', 'picture frame above desk'),
          ]),
        ],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
    async verifyTemporal(request) {
      if (request.artifacts.length !== 2) throw new Error('temporal verification must receive previous + current images')
      if (request.candidates.length !== 1) throw new Error(`temporal verification must be candidate-scoped, got ${request.candidates.length}`)
      const candidate = request.candidates[0]
      temporalCandidatesSeen.push(candidate.currentObjectName)

      if (candidate.currentObjectName === 'white door') {
        return { changes: [{ candidateKey: candidate.key, kind: 'state_change', previousState: 'closed', currentState: 'open', confidence: 0.98 }] }
      }
      if (candidate.currentObjectName === 'office chair') {
        return { changes: [{ candidateKey: candidate.key, kind: 'moved', confidence: 0.96 }] }
      }
      if (candidate.currentObjectName === 'closet') {
        // Simulate a high-confidence provider mistake caused by confusing the
        // nearby center door with the closet. Pipeline policy must reject it
        // because the composite openable has no independent open/closed cue.
        return { changes: [{ candidateKey: candidate.key, kind: 'state_change', previousState: 'closed', currentState: 'open', confidence: 0.99 }] }
      }
      return { changes: [] }
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
  const expected = ['Changed: white door', 'Moved: office chair', 'New: duffle bag']
  for (const title of expected) {
    if (!titles.includes(title)) throw new Error(`missing supported temporal change: ${title}; got ${titles.join(' | ')}`)
  }
  if (titles.length !== expected.length) {
    throw new Error(`expected only ${expected.join(' | ')}, got ${titles.join(' | ')}`)
  }

  const forbiddenTokens = ['closet', 'wooden floor', 'white wall', 'globe', 'books', 'pen holder', 'picture frame']
  for (const token of forbiddenTokens) {
    if (titles.some((title) => title.toLowerCase().includes(token))) {
      throw new Error(`noise leaked into photo diff: ${token}; got ${titles.join(' | ')}`)
    }
  }

  if (!temporalCandidatesSeen.includes('white door') || !temporalCandidatesSeen.includes('office chair') || !temporalCandidatesSeen.includes('closet')) {
    throw new Error(`expected door/chair/closet candidate-scoped checks, saw ${temporalCandidatesSeen.join(', ')}`)
  }
  if (temporalCandidatesSeen.includes('pen holder') || temporalCandidatesSeen.includes('globe') || temporalCandidatesSeen.includes('books')) {
    throw new Error(`low-salience objects must not consume temporal verification calls: ${temporalCandidatesSeen.join(', ')}`)
  }

  const doorChange = second.diff.changes.find((change) => change.title === 'Changed: white door')
  if (!doorChange || !/closed to open/.test(doorChange.description) || doorChange.confidence < 0.9) {
    throw new Error('door transition must be a high-confidence closed→open paired-photo verification')
  }

  const memory = await repository.get(environmentId)
  const currentSnapshot = memory?.snapshots.find((snapshot) => snapshot.stateId === second.state.id)
  const currentDoor = currentSnapshot?.objects.find((item) => item.name === 'white door')
  const currentCloset = currentSnapshot?.objects.find((item) => item.name === 'closet')
  if (currentDoor?.state !== 'open') throw new Error(`paired verification must override wrong single-photo door state, got ${currentDoor?.state ?? 'unknown'}`)
  if (currentCloset?.state !== undefined) throw new Error(`unverified single-photo closet state must be discarded, got ${currentCloset?.state}`)

  const previousSnapshot = memory?.snapshots.find((snapshot) => snapshot.stateId === first.state.id)
  const previousDoor = previousSnapshot?.objects.find((item) => item.name === 'white door')
  if (previousDoor?.state !== undefined) throw new Error('paired verification must not rewrite immutable historical baseline state')

  console.log('PASS  each temporal candidate is verified against previous + current images independently')
  console.log('PASS  false nearby-door→closet state transfer is rejected')
  console.log('PASS  unverified single-photo openable states are discarded')
  console.log('PASS  free-form photo movement requires paired verification')
  console.log('PASS  structural surfaces and low-salience decor do not become operational diff cards')
  console.log('PASS  exact output is white door changed + office chair moved + duffle bag added')
  console.log('SENTINEL TEMPORAL PHOTO DIFF VERIFIED')
} finally {
  await vite.close()
}
