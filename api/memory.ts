import '../server/runtime-env.js'

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> }
type Response = { status(code: number): Response; json(body: unknown): void; setHeader?(name: string, value: string): void }

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use GET /api/memory?environmentId=...' })
  const configuredOrigin = normalizedOrigin(process.env.SENTINEL_ALLOWED_ORIGIN)
  const origin = normalizedOrigin(header(req, 'origin'))
  if (configuredOrigin && origin && origin !== configuredOrigin) {
    return res.status(403).json({
      error: 'ORIGIN_NOT_ALLOWED',
      message: 'This browser URL is not allowed to call SENTINEL. Open the configured production URL or correct SENTINEL_ALLOWED_ORIGIN.',
    })
  }

  try {
    const environmentId = queryString(req.query?.environmentId, 'environmentId')
    const { getMemoryPersistenceMode, getRuntimeEnvironmentalMemoryRepository } = await import('../server/memory-repository.js')
    const repository = getRuntimeEnvironmentalMemoryRepository()
    const memory = await repository.get(environmentId)
    res.setHeader?.('Cache-Control', 'no-store')
    return res.status(200).json({ environmentId, memory: memory ?? null, persistence: getMemoryPersistenceMode() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown memory error'
    console.error('SENTINEL_MEMORY_READ_FAILED', error)
    return res.status(500).json({ error: 'MEMORY_READ_FAILED', message })
  }
}

function queryString(value: string | string[] | undefined, path: string): string {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate !== 'string' || !candidate.trim()) throw new Error(`${path} is required`)
  return candidate.trim()
}

function normalizedOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  const candidate = value.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')
  try {
    return new URL(candidate).origin.toLowerCase()
  } catch {
    return candidate.toLowerCase()
  }
}

function header(req: Request, name: string) { const value = req.headers?.[name]; return Array.isArray(value) ? value[0] : value }
