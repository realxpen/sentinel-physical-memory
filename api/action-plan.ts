import { createNebiusNemotronAdapter } from '../src/ai/nebius.js'
import { ModelAdapterError } from '../src/ai/model.js'
import { ActionPlannerInputError, ActionPlannerService } from '../src/action/planner.ts'
import { getMemoryPersistenceMode, getRuntimeEnvironmentalMemoryRepository } from '../server/memory-repository.js'

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }
type Response = { status(code: number): Response; json(body: unknown): void }

const MAX_BODY_BYTES = 64 * 1024
const MAX_GOAL_LENGTH = 1000
const MAX_IDS = 24
const DEFAULT_REASONING_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'
const ACTION_PLAN_CONTRACT = 'phase11-action-plan-v1'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST /api/action-plan' })
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
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Action-plan request exceeds 64 KB' })
    }

    const body = parseBody(req.body)
    const repository = getRuntimeEnvironmentalMemoryRepository()
    const adapter = createNebiusNemotronAdapter(apiKey, {
      baseUrl: process.env.NEBIUS_TOKEN_FACTORY_BASE_URL,
      model: process.env.NEBIUS_NEMOTRON_REASONING_MODEL?.trim() || DEFAULT_REASONING_MODEL,
      timeoutMs: 90_000,
    })
    const result = await new ActionPlannerService(repository, adapter).create(body)

    if (!result.grounding || result.plan.steps.some((step) => step.status !== 'recommended')) {
      throw new Error('Phase 11 action-plan grounding contract was not produced')
    }

    return res.status(200).json({
      ...result,
      persistence: getMemoryPersistenceMode(),
      actionContract: ACTION_PLAN_CONTRACT,
    })
  } catch (error) {
    if (error instanceof ActionPlannerInputError) {
      return res.status(error.status).json({ error: 'ACTION_PLAN_NOT_GROUNDED', message: error.message })
    }

    const message = error instanceof Error ? error.message : 'Unknown action planner error'
    if (error instanceof ModelAdapterError) {
      const timedOut = /timeout/i.test(error.code) || /timed out/i.test(error.message)
      console.error('SENTINEL_ACTION_PLAN_PROVIDER_FAILED', { code: error.code, message: error.message, status: error.status })
      return res.status(timedOut ? 504 : 502).json({
        error: timedOut ? 'ACTION_PLAN_TIMEOUT' : 'ACTION_PLAN_PROVIDER_FAILED',
        message: timedOut ? 'SENTINEL action planning timed out. Please try again.' : message,
      })
    }

    console.error('SENTINEL_ACTION_PLAN_FAILED', { message })
    return res.status(500).json({ error: 'ACTION_PLAN_FAILED', message })
  }
}

function parseBody(value: unknown) {
  if (!isRecord(value)) throw new ActionPlannerInputError('Request body must be a JSON object')
  return {
    environmentId: requiredString(value.environmentId, 'environmentId'),
    stateId: optionalString(value.stateId),
    goal: optionalLimitedString(value.goal, 'goal', MAX_GOAL_LENGTH),
    relatedConditionIds: optionalStringArray(value.relatedConditionIds, 'relatedConditionIds'),
    relatedIssueIds: optionalStringArray(value.relatedIssueIds, 'relatedIssueIds'),
    relatedObjectIds: optionalStringArray(value.relatedObjectIds, 'relatedObjectIds'),
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ActionPlannerInputError(`${path} must be a non-empty string`)
  return value.trim()
}
function optionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : requiredString(value, 'stateId')
}
function optionalLimitedString(value: unknown, path: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined
  const result = requiredString(value, path)
  if (result.length > max) throw new ActionPlannerInputError(`${path} must be ${max} characters or fewer`)
  return result
}
function optionalStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length > MAX_IDS || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new ActionPlannerInputError(`${path} must contain at most ${MAX_IDS} non-empty string IDs`)
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
