import type {
  EnvironmentRelation,
  Evidence,
  Observation,
  PerceptionResult,
  SpatialObject,
} from '../domain/sentinel'
import type { ScanArtifact } from '../scan/types'
import {
  ModelAdapterError,
  type ArtifactContent,
  type ArtifactResolver,
  type ModelAdapter,
  type ModelInferenceRequest,
} from './model'

const DEFAULT_BASE_URL = 'https://api.tokenfactory.nebius.com/v1'
const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni'

interface NebiusAdapterOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  fetchImpl?: typeof fetch
  artifactResolver?: ArtifactResolver
  timeoutMs?: number
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> }
  }>
}

/**
 * Nebius Token Factory adapter.
 *
 * The rest of SENTINEL knows nothing about OpenAI-compatible HTTP or Nebius.
 * Keep this adapter server-side so NEBIUS_API_KEY is never shipped to a browser.
 */
export class NebiusNemotronAdapter implements ModelAdapter {
  readonly provider = 'nebius-token-factory'
  readonly model: string

  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly artifactResolver?: ArtifactResolver
  private readonly timeoutMs: number

  constructor(options: NebiusAdapterOptions) {
    if (!options.apiKey) throw new Error('NEBIUS_API_KEY is required')

    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.model = options.model ?? DEFAULT_MODEL
    this.fetchImpl = options.fetchImpl ?? fetch
    this.artifactResolver = options.artifactResolver
    this.timeoutMs = options.timeoutMs ?? 60_000
  }

  async infer(request: ModelInferenceRequest): Promise<PerceptionResult> {
    const content = await this.buildContent(request.prompt, request.artifacts)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: this.systemPrompt(request.role),
            },
            { role: 'user', content },
          ],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new ModelAdapterError({
          code: 'NEBIUS_HTTP_ERROR',
          message: `Nebius inference failed (${response.status}): ${body.slice(0, 500)}`,
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        })
      }

      const payload = (await response.json()) as ChatCompletionResponse
      const text = this.extractText(payload)
      return this.parsePerceptionResult(text, request.artifacts)
    } catch (error) {
      if (error instanceof ModelAdapterError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ModelAdapterError({
          code: 'NEBIUS_TIMEOUT',
          message: `Nebius inference exceeded ${this.timeoutMs}ms`,
          retryable: true,
        })
      }
      throw new ModelAdapterError({
        code: 'NEBIUS_REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Unknown Nebius request failure',
        retryable: true,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  private async buildContent(prompt: string, artifacts: ScanArtifact[]) {
    const parts: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]

    for (const artifact of artifacts) {
      if (artifact.kind !== 'frame') continue
      if (!this.artifactResolver) {
        parts.push({ type: 'text', text: `FRAME_ARTIFACT ${artifact.artifactId}: ${artifact.uri}` })
        continue
      }

      const resolved = await this.artifactResolver.resolve(artifact)
      parts.push({ type: 'text', text: `FRAME_ID: ${artifact.frameId ?? artifact.artifactId}` })
      parts.push({ type: 'image_url', image_url: { url: resolved.uri } })
    }

    return parts
  }

  private systemPrompt(role: ModelInferenceRequest['role']): string {
    return [
      'You are SENTINEL, a physical-environment perception system.',
      `Current role: ${role}.`,
      'Return ONLY valid JSON matching the requested schema.',
      'Separate direct visual observations from inference.',
      'Never invent an object, issue, location, measurement, or evidence source.',
      'Use confidence values from 0 to 1.',
    ].join(' ')
  }

  private extractText(response: ChatCompletionResponse): string {
    const content = response.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('')
    throw new ModelAdapterError({
      code: 'EMPTY_MODEL_RESPONSE',
      message: 'Nebius returned no model content',
      retryable: true,
    })
  }

  private parsePerceptionResult(text: string, artifacts: ScanArtifact[]): PerceptionResult {
    const json = extractJson(text)
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      throw new ModelAdapterError({
        code: 'INVALID_MODEL_JSON',
        message: 'Nemotron returned invalid JSON',
        retryable: false,
      })
    }

    if (!isRecord(value)) {
      throw new ModelAdapterError({ code: 'INVALID_MODEL_SCHEMA', message: 'Model output is not an object', retryable: false })
    }

    return {
      sourceId: artifacts[0]?.artifactId ?? 'unknown',
      observations: asArray<Observation>(value.observations),
      objects: asArray<SpatialObject>(value.objects),
      relations: asArray<EnvironmentRelation>(value.relations),
      evidence: asArray<Evidence>(value.evidence),
    }
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) return fenced[1]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function createNebiusNemotronAdapter(apiKey: string, options: Omit<NebiusAdapterOptions, 'apiKey'> = {}) {
  return new NebiusNemotronAdapter({ apiKey, ...options })
}
