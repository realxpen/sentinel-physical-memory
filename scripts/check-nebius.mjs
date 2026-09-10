import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_BASE_URL = 'https://api.tokenfactory.us-central1.nebius.com/v1'
const GLOBAL_BASE_URL = 'https://api.tokenfactory.nebius.com/v1'

function unwrap(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1)
  }
  return trimmed
}

function readLocalEnv() {
  const values = {}
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
      if (value && values[key] === undefined) values[key] = value
    }
  }
  return values
}

const local = readLocalEnv()
const apiKey = local.NEBIUS_API_KEY || process.env.NEBIUS_API_KEY || ''
let baseUrl = (local.NEBIUS_TOKEN_FACTORY_BASE_URL || process.env.NEBIUS_TOKEN_FACTORY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
if (baseUrl === GLOBAL_BASE_URL) baseUrl = DEFAULT_BASE_URL

console.log('SENTINEL Nebius diagnostic')
console.log({
  node: process.version,
  apiKeyPresent: Boolean(apiKey.trim()),
  apiKeySource: local.NEBIUS_API_KEY ? '.env.local/.env' : process.env.NEBIUS_API_KEY ? 'process' : 'missing',
  baseUrl,
})

if (!apiKey.trim()) {
  console.error('NEBIUS AUTH FAILED: NEBIUS_API_KEY is missing.')
  process.exitCode = 2
} else {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: 'application/json',
      },
    })
    const body = await response.text()

    if (response.ok) {
      let modelCount
      try {
        const parsed = JSON.parse(body)
        modelCount = Array.isArray(parsed?.data) ? parsed.data.length : undefined
      } catch {
        modelCount = undefined
      }
      console.log('NEBIUS AUTH OK', { status: response.status, modelCount })
    } else {
      let detail = body.slice(0, 300)
      try {
        const parsed = JSON.parse(body)
        detail = parsed?.detail || parsed?.message || parsed?.error?.message || detail
      } catch {
        // Keep the bounded raw response; never print request headers or the key.
      }
      console.error('NEBIUS AUTH FAILED', { status: response.status, detail })
      if (response.status === 401 || response.status === 403) {
        console.error('The configured key is present but Token Factory did not authenticate it. Generate/restore a valid Token Factory API key and replace only NEBIUS_API_KEY in .env.local.')
      }
      process.exitCode = 1
    }
  } catch (error) {
    console.error('NEBIUS NETWORK FAILED', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
