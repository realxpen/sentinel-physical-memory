import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { ModelAdapterError } = await vite.ssrLoadModule('/src/ai/model.ts')

  await verifyOutputContractRetry(ScanPipeline, ModelAdapterError)
  await verifyTransientProviderRetry(ScanPipeline, ModelAdapterError)

  console.log('PASS  malformed first scene perception response retries automatically once')
  console.log('PASS  retry uses trusted frame grounding and still creates State v1')
  console.log('PASS  zero-condition normal result continues into one grounded condition-audit pass')
  console.log('PASS  transient provider timeout retries the primary scene once')
  console.log('PASS  recovered timeout persists the grounded scene without spending runtime on optional audits')
  console.log('SENTINEL PERCEPTION RETRY VERIFIED')
} finally {
  await vite.close()
}

async function verifyOutputContractRetry(ScanPipeline, ModelAdapterError) {
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
        return perception({
          environmentId,
          sourceId,
          capturedAt,
          label: 'Walkway visible',
          description: 'The visible walking path is present in the supplied frame.',
          confidence: 0.88,
        })
      }

      sceneAttempts += 1
      if (sceneAttempts === 1) {
        throw new ModelAdapterError({
          code: 'INVALID_PERCEPTION_SCHEMA',
          message: 'simulated malformed first provider response',
          retryable: false,
        })
      }

      return perception({
        environmentId,
        sourceId,
        capturedAt,
        label: 'Desk visible',
        description: 'A desk is visible in the supplied frame.',
        confidence: 0.9,
      })
    },
  }

  const result = await runVideoScan(new ScanPipeline({ model }), environmentId, sourceId, capturedAt)

  expect(sceneAttempts === 2, `expected exactly 2 scene perception attempts, got ${sceneAttempts}`)
  expect(auditAttempts === 1, `expected one post-scene condition audit, got ${auditAttempts}`)
  expect(result.state.version === 1, `expected State v1 after retry, got v${result.state.version}`)
  expect(result.observations.length === 1, `condition-audit prose must not persist as observations, got ${result.observations.length}`)
}

async function verifyTransientProviderRetry(ScanPipeline, ModelAdapterError) {
  const environmentId = 'timeout-retry-environment'
  const sourceId = 'timeout-retry-source'
  const capturedAt = '2026-09-23T10:30:00.000Z'
  let sceneAttempts = 0
  let auditAttempts = 0

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const isAudit = request.prompt.includes('Condition audit for scan')
      if (isAudit) {
        auditAttempts += 1
        return perception({
          environmentId,
          sourceId,
          capturedAt,
          label: 'Audit should not run',
          description: 'This optional audit should be skipped after timeout recovery.',
          confidence: 0.8,
        })
      }

      sceneAttempts += 1
      if (sceneAttempts === 1) {
        throw new ModelAdapterError({
          code: 'NEBIUS_TIMEOUT',
          message: 'Nebius inference exceeded the bounded attempt timeout',
          retryable: true,
        })
      }

      return perception({
        environmentId,
        sourceId,
        capturedAt,
        label: 'Exit corridor visible',
        description: 'The office corridor and exit context are directly visible.',
        confidence: 0.96,
        objects: [{
          id: 'fire-extinguisher',
          environmentId,
          category: 'safety',
          name: 'fire extinguisher',
          description: 'A red fire extinguisher is mounted on the wall.',
          position: { description: 'right wall beside the corridor' },
          confidence: 0.97,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }],
      })
    },
  }

  const result = await runVideoScan(new ScanPipeline({ model }), environmentId, sourceId, capturedAt)

  expect(sceneAttempts === 2, `expected timeout recovery to use exactly 2 scene attempts, got ${sceneAttempts}`)
  expect(auditAttempts === 0, `optional audits must be skipped after provider timeout recovery, got ${auditAttempts}`)
  expect(result.state.version === 1, `expected State v1 after timeout recovery, got v${result.state.version}`)
  expect(result.observations.length === 1, 'recovered scene observation must persist')
}

async function runVideoScan(pipeline, environmentId, sourceId, capturedAt) {
  return pipeline.run({
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
}

function perception({ environmentId, sourceId, capturedAt, label, description, confidence, objects = [] }) {
  return {
    sourceId,
    observations: [{
      id: 'observation-1',
      environmentId,
      sourceId,
      modality: 'video',
      capturedAt,
      label,
      description,
      confidence,
      basis: 'observed',
      evidenceIds: ['evidence_0'],
    }],
    objects,
    conditions: [],
    relations: [],
    evidence: [],
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
