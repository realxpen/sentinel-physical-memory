import { spawnSync } from 'node:child_process'
import { getDefaultResultOrder, lookup, setDefaultResultOrder } from 'node:dns'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REQUIRED_DNS_OPTION = '--dns-result-order=ipv4first'
const RESPAWN_GUARD = 'SENTINEL_NEON_CHECK_RESPAWNED'

if (process.env[RESPAWN_GUARD] !== '1' && !hasNodeOption(REQUIRED_DNS_OPTION)) {
  const nodeOptions = [process.env.NODE_OPTIONS?.trim(), REQUIRED_DNS_OPTION].filter(Boolean).join(' ')
  const child = spawnSync(process.execPath, [process.argv[1]], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions, [RESPAWN_GUARD]: '1' },
  })
  process.exit(child.status ?? 1)
}

setDefaultResultOrder('ipv4first')
loadLocalEnv()

const connectionString = process.env.DATABASE_URL?.trim()
if (!connectionString) {
  console.error('SENTINEL Neon transport check: FAIL — DATABASE_URL is not configured.')
  process.exit(1)
}

let databaseHost
try {
  databaseHost = new URL(connectionString).hostname
} catch {
  console.error('SENTINEL Neon transport check: FAIL — DATABASE_URL is not a valid PostgreSQL URL.')
  process.exit(1)
}

console.log('SENTINEL Neon transport matrix')
console.log(`Node: ${process.version}`)
console.log(`DNS result order: ${getDefaultResultOrder()}`)
console.log(`Process DNS option: ${hasNodeOption(REQUIRED_DNS_OPTION) ? 'ipv4first' : 'missing'}`)
console.log(`Database host: ${databaseHost}`)
console.log(`Global WebSocket: ${typeof globalThis.WebSocket === 'function' ? 'available' : 'missing'}`)

const dns = await probeDns(databaseHost)
report('DNS resolution', dns)

const https = await probeHttps(databaseHost)
report('Raw HTTPS /sql', https)

const httpDriver = await probeNeonHttp(connectionString)
report('Neon SQL-over-HTTP', httpDriver)

const websocketDriver = await probeNeonWebSocket(connectionString)
report('Neon WebSocket Pool', websocketDriver)

console.log('')
if (httpDriver.ok) {
  console.log('SENTINEL Neon transport check: PASS')
  console.log('Recommended local transport: http')
  process.exit(0)
}
if (websocketDriver.ok) {
  console.log('SENTINEL Neon transport check: PASS')
  console.log('Recommended local transport: websocket')
  process.exit(0)
}

console.log('SENTINEL Neon transport check: FAIL')
if (https.ok) console.log('The Neon HTTPS endpoint is reachable, but both database driver transports failed.')
else console.log('The Neon HTTPS endpoint itself is not reachable from this local process.')
process.exit(1)

async function probeDns(host) {
  try {
    const addresses = await lookup(host, { all: true })
    const families = [...new Set(addresses.map((entry) => `IPv${entry.family}`))]
    return { ok: addresses.length > 0, detail: `${addresses.length} address(es): ${families.join(', ') || 'unknown family'}` }
  } catch (error) {
    return failure(error)
  }
}

async function probeHttps(host) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`https://${host}/sql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
    return { ok: true, detail: `HTTP ${response.status}` }
  } catch (error) {
    return failure(error)
  } finally {
    clearTimeout(timer)
  }
}

async function probeNeonHttp(url) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(url)
    const rows = await withTimeout(sql`select 1 as ok`, 15_000, 'HTTP query timed out')
    const ok = rows?.[0]?.ok === 1 || rows?.[0]?.ok === '1'
    return ok ? { ok: true, detail: 'select 1 succeeded' } : { ok: false, detail: 'unexpected query response' }
  } catch (error) {
    return failure(error)
  }
}

async function probeNeonWebSocket(url) {
  let pool
  try {
    const { Pool, neonConfig } = await import('@neondatabase/serverless')
    neonConfig.poolQueryViaFetch = false
    pool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 15_000 })
    const result = await withTimeout(pool.query('select 1 as ok'), 20_000, 'WebSocket query timed out')
    const ok = result.rows?.[0]?.ok === 1 || result.rows?.[0]?.ok === '1'
    return ok ? { ok: true, detail: 'select 1 succeeded' } : { ok: false, detail: 'unexpected query response' }
  } catch (error) {
    return failure(error)
  } finally {
    if (pool) await pool.end().catch(() => undefined)
  }
}

function report(label, result) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${label}: ${result.detail}`)
}

function failure(error) {
  return { ok: false, detail: safeErrorSummary(error) }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ])
}

function hasNodeOption(option) {
  return (process.env.NODE_OPTIONS ?? '').split(/\s+/).includes(option)
}

function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), filename)
    if (!existsSync(path)) continue
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue
      const [, key, rawValue] = match
      const value = unwrap(rawValue)
      if (!value.trim()) continue
      if (key === 'DATABASE_URL') process.env.DATABASE_URL = value
    }
  }
}

function unwrap(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1)
  }
  return trimmed
}

function safeErrorSummary(error) {
  const parts = []
  const seen = new Set()
  const queue = [error]
  while (queue.length && parts.length < 8) {
    const current = queue.shift()
    if (current === undefined || current === null || seen.has(current)) continue
    seen.add(current)
    if (typeof current === 'string') {
      if (current.trim()) parts.push(current.trim())
      continue
    }
    if (current instanceof Error) {
      if (current.name && current.name !== 'Error') parts.push(current.name)
      if (current.message) parts.push(current.message)
      queue.push(current.cause)
    }
    if (typeof current === 'object') {
      if (typeof current.code === 'string') parts.push(current.code)
      if (typeof current.type === 'string') parts.push(`event:${current.type}`)
      if (typeof current.message === 'string') parts.push(current.message)
      queue.push(current.cause, current.sourceError, current.error)
    }
  }
  return [...new Set(parts)].join(' → ') || `non-Error failure (${Object.prototype.toString.call(error)})`
}
