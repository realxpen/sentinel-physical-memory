import { normalizePerceptionEvidenceReferences } from '../src/ai/perception-normalization.ts'
import { groundPerceptionToTrustedFrames } from '../src/ai/trusted-evidence.ts'
import { PerceptionValidationError, validatePerception, validatePerceptionForScan } from '../src/ai/perception-schema.ts'

const environmentId = 'env-provider-boundary'
const sourceId = 'source-provider-boundary'
const capturedAt = '2026-09-15T13:00:00.000Z'

function expect(label, predicate) {
  if (!predicate) throw new Error(`FAIL  ${label}`)
  console.log(`PASS  ${label}`)
}

const messyProviderPayload = {
  sourceId,
  observations: {
    id: '',
    environmentId,
    sourceId,
    modality: 'frame',
    capturedAt: '',
    label: 'Cable visible across walkway',
    description: '',
    confidence: '0.93',
    basis: 'guessed',
    position: { description: '', x: 'NaN' },
    evidenceIds: 'evidence_0',
  },
  objects: [
    {
      id: 'object-desk',
      environmentId,
      category: 'desk',
      name: 'Desk',
      description: '',
      position: 'left side of workspace',
      boundingBox: ['1', '2.5', '30', '40'],
      confidence: '0.95',
      firstSeenAt: '',
      lastSeenAt: null,
      evidenceIds: ['evidence_0'],
    },
    {
      id: 'object-cable',
      environmentId,
      category: 'cable',
      name: 'Cable',
      confidence: '0.90',
      firstSeenAt: '',
      lastSeenAt: '',
      evidenceIds: 'frame-1',
    },
    {
      id: 'object-bad-confidence',
      environmentId,
      category: 'equipment',
      name: 'Bad confidence object',
      confidence: '95%',
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['evidence_0'],
    },
    {
      id: 'object-ungrounded',
      environmentId,
      category: 'equipment',
      name: 'Ungrounded object',
      confidence: 0.8,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['evidence_99'],
    },
    {
      id: 'object-desk',
      environmentId,
      category: 'desk',
      name: 'Duplicate desk',
      confidence: 0.7,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: ['evidence_0'],
    },
  ],
  conditions: {
    id: '',
    environmentId,
    kind: 'safety hazard',
    title: 'Cable across walkway',
    description: '',
    status: 'maybe',
    basis: 'observed',
    confidence: '0.90',
    objectIds: 'object-cable',
    evidenceIds: 'evidence-1',
    observedAt: '',
  },
  relations: [
    {
      id: '',
      environmentId,
      fromId: 'object-desk',
      toId: 'object-cable',
      type: 'located_near',
      confidence: '0.80',
      evidenceIds: 'evidence_0',
    },
    {
      id: 'relation-blank-endpoint',
      environmentId,
      fromId: '',
      toId: 'object-cable',
      type: 'near',
      confidence: 0.8,
      evidenceIds: ['evidence_0'],
    },
    {
      id: 'relation-unknown-type',
      environmentId,
      fromId: 'object-desk',
      toId: 'object-cable',
      type: 'faces_toward',
      confidence: 0.8,
      evidenceIds: ['evidence_0'],
    },
  ],
  evidence: {
    id: 'provider-frame-0',
    type: 'video_frame',
    sourceId,
    capturedAt: '',
    frameIndex: '0',
    timestampMs: '1250.5',
    boundingBox: { x: '1', y: '2', width: '30', height: '40', frameWidth: '960', frameHeight: '540' },
    confidence: '0.88',
    description: 'Provider frame zero',
  },
}

const normalized = normalizePerceptionEvidenceReferences(messyProviderPayload)
expect('singleton provider collections normalize to arrays', Array.isArray(normalized.value.observations) && Array.isArray(normalized.value.conditions) && Array.isArray(normalized.value.evidence))
expect('missing technical ids are generated', normalized.generatedIds >= 3)
expect('safe confidence strings normalize', normalized.normalizedConfidences >= 5)
expect('safe numeric metadata strings normalize', normalized.normalizedNumericFields >= 8)
expect('scalar evidence/object references normalize to arrays', normalized.normalizedArrays >= 4)
expect('unsupported/blank optional fields do not invalidate good items', normalized.normalizedOptionalFields >= 1)
expect('bad required-confidence item and duplicate object are dropped', normalized.droppedItems >= 2)
expect('unsupported and unanchored relations are dropped', normalized.droppedRelations >= 2)
expect('located_near normalizes to near', normalized.value.relations.length === 1 && normalized.value.relations[0].type === 'near')
expect('specific desk category normalizes to furniture', normalized.value.objects.find((item) => item.id === 'object-desk')?.category === 'furniture')
expect('specific cable category normalizes to electrical', normalized.value.objects.find((item) => item.id === 'object-cable')?.category === 'electrical')
expect('condition synonym normalizes to hazard', normalized.value.conditions[0].kind === 'hazard')
expect('invalid condition status falls back conservatively', normalized.value.conditions[0].status === 'present')
expect('provider frame type normalizes to frame', normalized.value.evidence[0].type === 'frame')
expect('frameIndex numeric string becomes integer', normalized.value.evidence[0].frameIndex === 0)
expect('timestamp numeric string becomes finite number', normalized.value.evidence[0].timestampMs === 1250.5)

const adapterValidated = validatePerception(normalized.value)
expect('canonical provider payload passes strict adapter schema', adapterValidated.objects.length === 3)

const trustedFrames = [
  { frameId: 'trusted-frame-0', timestampMs: 250, uri: 'data:image/jpeg;base64,AAA' },
  { frameId: 'trusted-frame-1', timestampMs: 1250, uri: 'data:image/jpeg;base64,BBB' },
]
const grounded = groundPerceptionToTrustedFrames(adapterValidated, trustedFrames, sourceId, capturedAt)

expect('trusted scan frames are added as authoritative evidence', grounded.addedEvidence === 2)
expect('missing provider frame placeholder resolves to actual supplied frame', grounded.result.objects.find((item) => item.id === 'object-cable')?.evidenceIds[0] === 'trusted-frame-1')
expect('condition evidence placeholder resolves to trusted frame', grounded.result.conditions[0].evidenceIds[0] === 'trusted-frame-1')
expect('out-of-range unknown evidence reference is removed', grounded.droppedUnknownEvidenceReferences >= 1)
expect('entity left without grounded evidence is dropped instead of killing scan', !grounded.result.objects.some((item) => item.id === 'object-ungrounded'))
expect('trusted capture time replaces provider temporal claims', grounded.result.objects.every((item) => item.firstSeenAt === capturedAt && item.lastSeenAt === capturedAt))

const scanValidated = validatePerceptionForScan(grounded.result, environmentId, sourceId)
expect('full messy provider payload becomes a valid grounded scan', scanValidated.objects.length === 2 && scanValidated.conditions.length === 1)
expect('valid spatial relation survives canonicalization and grounding', scanValidated.relations.length === 1 && scanValidated.relations[0].type === 'near')

const outOfRangeOnly = validatePerception(normalizePerceptionEvidenceReferences({
  sourceId,
  observations: [{
    id: 'obs-out-of-range', environmentId, sourceId, modality: 'video', capturedAt,
    label: 'Unsupported claim', description: 'Unsupported claim', confidence: 0.9,
    basis: 'observed', evidenceIds: ['evidence_99'],
  }],
  objects: [], conditions: [], relations: [], evidence: [],
}).value)
const outOfRangeGrounded = groundPerceptionToTrustedFrames(outOfRangeOnly, trustedFrames, sourceId, capturedAt)
expect('out-of-range placeholder is never fabricated', outOfRangeGrounded.result.observations.length === 0)

let emptyGroundedRejected = false
try {
  validatePerceptionForScan(outOfRangeGrounded.result, environmentId, sourceId)
} catch (error) {
  emptyGroundedRejected = error instanceof PerceptionValidationError
}
expect('scan with no grounded semantic entities still fails closed', emptyGroundedRejected)

console.log('SENTINEL PROVIDER BOUNDARY CANONICALIZATION VERIFIED')
