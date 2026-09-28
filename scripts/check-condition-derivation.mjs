import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { deriveOperationalConditions } = await vite.ssrLoadModule('/src/perception/condition-derivation.ts')

  const environmentId = 'condition-derivation-compat-test'
  const sourceId = 'source_condition_derivation'
  const capturedAt = '2026-09-28T12:00:00.000Z'
  const evidence = {
    id: 'frame_current',
    type: 'frame',
    sourceId,
    capturedAt,
    frameIndex: 0,
    description: 'Current frame',
  }

  const perception = {
    sourceId,
    observations: [{
      id: 'obs_1',
      environmentId,
      sourceId,
      modality: 'image',
      capturedAt,
      label: 'unusual physical state',
      description: 'A physical component appears visibly abnormal.',
      confidence: 0.99,
      basis: 'observed',
      evidenceIds: [evidence.id],
    }],
    objects: [{
      id: 'object_1',
      environmentId,
      category: 'other',
      name: 'physical component',
      description: 'visibly abnormal physical component',
      confidence: 0.99,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: [evidence.id],
    }],
    conditions: [],
    relations: [],
    evidence: [evidence],
  }

  const result = deriveOperationalConditions(perception, capturedAt)
  expect(result.result === perception, 'compatibility boundary must preserve grounded perception')
  expect(result.derivedConditions.length === 0, 'deterministic semantic derivation must not manufacture conditions from text')

  const existingCondition = {
    id: 'condition_existing',
    environmentId,
    kind: 'maintenance',
    title: 'Grounded model-backed condition',
    description: 'Condition already produced by the evidence-grounded reasoning layer.',
    status: 'present',
    basis: 'inferred',
    confidence: 0.9,
    objectIds: ['object_1'],
    evidenceIds: [evidence.id],
    observedAt: capturedAt,
  }
  const withExisting = { ...perception, conditions: [existingCondition] }
  const preserved = deriveOperationalConditions(withExisting, capturedAt)
  expect(preserved.result.conditions.length === 1 && preserved.result.conditions[0].id === existingCondition.id, 'compatibility boundary must preserve already-grounded conditions unchanged')

  const source = await readFile(new URL('../src/perception/condition-derivation.ts', import.meta.url), 'utf8')
  expect(!source.includes('RegExp('), 'condition derivation must not contain regex-based semantic classification')
  expect(!source.includes('OPERATIONAL_CUE_RULES'), 'condition derivation must not contain a fixed hazard vocabulary')
  expect(!source.includes('Electrical hazard') && !source.includes('Slip hazard') && !source.includes('Sharp object hazard'), 'condition derivation must not enumerate named hazards')

  console.log('PASS  deterministic Phase 5 boundary no longer infers semantics from keywords')
  console.log('PASS  grounded model-backed conditions pass through unchanged')
  console.log('PASS  condition derivation contains no fixed hazard taxonomy')
  console.log('SENTINEL CONDITION DERIVATION COMPATIBILITY VERIFIED')
} finally {
  await vite.close()
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
