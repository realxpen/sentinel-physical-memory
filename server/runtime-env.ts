import { setDefaultResultOrder } from 'node:dns'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface RuntimeEnvDiagnostics {
  loadedFiles: string[]
  databaseUrlConfigured: boolean
  nebiusApiKeyConfigured: boolean
  dnsResultOrder: 'system' | 'ipv4first'
}

let loaded = false
let loadedFiles: string[] = []
let dnsResultOrder: RuntimeEnvDiagnostics['dnsResultOrder'] = 'system'

/**
 * Vercel injects environment variables in deployed functions. For local clones,
 * also load repository-local .env files so `vercel dev` and direct API execution
 * behave consistently without requiring the shell to `source` secrets first.
 * Existing non-empty process variables always win; blank injected values may be
 * filled from .env.local/.env.
 *
 * Some local networks advertise an IPv6 route that Node can resolve but cannot
 * actually use to reach Neon. Prefer IPv4 first only outside deployed Vercel
 * runtimes. This preserves production networking while making local Neon access
 * deterministic without requiring NODE_OPTIONS on every command.
 */
export function ensureRuntimeEnvLoaded(): void {
  if (loaded) return
  loaded = true

  if (!process.env.VERCEL_ENV) {
    setDefaultResultOrder('ipv4first')
    dnsResultOrder = 'ipv4first'
  }

  const files = ['.env.local', '.env']
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
      if (process.env[key]?.trim()) continue
      process.env[key] = unwrapEnvValue(rawValue)
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
