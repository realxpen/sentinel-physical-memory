import type { EnvironmentalMemory } from '../src/domain/sentinel'
import type { EnvironmentalMemoryRepository } from '../src/memory/repository'

type NeonFactory = typeof import('@neondatabase/serverless')['neon']
type NeonSql = ReturnType<NeonFactory>

const MAX_NETWORK_ATTEMPTS = 3
const RETRY_DELAYS_MS = [250, 750]
const TRANSIENT_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
])

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

    const rows = await this.withTransientNetworkRetry('read', async () => {
      const sql = await this.getSql()
      return sql`
        select sentinel_private.sentinel_get_environmental_memory(${normalizedEnvironmentId}) as memory
      `
    })

    const value = (rows[0] as { memory?: unknown } | undefined)?.memory
    if (value === null || value === undefined) return undefined
    return this.parseMemory(value, normalizedEnvironmentId)
  }

  async save(memory: EnvironmentalMemory): Promise<void> {
    await this.withTransientNetworkRetry('save', async () => {
      const sql = await this.getSql()
      await sql`
        select sentinel_private.sentinel_save_environmental_memory(${JSON.stringify(memory)}::jsonb)
      `
    })
  }

  private async getSql(): Promise<NeonSql> {
    if (!this.sql) {
      const { neon } = await import('@neondatabase/serverless')
      this.sql = neon(this.connectionString)
    }
    return this.sql
  }

  private async withTransientNetworkRetry<T>(operation: 'read' | 'save', task: () => Promise<T>): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_NETWORK_ATTEMPTS; attempt += 1) {
      try {
        return await task()
      } catch (error) {
        lastError = error
        if (!isTransientNetworkError(error) || attempt === MAX_NETWORK_ATTEMPTS) throw error

        const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
        console.warn('SENTINEL_NEON_TRANSIENT_RETRY', { operation, attempt, delayMs })
        await delay(delayMs)
      }
    }

    throw lastError
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

function isTransientNetworkError(error: unknown): boolean {
  const seen = new Set<unknown>()
  const queue: unknown[] = [error]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === null || current === undefined || seen.has(current)) continue
    seen.add(current)

    if (typeof current === 'string') {
      if (current.includes('fetch failed') || current.includes('ETIMEDOUT')) return true
      continue
    }

    if (current instanceof Error) {
      if (current.message.includes('fetch failed') || current.message.includes('ETIMEDOUT')) return true
      queue.push(current.cause)
    }

    if (isRecord(current)) {
      const code = current.code
      if (typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code)) return true
      queue.push(current.cause, current.sourceError)
    }
  }

  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
