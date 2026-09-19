import '../server/runtime-env.js'
import { listEnvironmentalStateHistory, selectEnvironmentalState, type EnvironmentalStateSelector } from '../src/memory/history.js'

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> }
type Response = { status(code: number): Response; json(body: unknown): void; setHeader?(name: string, value: string): void }

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Use GET /api/states?environmentId=...',
    })
  }

  const configuredOrigin = normalizedOrigin(process.env.SENTINEL_ALLOWED_ORIGIN)
  const origin = normalizedOrigin(header(req, 'origin'))
  if (configuredOrigin && origin && origin !== configuredOrigin) {
    return res.status(403).json({
      error: 'ORIGIN_NOT_ALLOWED',
      message: 'This browser URL is not allowed to call SENTINEL. Open the configured production URL or correct SENTINEL_ALLOWED_ORIGIN.',
    })
  }

  try {
    const environmentId = requiredQuery(req.query?.environmentId, 'environmentId')
    const selection = parseSelection(req.query)
    const { getMemoryPersistenceMode, getRuntimeEnvironmentalMemoryRepository } = await import('../server/memory-repository.js')
    const repository = getRuntimeEnvironmentalMemoryRepository()
    const memory = await repository.get(environmentId)
    res.setHeader?.('Cache-Control', 'no-store')

    if (!memory) {
      return res.status(404).json({
        error: 'ENVIRONMENT_NOT_FOUND',
        message: `Environment ${environmentId} has no persisted memory`,
      })
    }

    const states = listEnvironmentalStateHistory(memory)
    const current = states.find((item) => item.isCurrent)
    const previous = current
      ? states.find((item) => item.version === current.version - 1)
      : undefined

    if (!selection) {
      return res.status(200).json({
        environmentId,
        currentStateId: current?.stateId ?? null,
        previousStateId: previous?.stateId ?? null,
        states,
        persistence: getMemoryPersistenceMode(),
      })
    }

    const record = selectEnvironmentalState(memory, selection)
    if (!record) {
      return res.status(404).json({
        error: 'STATE_NOT_FOUND',
        message: selectionMessage(selection),
      })
    }

    return res.status(200).json({
      environmentId,
      currentStateId: current?.stateId ?? null,
      previousStateId: previous?.stateId ?? null,
      states,
      selection: record,
      persistence: getMemoryPersistenceMode(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown state-history error'
    const status = /Historical snapshot unavailable/i.test(message) ? 409 : 400
    const code = status === 409 ? 'HISTORICAL_SNAPSHOT_UNAVAILABLE' : 'INVALID_HISTORY_QUERY'
    console.error('SENTINEL_STATE_HISTORY_READ_FAILED', { code, message })
    return res.status(status).json({ error: code, message })
  }
}

function parseSelection(query: Request['query']): EnvironmentalStateSelector | undefined {
  const selector = optionalQuery(query?.selector)
  const stateId = optionalQuery(query?.stateId)
  const at = optionalQuery(query?.at)

  const supplied = [selector, stateId, at].filter(Boolean)
  if (supplied.length > 1) {
    throw new Error('Use only one of selector, stateId, or at')
  }

  if (selector) {
    if (selector !== 'current' && selector !== 'previous') {
      throw new Error('selector must be current or previous')
    }
    return { selector }
  }
  if (stateId) return { stateId }
  if (at) return { at }
  return undefined
}

function selectionMessage(selection: EnvironmentalStateSelector): string {
  if ('stateId' in selection) return `State ${selection.stateId} was not found`
  if ('at' in selection) return `No state exists at or before ${selection.at}`
  return selection.selector === 'previous'
    ? 'No previous state exists for this environment'
    : 'No current state exists for this environment'
}

function requiredQuery(value: string | string[] | undefined, path: string): string {
  const candidate = optionalQuery(value)
  if (!candidate) throw new Error(`${path} is required`)
  return candidate
}

function optionalQuery(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined
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

function header(req: Request, name: string) {
  const value = req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}
