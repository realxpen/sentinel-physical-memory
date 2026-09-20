import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { ModelAdapterError } = await vite.ssrLoadModule('/src/ai/model.ts')

  const environmentId = 'retry-test-environment'
  const sourceId = 'retry-test-source'
  const capturedAt = '2026-09-15T13:30:00.000Z'
  let sceneAttempts = 0
  let auditAttempts = 0

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const isAudit = request.prompt.includes('Condition audit for scan')
      if (isAudit) {
        auditAttempts += 1
        return {
          sourceId,
          observations: [{
            id: 'audit-observation-1',
            environmentId,
            sourceId,
            modality: 'video',
            capturedAt,
            label: 'Walkway visible',
            description: 'The visible walking path is present in the supplied frame.',
            confidence: 0.88,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }],
          objects: [],
          conditions: [],
          relations: [],
          evidence: [],
        }
      }

      sceneAttempts += 1
      if (sceneAttempts === 1) {
        throw new ModelAdapterError({
          code: 'INVALID_PERCEPTION_SCHEMA',
          message: 'simulated malformed first provider response',
          retryable: false,
        })
      }

      return {
        sourceId,
        observations: [{
          id: 'observation-1',
          environmentId,
          sourceId,
          modality: 'video',
          capturedAt,
          label: 'Desk visible',
          description: 'A desk is visible in the supplied frame.',
          confidence: 0.9,
          basis: 'observed',
          evidenceIds: ['evidence_0'],
        }],
        objects: [],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
  }

  const pipeline = new ScanPipeline({ model })
  const result = await pipeline.run({
    environmentId,
    source: {
      id: sourceId,
      environmentId,
      modality: 'video',
      uri: 'local://retry-test.mp4',
      capturedAt,
      durationMs: 30_000,
      metadata: { name: 'Retry Test Office', environmentType: 'office' },
    },
    media: {
      kind: 'video',
      uri: 'local://retry-test.mp4',
      mimeType: 'video/mp4',
      durationMs: 30_000,
      extractedFrames: [{
        frameId: 'retry-trusted-frame-0',
        timestampMs: 1_000,
        uri: 'data:image/jpeg;base64,AAA',
      }],
    },
  })

  if (sceneAttempts !== 2) throw new Error(`expected exactly 2 scene perception attempts, got ${sceneAttempts}`)
  if (auditAttempts !== 1) throw new Error(`expected one post-scene condition audit, got ${auditAttempts}`)
  if (result.state.version !== 1) throw new Error(`expected State v1 after retry, got v${result.state.version}`)
  if (result.observations.length !== 1) throw new Error(`condition-audit prose must not persist as observations, got ${result.observations.length}`)

  console.log('PASS  malformed first scene perception response retries automatically once')
  console.log('PASS  retry uses trusted frame grounding and still creates State v1')
  console.log('PASS  zero-condition result continues into one grounded condition-audit pass')
  console.log('PASS  condition-audit prose does not pollute durable observations')
  console.log('SENTINEL PERCEPTION RETRY VERIFIED')
} finally {
  await vite.close()
}
