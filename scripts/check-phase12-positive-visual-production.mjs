const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const environmentId = process.env.SENTINEL_PHASE12_POSITIVE_ENVIRONMENT_ID || 'env_phase-12-verification-test-4_53870785'
const expectedCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

if (expectedCommit) await waitForDeployment(expectedCommit)

const memoryResponse = await fetch(origin + '/api/memory?environmentId=' + encodeURIComponent(environmentId), {
  headers: { Accept: 'application/json', 'User-Agent': 'sentinel-phase12-positive-visual-smoke' },
})
const memoryText = await memoryResponse.text()
if (!memoryResponse.ok) throw new Error('Unable to load positive verification memory: ' + memoryText.slice(0, 600))
const memoryPayload = JSON.parse(memoryText)
const memory = memoryPayload.memory
expect(memoryPayload.persistence === 'neon', 'positive verification fixture must be Neon-backed')
expect(memory, 'positive verification fixture memory is missing')

const previous = memory.states.find((item) => item.version === 1)
const current = memory.states.find((item) => item.version === 2)
expect(previous && current, 'Test 4 must contain State v1 and State v2')

const previousSnapshot = memory.snapshots.find((item) => item.stateId === previous.id)
const currentSnapshot = memory.snapshots.find((item) => item.stateId === current.id)
expect(previousSnapshot && currentSnapshot, 'Test 4 immutable snapshots are missing')

const accessCondition = previousSnapshot.conditions.find((item) =>
  item.kind === 'access' &&
  item.status === 'present' &&
  /doorway access obstructed/i.test(item.title)
)
expect(accessCondition, 'Test 4 State v1 must contain the grounded doorway access condition')
expect(currentSnapshot.conditions.filter((item) => item.kind !== 'normal').length === 0, 'Test 4 State v2 should contain no current non-normal condition')

const baselineDoorId = accessCondition.objectIds.find((id) =>
  previousSnapshot.objects.some((item) => item.id === id && item.category === 'door')
)
expect(baselineDoorId, 'Test 4 access condition must reference a durable door')
expect(currentSnapshot.objects.some((item) => item.id === baselineDoorId), 'the same durable door must be re-observed in State v2')

const response = await fetch(origin + '/api/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'sentinel-phase12-positive-visual-smoke',
  },
  body: JSON.stringify({
    environmentId,
    previousStateId: previous.id,
    currentStateId: current.id,
    actionPlanId: 'phase12-test4-positive-proof',
    conditionIds: [accessCondition.id],
  }),
})
const text = await response.text()
if (!response.ok) throw new Error('Positive production verification failed (' + response.status + '): ' + text.slice(0, 800))
const payload = JSON.parse(text)

console.log('POSITIVE_VERIFICATION_RESPONSE', JSON.stringify({
  verificationContract: payload.verificationContract ?? null,
  persistence: payload.persistence ?? null,
  previousStateId: payload.previousStateId ?? null,
  currentStateId: payload.currentStateId ?? null,
  status: payload.status ?? null,
  resolved: payload.resolvedConditionIds?.length ?? 0,
  remaining: payload.remainingConditionIds?.length ?? 0,
  inconclusive: payload.inconclusiveConditionIds?.length ?? 0,
  newConditions: payload.newConditionIds?.length ?? 0,
  evidenceCount: payload.evidenceIds?.length ?? 0,
  verdicts: (payload.verdicts || []).map((item) => ({
    conditionId: item.conditionId,
    status: item.status,
    confidence: item.confidence,
    evidenceCount: item.evidenceIds?.length ?? 0,
    relatedObjectIds: item.relatedObjectIds ?? [],
  })),
}))

expect(payload.verificationContract === 'phase12-visual-verification-v2', 'production must expose the visual verification v2 contract')
expect(payload.persistence === 'neon', 'positive production verification must use Neon-backed memory')
expect(payload.previousStateId === previous.id, 'positive proof must remain pinned to immutable State v1')
expect(payload.currentStateId === current.id, 'positive proof must compare against immutable State v2')
expect(payload.status === 'passed', 'Test 4 visual verification must pass when the same doorway is visibly clear')
expect(payload.resolvedConditionIds.includes(accessCondition.id), 'baseline doorway access condition must be resolved')
expect(payload.remainingConditionIds.length === 0, 'positive proof must have no remaining target condition')
expect(payload.inconclusiveConditionIds.length === 0, 'positive proof must have no inconclusive target condition')
expect(payload.newConditionIds.length === 0, 'positive proof must have no new non-normal condition')

const verdict = payload.verdicts.find((item) => item.conditionId === accessCondition.id)
expect(verdict?.status === 'resolved', 'baseline doorway condition must receive a resolved verdict')
expect(verdict.confidence >= 0.75, 'resolved visual verdict must meet the Phase 12 confidence floor')
expect(verdict.evidenceIds.length > 0, 'resolved visual verdict must cite current-state evidence')
expect(verdict.relatedObjectIds.includes(baselineDoorId), 'resolved visual verdict must anchor to the same durable door')

const currentEvidence = new Set(
  memory.evidence
    .filter((item) => current.sourceIds.includes(item.sourceId))
    .map((item) => item.id),
)
expect(verdict.evidenceIds.some((id) => currentEvidence.has(id)), 'resolved verdict must cite State v2 evidence')

console.log('PASS  same durable doorway is re-observed in Test 4 State v2')
console.log('PASS  current rescan image positively verifies the doorway is clear')
console.log('PASS  baseline access condition resolves without treating absence alone as proof')
console.log('PASS  Test 4 returns passed from current visual evidence')
console.log('SENTINEL PHASE 12 POSITIVE VISUAL VERIFICATION VERIFIED')

async function waitForDeployment(commit) {
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    try {
      const response = await fetch(origin + '/api/health', {
        headers: { Accept: 'application/json', 'User-Agent': 'sentinel-phase12-positive-visual-smoke' },
      })
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

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
