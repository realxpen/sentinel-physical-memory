const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const environmentId = process.env.SENTINEL_PHASE16_ENVIRONMENT_ID || 'env_warehouse_73266674'
const expectedCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

if (expectedCommit) await waitForDeployment(expectedCommit)

const health = await fetchJson('/api/health?phase16=' + Date.now())
expect(health.deploymentCommit === expectedCommit || !expectedCommit, 'production health must report the expected deployment commit')
expect(health.nebiusConfigured === true, 'production must report Nebius configured')
expect(health.aiRuntime?.provider === 'nebius-token-factory', 'production health must identify Nebius Token Factory')
expect(typeof health.aiRuntime?.reasoningModel === 'string' && /^nvidia\//i.test(health.aiRuntime.reasoningModel), 'production reasoning model must be an NVIDIA model')
expect(health.aiRuntime?.roles?.ask === health.aiRuntime.reasoningModel, 'Ask role must map to the configured reasoning model')
expect(health.aiRuntime?.roles?.actionPlan === health.aiRuntime.reasoningModel, 'Action Planner role must map to the configured reasoning model')

const answer = await postJson('/api/ask-building', {
  environmentId,
  question: 'What changed since the last scan?',
})

expect(answer.reasoningContract === 'phase10-grounded-v1', 'production Ask must retain the grounded reasoning contract')
expect(answer.persistence === 'neon', 'production Ask must reason over Neon-backed memory')
expect(Array.isArray(answer.inference) && answer.inference.length >= 1, 'production Ask must expose at least one inference trace')

const trace = answer.inference.find((item) => item.role === 'reasoning')
expect(trace, 'production Ask must expose a reasoning trace')
expect(trace.provider === 'nebius-token-factory', 'production reasoning trace must identify Nebius Token Factory')
expect(trace.model === health.aiRuntime.reasoningModel, 'production reasoning trace model must match health architecture')
expect(/^nvidia\//i.test(trace.model), 'production reasoning trace must identify an NVIDIA model')
expect(trace.outcome === 'success', 'production reasoning trace must be successful')
expect(Number.isFinite(trace.latencyMs) && trace.latencyMs >= 0, 'production reasoning trace must include latencyMs')
expect(trace.httpStatus === 200, 'production reasoning trace must include HTTP 200')

console.log('PASS  exact deployed main reports Nebius Token Factory as the AI runtime')
console.log('PASS  exact deployed main maps Ask + Action Plan to NVIDIA reasoning model ' + health.aiRuntime.reasoningModel)
console.log('PASS  real production Ask returned successful reasoning trace with latency=' + trace.latencyMs + 'ms')
console.log('SENTINEL PHASE 16 PRODUCTION NEBIUS NVIDIA TRACE VERIFIED')

async function fetchJson(path) {
  const response = await fetch(origin + path, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'sentinel-phase16-runtime-validator' },
  })
  const text = await response.text()
  if (!response.ok) throw new Error('GET ' + path + ' failed with ' + response.status + ': ' + text.slice(0, 500))
  return parseJson(text, 'GET ' + path)
}

async function postJson(path, body) {
  const response = await fetch(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'sentinel-phase16-runtime-validator' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error('POST ' + path + ' failed with ' + response.status + ': ' + text.slice(0, 500))
  return parseJson(text, 'POST ' + path)
}

function parseJson(text, label) {
  try { return JSON.parse(text) } catch { throw new Error(label + ' returned malformed JSON') }
}

async function waitForDeployment(commit) {
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    try {
      const health = await fetchJson('/api/health?phase16_wait=' + Date.now())
      if (health.deploymentCommit === commit) {
        console.log('Fresh production deployment detected for ' + commit)
        return
      }
      console.log('Waiting for production commit ' + commit + '; currently ' + (health.deploymentCommit || 'unknown'))
    } catch (error) {
      console.log('Production health not ready yet: ' + (error instanceof Error ? error.message : String(error)))
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error('Timed out waiting for production deployment ' + commit)
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
