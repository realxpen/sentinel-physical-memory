import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { ModelAdapterError } = await vite.ssrLoadModule('/src/ai/model.ts')
  const { createLatencyResilientPerceptionAdapter } = await vite.ssrLoadModule('/api/scan.ts')

  await verifyOutputContractRetry(ScanPipeline, ModelAdapterError)
  await verifySparseStillInventoryRetry(ScanPipeline)
  await verifyPersistentSparseStillFailsClosed(ScanPipeline, ModelAdapterError)
  await verifyTransientProviderRetry(ScanPipeline, ModelAdapterError)
  await verifyRecoveredUpdateSkipsTemporal(ScanPipeline, ModelAdapterError)
  await verifySoftBudgetSkipsOptional(ScanPipeline)
  await verifyPreferredVisionFallback(createLatencyResilientPerceptionAdapter, ModelAdapterError)

  console.log('PASS  malformed first scene perception response retries automatically once')
  console.log('PASS  retry uses trusted frame grounding and still creates State v1')
  console.log('PASS  zero-condition normal result continues into one grounded condition-audit pass')
  console.log('PASS  sparse still-photo inventory retries before State v1 can be persisted')
  console.log('PASS  persistently empty still-photo inventory fails closed without writing memory')
  console.log('PASS  transient provider timeout retries the primary scene once')
  console.log('PASS  recovered timeout persists the grounded scene without spending runtime on optional audits')
  console.log('PASS  recovered update timeout also skips temporal verification and persists before platform timeout')
  console.log('PASS  scan soft deadline skips optional still-image audits when persistence reserve is at risk')
  console.log('PASS  mandatory scene perception can fail over from preferred Qwen vision to configured MiniCPM without weakening trust')
  console.log('PASS  optional audits stay single-route and vision fallback exhaustion is non-retryable')
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

async function verifySparseStillInventoryRetry(ScanPipeline) {
  const environmentId = 'sparse-still-retry-environment'
  const sourceId = 'sparse-still-retry-source'
  const capturedAt = '2026-09-26T12:30:00.000Z'
  let sceneAttempts = 0
  const prompts = []

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      prompts.push(request.prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId ?? 'frame_0'
      sceneAttempts += 1

      if (sceneAttempts === 1) {
        return {
          sourceId,
          observations: [{
            id: 'obs-exit-sign-only',
            environmentId,
            sourceId,
            modality: 'image',
            capturedAt,
            label: 'EXIT sign visible',
            description: 'A green EXIT sign is visible above the doorway.',
            confidence: 0.95,
            basis: 'observed',
            evidenceIds: [frameId],
          }],
          objects: [],
          conditions: [],
          relations: [],
          evidence: [],
        }
      }

      return {
        sourceId,
        observations: [{
          id: 'obs-office-lounge',
          environmentId,
          sourceId,
          modality: 'image',
          capturedAt,
          label: 'Office lounge visible',
          description: 'A glass door, chair, table, plant, and fire extinguisher are directly visible.',
          confidence: 0.97,
          basis: 'observed',
          evidenceIds: [frameId],
        }],
        objects: [{
          id: 'glass-door',
          environmentId,
          category: 'door',
          name: 'glass door',
          description: 'Black-framed glass door.',
          state: 'closed',
          confidence: 0.97,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }, {
          id: 'round-table',
          environmentId,
          category: 'furniture',
          name: 'round table',
          description: 'Round white table in the lounge.',
          confidence: 0.96,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }, {
          id: 'green-chair',
          environmentId,
          category: 'furniture',
          name: 'green chair',
          description: 'Green lounge chair beside the table.',
          confidence: 0.96,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }],
        conditions: [{
          id: 'normal-office-lounge',
          environmentId,
          kind: 'normal',
          title: 'Office lounge visible',
          description: 'No operational condition is asserted.',
          status: 'present',
          basis: 'observed',
          confidence: 0.9,
          objectIds: [],
          evidenceIds: [frameId],
          observedAt: capturedAt,
        }],
        relations: [],
        evidence: [],
      }
    },
  }

  const pipeline = new ScanPipeline({ model })
  const result = await runImageScan(pipeline, environmentId, sourceId, capturedAt)

  expect(sceneAttempts === 2, `expected one sparse-inventory retry, got ${sceneAttempts} scene calls`)
  expect(prompts[1]?.includes('SPARSE STILL-PHOTO RETRY'), 'second scene attempt must receive the sparse still-photo recovery instruction')
  expect(result.state.version === 1, 'successful retry must create exactly State v1')
  const memory = await pipeline.getMemory(environmentId)
  const snapshot = memory?.snapshots.find((item) => item.stateId === result.state.id)
  expect((snapshot?.objects.length ?? 0) >= 3, 'recovered State v1 must contain the grounded physical inventory')
}

async function verifyPersistentSparseStillFailsClosed(ScanPipeline, ModelAdapterError) {
  const environmentId = 'persistent-sparse-still-environment'
  const sourceId = 'persistent-sparse-still-source'
  const capturedAt = '2026-09-26T12:35:00.000Z'
  let sceneAttempts = 0

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      sceneAttempts += 1
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId ?? 'frame_0'
      return {
        sourceId,
        observations: [{
          id: `obs-sparse-${sceneAttempts}`,
          environmentId,
          sourceId,
          modality: 'image',
          capturedAt,
          label: 'EXIT sign visible',
          description: 'An EXIT sign is visible, but no grounded physical-object inventory was returned.',
          confidence: 0.95,
          basis: 'observed',
          evidenceIds: [frameId],
        }],
        objects: [],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
  }

  const pipeline = new ScanPipeline({ model })
  let thrown
  try {
    await runImageScan(pipeline, environmentId, sourceId, capturedAt)
  } catch (error) {
    thrown = error
  }

  expect(thrown instanceof ModelAdapterError, 'persistent sparse still must reject with a model output error')
  expect(thrown?.code === 'INSUFFICIENT_SCENE_INVENTORY', `expected INSUFFICIENT_SCENE_INVENTORY, got ${thrown?.code}`)
  expect(sceneAttempts === 2, `persistent sparse still must use exactly two scene attempts, got ${sceneAttempts}`)
  const memory = await pipeline.getMemory(environmentId)
  expect(memory === undefined, 'failed sparse still must not persist an environment or State v1')
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

async function verifyRecoveredUpdateSkipsTemporal(ScanPipeline, ModelAdapterError) {
  const environmentId = 'timeout-update-environment'
  const baselineAt = '2026-09-24T13:00:00.000Z'
  const updateAt = '2026-09-24T13:05:00.000Z'
  let updateSceneAttempts = 0
  let temporalCalls = 0

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const sourceId = request.prompt.includes('update-source') ? 'update-source' : 'baseline-source'
      const capturedAt = sourceId === 'update-source' ? updateAt : baselineAt
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId ?? 'frame_0'

      if (sourceId === 'update-source') {
        updateSceneAttempts += 1
        if (updateSceneAttempts === 1) {
          throw new ModelAdapterError({
            code: 'NEBIUS_TIMEOUT',
            message: 'simulated slow update scene',
            retryable: true,
          })
        }
      }

      return {
        sourceId,
        observations: [{
          id: 'obs-' + sourceId,
          environmentId,
          sourceId,
          modality: 'image',
          capturedAt,
          label: 'Fire extinguisher visible',
          description: 'A red fire extinguisher is visible in the corridor.',
          confidence: 0.97,
          basis: 'observed',
          evidenceIds: [frameId],
        }],
        objects: [{
          id: 'extinguisher-' + sourceId,
          environmentId,
          category: 'safety',
          name: 'fire extinguisher',
          description: 'A red fire extinguisher is visible.',
          position: { description: sourceId === 'update-source' ? 'left wall' : 'right wall' },
          confidence: 0.97,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }],
        conditions: [{
          id: 'condition-' + sourceId,
          environmentId,
          kind: 'attention',
          title: 'Safety equipment visible',
          description: 'A safety object is directly visible.',
          status: 'present',
          basis: 'observed',
          confidence: 0.9,
          objectIds: ['extinguisher-' + sourceId],
          evidenceIds: [frameId],
          observedAt: capturedAt,
        }],
        relations: [],
        evidence: [],
      }
    },
    async verifyTemporal() {
      temporalCalls += 1
      return { changes: [] }
    },
  }

  const pipeline = new ScanPipeline({ model })
  await runImageScan(pipeline, environmentId, 'baseline-source', baselineAt)
  const update = await runImageScan(pipeline, environmentId, 'update-source', updateAt)

  expect(updateSceneAttempts === 2, `expected update scene to recover on second attempt, got ${updateSceneAttempts}`)
  expect(temporalCalls === 0, `temporal verification must be skipped after recovered scene timeout, got ${temporalCalls}`)
  expect(update.state.version === 2, `recovered update must still persist State v2, got v${update.state.version}`)
}

async function verifySoftBudgetSkipsOptional(ScanPipeline) {
  const environmentId = 'soft-budget-environment'
  const sourceId = 'soft-budget-source'
  const capturedAt = '2026-09-24T14:00:00.000Z'
  let inferCalls = 0

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      inferCalls += 1
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId ?? 'frame_0'
      return {
        sourceId,
        observations: [{
          id: 'obs-budget',
          environmentId,
          sourceId,
          modality: 'image',
          capturedAt,
          label: 'Door visible',
          description: 'A door is directly visible.',
          confidence: 0.95,
          basis: 'observed',
          evidenceIds: [frameId],
        }],
        objects: [{
          id: 'door-budget',
          environmentId,
          category: 'door',
          name: 'office door',
          description: 'A visible office door.',
          confidence: 0.95,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
  }

  const pipeline = new ScanPipeline({
    model,
    deadlineAtMs: 20_000,
    nowMs: () => 0,
  })
  const result = await runImageScan(pipeline, environmentId, sourceId, capturedAt)

  expect(inferCalls === 1, `soft budget must keep only the mandatory scene call, got ${inferCalls} inference calls`)
  expect(result.state.version === 1, 'soft-budget scan must persist the grounded scene instead of failing')
}

async function verifyPreferredVisionFallback(createAdapter, ModelAdapterError) {
  let preferredCalls = 0
  let configuredCalls = 0
  const timeouts = []

  const configured = {
    provider: 'nebius-token-factory',
    model: 'openbmb/MiniCPM-V-4_5',
    async infer(request) {
      configuredCalls += 1
      timeouts.push(['configured', request.timeoutMs])
      return { sourceId: 'fallback-source', observations: [], objects: [], conditions: [], relations: [], evidence: [] }
    },
    async verifyTemporal() { return { changes: [] } },
  }
  const preferred = {
    provider: 'nebius-token-factory',
    model: 'Qwen/Qwen2.5-VL-72B-Instruct',
    async infer(request) {
      preferredCalls += 1
      timeouts.push(['preferred', request.timeoutMs])
      throw new ModelAdapterError({
        code: 'NEBIUS_TIMEOUT',
        message: 'simulated preferred vision timeout',
        retryable: true,
      })
    },
  }

  const adapter = createAdapter(configured, preferred)
  const scene = await adapter.infer({ role: 'perception', prompt: 'scene', artifacts: [] })
  expect(scene.sourceId === 'fallback-source', 'configured vision model must recover the mandatory scene')
  expect(preferredCalls === 1 && configuredCalls === 1, 'mandatory scene must try preferred then configured exactly once')
  expect(timeouts.some(([route, timeout]) => route === 'preferred' && timeout === 55_000), 'preferred vision route must use its bounded timeout')
  expect(timeouts.some(([route, timeout]) => route === 'configured' && timeout === 45_000), 'configured fallback must use its bounded timeout')

  preferredCalls = 0
  configuredCalls = 0
  await adapter.infer({ role: 'perception', prompt: 'audit', artifacts: [], timeoutMs: 25_000 })
  expect(preferredCalls === 0 && configuredCalls === 1, 'optional audit must stay on the configured model and not consume fallback budget')

  const unavailablePreferred = {
    ...preferred,
    async infer() {
      throw new ModelAdapterError({
        code: 'NEBIUS_HTTP_ERROR',
        message: 'preferred model unavailable in this account',
        status: 404,
        retryable: false,
      })
    },
  }
  const unavailableAdapter = createAdapter(configured, unavailablePreferred)
  const recovered = await unavailableAdapter.infer({ role: 'perception', prompt: 'scene', artifacts: [] })
  expect(recovered.sourceId === 'fallback-source', '404 on preferred model must safely fall back to configured vision')

  const timedOutConfigured = {
    ...configured,
    async infer() {
      throw new ModelAdapterError({
        code: 'NEBIUS_TIMEOUT',
        message: 'configured fallback timed out',
        retryable: true,
      })
    },
  }
  const exhausted = createAdapter(timedOutConfigured, preferred)
  let thrown
  try {
    await exhausted.infer({ role: 'perception', prompt: 'scene', artifacts: [] })
  } catch (error) {
    thrown = error
  }
  expect(thrown instanceof ModelAdapterError, 'exhausted vision routing must throw a model adapter error')
  expect(thrown.code === 'PERCEPTION_TIMEOUT', `expected PERCEPTION_TIMEOUT after both routes fail, got ${thrown?.code}`)
  expect(thrown.retryable === false, 'exhausted multi-model route must not trigger another full scene retry')
}

async function runImageScan(pipeline, environmentId, sourceId, capturedAt) {
  return pipeline.run({
    environmentId,
    source: {
      id: sourceId,
      environmentId,
      modality: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      capturedAt,
      metadata: { name: 'Runtime Budget Test Office', environmentType: 'office', captureMode: 'photo' },
    },
    media: {
      kind: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
    },
  })
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
