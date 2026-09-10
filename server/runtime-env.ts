import { setDefaultResultOrder } from 'node:dns'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface RuntimeEnvDiagnostics {
  loadedFiles: string[]
  databaseUrlConfigured: boolean
  nebiusApiKeyConfigured: boolean
  dnsResultOrder: 'system' | 'ipv4first'
  databaseHost?: string
  databaseUrlSource: 'process' | '.env.local' | '.env' | 'missing'
  nebiusApiKeySource: 'process' | '.env.local' | '.env' | 'missing'
  nebiusBaseUrl?: string
}

const LOCAL_AUTHORITATIVE_KEYS = new Set([
  'DATABASE_URL',
  'NEBIUS_API_KEY',
  'NEBIUS_TOKEN_FACTORY_BASE_URL',
  'NEBIUS_PERCEPTION_MODEL',
  'NEBIUS_NEMOTRON_REASONING_MODEL',
  'SENTINEL_ALLOWED_ORIGIN',
])

let loaded = false
let loadedFiles: string[] = []
let dnsResultOrder: RuntimeEnvDiagnostics['dnsResultOrder'] = 'system'
let databaseUrlSource: RuntimeEnvDiagnostics['databaseUrlSource'] = 'missing'
let nebiusApiKeySource: RuntimeEnvDiagnostics['nebiusApiKeySource'] = 'missing'

/**
 * Deployed Vercel functions keep platform-injected environment variables as the
 * source of truth. During local execution, repository-local .env.local is
 * authoritative for SENTINEL's server-only runtime settings. This avoids a
 * linked `vercel dev` project silently overriding a proven local DATABASE_URL
 * or NEBIUS_API_KEY with stale Development/Preview values.
 *
 * Some local networks advertise an IPv6 route that Node can resolve but cannot
 * actually use to reach Neon. Prefer IPv4 first only outside deployed Vercel
 * runtimes. This preserves production networking while making local Neon access
 * deterministic without requiring NODE_OPTIONS on every command.
 */
export function ensureRuntimeEnvLoaded(): void {
  if (loaded) return
  loaded = true

  const isLocalRuntime = !process.env.VERCEL_ENV
  if (isLocalRuntime) {
    setDefaultResultOrder('ipv4first')
    dnsResultOrder = 'ipv4first'
  }

  if (process.env.DATABASE_URL?.trim()) databaseUrlSource = 'process'
  if (process.env.NEBIUS_API_KEY?.trim()) nebiusApiKeySource = 'process'

  const files = ['.env.local', '.env'] as const
  for (const filename of files) {
    const path = resolve(process.cwd(), filename)
    if (!existsSync(path)) continue

    const source = readFileSync(path, 'utf8')
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue

      const [, key, rawValue] = match
      const value = unwrapEnvValue(rawValue)
      if (!value.trim()) continue

      const localOverride = isLocalRuntime && LOCAL_AUTHORITATIVE_KEYS.has(key)
      if (!localOverride && process.env[key]?.trim()) continue

      process.env[key] = value
      if (key === 'DATABASE_URL') databaseUrlSource = filename
      if (key === 'NEBIUS_API_KEY') nebiusApiKeySource = filename
    }

    loadedFiles.push(filename)
  }
}

export function getRuntimeEnvDiagnostics(): RuntimeEnvDiagnostics {
  ensureRuntimeEnvLoaded()
  return {
    loadedFiles: [...loadedFiles],
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    nebiusApiKeyConfigured: Boolean(process.env.NEBIUS_API_KEY?.trim()),
    dnsResultOrder,
    databaseHost: safeDatabaseHost(process.env.DATABASE_URL),
    databaseUrlSource,
    nebiusApiKeySource,
    nebiusBaseUrl: safeHttpOrigin(process.env.NEBIUS_TOKEN_FACTORY_BASE_URL),
  }
}

function safeDatabaseHost(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  try {
    return new URL(value.trim()).hostname
  } catch {
    return 'invalid-postgres-url'
  }
}

function safeHttpOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value.trim())
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return 'invalid-url'
  }
}

function unwrapEnvValue(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

ensureRuntimeEnvLoaded()
