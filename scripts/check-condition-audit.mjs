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

  const warehouseEnvironmentId = 'condition-audit-warehouse-identity-test'
  const warehouseSourceId = 'source-condition-audit-warehouse'
  const warehousePrompts = []
  const warehouseModel = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      warehousePrompts.push(request.prompt)
      const isConditionAudit = request.prompt.includes('Condition audit for scan')
      const isIdentityAudit = request.prompt.includes('Targeted physical-object identity verification for scan')

      if (isIdentityAudit) {
        return {
          sourceId: warehouseSourceId,
          observations: [{
            id: 'identity-jack-placement',
            environmentId: warehouseEnvironmentId,
            sourceId: warehouseSourceId,
            modality: 'video',
            capturedAt,
            label: 'orange pallet jack',
            description: 'An orange pallet jack is directly in front of the green door.',
            confidence: 1,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }, {
            id: 'identity-exit-sign',
            environmentId: warehouseEnvironmentId,
            sourceId: warehouseSourceId,
            modality: 'video',
            capturedAt,
            label: 'emergency exit sign',
            description: 'A green emergency exit sign is above the green door.',
            confidence: 1,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }],
          objects: [{
            id: 'identity-jack',
            environmentId: warehouseEnvironmentId,
            category: 'equipment',
            name: 'orange pallet jack',
            description: 'An orange pallet jack directly in front of the green door.',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }, {
            id: 'identity-door',
            environmentId: warehouseEnvironmentId,
            category: 'door',
            name: 'green door',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }, {
            id: 'identity-exit',
            environmentId: warehouseEnvironmentId,
            category: 'signage',
            name: 'emergency exit sign',
            description: 'Green emergency exit sign above the green door.',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }],
          conditions: [],
          relations: [],
          evidence: [],
        }
      }

      if (isConditionAudit) {
        return {
          sourceId: warehouseSourceId,
          observations: [{
            id: 'audit-ramp',
            environmentId: warehouseEnvironmentId,
            sourceId: warehouseSourceId,
            modality: 'video',
            capturedAt,
            label: 'green door',
            description: 'Green door with orange ramp in front.',
            confidence: 1,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }, {
            id: 'audit-exit',
            environmentId: warehouseEnvironmentId,
            sourceId: warehouseSourceId,
            modality: 'video',
            capturedAt,
            label: 'emergency exit sign',
            description: 'Emergency exit sign above the green door.',
            confidence: 1,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }],
          objects: [{
            id: 'audit-ramp-object',
            environmentId: warehouseEnvironmentId,
            category: 'other',
            name: 'orange ramp',
            description: 'An orange ramp in front of the green door.',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }, {
            id: 'audit-door-object',
            environmentId: warehouseEnvironmentId,
            category: 'door',
            name: 'green door',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }, {
            id: 'audit-exit-object',
            environmentId: warehouseEnvironmentId,
            category: 'signage',
            name: 'emergency exit sign',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }],
          conditions: [{
            id: 'audit-normal',
            environmentId: warehouseEnvironmentId,
            kind: 'normal',
            title: 'Normal warehouse environment',
            description: 'Warehouse appears normal.',
            status: 'present',
            basis: 'observed',
            confidence: 1,
            objectIds: [],
            evidenceIds: ['evidence_0'],
            observedAt: capturedAt,
          }],
          relations: [],
          evidence: [],
        }
      }

      return {
        sourceId: warehouseSourceId,
        observations: [{
          id: 'scene-exit',
          environmentId: warehouseEnvironmentId,
          sourceId: warehouseSourceId,
          modality: 'video',
          capturedAt,
          label: 'emergency exit sign',
          description: 'Emergency exit sign above the green door.',
          confidence: 1,
          basis: 'observed',
          evidenceIds: ['evidence_0'],
        }],
        objects: [{
          id: 'scene-ramp',
          environmentId: warehouseEnvironmentId,
          category: 'other',
          name: 'orange ramp',
          description: 'An orange ramp in front of the green door.',
          confidence: 1,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }, {
          id: 'scene-door',
          environmentId: warehouseEnvironmentId,
          category: 'door',
          name: 'green door',
          confidence: 1,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }, {
          id: 'scene-exit-object',
          environmentId: warehouseEnvironmentId,
          category: 'signage',
          name: 'emergency exit sign',
          confidence: 1,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }],
        conditions: [{
          id: 'scene-normal',
          environmentId: warehouseEnvironmentId,
          kind: 'normal',
          title: 'Normal warehouse environment',
          description: 'Warehouse appears normal.',
          status: 'present',
          basis: 'observed',
          confidence: 1,
          objectIds: [],
          evidenceIds: ['evidence_0'],
          observedAt: capturedAt,
        }],
        relations: [],
        evidence: [],
      }
    },
  }

  const warehousePipeline = new ScanPipeline({ model: warehouseModel })
  const warehouseResult = await warehousePipeline.run({
    environmentId: warehouseEnvironmentId,
    source: {
      id: warehouseSourceId,
      environmentId: warehouseEnvironmentId,
      modality: 'video',
      uri: 'local://warehouse-identity-audit.mp4',
      capturedAt,
      durationMs: 30_000,
      metadata: { name: 'Warehouse Identity Audit', environmentType: 'warehouse' },
    },
    media: {
      kind: 'video',
      uri: 'local://warehouse-identity-audit.mp4',
      mimeType: 'video/mp4',
      durationMs: 30_000,
      extractedFrames: [{
        frameId: 'warehouse-identity-frame-0',
        timestampMs: 1_000,
        uri: 'data:image/jpeg;base64,AAA',
      }],
    },
  })

  if (warehousePrompts.length !== 3) throw new Error(`expected scene + condition audit + identity audit, got ${warehousePrompts.length}`)
  if (!warehousePrompts[2].includes('Classify by visible morphology')) throw new Error('identity audit must classify from visible morphology')
  if (!warehousePrompts[2].includes('not by filenames or metadata')) throw new Error('identity audit must reject filename/metadata leakage')
  if (!warehouseResult.conditions.some((item) => item.title === 'Emergency exit access obstructed')) {
    throw new Error('identity-audit correction did not enable grounded access derivation')
  }
  if (warehouseResult.state.issueIds.length !== 1) throw new Error('derived warehouse access condition was not promoted')
  if (!warehouseResult.observations.some((item) => item.label === 'orange pallet jack')) throw new Error('identity audit pallet-jack fact did not survive merge')

  console.log('PASS  ambiguous ramp-like warehouse object triggers one targeted identity audit')
  console.log('PASS  identity audit uses visible morphology and explicitly rejects filename/metadata leakage')
  console.log('PASS  corrected pallet-jack identity enables grounded derivation without lowering trust thresholds')
  console.log('SENTINEL CONDITION AUDIT VERIFIED')
} finally {
  await vite.close()
}
