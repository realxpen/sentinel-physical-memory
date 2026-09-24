export type SentinelOperation = 'observation' | 'memory' | 'history' | 'ask' | 'action-plan' | 'verification'

export interface SentinelErrorPayload {
  error?: string
  message?: string
}

export class SentinelRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly operation: SentinelOperation

  constructor(operation: SentinelOperation, status: number, code: string, message: string) {
    super(message)
    this.name = 'SentinelRequestError'
    this.operation = operation
    this.status = status
    this.code = code
  }
}

export async function fetchSentinel(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  operation: SentinelOperation,
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch {
    throw new SentinelRequestError(
      operation,
      0,
      'NETWORK_INTERRUPTED',
      networkFailureMessage(operation),
    )
  }
}

export async function readSentinelApiResponse<T>(
  response: Response,
  operation: SentinelOperation,
): Promise<T> {
  const text = await response.text()

  if (!text.trim()) {
    if (!response.ok) {
      throw new SentinelRequestError(
        operation,
        response.status,
        codeFromStatus(response.status),
        messageForFailure(operation, response.status, undefined, undefined),
      )
    }
    throw new SentinelRequestError(
      operation,
      response.status,
      'EMPTY_RESPONSE',
      `${operationLabel(operation)} returned an empty response. Nothing was accepted as complete.`,
    )
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const looksJson = contentType.includes('application/json') || /^[\s]*[\[{]/.test(text)
  let parsed: unknown

  if (looksJson) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new SentinelRequestError(
        operation,
        response.status,
        'MALFORMED_RESPONSE',
        `${operationLabel(operation)} returned malformed data. Nothing was accepted as complete.`,
      )
    }
  } else {
    const cleaned = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220)

    if (!response.ok) {
      throw new SentinelRequestError(
        operation,
        response.status,
        codeFromStatus(response.status),
        messageForFailure(operation, response.status, undefined, cleaned || undefined),
      )
    }

    throw new SentinelRequestError(
      operation,
      response.status,
      'UNEXPECTED_RESPONSE',
      `${operationLabel(operation)} returned an unexpected response format. Nothing was accepted as complete.`,
    )
  }

  if (!response.ok) {
    const payload = isRecord(parsed) ? parsed as SentinelErrorPayload : {}
    throw new SentinelRequestError(
      operation,
      response.status,
      typeof payload.error === 'string' && payload.error.trim() ? payload.error.trim() : codeFromStatus(response.status),
      messageForFailure(
        operation,
        response.status,
        typeof payload.error === 'string' ? payload.error : undefined,
        typeof payload.message === 'string' ? payload.message : undefined,
      ),
    )
  }

  return parsed as T
}

export function messageForFailure(
  operation: SentinelOperation,
  status: number,
  code?: string,
  serverMessage?: string,
): string {
  switch (code) {
    case 'ENVIRONMENT_NOT_FOUND':
      return 'This location has no persisted SENTINEL memory. Refresh the location or observe it first.'
    case 'STATE_NOT_FOUND':
      return 'That remembered state is no longer available. Refresh the location history and try again.'
    case 'HISTORICAL_SNAPSHOT_UNAVAILABLE':
      return 'That state exists, but its immutable snapshot is unavailable. SENTINEL stopped instead of reconstructing history from newer data.'
    case 'MEMORY_NOT_READY':
      return 'This location does not have a grounded environmental state yet. Observe it before reasoning or planning.'
    case 'PAYLOAD_TOO_LARGE':
    case 'SOURCE_VIDEO_TOO_LARGE':
    case 'FRAME_TOO_LARGE':
      return 'This request is too large for SENTINEL to process safely. Use a smaller image/video or fewer evidence frames and try again.'
    case 'PERCEPTION_TIMEOUT':
    case 'REASONING_TIMEOUT':
    case 'ACTION_PLAN_TIMEOUT':
    case 'VERIFICATION_TIMEOUT':
      return `${operationLabel(operation)} timed out before a trustworthy result was completed. Try again; no result was accepted as complete.`
    case 'VERIFICATION_NOT_GROUNDED':
      return serverMessage?.trim() || 'I couldn\'t verify this condition from the available evidence. A clearer observation is needed.'
    case 'ACTION_PLAN_NOT_GROUNDED':
      return serverMessage?.trim() || 'SENTINEL could not create an evidence-backed action plan from this state.'
    case 'NETWORK_INTERRUPTED':
      return networkFailureMessage(operation)
  }

  if (status === 413) {
    return 'This request is too large for SENTINEL to process safely. Reduce the request size and try again.'
  }
  if (status === 404) {
    return serverMessage?.trim() || `${operationLabel(operation)} could not find the requested remembered resource.`
  }
  if (status === 409) {
    return serverMessage?.trim() || `${operationLabel(operation)} stopped because the persisted memory is incomplete or inconsistent.`
  }
  if (status === 502 || status === 503 || status === 504) {
    return `${operationLabel(operation)} is temporarily unavailable. No result was accepted as complete; please try again.`
  }
  if (status >= 500) {
    return `${operationLabel(operation)} could not complete safely. No result was accepted as complete.`
  }

  return serverMessage?.trim() || `${operationLabel(operation)} could not complete this request.`
}

function networkFailureMessage(operation: SentinelOperation): string {
  return `Network connection to SENTINEL was interrupted during ${operationLabel(operation).toLowerCase()}. No result was confirmed. Check your connection and try again.`
}

function operationLabel(operation: SentinelOperation): string {
  switch (operation) {
    case 'observation': return 'Observation'
    case 'memory': return 'Memory'
    case 'history': return 'History'
    case 'ask': return 'Ask'
    case 'action-plan': return 'Action planning'
    case 'verification': return 'Verification'
  }
}

function codeFromStatus(status: number): string {
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 413) return 'PAYLOAD_TOO_LARGE'
  if (status === 502) return 'UPSTREAM_FAILED'
  if (status === 503) return 'SERVICE_UNAVAILABLE'
  if (status === 504) return 'UPSTREAM_TIMEOUT'
  return `HTTP_${status}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
