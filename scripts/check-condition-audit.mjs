import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')

  const environmentId = 'condition-audit-test'
  const sourceId = 'source-condition-audit'
  const capturedAt = '2026-09-15T14:30:00.000Z'
  const prompts = []

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      prompts.push(request.prompt)
      const isAudit = request.prompt.includes('Condition audit for scan')

      if (!isAudit) {
        return {
          sourceId,
          observations: [{
            id: 'observation-scene',
            environmentId,
            sourceId,
            modality: 'video',
            capturedAt,
            label: 'Office furniture visible',
            description: 'A desk and chair are visible.',
            confidence: 0.95,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }],
          objects: [{
            id: 'desk-scene',
            environmentId,
            category: 'furniture',
            name: 'desk',
            confidence: 0.95,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }],
          conditions: [],
          relations: [],
          evidence: [],
        }
      }

      return {
        sourceId,
        observations: [{
          id: 'observation-obstruction',
          environmentId,
          sourceId,
          modality: 'video',
          capturedAt,
          label: 'Chair across walkway',
          description: 'A chair is positioned across the visible walking path.',
          confidence: 0.94,
          basis: 'observed',
          evidenceIds: ['evidence_0'],
        }],
        objects: [{
          id: 'chair-audit',
          environmentId,
          category: 'furniture',
          name: 'chair',
          confidence: 0.94,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }],
        conditions: [{
          id: 'condition-obstruction',
          environmentId,
          kind: 'access',
          title: 'Walkway obstructed',
          description: 'A chair visibly narrows or blocks the walking path.',
          status: 'present',
          basis: 'observed',
          confidence: 0.92,
          objectIds: ['chair-audit'],
          evidenceIds: ['evidence_0'],
          observedAt: capturedAt,
        }],
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
      uri: 'local://condition-audit.mp4',
      capturedAt,
      durationMs: 30_000,
      metadata: { name: 'Condition Audit Office', environmentType: 'office' },
    },
    media: {
      kind: 'video',
      uri: 'local://condition-audit.mp4',
      mimeType: 'video/mp4',
      durationMs: 30_000,
      extractedFrames: [{
        frameId: 'condition-audit-frame-0',
        timestampMs: 1_000,
        uri: 'data:image/jpeg;base64,AAA',
      }],
    },
  })

  if (prompts.length !== 2) throw new Error(`expected scene + condition audit passes, got ${prompts.length}`)
  if (!prompts[1].includes('walking paths, doors, exits, floors')) throw new Error('condition audit prompt is missing facility-condition focus')
  if (result.conditions.length !== 1) throw new Error(`expected one audited condition, got ${result.conditions.length}`)
  if (result.conditions[0].title !== 'Walkway obstructed') throw new Error('audited condition did not survive merge')
  if (result.conditions[0].evidenceIds[0] !== 'condition-audit-frame-0') throw new Error('audited condition was not grounded to trusted frame')
  if (result.state.conditionIds.length !== 1) throw new Error('audited condition was not persisted into State v1')
  if (result.state.issueIds.length !== 1) throw new Error('supported observed access condition was not promoted by SENTINEL policy')

  console.log('PASS  zero-condition scene triggers targeted facility-condition audit')
  console.log('PASS  audited condition remains grounded to SENTINEL-owned frame evidence')
  console.log('PASS  audited condition persists into state and issue policy remains SENTINEL-owned')
  console.log('SENTINEL CONDITION AUDIT VERIFIED')
} finally {
  await vite.close()
}
