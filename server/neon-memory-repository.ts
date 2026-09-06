import type { EnvironmentalMemory } from '../src/domain/sentinel'
import type { EnvironmentalMemoryRepository } from '../src/memory/repository'

type NeonFactory = typeof import('@neondatabase/serverless')['neon']
type NeonSql = ReturnType<NeonFactory>

export class NeonEnvironmentalMemoryRepository implements EnvironmentalMemoryRepository {
  private readonly connectionString: string
  private sql?: NeonSql

  constructor(connectionString: string) {
    const normalized = connectionString.trim()
    if (!/^postgres(?:ql)?:\/\//i.test(normalized)) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection string')
    }

    this.connectionString = normalized
  }

  async get(environmentId: string): Promise<EnvironmentalMemory | undefined> {
    const normalizedEnvironmentId = environmentId.trim()
    if (!normalizedEnvironmentId) throw new Error('environmentId is required')

    const sql = await this.getSql()
    const rows = await sql`
      select sentinel_private.sentinel_get_environmental_memory(${normalizedEnvironmentId}) as memory
    `

    const value = (rows[0] as { memory?: unknown } | undefined)?.memory
    if (value === null || value === undefined) return undefined
    return this.parseMemory(value, normalizedEnvironmentId)
  }

  async save(memory: EnvironmentalMemory): Promise<void> {
    const sql = await this.getSql()
    await sql`
      select sentinel_private.sentinel_save_environmental_memory(${JSON.stringify(memory)}::jsonb)
    `
  }

  private async getSql(): Promise<NeonSql> {
    if (!this.sql) {
      const { neon } = await import('@neondatabase/serverless')
      this.sql = neon(this.connectionString)
    }
    return this.sql
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
