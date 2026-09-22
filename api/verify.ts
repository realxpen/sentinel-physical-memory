import { createNebiusNemotronAdapter } from '../src/ai/nebius.js'
import { ModelAdapterError } from '../src/ai/model.js'
import type { ScanArtifact } from '../src/scan/types.js'
import { VerificationAgentService, VerificationInputError } from '../src/verification/service.ts'
import { getMemoryPersistenceMode, getRuntimeEnvironmentalMemoryRepository } from '../server/memory-repository.js'

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }
type Response = { status(code: number): Response; json(body: unknown): void }

const MAX_BODY_BYTES = 64 * 1024
const MAX_IDS = 24
const DEFAULT_VERIFICATION_MODEL = 'openbmb/MiniCPM-V-4_5'
const VERIFICATION_CONTRACT = 'phase12-visual-verification-v2'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST /api/verify' })
  }

  const configuredOrigin = normalizedOrigin(process.env.SENTINEL_ALLOWED_ORIGIN)
  const origin = normalizedOrigin(header(req, 'origin'))
  if (configuredOrigin && origin && origin !== configuredOrigin) {
    return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED', message: 'This browser URL is not allowed to call SENTINEL.' })
  }

  const apiKey = process.env.NEBIUS_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'NEBIUS_NOT_CONFIGURED', message: 'Server inference credentials are not configured' })
  }

  try {
    const rawSize = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8')
    if (rawSize > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Verification request exceeds 64 KB' })
    }

    const body = parseBody(req.body)
    const repository = getRuntimeEnvironmentalMemoryRepository()
    const adapter = createNebiusNemotronAdapter(apiKey, {
      baseUrl: process.env.NEBIUS_TOKEN_FACTORY_BASE_URL,
      model: process.env.NEBIUS_VERIFICATION_MODEL?.trim()
        || process.env.NEBIUS_PERCEPTION_MODEL?.trim()
        || DEFAULT_VERIFICATION_MODEL,
      timeoutMs: 90_000,
      artifactResolver: {
        resolve: async (artifact: ScanArtifact) => ({
          artifactId: artifact.artifactId,
          mimeType: mimeTypeFromDataUrl(artifact.uri) || 'image/jpeg',
          uri: artifact.uri,
        }),
      },
    })
    const result = await new VerificationAgentService(repository, adapter).verify(body)

    return res.status(200).json({
      ...result,
      persistence: getMemoryPersistenceMode(),
      verificationContract: VERIFICATION_CONTRACT,
    })
  } catch (error) {
    if (error instanceof VerificationInputError) {
      return res.status(error.status).json({ error: 'VERIFICATION_NOT_GROUNDED', message: error.message })
    }

    const message = error instanceof Error ? error.message : 'Unknown verification error'
    if (error instanceof ModelAdapterError) {
      const timedOut = /timeout/i.test(error.code) || /timed out/i.test(error.message)
      console.error('SENTINEL_VERIFICATION_PROVIDER_FAILED', { code: error.code, message: error.message, status: error.status })
      return res.status(timedOut ? 504 : 502).json({
        error: timedOut ? 'VERIFICATION_TIMEOUT' : 'VERIFICATION_PROVIDER_FAILED',
        message: timedOut ? 'SENTINEL verification timed out. Please try again.' : message,
      })
    }

    console.error('SENTINEL_VERIFICATION_FAILED', { message })
    return res.status(500).json({ error: 'VERIFICATION_FAILED', message })
  }
}

function parseBody(value: unknown) {
  if (!isRecord(value)) throw new VerificationInputError('Request body must be a JSON object')
  return {
    environmentId: requiredString(value.environmentId, 'environmentId'),
    previousStateId: requiredString(value.previousStateId, 'previousStateId'),
    currentStateId: requiredString(value.currentStateId, 'currentStateId'),
    actionPlanId: optionalString(value.actionPlanId, 'actionPlanId'),
    conditionIds: optionalStringArray(value.conditionIds, 'conditionIds'),
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new VerificationInputError(`${path} must be a non-empty string`)
  return value.trim()
}
function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return requiredString(value, path)
}
function optionalStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length > MAX_IDS || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new VerificationInputError(`${path} must contain at most ${MAX_IDS} non-empty string IDs`)
  }
  return [...new Set(value.map((item) => item.trim()))]
}
function normalizedOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  const candidate = value.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')
  try { return new URL(candidate).origin.toLowerCase() } catch { return candidate.toLowerCase() }
}
function header(req: Request, name: string) {
  const value = req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}
function mimeTypeFromDataUrl(uri: string): string | undefined {
  const match = uri.match(/^data:([^;,]+)[;,]/i)
  return match?.[1]?.toLowerCase()
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
