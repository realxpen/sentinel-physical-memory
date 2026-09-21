const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const environmentId = process.env.SENTINEL_PHASE10_ENVIRONMENT_ID || 'env_warehouse_73266674'
const expectedCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

const questions = [
  ['What needs my attention?', 'attention'],
  ['Where is the electrical panel?', 'location'],
  ['What did you see near the server room?', 'nearby'],
  ['What changed since the last scan?', 'change'],
  ['Which change matters most?', 'priority'],
  ['What should I do?', 'action'],
  ['Has it been resolved?', 'resolution'],
]

if (expectedCommit) await waitForDeployment(expectedCommit)

for (const [question, expectedIntent] of questions) {
  const payload = await askWithRetry(question)
  expect(payload.persistence === 'neon', 'production Ask must reason over Neon-backed memory')
  expect(typeof payload.answer === 'string' && payload.answer.trim().length > 0, 'production Ask must return a non-empty conclusion')
  expect(Number.isFinite(payload.confidence) && payload.confidence >= 0 && payload.confidence <= 1, 'production Ask confidence must be bounded')
  expect(payload.grounding?.intent === expectedIntent, `Expected ${expectedIntent} intent for "${question}"`)
  expect(payload.grounding?.state?.id === payload.stateId, 'grounding state must match answer state')
  expect(Array.isArray(payload.grounding?.historyStateIds) && payload.grounding.historyStateIds.length >= 3, 'production Ask must receive real multi-state history')
  const evidenceRefs = new Set((payload.grounding?.evidence || []).map((item) => item.id))
  const objectRefs = new Set((payload.grounding?.objects || []).map((item) => item.id))
  const issueRefs = new Set((payload.grounding?.issues || []).map((item) => item.id))
  expect((payload.evidenceIds || []).every((id) => evidenceRefs.has(id)), 'returned evidence IDs must be represented in grounding')
  expect((payload.relatedObjectIds || []).every((id) => objectRefs.has(id)), 'returned object IDs must be represented in grounding')
  expect((payload.relatedIssueIds || []).every((id) => issueRefs.has(id)), 'returned issue IDs must be represented in grounding')
  if ((payload.evidenceIds || []).length === 0) expect(payload.confidence <= 0.35, 'no-evidence production answer must remain low confidence')
  console.log(`PASS  ${expectedIntent.padEnd(10)} confidence=${Math.round(payload.confidence * 100)} evidence=${payload.evidenceIds.length} objects=${payload.relatedObjectIds.length} issues=${payload.relatedIssueIds.length}`)
}

console.log('SENTINEL PHASE 10 PRODUCTION ASK THE BUILDING VERIFIED')

async function askWithRetry(question) {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(origin + '/api/ask-building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'sentinel-phase10-production-smoke' },
        body: JSON.stringify({ environmentId, question }),
      })
      const text = await response.text()
      if (!response.ok) {
        const error = new Error(`Ask failed (${response.status}): ${text.slice(0, 500)}`)
        if (attempt < 2 && [429, 502, 503, 504].includes(response.status)) { lastError = error; await delay(1500); continue }
        throw error
      }
      return JSON.parse(text)
    } catch (error) {
      lastError = error
      if (attempt < 2) { await delay(1500); continue }
    }
  }
  throw lastError
}

async function waitForDeployment(commit) {
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    try {
      const response = await fetch(origin + '/api/health', { headers: { Accept: 'application/json', 'User-Agent': 'sentinel-phase10-production-smoke' } })
      const health = await response.json()
      if (response.ok && health.deploymentCommit === commit) { console.log('Fresh production deployment detected for ' + commit); return }
      console.log('Waiting for production commit ' + commit + '; currently ' + (health.deploymentCommit || 'unknown'))
    } catch (error) {
      console.log('Production health not ready yet: ' + (error instanceof Error ? error.message : String(error)))
    }
    await delay(5000)
  }
  throw new Error('Timed out waiting for production deployment ' + commit)
}
function expect(condition, message) { if (!condition) throw new Error(message) }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
