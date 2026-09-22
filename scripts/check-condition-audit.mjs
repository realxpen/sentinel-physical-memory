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
        }, {
          id: 'observation-negative-spam',
          environmentId,
          sourceId,
          modality: 'video',
          capturedAt,
          label: 'No visible obstructions in server rooms',
          description: 'No visible obstructions in server rooms.',
          confidence: 0.9,
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
  if (!prompts[0].includes('Repeated sightings of the same physical entity across frames should resolve to one object')) throw new Error('scene prompt must consolidate repeated cross-frame sightings')
  if (!prompts[0].includes('Do not emit the overall scene/environment itself')) throw new Error('scene prompt must reject the whole environment as a SpatialObject')
  if (!prompts[0].includes('distinguish pallet jacks/carts/trolleys from ramps')) throw new Error('scene prompt is missing warehouse equipment disambiguation')
  if (!prompts[0].includes('portable fire extinguisher')) throw new Error('scene prompt is missing extinguisher/hydrant disambiguation')
  if (!prompts[1].includes('walking paths, doors, exits, floors')) throw new Error('condition audit prompt is missing facility-condition focus')
  if (!prompts[1].includes('Re-check object identity independently instead of blindly copying the scene label')) throw new Error('condition audit must independently re-check scene taxonomy')
  if (!prompts[1].includes('If an emergency/exit sign is visible, emit it as a signage object')) throw new Error('condition audit must keep exit signage in the durable object inventory')
  if (!prompts[1].includes('supply box (obstruction)')) throw new Error('condition audit prompt is missing scene-object context')
  if (!prompts[1].includes('Normal office environment [normal]')) throw new Error('condition audit prompt is missing benign-condition context')
  if (!prompts[1].includes('Do not enumerate negative findings')) throw new Error('condition audit prompt must prohibit negative finding spam')
  if (result.observations.some((item) => /no visible obstructions/i.test(item.label))) throw new Error('generic negative audit observation should be pruned before memory')
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
  console.log('PASS  generic negative audit spam is pruned before memory')

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

  const geometryEnvironmentId = 'condition-audit-warehouse-geometry-test'
  const geometrySourceId = 'source-condition-audit-geometry'
  const geometryPrompts = []
  const geometryModel = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      geometryPrompts.push(request.prompt)
      const isConditionAudit = request.prompt.includes('Condition audit for scan')
      const isGeometryAudit = request.prompt.includes('Targeted access-geometry verification for scan')

      if (isGeometryAudit) {
        return {
          sourceId: geometrySourceId,
          observations: [{
            id: 'geometry-placement',
            environmentId: geometryEnvironmentId,
            sourceId: geometrySourceId,
            modality: 'video',
            capturedAt,
            label: 'orange pallet jack',
            description: 'An orange pallet jack is directly in front of the green door.',
            confidence: 1,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }, {
            id: 'geometry-exit',
            environmentId: geometryEnvironmentId,
            sourceId: geometrySourceId,
            modality: 'video',
            capturedAt,
            label: 'emergency exit sign',
            description: 'A green emergency exit sign is above the green door.',
            confidence: 1,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }],
          objects: [{
            id: 'geometry-jack',
            environmentId: geometryEnvironmentId,
            category: 'equipment',
            name: 'orange pallet jack',
            description: 'orange pallet jack with wheels',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }, {
            id: 'geometry-door',
            environmentId: geometryEnvironmentId,
            category: 'door',
            name: 'green emergency exit door',
            description: 'green door',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }, {
            id: 'geometry-sign',
            environmentId: geometryEnvironmentId,
            category: 'signage',
            name: 'green exit sign',
            description: 'green emergency exit sign above the green door',
            confidence: 1,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }],
          conditions: [],
          relations: [{
            id: 'geometry-front',
            environmentId: geometryEnvironmentId,
            fromId: 'geometry-jack',
            toId: 'geometry-door',
            type: 'in_front_of',
            confidence: 1,
            evidenceIds: ['evidence_0'],
          }],
          evidence: [],
        }
      }

      const observations = [{
        id: isConditionAudit ? 'audit-exit-geometry' : 'scene-exit-geometry',
        environmentId: geometryEnvironmentId,
        sourceId: geometrySourceId,
        modality: 'video',
        capturedAt,
        label: 'green exit sign',
        description: 'A green emergency exit sign is above the green door.',
        confidence: 1,
        basis: 'observed',
        evidenceIds: ['evidence_0'],
      }, {
        id: isConditionAudit ? 'audit-jack-geometry' : 'scene-jack-geometry',
        environmentId: geometryEnvironmentId,
        sourceId: geometrySourceId,
        modality: 'video',
        capturedAt,
        label: 'orange pallet jack',
        description: 'An orange pallet jack with visible wheels and handle.',
        confidence: 1,
        basis: 'observed',
        evidenceIds: ['evidence_0'],
      }]
      const objects = [{
        id: isConditionAudit ? 'audit-door-geometry' : 'scene-door-geometry',
        environmentId: geometryEnvironmentId,
        category: 'door',
        name: 'green emergency exit door',
        description: 'green door with window and handle',
        confidence: 1,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        evidenceIds: ['evidence_0'],
      }, {
        id: isConditionAudit ? 'audit-jack-object-geometry' : 'scene-jack-object-geometry',
        environmentId: geometryEnvironmentId,
        category: 'equipment',
        name: 'orange pallet jack',
        description: 'orange pallet jack with wheels',
        confidence: 1,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        evidenceIds: ['evidence_0'],
      }, {
        id: isConditionAudit ? 'audit-sign-geometry' : 'scene-sign-geometry',
        environmentId: geometryEnvironmentId,
        category: 'signage',
        name: 'green exit sign',
        description: 'green emergency exit sign above the green door',
        confidence: 1,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        evidenceIds: ['evidence_0'],
      }]
      return {
        sourceId: geometrySourceId,
        observations,
        objects,
        conditions: [{
          id: isConditionAudit ? 'audit-normal-geometry' : 'scene-normal-geometry',
          environmentId: geometryEnvironmentId,
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

  const geometryPipeline = new ScanPipeline({ model: geometryModel })
  const geometryResult = await geometryPipeline.run({
    environmentId: geometryEnvironmentId,
    source: {
      id: geometrySourceId,
      environmentId: geometryEnvironmentId,
      modality: 'video',
      uri: 'local://warehouse-geometry-audit.mp4',
      capturedAt,
      durationMs: 30_000,
      metadata: { name: 'Warehouse Geometry Audit', environmentType: 'warehouse' },
    },
    media: {
      kind: 'video',
      uri: 'local://warehouse-geometry-audit.mp4',
      mimeType: 'video/mp4',
      durationMs: 30_000,
      extractedFrames: [{
        frameId: 'warehouse-geometry-frame-0',
        timestampMs: 1_000,
        uri: 'data:image/jpeg;base64,AAA',
      }],
    },
  })

  if (geometryPrompts.length !== 3) throw new Error(`expected scene + condition audit + access geometry audit, got ${geometryPrompts.length}`)
  if (!geometryPrompts[2].includes('type="in_front_of"')) throw new Error('geometry audit must request a structured in_front_of relation')
  if (!geometryPrompts[2].includes('Near, beside, left/right')) throw new Error('geometry audit must reject weak proximity as obstruction evidence')
  if (!geometryResult.conditions.some((item) => item.title === 'Emergency exit access obstructed')) {
    throw new Error('grounded geometry relation did not enable deterministic access derivation')
  }
  if (geometryResult.state.issueIds.length !== 1) throw new Error('geometry-supported derived access condition was not promoted')
  const geometryMemory = await geometryPipeline.getMemory(geometryEnvironmentId)
  const geometryStateConditions = geometryMemory?.snapshots
    .find((item) => item.stateId === geometryResult.state.id)?.conditions
    .filter((item) => item.title === 'Emergency exit access obstructed') ?? []
  if (geometryStateConditions.length !== 1) {
    throw new Error(`expected exactly one persisted semantic access condition, got ${geometryStateConditions.length}`)
  }

  console.log('PASS  pallet-jack + exit context without placement triggers one targeted access-geometry audit')
  console.log('PASS  pass-local door aliases collapse to one persisted semantic access condition')
  console.log('PASS  geometry audit requires obstacle -> door in_front_of evidence and rejects weak proximity')
  console.log('PASS  structured geometry relation enables derivation without weakening policy thresholds')


  const ordinaryGeometryEnvironmentId = 'condition-audit-ordinary-doorway-geometry-test'
  const ordinaryGeometrySourceId = 'source-condition-audit-ordinary-doorway-geometry'
  const ordinaryGeometryPrompts = []
  const ordinaryGeometryModel = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      ordinaryGeometryPrompts.push(request.prompt)
      const isConditionAudit = request.prompt.includes('Condition audit for scan')
      const isGeometryAudit = request.prompt.includes('Targeted access-geometry verification for scan')

      if (isGeometryAudit) {
        return {
          sourceId: ordinaryGeometrySourceId,
          observations: [{
            id: 'ordinary-geometry-placement',
            environmentId: ordinaryGeometryEnvironmentId,
            sourceId: ordinaryGeometrySourceId,
            modality: 'image',
            capturedAt,
            label: 'Conference Room chair',
            description: 'The gray Conference Room chair is directly in front of the Conference Room door.',
            confidence: 0.98,
            basis: 'observed',
            evidenceIds: ['evidence_0'],
          }],
          objects: [{
            id: 'ordinary-geometry-door',
            environmentId: ordinaryGeometryEnvironmentId,
            category: 'door',
            name: 'Conference Room door',
            description: 'A wooden door with a black frame that is partially open.',
            state: 'open',
            confidence: 0.95,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }, {
            id: 'ordinary-geometry-chair',
            environmentId: ordinaryGeometryEnvironmentId,
            category: 'furniture',
            name: 'Conference Room chair',
            description: 'A gray upholstered chair with black metal legs and armrests.',
            confidence: 0.95,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: ['evidence_0'],
          }],
          conditions: [],
          relations: [{
            id: 'ordinary-geometry-front',
            environmentId: ordinaryGeometryEnvironmentId,
            fromId: 'ordinary-geometry-chair',
            toId: 'ordinary-geometry-door',
            type: 'in_front_of',
            confidence: 0.98,
            evidenceIds: ['evidence_0'],
          }],
          evidence: [],
        }
      }

      return {
        sourceId: ordinaryGeometrySourceId,
        observations: [],
        objects: [{
          id: isConditionAudit ? 'audit-ordinary-door' : 'scene-ordinary-door',
          environmentId: ordinaryGeometryEnvironmentId,
          category: 'door',
          name: 'Conference Room door',
          description: 'A wooden door with a black frame that is partially open.',
          state: 'open',
          confidence: 0.95,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }, {
          id: isConditionAudit ? 'audit-ordinary-chair' : 'scene-ordinary-chair',
          environmentId: ordinaryGeometryEnvironmentId,
          category: 'furniture',
          name: 'Conference Room chair',
          description: 'A gray upholstered chair with black metal legs and armrests.',
          confidence: 0.95,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }],
        conditions: [{
          id: isConditionAudit ? 'audit-ordinary-normal' : 'scene-ordinary-normal',
          environmentId: ordinaryGeometryEnvironmentId,
          kind: 'normal',
          title: 'Office corridor appears normal',
          description: 'No operational condition was asserted in the broad pass.',
          status: 'present',
          basis: 'observed',
          confidence: 0.95,
          objectIds: [],
          evidenceIds: ['evidence_0'],
          observedAt: capturedAt,
        }],
        relations: [],
        evidence: [],
      }
    },
  }

  const ordinaryGeometryPipeline = new ScanPipeline({ model: ordinaryGeometryModel })
  const ordinaryGeometryResult = await ordinaryGeometryPipeline.run({
    environmentId: ordinaryGeometryEnvironmentId,
    source: {
      id: ordinaryGeometrySourceId,
      environmentId: ordinaryGeometryEnvironmentId,
      modality: 'image',
      uri: 'local://ordinary-doorway-chair.jpg',
      capturedAt,
      metadata: { name: 'Ordinary Doorway Geometry Audit', environmentType: 'office' },
    },
    media: {
      kind: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      mimeType: 'image/jpeg',
    },
  })

  if (ordinaryGeometryPrompts.length !== 3) {
    throw new Error(`expected scene + condition audit + ordinary access geometry audit, got ${ordinaryGeometryPrompts.length}`)
  }
  if (!ordinaryGeometryPrompts[2].includes('Visible physical-obstruction candidates')) {
    throw new Error('ordinary geometry audit must explicitly inspect physical-obstruction candidates')
  }
  if (!ordinaryGeometryPrompts[2].includes('do not call the doorway an emergency exit')) {
    throw new Error('ordinary geometry audit must preserve the emergency-exit identity boundary')
  }
  const ordinaryProviderConditions = ordinaryGeometryResult.conditions.filter((item) => item.title === 'Doorway access obstructed')
  if (ordinaryProviderConditions.length === 0) {
    throw new Error('ordinary geometry relation did not enable deterministic doorway access derivation')
  }
  if (ordinaryProviderConditions.some((item) => item.basis !== 'inferred' || item.confidence < 0.85)) {
    throw new Error('ordinary doorway condition must remain strong inferred evidence, not direct observation')
  }
  if (ordinaryGeometryResult.state.issueIds.length !== 1) {
    throw new Error('ordinary doorway obstruction should promote exactly one operational access issue')
  }
  const ordinaryMemory = await ordinaryGeometryPipeline.getMemory(ordinaryGeometryEnvironmentId)
  const ordinarySnapshot = ordinaryMemory?.snapshots.find((item) => item.stateId === ordinaryGeometryResult.state.id)
  if (!ordinarySnapshot?.relations.some((item) => item.type === 'in_front_of')) {
    throw new Error('ordinary geometry audit relation did not survive into the immutable snapshot')
  }
  const ordinaryPersistedConditions = ordinarySnapshot?.conditions.filter((item) => item.title === 'Doorway access obstructed') ?? []
  if (ordinaryPersistedConditions.length !== 1) {
    throw new Error(`expected exactly one persisted semantic ordinary doorway condition, got ${ordinaryPersistedConditions.length}`)
  }
  if (ordinarySnapshot?.issues.length !== 1 || ordinarySnapshot.issues[0].type !== 'access' || ordinarySnapshot.issues[0].severity !== 'medium') {
    throw new Error('ordinary doorway obstruction must persist exactly one medium access issue')
  }

  console.log('PASS  ordinary chair + door without placement triggers one targeted access-geometry audit')
  console.log('PASS  targeted audit grounds chair -> door in_front_of from current image evidence')
  console.log('PASS  pass-local aliases consolidate into exactly one persisted ordinary doorway condition')
  console.log('PASS  ordinary doorway obstruction persists exactly one inferred medium access issue')
  console.log('PASS  ordinary geometry audit cannot silently relabel the doorway as an emergency exit')

  const completionEnvironmentId = 'condition-audit-exit-sign-completion-test'
  const completionSourceId = 'source-exit-sign-completion'
  const completionModel = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const isAudit = request.prompt.includes('Condition audit for scan')
      const common = {
        sourceId: completionSourceId,
        observations: [{
          id: isAudit ? 'audit-door-sign-mention' : 'scene-door-sign-mention',
          environmentId: completionEnvironmentId,
          sourceId: completionSourceId,
          modality: 'video',
          capturedAt,
          label: 'green door',
          description: 'A green door with exit sign above.',
          confidence: 0.96,
          basis: 'observed',
          evidenceIds: ['evidence_0'],
        }],
        objects: [{
          id: isAudit ? 'audit-door-only' : 'scene-door-only',
          environmentId: completionEnvironmentId,
          category: 'door',
          name: 'green emergency exit door',
          description: 'green door with exit sign above',
          confidence: 0.96,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: ['evidence_0'],
        }],
        conditions: [{
          id: isAudit ? 'audit-normal-sign' : 'scene-normal-sign',
          environmentId: completionEnvironmentId,
          kind: 'normal',
          title: 'Normal warehouse environment',
          description: 'Warehouse appears normal.',
          status: 'present',
          basis: 'observed',
          confidence: 0.96,
          objectIds: [],
          evidenceIds: ['evidence_0'],
          observedAt: capturedAt,
        }],
        relations: [],
        evidence: [],
      }
      return common
    },
  }

  const completionPipeline = new ScanPipeline({ model: completionModel })
  const completionResult = await completionPipeline.run({
    environmentId: completionEnvironmentId,
    source: {
      id: completionSourceId,
      environmentId: completionEnvironmentId,
      modality: 'video',
      uri: 'local://exit-sign-completion.mp4',
      capturedAt,
      durationMs: 30_000,
      metadata: { name: 'Exit Sign Completion', environmentType: 'warehouse' },
    },
    media: {
      kind: 'video',
      uri: 'local://exit-sign-completion.mp4',
      mimeType: 'video/mp4',
      durationMs: 30_000,
      extractedFrames: [{
        frameId: 'exit-sign-completion-frame-0',
        timestampMs: 1_000,
        uri: 'data:image/jpeg;base64,AAA',
      }],
    },
  })

  const completionMemory = await completionPipeline.getMemory(completionEnvironmentId)
  const completionSnapshot = completionMemory?.snapshots.find((item) => item.stateId === completionResult.state.id)
  const materializedSigns = completionSnapshot?.objects.filter((item) =>
    item.category === 'signage' && /\bexit sign\b/i.test(`${item.name} ${item.description ?? ''}`),
  ) ?? []
  if (materializedSigns.length !== 1) {
    throw new Error(`expected one durable exit-sign object from explicit grounded mention, got ${materializedSigns.length}`)
  }
  if (materializedSigns[0].evidenceIds.length === 0) {
    throw new Error('materialized exit-sign object must preserve grounded evidence')
  }

  console.log('PASS  explicit grounded exit-sign mention materializes one durable signage object when provider omits it')
  console.log('PASS  grounded object completion preserves evidence and does not rely on filename/prior memory')
  console.log('SENTINEL CONDITION AUDIT VERIFIED')
} finally {
  await vite.close()
}
