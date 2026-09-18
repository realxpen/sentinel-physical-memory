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
            description: 'A desk, chair, and supply box are visible.',
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
          }, {
            id: 'box-scene',
            environmentId,
            category: 'obstruction',
            name: 'supply box',
            confidence: 0.98,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }],
          conditions: [{
            id: 'condition-normal',
            environmentId,
            kind: 'normal',
            title: 'Normal office environment',
            description: 'The scene appears to be an office.',
            status: 'present',
            basis: 'observed',
            confidence: 0.9,
            objectIds: [],
            evidenceIds: ['evidence_0'],
            observedAt: capturedAt,
          }],
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
          label: 'Supply box across walkway',
          description: 'A supply box is positioned across the visible walking path.',
          confidence: 0.94,
          basis: 'observed',
          evidenceIds: ['evidence_0'],
        }],
        objects: [{
          id: 'box-audit',
          environmentId,
          category: 'obstruction',
          name: 'supply box',
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
          description: 'A supply box visibly narrows or blocks the walking path.',
          status: 'present',
          basis: 'observed',
          confidence: 0.92,
          objectIds: ['box-audit'],
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
  if (!prompts[0].includes('Previously remembered object naming context (NOT evidence): none')) throw new Error('scene prompt must label prior memory as naming-only context')
  if (!prompts[0].includes('distinguish pallet jacks/carts/trolleys from ramps')) throw new Error('scene prompt is missing warehouse equipment disambiguation')
  if (!prompts[0].includes('portable fire extinguisher')) throw new Error('scene prompt is missing extinguisher/hydrant disambiguation')
  if (!prompts[1].includes('walking paths, doors, exits, floors')) throw new Error('condition audit prompt is missing facility-condition focus')
  if (!prompts[1].includes('Re-check object identity independently instead of blindly copying the scene label')) throw new Error('condition audit must independently re-check scene taxonomy')
  if (!prompts[1].includes('If an emergency/exit sign is visible, emit it as a signage object')) throw new Error('condition audit must keep exit signage in the durable object inventory')
  if (!prompts[1].includes('supply box (obstruction)')) throw new Error('condition audit prompt is missing scene-object context')
  if (!prompts[1].includes('Normal office environment [normal]')) throw new Error('condition audit prompt is missing benign-condition context')
  if (result.conditions.length !== 2) throw new Error(`expected benign + audited conditions, got ${result.conditions.length}`)
  const obstruction = result.conditions.find((item) => item.title === 'Walkway obstructed')
  if (!obstruction) throw new Error('audited condition did not survive merge')
  if (obstruction.evidenceIds[0] !== 'condition-audit-frame-0') throw new Error('audited condition was not grounded to trusted frame')
  if (result.state.conditionIds.length !== 2) throw new Error('benign and audited conditions were not persisted into State v1')
  if (result.state.issueIds.length !== 1) throw new Error('supported observed access condition was not promoted by SENTINEL policy')

  console.log('PASS  benign-only scene still triggers targeted facility-condition audit')
  console.log('PASS  condition audit receives scene object + benign-condition context')
  console.log('PASS  audited condition remains grounded to SENTINEL-owned frame evidence')
  console.log('PASS  audited access condition persists and issue policy remains SENTINEL-owned')
  console.log('SENTINEL CONDITION AUDIT VERIFIED')
} finally {
  await vite.close()
}
