import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { deriveOperationalConditions } = await vite.ssrLoadModule('/src/perception/condition-derivation.ts')
  const { assessCondition } = await vite.ssrLoadModule('/src/perception/condition-model.ts')

  const environmentId = 'warehouse-test'
  const sourceId = 'source-test'
  const capturedAt = '2026-09-17T13:15:54.989Z'
  const evidence = (id) => ({ id, type: 'frame', sourceId, capturedAt, description: id })

  const base = {
    sourceId,
    evidence: [evidence('frame_door'), evidence('frame_jack')],
    relations: [],
    conditions: [{
      id: 'normal_1', environmentId, kind: 'normal', title: 'warehouse environment',
      description: 'The warehouse is in a normal state.', status: 'present', basis: 'observed',
      confidence: 1, objectIds: [], evidenceIds: ['frame_door'], observedAt: capturedAt,
    }],
    objects: [
      {
        id: 'door_1', environmentId, category: 'door', name: 'green door',
        description: 'green double door with orange frame', confidence: 1,
        firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: ['frame_door'],
      },
      {
        id: 'jack_1', environmentId, category: 'equipment', name: 'orange pallet jack',
        description: 'orange pallet jack in front of the green door', confidence: 1,
        firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: ['frame_jack'],
      },
    ],
    observations: [
      {
        id: 'obs_exit', environmentId, sourceId, modality: 'image', capturedAt,
        label: 'emergency exit sign', description: 'An emergency exit sign above the green door.',
        confidence: 1, basis: 'observed', evidenceIds: ['frame_door'],
      },
      {
        id: 'obs_jack', environmentId, sourceId, modality: 'image', capturedAt,
        label: 'orange pallet jack', description: 'An orange pallet jack in front of the green door.',
        confidence: 1, basis: 'observed', evidenceIds: ['frame_jack'],
      },
    ],
  }

  const positive = deriveOperationalConditions(base, capturedAt)
  if (positive.derivedConditions.length !== 1) throw new Error('expected one derived access condition')
  const derived = positive.derivedConditions[0]
  if (derived.kind !== 'access' || derived.basis !== 'inferred' || derived.status !== 'present') {
    throw new Error('derived condition must be a present inferred access condition')
  }
  if (!derived.objectIds.includes('door_1') || !derived.objectIds.includes('jack_1')) {
    throw new Error('derived access condition must bind the obstacle and exit door')
  }
  if (!derived.evidenceIds.includes('frame_door') || !derived.evidenceIds.includes('frame_jack')) {
    throw new Error('derived access condition must preserve both grounded evidence sources')
  }
  if (derived.confidence !== 0.9) throw new Error(`expected bounded 0.9 confidence, got ${derived.confidence}`)

  const assessment = assessCondition(derived)
  if (!assessment.operational || assessment.issueType !== 'access' || assessment.severity !== 'medium') {
    throw new Error('strong grounded inferred exit obstruction should become a medium access issue')
  }

  const safePlacement = structuredClone(base)
  safePlacement.observations[1].description = 'An orange pallet jack is parked beside the shelving.'
  safePlacement.objects[1].description = 'orange pallet jack beside the shelving'
  const negative = deriveOperationalConditions(safePlacement, capturedAt)
  if (negative.derivedConditions.length !== 0) throw new Error('safe placement must not derive an access obstruction')

  console.log('PASS  grounded exit signage + obstacle placement derives one inferred access condition')
  console.log('PASS  derived condition preserves evidence and stays below source confidence')
  console.log('PASS  safe obstacle placement does not create an access condition')
  console.log('SENTINEL CONDITION DERIVATION GATE VERIFIED')
} finally {
  await vite.close()
}
