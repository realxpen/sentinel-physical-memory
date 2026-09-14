import { normalizePerceptionEvidenceReferences } from '../src/ai/perception-normalization.ts'

function normalize(value) {
  return normalizePerceptionEvidenceReferences(value)
}

function evidenceIds(result, collection, index = 0) {
  return result.value[collection][index].evidenceIds
}

const byFrameIndex = normalize({
  evidence: [
    { id: 'frame-proof-a', frameIndex: 0 },
    { id: 'frame-proof-b', frameIndex: 1 },
  ],
  observations: [{ evidenceIds: ['evidence_1'] }],
  objects: [{ evidenceIds: ['evidence_0', 'frame-proof-b'] }],
  relations: [{ evidenceIds: ['evidence:1'] }],
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
