import { neon } from '@neondatabase/serverless'
import type { EnvironmentalMemory } from '../src/domain/sentinel'
import type { EnvironmentalMemoryRepository } from '../src/memory/repository'

export class NeonEnvironmentalMemoryRepository implements EnvironmentalMemoryRepository {
  private readonly sql: ReturnType<typeof neon>

  constructor(connectionString: string) {
    const normalized = connectionString.trim()
    if (!/^postgres(?:ql)?:\/\//i.test(normalized)) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection string')
    }

    this.sql = neon(normalized)
  }

  async get(environmentId: string): Promise<EnvironmentalMemory | undefined> {
    const normalizedEnvironmentId = environmentId.trim()
    if (!normalizedEnvironmentId) throw new Error('environmentId is required')

    const rows = await this.sql`
      select sentinel_private.sentinel_get_environmental_memory(${normalizedEnvironmentId}) as memory
    `

    const value = (rows[0] as { memory?: unknown } | undefined)?.memory
    if (value === null || value === undefined) return undefined
    return this.parseMemory(value, normalizedEnvironmentId)
  }

  async save(memory: EnvironmentalMemory): Promise<void> {
    await this.sql`
      select sentinel_private.sentinel_save_environmental_memory(${JSON.stringify(memory)}::jsonb)
    `
  }

  private parseMemory(value: unknown, environmentId: string): EnvironmentalMemory {
    if (!isRecord(value) || !isRecord(value.environment) || value.environment.id !== environmentId) {
      throw new Error(`Neon returned invalid environmental memory for ${environmentId}`)
    }

    const requiredCollections = ['states', 'objects', 'issues', 'observations', 'evidence', 'relations', 'sources', 'diffs'] as const
    for (const key of requiredCollections) {
      if (!Array.isArray(value[key])) throw new Error(`Neon environmental memory is missing ${key}`)
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
