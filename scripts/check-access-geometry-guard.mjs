import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { deriveOperationalConditions } = await vite.ssrLoadModule('/src/perception/condition-derivation.ts')

  const environmentId = 'office-lounge-geometry-guard'
  const sourceId = 'office-lounge-baseline'
  const capturedAt = '2026-09-26T12:00:00.000Z'
  const prompts = []

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      prompts.push(request.prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('expected trusted still frame')

      if (request.prompt.includes('Condition audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      if (request.prompt.includes('Targeted access-geometry verification')) {
        throw new Error('ordinary office furniture must not trigger the targeted access-geometry audit')
      }

      if (request.prompt.includes('Targeted openable-object state verification')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      return {
        sourceId,
        observations: [{
          id: 'obs_exit',
          environmentId,
          sourceId,
          modality: 'image',
          capturedAt,
          label: 'EXIT sign above glass door',
          description: 'A green EXIT sign is mounted above the black-framed glass door.',
          confidence: 0.98,
          basis: 'observed',
          evidenceIds: [frameId],
        }],
        objects: [{
          id: 'door',
          environmentId,
          category: 'door',
          name: 'glass door',
          description: 'Black-framed glass door leading outside.',
          state: 'closed',
          confidence: 0.98,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }, {
          id: 'exit_sign',
          environmentId,
          category: 'signage',
          name: 'exit sign',
          description: 'Green EXIT sign.',
          position: { description: 'above glass door' },
          confidence: 0.98,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }, {
          id: 'table',
          environmentId,
          category: 'furniture',
          name: 'round table',
          description: 'Round white table in the lounge seating area.',
          position: { description: 'beside the green chairs' },
          confidence: 0.98,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }, {
          id: 'chair',
          environmentId,
          category: 'furniture',
          name: 'green chair',
          description: 'Green lounge chair beside the round table.',
          position: { description: 'beside the round table' },
          confidence: 0.98,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }],
        conditions: [{
          id: 'normal',
          environmentId,
          kind: 'normal',
          title: 'Clean and organized office lounge',
          description: 'The visible lounge appears clean and organized.',
          status: 'present',
          basis: 'observed',
          confidence: 0.95,
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
  const result = await pipeline.run({
    environmentId,
    source: {
      id: sourceId,
      environmentId,
      modality: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      capturedAt,
      metadata: { name: 'Office Lounge Geometry Guard', environmentType: 'office', captureMode: 'photo' },
    },
    media: {
      kind: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
    },
  })

  if (prompts.some((prompt) => prompt.includes('Targeted access-geometry verification'))) {
    throw new Error('ordinary table/chair baseline must not trigger access-geometry verification')
  }
  if (result.conditions.some((item) => item.kind === 'access')) {
    throw new Error('clean office furniture must not create an access condition')
  }
  if (result.state.issueIds.length !== 0) {
    throw new Error('clean office furniture must not promote an access issue')
  }

  const grounded = {
    sourceId,
    observations: [{
      id: 'geometry_table_claim',
      environmentId,
      sourceId,
      modality: 'image',
      capturedAt,
      label: 'Round table in front of glass door',
      description: 'The round table is positioned directly in front of the glass door, blocking the entranceway.',
      confidence: 0.99,
      basis: 'observed',
      evidenceIds: ['frame_1'],
    }],
    objects: [{
      id: 'door_1',
      environmentId,
      category: 'door',
      name: 'glass door',
      description: 'Black-framed glass door.',
      confidence: 0.99,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['frame_1'],
    }, {
      id: 'sign_1',
      environmentId,
      category: 'signage',
      name: 'exit sign',
      description: 'Green EXIT sign.',
      position: { description: 'above glass door' },
      confidence: 0.99,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['frame_1'],
    }, {
      id: 'table_1',
      environmentId,
      category: 'furniture',
      name: 'round table',
      description: 'Round white table.',
      confidence: 0.99,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['frame_1'],
    }],
    conditions: [],
    relations: [],
    evidence: [],
  }

  const proseOnly = deriveOperationalConditions(grounded, capturedAt)
  if (proseOnly.derivedConditions.length !== 0) {
    throw new Error('geometry-audit prose without an explicit relation must not derive access obstruction')
  }

  const withRelation = structuredClone(grounded)
  withRelation.relations = [{
    id: 'geometry_relation_table_door',
    environmentId,
    fromId: 'table_1',
    toId: 'door_1',
    type: 'in_front_of',
    confidence: 0.99,
    evidenceIds: ['frame_1'],
  }]
  const relationBacked = deriveOperationalConditions(withRelation, capturedAt)
  if (relationBacked.derivedConditions.length !== 1) {
    throw new Error('explicit grounded obstacle -> door relation must remain eligible for access derivation')
  }

  console.log('PASS  ordinary office furniture does not trigger targeted access-geometry auditing')
  console.log('PASS  geometry-audit obstruction prose is non-authoritative without an explicit relation')
  console.log('PASS  an explicit grounded obstacle -> door relation still supports access derivation')
  console.log('SENTINEL ACCESS GEOMETRY GUARD VERIFIED')
} finally {
  await vite.close()
}
