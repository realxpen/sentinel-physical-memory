import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { resolvePersonGrounding } = await vite.ssrLoadModule('/src/perception/person-grounding.ts')
  const { buildMemoryObjectRows } = await vite.ssrLoadModule('/src/memory/memory-presentation.ts')

  const environmentId = 'person-grounding-test'
  const sourceId = 'person-grounding-source'
  const capturedAt = '2026-09-26T10:00:00.000Z'
  const evidenceId = 'frame_current'

  const base = {
    sourceId,
    evidence: [],
  }

  const falseScene = {
    ...base,
    observations: [{
      id: 'obs_person_false', environmentId, sourceId, modality: 'image', capturedAt,
      label: 'person visible', description: 'A distant shape was interpreted as a person.',
      confidence: 1, basis: 'observed', evidenceIds: [evidenceId],
    }],
    objects: [
      {
        id: 'person_false', environmentId, category: 'person', name: 'person',
        description: 'Distant human-like silhouette outside the glass door.',
        boundingBox: { x: 0.72, y: 0.18, width: 0.08, height: 0.2 },
        confidence: 1, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [evidenceId],
      },
      {
        id: 'exit_door', environmentId, category: 'door', name: 'glass exit door',
        description: 'Black-framed glass exit door.',
        boundingBox: { x: 0.55, y: 0.08, width: 0.25, height: 0.82 },
        confidence: 0.98, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [evidenceId],
      },
    ],
    conditions: [{
      id: 'condition_person', environmentId, kind: 'attention', title: 'Person near exit',
      description: 'A person appears near the exit.', status: 'present', basis: 'observed',
      confidence: 0.95, objectIds: ['person_false'], evidenceIds: [evidenceId], observedAt: capturedAt,
    }],
    relations: [{
      id: 'relation_person', environmentId, fromId: 'person_false', toId: 'exit_door',
      type: 'near', confidence: 0.95, evidenceIds: [evidenceId],
    }],
  }

  const emptyAudit = { ...base, observations: [], objects: [], conditions: [], relations: [] }
  const rejected = resolvePersonGrounding(falseScene, emptyAudit)

  expect(!rejected.result.objects.some((item) => item.id === 'person_false'), 'rejected person candidate must not persist')
  expect(rejected.result.objects.some((item) => item.id === 'exit_door'), 'rejecting a person must preserve unrelated grounded objects')
  expect(rejected.result.observations.length === 0, 'person-only observation tied to rejected candidate must be removed')
  expect(rejected.result.conditions.length === 0, 'condition referencing rejected person must be removed')
  expect(rejected.result.relations.length === 0, 'relation referencing rejected person must be removed')

  const clearScene = {
    ...base,
    observations: [{
      id: 'obs_person_real', environmentId, sourceId, modality: 'image', capturedAt,
      label: 'person visible', description: 'A clearly visible person is standing near the table.',
      confidence: 0.98, basis: 'observed', evidenceIds: [evidenceId],
    }],
    objects: [{
      id: 'person_real', environmentId, category: 'person', name: 'person',
      description: 'Clearly visible standing person.',
      boundingBox: { x: 0.12, y: 0.12, width: 0.22, height: 0.72 },
      confidence: 0.98, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [evidenceId],
    }],
    conditions: [],
    relations: [],
  }

  const confirmingAudit = {
    ...base,
    observations: [],
    objects: [{
      id: 'audit_person_real', environmentId, category: 'person', name: 'person',
      description: 'Clearly visible head and face, torso and shoulders, with both arms and legs visible.',
      boundingBox: { x: 0.13, y: 0.13, width: 0.21, height: 0.7 },
      confidence: 0.99, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [evidenceId],
    }],
    conditions: [],
    relations: [],
  }

  const confirmed = resolvePersonGrounding(clearScene, confirmingAudit)
  const confirmedPerson = confirmed.result.objects.find((item) => item.id === 'person_real')
  expect(Boolean(confirmedPerson), 'clearly visible independently confirmed person must survive')
  expect(confirmedPerson?.personGrounding?.status === 'confirmed', 'confirmed person must carry explicit grounding metadata')
  expect((confirmedPerson?.personGrounding?.cues.length ?? 0) >= 2, 'confirmed person must record at least two visual cue groups')
  expect(buildMemoryObjectRows(confirmed.result.objects).some((row) => row.object.id === 'person_real'), 'confirmed person must remain visible in Memory presentation')

  const ambiguousAudit = {
    ...base,
    observations: [],
    objects: [{
      id: 'audit_ambiguous', environmentId, category: 'person', name: 'person',
      description: 'Distant human-like silhouette.',
      boundingBox: { x: 0.13, y: 0.13, width: 0.21, height: 0.7 },
      confidence: 0.99, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [evidenceId],
    }],
    conditions: [],
    relations: [],
  }
  const ambiguous = resolvePersonGrounding(clearScene, ambiguousAudit)
  expect(ambiguous.result.objects.length === 0, 'high confidence alone must not confirm an ambiguous human-like silhouette')

  console.log('PASS  rejected person candidates and their dependent claims are removed before persistence')
  console.log('PASS  clear people survive only after independent visual confirmation with matching geometry and human cues')
  console.log('PASS  model confidence alone cannot override the person trust gate')
  console.log('SENTINEL PERSON GROUNDING VERIFIED')
} finally {
  await vite.close()
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
