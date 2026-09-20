import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const environmentId = 'photo-observation-test'
  const capturedAt = '2026-09-20T00:00:00.000Z'
  const sourceId = 'photo-source'
  let calls = 0
  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      calls += 1
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('image scan should produce one trusted frame artifact')
      return {
        sourceId,
        observations: [{ id: `obs_${calls}`, environmentId, sourceId, modality: 'image', capturedAt, label: 'chair', description: 'A chair is visible beside the desk.', confidence: 0.95, basis: 'observed', evidenceIds: [frameId] }],
        objects: [{ id: `chair_${calls}`, environmentId, category: 'furniture', name: 'chair', description: 'chair beside desk', position: { description: 'beside desk' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] }],
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
  console.log('PASS  still photo becomes one trusted perception frame')
  console.log('PASS  still photo creates durable environmental State v1')
  console.log('PASS  image observation remains grounded through the normal perception pipeline')
  console.log('SENTINEL PHOTO OBSERVATION VERIFIED')
} finally {
  await vite.close()
}
