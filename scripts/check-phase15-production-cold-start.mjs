import { createHash } from 'node:crypto'

const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const environmentId = process.env.SENTINEL_PHASE15_COLD_START_ENVIRONMENT_ID || 'env_warehouse_73266674'
const expectedCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

if (expectedCommit) await waitForDeployment(expectedCommit)

const first = await fetchBundle('first')
await delay(1500)
const second = await fetchBundle('second')

expect(first.memory.persistence === 'neon', 'first memory read must report Neon persistence')
expect(second.memory.persistence === 'neon', 'second memory read must report Neon persistence')
expect(first.states.persistence === 'neon', 'first state-history read must report Neon persistence')
expect(second.states.persistence === 'neon', 'second state-history read must report Neon persistence')

const firstEnv = first.memory.memory?.environment
const secondEnv = second.memory.memory?.environment
expect(firstEnv?.id === environmentId, 'first cold-start read must restore the requested environment')
expect(secondEnv?.id === environmentId, 'second cold-start read must restore the requested environment')
expect(Boolean(firstEnv?.currentStateId), 'restored memory must expose a current state')
expect(firstEnv?.currentStateId === secondEnv?.currentStateId, 'current state must remain stable across independent reads')
expect(first.states.currentStateId === firstEnv?.currentStateId, 'memory and history APIs must agree on current state')
expect(second.states.currentStateId === secondEnv?.currentStateId, 'second memory/history reads must agree on current state')
expect(Array.isArray(first.states.states) && first.states.states.length >= 2, 'cold-start fixture must retain multi-state history')
expect(first.states.states.length === second.states.states.length, 'independent reload reads must preserve state count')

const firstFingerprint = fingerprint(first)
const secondFingerprint = fingerprint(second)
expect(firstFingerprint === secondFingerprint, 'read-only cold-start/reload checks must return stable persisted memory')

console.log('PASS  production reload restores Neon-authoritative memory without browser-carried state')
console.log('PASS  independent memory/history reads agree on current immutable state')
console.log('PASS  reload/cold-start fingerprint stable: ' + firstFingerprint)
console.log('SENTINEL PHASE 15 PRODUCTION COLD-START / RELOAD VERIFIED')

async function fetchBundle(label) {
  const cacheBust = Date.now() + '-' + label
  const [memory, states] = await Promise.all([
    fetchJson('/api/memory?environmentId=' + encodeURIComponent(environmentId) + '&phase15=' + cacheBust),
    fetchJson('/api/states?environmentId=' + encodeURIComponent(environmentId) + '&phase15=' + cacheBust),
  ])
  return { memory, states }
}

async function fetchJson(path) {
  const response = await fetch(origin + path, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': 'sentinel-phase15-cold-start-validator',
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error('GET ' + path + ' failed with ' + response.status + ': ' + text.slice(0, 400))
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('GET ' + path + ' returned malformed JSON')
  }
}

async function waitForDeployment(commit) {
  for (let attempt = 1; attempt <= 48; attempt += 1) {
    try {
      const health = await fetchJson('/api/health?phase15=' + Date.now())
      if (health.deploymentCommit === commit) {
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

function fingerprint(bundle) {
  const memory = bundle.memory.memory || {}
  const compact = {
    environment: memory.environment,
    stateIds: (memory.states || []).map((item) => [item.id, item.version, item.capturedAt]),
    snapshotIds: (memory.snapshots || []).map((item) => item.stateId),
    diffIds: (memory.diffs || []).map((item) => item.id),
    history: (bundle.states.states || []).map((item) => [item.stateId, item.version, item.capturedAt, item.isCurrent]),
  }
  return createHash('sha256').update(canonicalJson(compact)).digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function expect(condition, message) { if (!condition) throw new Error(message) }
