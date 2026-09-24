const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const repoApi = 'https://api.github.com/repos/realxpen/sentinel-physical-memory'
const expectedCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

if (expectedCommit) await waitForDeployment(expectedCommit)

const [repo, health, home] = await Promise.all([
  fetchJson(repoApi),
  fetchJson(origin + '/api/health?phase17=' + Date.now()),
  fetchText(origin + '/'),
])

expect(repo.private === false && repo.visibility === 'public', 'judge repository must be public')
expect(repo.license?.spdx_id === 'MIT', 'GitHub must detect the MIT license')
expect(health.status === 'ok', 'production health must be OK')
expect(!expectedCommit || health.deploymentCommit === expectedCommit, 'production must run the exact Phase 17 main commit')
expect(health.persistenceConfigured === true, 'production persistence must be configured')
expect(health.nebiusConfigured === true, 'production Nebius inference must be configured')
expect(health.aiRuntime?.provider === 'nebius-token-factory', 'production must identify Nebius Token Factory')
expect(/^nvidia\//i.test(health.aiRuntime?.reasoningModel || ''), 'production reasoning path must identify an NVIDIA model')
expect(/<div id="root"><\/div>|id=["']root["']/i.test(home), 'working demo must return the application shell')

console.log('PASS  GitHub repository is public with detected MIT license')
console.log('PASS  working demo is publicly reachable without judge credentials')
console.log('PASS  exact production commit has Neon + Nebius configured')
console.log('PASS  production health exposes Nebius Token Factory + NVIDIA reasoning model')
console.log('SENTINEL PHASE 17 JUDGE READINESS VERIFIED')

async function waitForDeployment(commit) {
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    try {
      const health = await fetchJson(origin + '/api/health?phase17_wait=' + Date.now())
      if (health.deploymentCommit === commit) {
        console.log('Fresh production deployment detected for ' + commit)
        return
      }
      console.log('Waiting for production commit ' + commit + '; currently ' + (health.deploymentCommit || 'unknown'))
    } catch (error) {
      console.log('Production not ready yet: ' + (error instanceof Error ? error.message : String(error)))
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error('Timed out waiting for production deployment ' + commit)
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'sentinel-phase17-judge-readiness' },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(url + ' failed with ' + response.status + ': ' + text.slice(0, 400))
  try { return JSON.parse(text) } catch { throw new Error(url + ' returned malformed JSON') }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { Accept: 'text/html', 'Cache-Control': 'no-cache', 'User-Agent': 'sentinel-phase17-judge-readiness' },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(url + ' failed with ' + response.status)
  return text
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
