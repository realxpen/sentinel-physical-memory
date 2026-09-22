const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const environmentId = process.env.SENTINEL_PHASE12_ENVIRONMENT_ID || 'env_warehouse_73266674'
const expectedCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

if (expectedCommit) await waitForDeployment(expectedCommit)

const memoryResponse = await fetch(origin + '/api/memory?environmentId=' + encodeURIComponent(environmentId), {
  headers: { Accept: 'application/json', 'User-Agent': 'sentinel-phase12-production-smoke' },
})
const memoryText = await memoryResponse.text()
if (!memoryResponse.ok) throw new Error('Unable to load production memory: ' + memoryText.slice(0, 600))
const memoryPayload = JSON.parse(memoryText)
const memory = memoryPayload.memory
expect(memoryPayload.persistence === 'neon', 'production verification fixture must be Neon-backed')
expect(memory, 'production verification fixture memory is missing')

const previous = memory.states.find((item) => item.version === 2)
const current = memory.states.find((item) => item.version === 3)
expect(previous && current, 'warehouse fixture must contain State v2 and State v3')
const previousSnapshot = memory.snapshots.find((item) => item.stateId === previous.id)
const currentSnapshot = memory.snapshots.find((item) => item.stateId === current.id)
expect(previousSnapshot && currentSnapshot, 'warehouse fixture immutable snapshots are missing')

const accessCondition = previousSnapshot.conditions.find((item) => item.kind === 'access' && item.status === 'present')
expect(accessCondition, 'warehouse State v2 must contain the grounded access condition')

const response = await fetch(origin + '/api/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'sentinel-phase12-production-smoke',
  },
  body: JSON.stringify({
    environmentId,
    previousStateId: previous.id,
    currentStateId: current.id,
    actionPlanId: 'production-proof-plan',
    conditionIds: [accessCondition.id],
  }),
})
const text = await response.text()
if (!response.ok) throw new Error('Production verification failed (' + response.status + '): ' + text.slice(0, 800))
const payload = JSON.parse(text)

console.log('VERIFICATION_RESPONSE', JSON.stringify({
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
  })),
}))

expect(payload.verificationContract === 'phase12-verification-v1', 'production must expose the Phase 12 verification contract')
expect(payload.persistence === 'neon', 'production verification must use Neon-backed memory')
expect(payload.previousStateId === previous.id, 'verification must remain pinned to immutable State v2 as baseline')
expect(payload.currentStateId === current.id, 'verification must compare against immutable State v3')
expect(payload.status === 'failed', 'real warehouse v2→v3 must not be falsely marked resolved while obstruction geometry remains grounded')
expect(payload.resolvedConditionIds.length === 0, 'real unresolved access condition must not enter resolvedConditionIds')
expect(payload.remainingConditionIds.includes(accessCondition.id), 'real access condition must remain tied to the baseline condition ID')
expect(payload.verdicts.some((item) => item.conditionId === accessCondition.id && item.status === 'remaining'), 'baseline access condition must receive a remaining verdict')
expect(payload.verdicts.every((item) => item.evidenceIds.length > 0), 'definitive production verdicts must cite current evidence')
expect(/not resolved/i.test(payload.summary), 'production summary must communicate that the condition is not resolved')

const currentEvidence = new Set(
  memory.evidence
    .filter((item) => current.sourceIds.includes(item.sourceId))
    .map((item) => item.id),
)
const remainingVerdict = payload.verdicts.find((item) => item.conditionId === accessCondition.id)
expect(remainingVerdict.evidenceIds.some((id) => currentEvidence.has(id)), 'remaining verdict must cite State v3 evidence, not only historical evidence')

console.log('PASS  real Warehouse State v2→v3 does not confuse issue disappearance with resolution')
console.log('PASS  continued obstruction geometry is backed by State v3 evidence')
console.log('PASS  baseline condition identity remains stable in the verification result')
console.log('PASS  production returns failed rather than a false Verified state')
console.log('SENTINEL PHASE 12 PRODUCTION VERIFICATION VERIFIED')

async function waitForDeployment(commit) {
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    try {
      const response = await fetch(origin + '/api/health', {
        headers: { Accept: 'application/json', 'User-Agent': 'sentinel-phase12-production-smoke' },
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
