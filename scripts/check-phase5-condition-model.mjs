import { assessCondition } from '../src/perception/condition-model.ts'
import { PerceptionValidationError, validatePerceptionForScan, validatePerception } from '../src/ai/perception-schema.ts'

const environmentId = 'phase5-test'
const sourceId = 'source_phase5'
const capturedAt = '2026-09-15T09:00:00.000Z'

function condition(overrides = {}) {
  return {
    id: 'condition_1',
    environmentId,
    kind: 'hazard',
    title: 'Exposed cable',
    description: 'A cable with exposed conductors is visible near the desk.',
    status: 'present',
    basis: 'observed',
    confidence: 0.92,
    objectIds: [],
    evidenceIds: ['evidence_1'],
    observedAt: capturedAt,
    ...overrides,
  }
}

function expect(label, predicate) {
  if (!predicate) throw new Error(`FAIL  ${label}`)
  console.log(`PASS  ${label}`)
}

const observedHazard = assessCondition(condition())
expect('observed evidence-backed hazard becomes an operational issue', observedHazard.operational === true)
expect('observed hazard is capped at high, never critical', observedHazard.severity === 'high')
expect('hazard maps to safety issue type', observedHazard.issueType === 'safety')
expect('observed trust label is explicit', observedHazard.trustLabel === 'Observed')

const inferredHazard = assessCondition(condition({ basis: 'inferred', confidence: 0.91 }))
expect('strong inferred present condition can become operational', inferredHazard.operational === true)
expect('inferred condition severity is capped at medium', inferredHazard.severity === 'medium')
expect('inferred trust label is explicit', inferredHazard.trustLabel === 'Inferred')

const weakInference = assessCondition(condition({ basis: 'inferred', confidence: 0.84 }))
expect('weak inference stays context-only', weakInference.operational === false)

const uncertainObserved = assessCondition(condition({ status: 'uncertain', confidence: 0.99 }))
expect('uncertain condition never auto-promotes to issue', uncertainObserved.operational === false)

const normalCondition = assessCondition(condition({ kind: 'normal', title: 'Exit path clear' }))
expect('normal condition stays memory context', normalCondition.operational === false)

const perception = validatePerception({
  sourceId,
  observations: [{
    id: 'observation_1',
    environmentId,
    sourceId,
    modality: 'video',
    capturedAt,
    label: 'Cable visible',
    description: 'A cable is visible beside the desk.',
    confidence: 0.95,
    basis: 'observed',
    evidenceIds: ['evidence_1'],
  }],
  objects: [{
    id: 'object_1',
    environmentId,
    category: 'equipment',
    name: 'Cable',
    confidence: 0.9,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    evidenceIds: ['evidence_1'],
  }],
  conditions: [{
    ...condition(),
    objectIds: ['object_1'],
  }],
  relations: [],
  evidence: [{
    id: 'evidence_1',
    type: 'frame',
    sourceId,
    capturedAt,
    frameIndex: 0,
    description: 'Frame showing cable beside desk.',
  }],
})
validatePerceptionForScan(perception, environmentId, sourceId)
expect('valid condition is grounded to existing object and evidence', perception.conditions.length === 1)

let missingEvidenceRejected = false
try {
  validatePerceptionForScan({
    ...perception,
    conditions: [{ ...perception.conditions[0], evidenceIds: ['missing_evidence'] }],
  }, environmentId, sourceId)
} catch (error) {
  missingEvidenceRejected = error instanceof PerceptionValidationError
}
expect('condition with missing evidence fails closed', missingEvidenceRejected)

let missingObjectRejected = false
try {
  validatePerceptionForScan({
    ...perception,
    conditions: [{ ...perception.conditions[0], objectIds: ['missing_object'] }],
  }, environmentId, sourceId)
} catch (error) {
  missingObjectRejected = error instanceof PerceptionValidationError
}
expect('condition with missing object fails closed', missingObjectRejected)

console.log('PHASE 5 CONDITION TRUST MODEL VERIFIED')
