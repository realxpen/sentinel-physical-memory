import { assessCondition, effectiveConditionKind } from '../src/perception/condition-model.ts'
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

const normalCondition = assessCondition(condition({ kind: 'normal', title: 'Exit path clear', description: 'The visible exit path is clear.' }))
expect('normal condition stays memory context', normalCondition.operational === false)

const benignBox = assessCondition(condition({
  kind: 'normal',
  title: 'Supply Box',
  description: 'A cardboard box labeled SUPPLIES is visible in the room.',
  confidence: 1,
}))
expect('generic box-in-room statement stays benign', benignBox.operational === false)
expect('generic box-in-room statement keeps normal effective kind', effectiveConditionKind(condition({ kind: 'normal', title: 'Supply Box', description: 'A cardboard box is visible in the room.' })) === 'normal')

const normalBlockingText = condition({
  kind: 'normal',
  title: 'Provider normal claim',
  description: 'Text contains the words blocking doorway, but kind remains normal.',
  confidence: 1,
})
expect('trust policy does not reclassify a condition from keywords', effectiveConditionKind(normalBlockingText) === 'normal')
expect('normal kind cannot auto-promote even when its prose contains hazard-like words', assessCondition(normalBlockingText).operational === false)

const explicitAccess = condition({
  kind: 'access',
  title: 'Doorway access obstructed',
  description: 'A grounded current condition is semantically classified as access by perception/reasoning.',
  confidence: 0.65,
})
const accessAssessment = assessCondition(explicitAccess)
expect('semantic access kind at observed threshold becomes operational', accessAssessment.operational === true)
expect('access kind maps to access issue type', accessAssessment.issueType === 'access')
expect('observed access remains medium severity', accessAssessment.severity === 'medium')

const weakAccess = assessCondition(condition({
  kind: 'access',
  title: 'Possible access condition',
  description: 'Grounded current access condition below trust threshold.',
  confidence: 0.64,
}))
expect('access condition below structural observed threshold stays context-only', weakAccess.operational === false)

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
