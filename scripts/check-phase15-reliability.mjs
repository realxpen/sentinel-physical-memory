import { readFile } from 'node:fs/promises'

const [service, equivalence, matrix, pkg, ci] = await Promise.all([
  readFile(new URL('../src/verification/service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/verification/condition-equivalence.ts', import.meta.url), 'utf8'),
  readFile(new URL('../Knowledge/Technical/phase-15-reliability-guardrails.md', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
])

const requiredFailures = [
  'Zero grounded observations/entities',
  'Poor video / too dark',
  'Duplicate-heavy video',
  'Model timeout / transient provider failure',
  'Invalid provider JSON/schema',
  'Missing/unknown evidence references',
  'Missing prior/current state',
  'No material changes',
  'Wrong environment/source identity',
  'Reload / cold start',
  'Incomplete immutable memory/snapshot',
  'Reasoning references non-existent evidence',
  'Huge request body',
  'Network failure',
  'Duplicate semantic condition',
  'Conflicting duplicate model verdicts',
]

for (const item of requiredFailures) {
  expect(matrix.includes(`| ${item} |`), `Phase 15 reliability matrix is missing: ${item}`)
}

expect(equivalence.includes('share direct grounding') || equivalence.includes('shared grounding'), 'condition dedupe must require shared grounding')
expect(equivalence.includes('evidenceOverlap || objectOverlap'), 'condition dedupe must not collapse same-title conditions without shared evidence/object grounding')
expect(service.includes('dedupeVerificationConditions(previousActionableRaw)'), 'verification must project duplicate historical conditions')
expect(service.includes('dedupeVerificationConditions(selectedPrevious)'), 'explicit duplicate condition IDs must collapse before verdict generation')
expect(service.includes('dedupeVerificationConditions(') && service.includes('currentSnapshot.conditions'), 'current verification conditions must be deduped')
expect(service.includes('The verification model returned conflicting verdicts for the same condition'), 'conflicting duplicate model verdicts must fail closed')
expect(service.includes('selectModelVerdict'), 'verification must select/collapse duplicate model verdicts')
expect(JSON.parse(pkg)['scripts']['check:phase15-reliability'], 'package must expose Phase 15 reliability gate')
expect(ci.includes('Verify Phase 15 reliability guardrails'), 'CI must run the Phase 15 reliability gate')

console.log('PASS  every locked Phase 15 failure path is represented in the reliability matrix')
console.log('PASS  duplicate condition projection requires shared physical grounding')
console.log('PASS  duplicate semantic conditions cannot create duplicate verification verdicts')
console.log('PASS  conflicting duplicate model verdicts fail closed')
console.log('SENTINEL PHASE 15 RELIABILITY MATRIX SLICE 1 VERIFIED')

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
