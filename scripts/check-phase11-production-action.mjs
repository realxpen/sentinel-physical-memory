const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const environmentId = process.env.SENTINEL_PHASE11_ENVIRONMENT_ID || 'env_warehouse_73266674'
const stateId = process.env.SENTINEL_PHASE11_STATE_ID || 'state_9eef338f-2f7c-49f8-ac54-c8901f678d04'
const expectedCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

if (expectedCommit) await waitForDeployment(expectedCommit)

const payload = await requestPlanWithRetry()

console.log('ACTION_PLAN_RESPONSE', JSON.stringify({
  actionContract: payload.actionContract ?? null,
  persistence: payload.persistence ?? null,
  stateId: payload.plan?.stateId ?? null,
  stateVersion: payload.grounding?.state?.version ?? null,
  isCurrent: payload.grounding?.state?.isCurrent ?? null,
  stepCount: payload.plan?.steps?.length ?? 0,
  evidenceCount: payload.plan?.evidenceIds?.length ?? 0,
  conditionCount: payload.grounding?.conditions?.length ?? 0,
  issueCount: payload.grounding?.issues?.length ?? 0,
  objectCount: payload.grounding?.objects?.length ?? 0,
}))

expect(payload.actionContract === 'phase11-action-plan-v1', 'production must expose Phase 11 action contract')
expect(payload.persistence === 'neon', 'production action plan must use Neon-backed environmental memory')
expect(payload.plan?.stateId === stateId, 'production plan must stay pinned to the requested immutable state')
expect(payload.grounding?.state?.id === stateId, 'grounding state must match plan state')
expect(payload.grounding?.state?.version === 2, 'real warehouse Phase 11 proof must use immutable State v2')
expect(payload.grounding?.state?.isCurrent === false, 'State v2 proof must remain historical, not silently become current')
expect(Array.isArray(payload.plan?.steps) && payload.plan.steps.length >= 2 && payload.plan.steps.length <= 6, 'plan must contain bounded corrective steps plus verification handoff')
expect(payload.plan.steps.every((step) => step.status === 'recommended'), 'Phase 11 must never claim execution/verification')
expect(payload.plan.steps.at(-1)?.title === 'Rescan to verify', 'final step must be deterministic verification handoff')
expect(payload.plan.steps.every((step) => Array.isArray(step.evidenceIds) && step.evidenceIds.length > 0), 'every plan step must remain evidence-backed')
expect(payload.plan.steps.slice(0,-1).every((step) => step.relatedConditionIds.length > 0 || step.relatedIssueIds.length > 0), 'every corrective step must cite a grounded condition or issue')
expect(payload.plan.steps.slice(0,-1).every((step) => step.priority === 'medium' || step.priority === 'low'), 'real inferred access/medium issue must never escalate to high/critical action priority')
expect(payload.grounding.conditions.length > 0, 'real historical state must provide grounded condition context')
expect(payload.grounding.issues.length > 0, 'real historical state must provide grounded issue context')

const conditionIds = new Set(payload.grounding.conditions.map((item) => item.id))
const issueIds = new Set(payload.grounding.issues.map((item) => item.id))
const objectIds = new Set(payload.grounding.objects.map((item) => item.id))
const evidenceIds = new Set(payload.grounding.evidence.map((item) => item.id))
for (const step of payload.plan.steps) {
  expect(step.relatedConditionIds.every((id) => conditionIds.has(id)), 'step condition IDs must exist in server grounding')
  expect(step.relatedIssueIds.every((id) => issueIds.has(id)), 'step issue IDs must exist in server grounding')
  expect(step.relatedObjectIds.every((id) => objectIds.has(id)), 'step object IDs must exist in server grounding')
  expect(step.evidenceIds.every((id) => evidenceIds.has(id)), 'step evidence IDs must exist in server grounding')
  expect(!('estimatedCost' in step), 'Phase 11 production plan must not invent costs')
}

console.log('PASS  real historical warehouse State v2 generated a grounded recommended action plan')
console.log('PASS  all action IDs resolve inside the server-owned grounding envelope')
console.log('PASS  priority remains bounded by inferred-access / medium-issue authority')
console.log('PASS  final step hands off to rescan without claiming resolution')
console.log('SENTINEL PHASE 11 PRODUCTION ACTION PLANNER VERIFIED')

async function requestPlanWithRetry() {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(origin + '/api/action-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'sentinel-phase11-production-smoke',
      },
      body: JSON.stringify({
        environmentId,
        stateId,
        goal: 'Create a safe action plan for the grounded emergency exit obstruction in this remembered state.',
      }),
    })
    const text = await response.text()
    if (response.ok) return JSON.parse(text)
    lastError = new Error('Production action plan failed (' + response.status + '): ' + text.slice(0, 600))
    if (attempt < 2 && [502,503,504].includes(response.status)) {
      console.log('Retrying transient production action-plan provider failure after HTTP ' + response.status)
      await delay(1500)
      continue
    }
    throw lastError
  }
  throw lastError
}

async function waitForDeployment(commit) {
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    try {
      const response = await fetch(origin + '/api/health', { headers: { Accept:'application/json', 'User-Agent':'sentinel-phase11-production-smoke' } })
      const health = await response.json()
      if (response.ok && health.deploymentCommit === commit) {
        console.log('Fresh production deployment detected for ' + commit)
        return
      }
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
