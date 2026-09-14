import {
  assessVideoCandidates,
  VideoIngestionError,
} from '../src/scan/video-ingestion.ts'

const SIGNATURE_SIZE = 32 * 18
const DURATION_MS = 45_000

function frame(index, brightness, tone) {
  const signature = new Uint8Array(SIGNATURE_SIZE)
  signature.fill(Math.max(0, Math.min(255, tone)))
  return {
    timestampMs: Math.round((index / 23) * (DURATION_MS - 500)),
    brightness,
    signature,
  }
}

function expectVideoError(label, candidates, expectedCode) {
  try {
    assessVideoCandidates(candidates, DURATION_MS)
  } catch (error) {
    if (error instanceof VideoIngestionError && error.code === expectedCode) {
      console.log(`PASS  ${label}: ${expectedCode}`)
      return
    }
    throw new Error(`${label} returned the wrong failure: ${error instanceof Error ? error.message : String(error)}`)
  }
  throw new Error(`${label} did not fail with ${expectedCode}`)
}

const dark = Array.from({ length: 24 }, (_, index) => frame(index, 0.04, 30 + index * 4))
expectVideoError('dark walkthrough fails closed', dark, 'LOW_LIGHT_VIDEO')

const duplicateHeavy = Array.from({ length: 24 }, (_, index) => frame(index, 0.62, 150))
expectVideoError('duplicate-heavy walkthrough fails closed', duplicateHeavy, 'INSUFFICIENT_VISUAL_VARIETY')

const tooFew = Array.from({ length: 3 }, (_, index) => frame(index, 0.62, 80 + index * 30))
expectVideoError('too-few candidates fail closed', tooFew, 'INSUFFICIENT_VIDEO_EVIDENCE')

const mixed = Array.from({ length: 24 }, (_, index) => {
  if (index < 6) return frame(index, 0.06, 20 + index * 3)
  return frame(index, 0.58, 45 + (index - 6) * 9)
})
const mixedAssessment = assessVideoCandidates(mixed, DURATION_MS)
if (mixedAssessment.lowLightFramesRejected !== 6) {
  throw new Error(`mixed walkthrough expected 6 low-light exclusions, received ${mixedAssessment.lowLightFramesRejected}`)
}
if (mixedAssessment.selected.length < 8 || mixedAssessment.selected.length > 12) {
  throw new Error(`mixed walkthrough selected ${mixedAssessment.selected.length} frames; expected 8-12`)
}
console.log(`PASS  mixed walkthrough excludes dark evidence and keeps ${mixedAssessment.selected.length} useful frames`)

const healthy = Array.from({ length: 24 }, (_, index) => frame(index, 0.65, 35 + index * 9))
const healthyAssessment = assessVideoCandidates(healthy, DURATION_MS)
if (healthyAssessment.selected.length < 8 || healthyAssessment.selected.length > 12) {
  throw new Error(`healthy walkthrough selected ${healthyAssessment.selected.length} frames; expected 8-12`)
}
if (healthyAssessment.averageBrightness < 0.6) {
  throw new Error(`healthy walkthrough brightness unexpectedly low: ${healthyAssessment.averageBrightness}`)
}
console.log(`PASS  healthy walkthrough keeps ${healthyAssessment.selected.length} evidence frames`)

console.log('PHASE 4 POOR-INPUT QUALITY GATE VERIFIED')
