import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const environmentId = 'photo-observation-test'
  const capturedAt = '2026-09-20T00:00:00.000Z'
  const sourceId = 'photo-source'
  let calls = 0
  const prompts = []
  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      calls += 1
      prompts.push(request.prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('image scan should produce one trusted frame artifact')

      if (request.prompt.includes('Final openable-object state confirmation')) {
        return {
          sourceId,
          observations: [],
          objects: [
            { id: 'door-confirmation', environmentId, category: 'door', name: 'white door', position: { description: 'back wall' }, state: 'open', confidence: 0.99, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
            { id: 'door-handle-leak', environmentId, category: 'other', name: 'door handle (door hardware)', position: { description: 'on white door' }, state: 'open', confidence: 0.99, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
            { id: 'desk-leak', environmentId, category: 'furniture', name: 'desk (furniture)', position: { description: 'left side' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          ],
          conditions: [], relations: [], evidence: [],
        }
      }

      if (request.prompt.includes('Targeted openable-object state verification')) {
        return {
          sourceId,
          observations: [],
          objects: [
            { id: 'door-audit', environmentId, category: 'door', name: 'white door', position: { description: 'back wall' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
            { id: 'door-hinge-leak', environmentId, category: 'other', name: 'door hinge (door hardware)', position: { description: 'on white door' }, state: 'closed', confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          ],
          conditions: [], relations: [], evidence: [],
        }
      }

      if (request.prompt.includes('Condition audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      return {
        sourceId,
        observations: [{ id: `obs_${calls}`, environmentId, sourceId, modality: 'image', capturedAt, label: 'chair', description: 'A chair is visible beside the desk.', confidence: 0.95, basis: 'observed', evidenceIds: [frameId] }],
        objects: [
          { id: `chair_${calls}`, environmentId, category: 'furniture', name: 'chair', description: 'chair beside desk', position: { description: 'beside desk' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          ...Array.from({ length: 12 }, (_, index) => ({ id: `plant_${calls}_${index}`, environmentId, category: 'furniture', name: 'potted plant', position: { description: 'on shelf' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] })),
          { id: `plant_alias_${calls}`, environmentId, category: 'furniture', name: 'plant pot', position: { description: 'on shelf' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          { id: `plant_desk_${calls}`, environmentId, category: 'furniture', name: 'potted plant', position: { description: 'on desk' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          { id: `door_${calls}`, environmentId, category: 'door', name: 'white door', position: { description: 'back wall' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
        ],
        conditions: [], relations: [], evidence: [],
      }
    },
  }
  const pipeline = new ScanPipeline({ model })
  const result = await pipeline.run({
    environmentId,
    source: { id: sourceId, environmentId, modality: 'image', uri: 'data:image/jpeg;base64,AAA', capturedAt, metadata: { name: 'Photo Test', environmentType: 'office', captureMode: 'photo' } },
    media: { kind: 'image', uri: 'data:image/jpeg;base64,AAA', mimeType: 'image/jpeg', sizeBytes: 3 },
  })
  if (result.frames.length !== 1) throw new Error(`expected one image frame, got ${result.frames.length}`)
  if (result.state.version !== 1) throw new Error(`expected photo to create State v1, got v${result.state.version}`)
  if (result.observations.length === 0) throw new Error('expected grounded image observation')
  const memory = await pipeline.getMemory(environmentId)
  const snapshot = memory?.snapshots.find((item) => item.stateId === result.state.id)
  const plants = snapshot?.objects.filter((item) => item.name === 'potted plant') ?? []
  if (plants.length !== 2) throw new Error(`expected duplicate/alias still-photo plants to collapse to 2 grounded locations, got ${plants.length}`)
  const door = snapshot?.objects.find((item) => item.name === 'white door')
  if (door?.state !== 'open') throw new Error(`expected confirmed visible door state to persist, got ${door?.state ?? 'missing'}`)
  if (snapshot?.objects.some((item) => /door handle|door hinge|desk \(furniture\)/i.test(item.name))) {
    throw new Error('state-audit inventory leakage must never enter durable memory')
  }
  if (!prompts.some((prompt) => prompt.includes('Final openable-object state confirmation'))) throw new Error('missing bounded final openable-state confirmation pass')
  console.log('PASS  still photo becomes one trusted perception frame')
  console.log('PASS  repeated same-frame duplicate and plant aliases collapse by grounded location')
  console.log('PASS  explicit visible door state survives canonicalization')
  console.log('PASS  one bounded state-confirmation retry recovers a missed open/closed classification')
  console.log('PASS  state-audit hardware/inventory leakage is rejected before memory')
  console.log('PASS  still photo creates durable environmental State v1')
  console.log('PASS  image observation remains grounded through the normal perception pipeline')
  console.log('SENTINEL PHOTO OBSERVATION VERIFIED')
} finally {
  await vite.close()
}
