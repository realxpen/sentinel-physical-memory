import type { EnvironmentalMemory } from '../domain/sentinel'
import type { EnvironmentalMemoryRepository } from './repository'

export interface SupabaseEnvironmentalMemoryRepositoryOptions {
  fetch?: typeof fetch
}

export class SupabaseEnvironmentalMemoryRepository implements EnvironmentalMemoryRepository {
  private readonly baseUrl: string
  private readonly secretKey: string
  private readonly request: typeof fetch

  constructor(baseUrl: string, secretKey: string, options: SupabaseEnvironmentalMemoryRepositoryOptions = {}) {
    const normalizedUrl = baseUrl.trim().replace(/\/$/, '')
    const normalizedKey = secretKey.trim()
    if (!/^https:\/\//i.test(normalizedUrl)) throw new Error('SUPABASE_URL must be an HTTPS URL')
    if (!normalizedKey) throw new Error('Supabase server secret key is required')
    this.baseUrl = normalizedUrl
    this.secretKey = normalizedKey
    this.request = options.fetch ?? fetch
  }

  async get(environmentId: string): Promise<EnvironmentalMemory | undefined> {
    const response = await this.callRpc('sentinel_get_environmental_memory', { p_environment_id: environmentId })
    const value = await response.json() as unknown
    if (value === null) return undefined
    return this.parseMemory(value, environmentId)
  }

  async save(memory: EnvironmentalMemory): Promise<void> {
    await this.callRpc('sentinel_save_environmental_memory', { p_memory: memory }, true)
  }

  private async callRpc(name: string, body: Record<string, unknown>, preferMinimal = false): Promise<Response> {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    // Modern sb_secret_* keys must be sent as apikey only. Legacy service_role JWTs
    // still need the Authorization header while they remain supported.
    if (!this.secretKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${this.secretKey}`
    if (preferMinimal) headers.Prefer = 'return=minimal'

    const response = await this.request(`${this.baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1200)
      throw new Error(`Supabase memory RPC ${name} failed (${response.status}): ${detail || response.statusText}`)
    }

    return response
  }

  private parseMemory(value: unknown, environmentId: string): EnvironmentalMemory {
    if (!isRecord(value) || !isRecord(value.environment) || value.environment.id !== environmentId) {
      throw new Error(`Supabase returned invalid environmental memory for ${environmentId}`)
    }

    const requiredCollections = ['states', 'objects', 'issues', 'observations', 'evidence', 'relations', 'sources', 'diffs'] as const
    for (const key of requiredCollections) {
      if (!Array.isArray(value[key])) throw new Error(`Supabase environmental memory is missing ${key}`)
    }

    return {
      ...(value as unknown as EnvironmentalMemory),
      snapshots: Array.isArray(value.snapshots) ? value.snapshots as EnvironmentalMemory['snapshots'] : [],
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
