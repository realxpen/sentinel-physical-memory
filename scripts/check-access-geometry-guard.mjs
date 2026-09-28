import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { deriveOperationalConditions } = await vite.ssrLoadModule('/src/perception/condition-derivation.ts')

  const capturedAt = '2026-09-26T12:00:00.000Z'

  const baselineEnvironmentId = 'office-lounge-geometry-guard'
  const baselineSourceId = 'office-lounge-baseline'
  const baselinePrompts = []
  const baselineModel = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      baselinePrompts.push(request.prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('expected trusted still frame')

      if (request.prompt.includes('Condition audit for scan') || request.prompt.includes('Localized physical-detail audit for scan')) {
        return { sourceId: baselineSourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }
      if (request.prompt.includes('Targeted access-geometry verification')) {
        throw new Error('ordinary office furniture must not trigger the targeted access-geometry audit')
      }

      return {
        sourceId: baselineSourceId,
        observations: [{
          id: 'obs_exit',
          environmentId: baselineEnvironmentId,
          sourceId: baselineSourceId,
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
          environmentId: baselineEnvironmentId,
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
          environmentId: baselineEnvironmentId,
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
          environmentId: baselineEnvironmentId,
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
          environmentId: baselineEnvironmentId,
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
          environmentId: baselineEnvironmentId,
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
    async reasonConditions() {
      return { conditions: [] }
    },
  }

  const baselinePipeline = new ScanPipeline({ model: baselineModel })
  const baselineResult = await baselinePipeline.run({
    environmentId: baselineEnvironmentId,
    source: {
      id: baselineSourceId,
      environmentId: baselineEnvironmentId,
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

  if (baselinePrompts.some((prompt) => prompt.includes('Targeted access-geometry verification'))) {
    throw new Error('ordinary table/chair baseline must not trigger access-geometry verification')
  }
  if (baselineResult.conditions.some((item) => item.kind === 'access')) {
    throw new Error('clean office furniture must not create an access condition')
  }
  if (baselineResult.state.issueIds.length !== 0) {
    throw new Error('clean office furniture must not promote an access issue')
  }

  const grounded = {
    sourceId: baselineSourceId,
    observations: [{
      id: 'geometry_table_claim',
      environmentId: baselineEnvironmentId,
      sourceId: baselineSourceId,
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
      environmentId: baselineEnvironmentId,
      category: 'door',
      name: 'glass door',
      description: 'Black-framed glass door.',
      confidence: 0.99,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['frame_1'],
    }, {
      id: 'table_1',
      environmentId: baselineEnvironmentId,
      category: 'furniture',
      name: 'round table',
      description: 'Round white table.',
      confidence: 0.99,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['frame_1'],
    }],
    conditions: [],
    relations: [{
      id: 'geometry_relation_table_door',
      environmentId: baselineEnvironmentId,
      fromId: 'table_1',
      toId: 'door_1',
      type: 'in_front_of',
      confidence: 0.99,
      evidenceIds: ['frame_1'],
    }],
    evidence: [],
  }

  const deterministic = deriveOperationalConditions(grounded, capturedAt)
  if (deterministic.derivedConditions.length !== 0) {
    throw new Error('deterministic compatibility layer must not infer semantic access conditions from geometry keywords/relations')
  }

  const environmentId = 'arbitrary-obstruction-geometry'
  const sourceId = 'arbitrary-obstruction-source'
  const prompts = []
  let conditionReasoningContext = ''
  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      prompts.push(request.prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('expected trusted still frame')

      if (request.prompt.includes('Condition audit for scan') || request.prompt.includes('Localized physical-detail audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }
      if (request.prompt.includes('Targeted access-geometry verification')) {
        return {
          sourceId,
          observations: [{
            id: 'obs_geom',
            environmentId,
            sourceId,
            modality: 'image',
            capturedAt,
            label: 'physical object at doorway',
            description: 'The current physical object occupies the doorway access area.',
            confidence: 0.97,
            basis: 'observed',
            evidenceIds: [frameId],
          }],
          objects: [{
            id: 'door_current',
            environmentId,
            category: 'door',
            name: 'service door',
            description: 'Visible service door.',
            confidence: 0.98,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: [frameId],
          }, {
            id: 'object_current',
            environmentId,
            category: 'obstruction',
            name: 'temporary physical item',
            description: 'Visible item in the access area.',
            confidence: 0.96,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: [frameId],
          }],
          conditions: [],
          relations: [{
            id: 'geometry_object_front_door',
            environmentId,
            fromId: 'object_current',
            toId: 'door_current',
            type: 'in_front_of',
            confidence: 0.97,
            evidenceIds: [frameId],
          }],
          evidence: [],
        }
      }

      return {
        sourceId,
        observations: [],
        objects: [{
          id: 'door_current',
          environmentId,
          category: 'door',
          name: 'service door',
          description: 'Visible service door.',
          state: 'closed',
          confidence: 0.98,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }, {
          id: 'object_current',
          environmentId,
          category: 'obstruction',
          name: 'temporary physical item',
          description: 'Visible item in the middle area.',
          position: { description: 'middle area' },
          confidence: 0.96,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
    async reasonConditions(request) {
      conditionReasoningContext = request.context
      const relation = request.context.match(/\|\s+([^\s]+)\s+-\[in_front_of\]->\s+([^\s]+)\s+\|[^\n]*evidence=([^\s,]+)/)
      if (!relation) return { conditions: [] }
      return {
        conditions: [{
          kind: 'access',
          title: 'Doorway access obstructed',
          description: 'The grounded current relation shows a physical item occupying the doorway access area.',
          status: 'present',
          confidence: 0.96,
          objectIds: [relation[1], relation[2]],
          evidenceIds: [relation[3]],
        }],
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
      metadata: { name: 'Arbitrary Geometry Scene', environmentType: 'other', captureMode: 'photo' },
    },
    media: { kind: 'image', uri: 'data:image/jpeg;base64,AAA', mimeType: 'image/jpeg', sizeBytes: 3 },
  })

  if (!prompts.some((prompt) => prompt.includes('Targeted access-geometry verification'))) {
    throw new Error('grounded obstruction category plus visible door must still trigger geometry verification without a noun whitelist')
  }
  if (!conditionReasoningContext.includes('-[in_front_of]->')) {
    throw new Error('verified geometry relation must reach the generic condition reasoner as grounded context')
  }
  if (!result.conditions.some((item) => item.title === 'Doorway access obstructed')) {
    throw new Error('generic condition reasoning did not convert grounded geometry into an access condition')
  }
  if (result.state.issueIds.length !== 1) {
    throw new Error('grounded reasoned access condition must promote exactly one operational issue')
  }

  console.log('PASS  ordinary office furniture does not trigger targeted access-geometry auditing')
  console.log('PASS  deterministic compatibility layer no longer infers semantic conditions from keywords')
  console.log('PASS  arbitrary obstruction geometry is verified independently of object nouns')
  console.log('PASS  verified relation feeds generic condition reasoning and then the structural trust gate')
  console.log('SENTINEL ACCESS GEOMETRY GUARD VERIFIED')
} finally {
  await vite.close()
}
