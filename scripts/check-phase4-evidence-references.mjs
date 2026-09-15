import { normalizePerceptionEvidenceReferences } from '../src/ai/perception-normalization.ts'

function normalize(value) {
  return normalizePerceptionEvidenceReferences(value)
}

function evidenceIds(result, collection, index = 0) {
  return result.value[collection][index].evidenceIds
}

const relation = (type, evidenceIdsValue, suffix = 'a') => ({
  id: `rel-${suffix}`,
  fromId: `obj-from-${suffix}`,
  toId: `obj-to-${suffix}`,
  type,
  evidenceIds: evidenceIdsValue,
})

const byFrameIndex = normalize({
  evidence: [
    { id: 'frame-proof-a', frameIndex: 0 },
    { id: 'frame-proof-b', frameIndex: 1 },
  ],
  observations: [{ evidenceIds: ['evidence_1'] }],
  objects: [{ evidenceIds: ['evidence_0', 'frame-proof-b'] }],
  relations: [relation('near', ['evidence:1'])],
})
if (byFrameIndex.remappedReferences !== 3) throw new Error(`expected 3 frame-index remaps, got ${byFrameIndex.remappedReferences}`)
if (evidenceIds(byFrameIndex, 'observations')[0] !== 'frame-proof-b') throw new Error('observation frame-index reference was not remapped')
if (evidenceIds(byFrameIndex, 'objects')[0] !== 'frame-proof-a') throw new Error('object frame-index reference was not remapped')
if (evidenceIds(byFrameIndex, 'objects')[1] !== 'frame-proof-b') throw new Error('exact evidence id should remain unchanged')
if (evidenceIds(byFrameIndex, 'relations')[0] !== 'frame-proof-b') throw new Error('relation frame-index reference was not remapped')
console.log('PASS  deterministic frameIndex evidence references remap to existing evidence ids')

const byArrayIndex = normalize({
  evidence: [
    { id: 'proof-zero' },
    { id: 'proof-one' },
  ],
  observations: [{ evidenceIds: ['evidence-1'] }],
  objects: [],
  relations: [],
})
if (byArrayIndex.remappedReferences !== 1) throw new Error(`expected 1 array-index remap, got ${byArrayIndex.remappedReferences}`)
if (evidenceIds(byArrayIndex, 'observations')[0] !== 'proof-one') throw new Error('array-index evidence reference was not remapped')
console.log('PASS  unambiguous evidence array index fallback remaps an existing item')

const scalar = normalize({
  evidence: [{ id: 'proof-zero', frameIndex: 0 }],
  observations: [],
  objects: [{ evidenceIds: 'proof-zero' }],
  conditions: [{ evidenceIds: 'evidence_0' }],
  relations: [],
})
if (!Array.isArray(evidenceIds(scalar, 'objects'))) throw new Error('scalar object evidenceIds was not normalized to an array')
if (evidenceIds(scalar, 'objects')[0] !== 'proof-zero') throw new Error('scalar exact object evidence id changed unexpectedly')
if (!Array.isArray(evidenceIds(scalar, 'conditions'))) throw new Error('scalar condition evidenceIds was not normalized to an array')
if (evidenceIds(scalar, 'conditions')[0] !== 'proof-zero') throw new Error('scalar condition placeholder did not resolve to existing evidence')
console.log('PASS  single-string evidenceIds normalize to one-item arrays without inventing evidence')

const confidenceStrings = normalize({
  evidence: [{ id: 'proof-zero', confidence: ' 0.88 ' }],
  observations: [{ evidenceIds: ['proof-zero'], confidence: '0.93' }],
  objects: [{ evidenceIds: ['proof-zero'], confidence: '1' }],
  conditions: [{ evidenceIds: ['proof-zero'], confidence: '0.70' }],
  relations: [{ ...relation('near', ['proof-zero']), confidence: '0' }],
})
if (confidenceStrings.normalizedConfidences !== 5) throw new Error(`expected 5 confidence normalizations, got ${confidenceStrings.normalizedConfidences}`)
if (confidenceStrings.value.observations[0].confidence !== 0.93) throw new Error('observation confidence string was not normalized')
if (confidenceStrings.value.objects[0].confidence !== 1) throw new Error('object confidence string was not normalized')
if (confidenceStrings.value.conditions[0].confidence !== 0.7) throw new Error('condition confidence string was not normalized')
if (confidenceStrings.value.relations[0].confidence !== 0) throw new Error('relation confidence string was not normalized')
if (confidenceStrings.value.evidence[0].confidence !== 0.88) throw new Error('evidence confidence string was not normalized')
console.log('PASS  valid decimal confidence strings normalize to finite numbers in [0,1]')

const unsafeConfidence = normalize({
  evidence: [],
  observations: [],
  objects: [
    { evidenceIds: [], confidence: '93%' },
    { evidenceIds: [], confidence: 'high' },
    { evidenceIds: [], confidence: null },
    { evidenceIds: [], confidence: 1.4 },
  ],
  conditions: [],
  relations: [],
})
if (unsafeConfidence.normalizedConfidences !== 0) throw new Error('unsafe confidence values must not be normalized')
if (unsafeConfidence.value.objects[0].confidence !== '93%') throw new Error('percentage confidence must remain invalid')
if (unsafeConfidence.value.objects[1].confidence !== 'high') throw new Error('label confidence must remain invalid')
if (unsafeConfidence.value.objects[2].confidence !== null) throw new Error('null required confidence must remain invalid')
if (unsafeConfidence.value.objects[3].confidence !== 1.4) throw new Error('out-of-range numeric confidence must remain invalid')
console.log('PASS  unsafe confidence shapes remain invalid for strict validation')

const relationAliases = normalize({
  evidence: [{ id: 'proof-zero' }],
  observations: [],
  objects: [],
  conditions: [],
  relations: [
    relation('inside', ['proof-zero'], '1'),
    relation('next to', ['proof-zero'], '2'),
    relation('mounted-on', ['proof-zero'], '3'),
    relation('on top of', ['proof-zero'], '4'),
    relation('front of', ['proof-zero'], '5'),
    relation('left of', ['proof-zero'], '6'),
    relation('located_near', ['proof-zero'], '7'),
  ],
})
const expectedRelationTypes = ['located_in', 'adjacent_to', 'attached_to', 'on', 'in_front_of', 'left_of', 'near']
if (relationAliases.normalizedRelations !== expectedRelationTypes.length) throw new Error(`expected ${expectedRelationTypes.length} relation normalizations, got ${relationAliases.normalizedRelations}`)
for (let index = 0; index < expectedRelationTypes.length; index += 1) {
  if (relationAliases.value.relations[index].type !== expectedRelationTypes[index]) throw new Error(`relation alias ${index} did not normalize safely`)
}
console.log('PASS  unambiguous provider relation aliases normalize to canonical spatial relations')

const unknownRelation = normalize({
  evidence: [{ id: 'proof-zero' }],
  observations: [],
  objects: [],
  conditions: [],
  relations: [relation('faces_toward', ['proof-zero'])],
})
if (unknownRelation.normalizedRelations !== 0) throw new Error('unknown relation semantics must not be rewritten')
if (unknownRelation.value.relations[0].type !== 'faces_toward') throw new Error('unknown relation semantic changed unexpectedly')
console.log('PASS  unknown relation semantics remain invalid for strict validation')

const unanchoredRelations = normalize({
  evidence: [{ id: 'proof-zero' }],
  observations: [],
  objects: [],
  conditions: [],
  relations: [
    relation('near', ['proof-zero'], 'valid'),
    { id: 'rel-blank-from', fromId: '', toId: 'obj-b', type: 'near', evidenceIds: ['proof-zero'] },
    { id: 'rel-missing-from', toId: 'obj-b', type: 'near', evidenceIds: ['proof-zero'] },
    { id: 'rel-blank-to', fromId: 'obj-a', toId: '   ', type: 'near', evidenceIds: ['proof-zero'] },
  ],
})
if (unanchoredRelations.droppedRelations !== 3) throw new Error(`expected 3 unanchored relations to be dropped, got ${unanchoredRelations.droppedRelations}`)
if (unanchoredRelations.value.relations.length !== 1) throw new Error('unanchored relations should be discarded without losing valid relations')
if (unanchoredRelations.value.relations[0].id !== 'rel-valid') throw new Error('valid anchored relation was not preserved')
console.log('PASS  blank or missing relation endpoints are dropped instead of guessed')

const unknown = normalize({
  evidence: [{ id: 'proof-zero', frameIndex: 0 }],
  observations: [{ evidenceIds: ['evidence_9', 'semantic-label'] }],
  objects: [],
  relations: [],
})
if (unknown.remappedReferences !== 0) throw new Error('unknown references must not be rewritten')
if (evidenceIds(unknown, 'observations')[0] !== 'evidence_9') throw new Error('unknown numeric reference must remain for strict validation')
if (evidenceIds(unknown, 'observations')[1] !== 'semantic-label') throw new Error('non-placeholder evidence reference must remain unchanged')
console.log('PASS  unknown evidence references fail closed instead of inventing evidence')

const invalidShape = normalize({
  evidence: [{ id: 'proof-zero', frameIndex: 0 }],
  observations: [],
  objects: [{ evidenceIds: 42 }],
  relations: [],
})
if (evidenceIds(invalidShape, 'objects') !== 42) throw new Error('non-string scalar evidenceIds must remain invalid for strict validation')
console.log('PASS  non-string evidenceIds remain invalid and fail closed downstream')

const ambiguous = normalize({
  evidence: [
    { id: 'proof-a', frameIndex: 2 },
    { id: 'proof-b', frameIndex: 2 },
    { id: 'proof-c', frameIndex: 3 },
  ],
  observations: [{ evidenceIds: ['evidence_2'] }],
  objects: [],
  relations: [],
})
if (ambiguous.remappedReferences !== 0) throw new Error('ambiguous frame-index references must not be rewritten')
if (evidenceIds(ambiguous, 'observations')[0] !== 'evidence_2') throw new Error('ambiguous evidence reference must remain for strict validation')
console.log('PASS  ambiguous evidence references fail closed')

console.log('PHASE 4 EVIDENCE-REFERENCE REGRESSION GATE VERIFIED')
