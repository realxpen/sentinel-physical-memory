import { spawnSync } from 'node:child_process'
import { setDefaultResultOrder, getDefaultResultOrder } from 'node:dns'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REQUIRED_DNS_OPTION = '--dns-result-order=ipv4first'
const RESPAWN_GUARD = 'SENTINEL_NEON_CHECK_RESPAWNED'

if (process.env[RESPAWN_GUARD] !== '1' && !hasNodeOption(REQUIRED_DNS_OPTION)) {
  const nodeOptions = [process.env.NODE_OPTIONS?.trim(), REQUIRED_DNS_OPTION].filter(Boolean).join(' ')
  const child = spawnSync(process.execPath, [process.argv[1]], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      [RESPAWN_GUARD]: '1',
    },
  })
  process.exit(child.status ?? 1)
}

setDefaultResultOrder('ipv4first')
loadLocalEnv()

const connectionString = process.env.DATABASE_URL?.trim()
if (!connectionString) {
  console.error('SENTINEL Neon check: FAIL — DATABASE_URL is not configured.')
  process.exit(1)
}

let databaseHost
try {
  databaseHost = new URL(connectionString).hostname
} catch {
  console.error('SENTINEL Neon check: FAIL — DATABASE_URL is not a valid PostgreSQL URL.')
  process.exit(1)
}

try {
  const rows = await withRetry(async () => {
    const { Pool, neonConfig } = await import('@neondatabase/serverless')
    neonConfig.poolQueryViaFetch = false
    const pool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 15_000,
    })
    try {
      const result = await pool.query('select 1 as ok')
      return result.rows
    } finally {
      await pool.end().catch(() => undefined)
    }
  })
  const ok = rows?.[0]?.ok === 1 || rows?.[0]?.ok === '1'
  if (!ok) throw new Error('Unexpected database response')

  console.log('SENTINEL Neon check: PASS')
  console.log(`Node: ${process.version}`)
  console.log(`DNS result order: ${getDefaultResultOrder()}`)
  console.log(`Process DNS option: ${hasNodeOption(REQUIRED_DNS_OPTION) ? 'ipv4first' : 'missing'}`)
  console.log('Transport: websocket')
  console.log(`Database host: ${databaseHost}`)
} catch (error) {
  console.error('SENTINEL Neon check: FAIL')
  console.error(`Node: ${process.version}`)
  console.error(`DNS result order: ${getDefaultResultOrder()}`)
  console.error(`Process DNS option: ${hasNodeOption(REQUIRED_DNS_OPTION) ? 'ipv4first' : 'missing'}`)
  console.error('Transport: websocket')
  console.error(`Database host: ${databaseHost}`)
  console.error(`Error: ${safeErrorSummary(error)}`)
  process.exit(1)
}

async function withRetry(task) {
  const delays = [500, 1500]
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (!isTransientNetworkError(error) || attempt === 3) throw error
      const delayMs = delays[attempt - 1] ?? delays[delays.length - 1]
      console.warn(`SENTINEL Neon check: transient network retry ${attempt}/2 in ${delayMs}ms`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
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

function isTransientNetworkError(error) {
  const seen = new Set()
  const queue = [error]
  const codes = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET'])
  while (queue.length) {
    const current = queue.shift()
    if (!current || seen.has(current)) continue
    seen.add(current)
    if (typeof current === 'string') {
      if (isTransientMessage(current)) return true
      continue
    }
    if (current instanceof Error) {
      if (isTransientMessage(current.message)) return true
      queue.push(current.cause)
    }
    if (typeof current === 'object') {
      if (typeof current.code === 'string' && codes.has(current.code)) return true
      queue.push(current.cause, current.sourceError)
    }
  }
  return false
}

function isTransientMessage(message) {
  return /fetch failed|ETIMEDOUT|connection terminated|connection closed|websocket.*closed|socket hang up/i.test(message)
}

function safeErrorSummary(error) {
  const parts = []
  const seen = new Set()
  let current = error
  while (current && !seen.has(current) && parts.length < 6) {
    seen.add(current)
    if (current instanceof Error && current.message) parts.push(current.message)
    if (typeof current === 'object' && current !== null && typeof current.code === 'string') parts.push(current.code)
    if (typeof current === 'object' && current !== null) current = current.cause ?? current.sourceError
    else current = undefined
  }
  return [...new Set(parts)].join(' → ') || 'Unknown connectivity error'
}
