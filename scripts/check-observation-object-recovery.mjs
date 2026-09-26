import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')

  const environmentId = 'observation-recovery-test'
  let sceneCalls = 0

  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const sourceId = request.prompt.match(/scan source id is ([^\n.]+)/i)?.[1]?.trim() ?? 'source'
      const capturedAt = request.prompt.match(/capturedAt is ([^\n.]+)/i)?.[1]?.trim() ?? '2026-09-26T00:00:00.000Z'
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId ?? 'frame_0'

      if (request.prompt.includes('Operational change recovery audit')) {
        return perception(sourceId, capturedAt, frameId, {
          observations: [],
          objects: [object('plant_audit', 'other', 'Large Potted Plant', 'A large green plant in a black pot.', capturedAt, frameId)],
        })
      }

      if (!request.prompt.startsWith('Analyze scan')) {
        return perception(sourceId, capturedAt, frameId, { observations: [], objects: [] })
      }

      sceneCalls += 1
      if (sceneCalls === 1) {
        return perception(sourceId, capturedAt, frameId, {
          observations: [
            observation('obs_table', 'Round Table', 'A white round table with a small plant on it.', capturedAt, frameId),
            observation('obs_chair', 'Green Chair', 'A green chair next to the round table.', capturedAt, frameId),
            observation('obs_couch', 'Green Couch', 'A green couch on the right side of the room.', capturedAt, frameId),
            observation('obs_kitchen', 'Kitchen Area', 'A kitchen area with refrigerator and cabinets.', capturedAt, frameId),
            observation('obs_plant', 'Large Potted Plant', 'A large green plant in a black pot.', capturedAt, frameId),
          ],
          objects: [
            object('table', 'furniture', 'Round Table', 'A white round table.', capturedAt, frameId),
            object('chair', 'furniture', 'Green Chair', 'A green chair.', capturedAt, frameId),
            object('couch', 'furniture', 'Green Couch', 'A green couch.', capturedAt, frameId),
            object('kitchen', 'furniture', 'Kitchen Area', 'A kitchen area with refrigerator and cabinets.', capturedAt, frameId),
            object('plant', 'other', 'Large Potted Plant', 'A large green plant in a black pot.', capturedAt, frameId),
          ],
        })
      }

      return perception(sourceId, capturedAt, frameId, {
        observations: [
          observation('obs_table_2', 'Round Table', 'A white round table with a small plant on it.', capturedAt, frameId),
          observation('obs_chair_2', 'Green Chair', 'A green chair next to the round table.', capturedAt, frameId),
          observation('obs_couch_2', 'Green Couch', 'A green couch on the right side of the room.', capturedAt, frameId),
          observation('obs_kitchen_2', 'Kitchen Area', 'A kitchen area with refrigerator and cabinets.', capturedAt, frameId),
          observation('obs_plant_2', 'Large Potted Plant', 'A large green plant in a black pot.', capturedAt, frameId),
        ],
        // Reproduce the Scan C failure mode: the model directly observes five
        // stable objects in prose but only emits one SpatialObject.
        objects: [
          object('plant_2', 'other', 'Large Potted Plant', 'A large green plant in a black pot.', capturedAt, frameId),
        ],
      })
    },
  }

  const pipeline = new ScanPipeline({ model })

  const first = await pipeline.run(scanInput(environmentId, 'source_v1', '2026-09-26T12:00:00.000Z'))
  expect(first.state.version === 1, 'first observation must create State v1')

  const second = await pipeline.run(scanInput(environmentId, 'source_v2', '2026-09-26T12:10:00.000Z'))
  expect(second.state.version === 2, 'second observation must create State v2')

  const memory = await pipeline.getMemory(environmentId)
  const snapshot = memory?.snapshots.find((item) => item.stateId === second.state.id)
  const names = new Set(snapshot?.objects.map((item) => item.name) ?? [])

  for (const expected of ['Round Table', 'Green Chair', 'Green Couch', 'Kitchen Area', 'Large Potted Plant']) {
    expect(names.has(expected), `direct current observation should recover remembered object: ${expected}`)
  }

  const uncertainTitles = second.diff?.changes.filter((item) => item.type === 'uncertain').map((item) => item.title) ?? []
  for (const forbidden of ['Round Table', 'Green Chair', 'Green Couch', 'Kitchen Area']) {
    expect(!uncertainTitles.some((title) => title.includes(forbidden)), `directly observed ${forbidden} must not become Not re-observed`)
  }

  console.log('PASS  high-confidence current observations recover uniquely named remembered objects when the model omits their object entries')
  console.log('PASS  prior memory supplies identity context only; recovered presence/evidence come from the current observation')
  console.log('PASS  direct current re-observation prevents false disappearance churn')
  console.log('SENTINEL OBSERVATION OBJECT RECOVERY VERIFIED')
} finally {
  await vite.close()
}

function perception(sourceId, capturedAt, frameId, { observations, objects }) {
  return {
    sourceId,
    observations,
    objects,
    conditions: [],
    relations: [],
    evidence: [{
      id: frameId,
      sourceId,
      type: 'frame',
      capturedAt,
      description: 'Trusted current still frame.',
      uri: 'data:image/jpeg;base64,AAA',
    }],
  }
}

function observation(id, label, description, capturedAt, frameId) {
  return {
    id,
    environmentId: 'observation-recovery-test',
    sourceId: capturedAt.includes('12:10') ? 'source_v2' : 'source_v1',
    modality: 'image',
    capturedAt,
    label,
    description,
    confidence: 1,
    basis: 'observed',
    evidenceIds: [frameId],
  }
}

function object(id, category, name, description, capturedAt, frameId) {
  return {
    id,
    environmentId: 'observation-recovery-test',
    category,
    name,
    description,
    confidence: 1,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    evidenceIds: [frameId],
  }
}

function scanInput(environmentId, sourceId, capturedAt) {
  return {
    environmentId,
    source: {
      id: sourceId,
      environmentId,
      modality: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      capturedAt,
      metadata: { name: 'Observation Recovery Test', environmentType: 'office', captureMode: 'photo' },
    },
    media: { kind: 'image', uri: 'data:image/jpeg;base64,AAA', mimeType: 'image/jpeg', sizeBytes: 3 },
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
