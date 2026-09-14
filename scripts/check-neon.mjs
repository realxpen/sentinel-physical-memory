import { setDefaultResultOrder, getDefaultResultOrder } from 'node:dns'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(connectionString)
  const rows = await sql`select 1 as ok`
  const ok = rows?.[0]?.ok === 1 || rows?.[0]?.ok === '1'
  if (!ok) throw new Error('Unexpected database response')

  console.log('SENTINEL Neon check: PASS')
  console.log(`Node: ${process.version}`)
  console.log(`DNS result order: ${getDefaultResultOrder()}`)
  console.log(`Database host: ${databaseHost}`)
} catch (error) {
  console.error('SENTINEL Neon check: FAIL')
  console.error(`Node: ${process.version}`)
  console.error(`DNS result order: ${getDefaultResultOrder()}`)
  console.error(`Database host: ${databaseHost}`)
  console.error(`Error: ${safeErrorSummary(error)}`)
  process.exit(1)
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
  let current = error
  while (current && !seen.has(current) && parts.length < 4) {
    seen.add(current)
    if (current instanceof Error && current.message) parts.push(current.message)
    if (typeof current === 'object' && current !== null && typeof current.code === 'string') parts.push(current.code)
    current = typeof current === 'object' && current !== null ? current.cause : undefined
  }
  return [...new Set(parts)].join(' → ') || 'Unknown connectivity error'
}
