import { createNebiusNemotronAdapter } from '../src/ai/nebius.js'
import { AskBuildingService } from '../src/memory/ask-building.js'
import { getMemoryPersistenceMode, getRuntimeEnvironmentalMemoryRepository } from '../server/memory-repository.js'

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }
type Response = { status(code: number): Response; json(body: unknown): void }

const MAX_BODY_BYTES = 64 * 1024
const MAX_QUESTION_LENGTH = 1000
const DEFAULT_REASONING_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST /api/ask-building' })
  const configuredOrigin = process.env.SENTINEL_ALLOWED_ORIGIN
  const origin = header(req, 'origin')
  if (configuredOrigin && origin && origin !== configuredOrigin) return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })
  const apiKey = process.env.NEBIUS_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'NEBIUS_NOT_CONFIGURED', message: 'Server inference credentials are not configured' })

  try {
    const rawSize = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8')
    if (rawSize > MAX_BODY_BYTES) return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Ask request exceeds 64 KB' })
    const body = parseBody(req.body)
    const repository = getRuntimeEnvironmentalMemoryRepository()

    const adapter = createNebiusNemotronAdapter(apiKey, {
      baseUrl: process.env.NEBIUS_TOKEN_FACTORY_BASE_URL,
      model: process.env.NEBIUS_NEMOTRON_REASONING_MODEL?.trim() || DEFAULT_REASONING_MODEL,
    })
    const service = new AskBuildingService(repository, adapter)
    const answer = await service.ask({ environmentId: body.environmentId, question: body.question, stateId: body.stateId })
    return res.status(200).json({ ...answer, persistence: getMemoryPersistenceMode() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ask error'
    return res.status(400).json({ error: 'ASK_FAILED', message })
  }
}

function parseBody(value: unknown): { environmentId: string; question: string; stateId?: string } {
  if (!isRecord(value)) throw new Error('Request body must be a JSON object')
  const environmentId = requiredString(value.environmentId, 'environmentId')
  const question = requiredString(value.question, 'question')
  if (question.length > MAX_QUESTION_LENGTH) throw new Error(`question must be ${MAX_QUESTION_LENGTH} characters or fewer`)
  return { environmentId, question, stateId: optionalString(value.stateId) }
}

function requiredString(value: unknown, path: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`); return value.trim() }
function optionalString(value: unknown): string | undefined { return value === undefined || value === null ? undefined : requiredString(value, 'stateId') }
function header(req: Request, name: string) { const value = req.headers?.[name]; return Array.isArray(value) ? value[0] : value }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
