import type { AskBuildingResponse, PerceptionResult } from '../domain/sentinel'
import type { ScanArtifact } from '../scan/types'
import { validatePerception, PerceptionValidationError } from './perception-schema'
import { ModelAdapterError, type ArtifactResolver, type ModelAdapter, type ModelInferenceRequest, type ReasoningInferenceRequest, type ReasoningModelAdapter } from './model'

const DEFAULT_BASE_URL = 'https://api.tokenfactory.nebius.com/v1'
const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni'
interface NebiusAdapterOptions { apiKey: string; baseUrl?: string; model?: string; fetchImpl?: typeof fetch; artifactResolver?: ArtifactResolver; timeoutMs?: number }
interface ChatCompletionResponse { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> }

export class NebiusNemotronAdapter implements ModelAdapter, ReasoningModelAdapter {
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
    const response = await this.requestCompletion(this.systemPrompt(request.role), content)
    return this.parsePerceptionResult(this.extractText(response))
  }

  async reason(request: ReasoningInferenceRequest): Promise<AskBuildingResponse> {
    const prompt = [
      'Answer the user question using ONLY the supplied SENTINEL environmental memory context.',
      'Every factual claim about the environment must be supported by evidenceIds from the context.',
      'If the memory does not contain enough evidence, say that clearly instead of guessing.',
      'Return ONLY JSON with: answer (string), confidence (0..1), stateId (string), evidenceIds (string[]), relatedObjectIds (string[]), relatedIssueIds (string[]).',
      `Question: ${request.request.question}`,
      `Requested state: ${request.request.stateId ?? 'current'}`,
      'Environmental memory context:',
      request.context,
    ].join('\n')
    const response = await this.requestCompletion('You are SENTINEL, an evidence-grounded physical-environment reasoning agent.', [{ type: 'text', text: prompt }])
    return this.parseReasoningResult(this.extractText(response), request)
  }

  private async requestCompletion(system: string, content: unknown): Promise<ChatCompletionResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content }] }), signal: controller.signal })
      if (!response.ok) { const body = await response.text().catch(() => ''); throw new ModelAdapterError({ code: 'NEBIUS_HTTP_ERROR', message: `Nebius inference failed (${response.status}): ${body.slice(0, 500)}`, status: response.status, retryable: response.status === 429 || response.status >= 500 }) }
      return await response.json() as ChatCompletionResponse
    } catch (error) {
      if (error instanceof ModelAdapterError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new ModelAdapterError({ code: 'NEBIUS_TIMEOUT', message: `Nebius inference exceeded ${this.timeoutMs}ms`, retryable: true })
      throw new ModelAdapterError({ code: 'NEBIUS_REQUEST_FAILED', message: error instanceof Error ? error.message : 'Unknown Nebius request failure', retryable: true })
    } finally { clearTimeout(timeout) }
  }

  private async buildContent(prompt: string, artifacts: ScanArtifact[]) {
    const parts: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
    for (const artifact of artifacts) {
      if (artifact.kind !== 'frame') continue
      if (!this.artifactResolver) { parts.push({ type: 'text', text: `FRAME_ARTIFACT ${artifact.artifactId}: ${artifact.uri}` }); continue }
      const resolved = await this.artifactResolver.resolve(artifact)
      parts.push({ type: 'text', text: `FRAME_ID: ${artifact.frameId ?? artifact.artifactId}` })
      parts.push({ type: 'image_url', image_url: { url: resolved.uri } })
    }
    return parts
  }

  private systemPrompt(role: ModelInferenceRequest['role']): string { return ['You are SENTINEL, a physical-environment perception system.', `Current role: ${role}.`, 'Return ONLY valid JSON matching the SENTINEL PerceptionResult schema.', 'Never invent an object, issue, location, measurement, or evidence source.', 'Use confidence values from 0 to 1.', 'Every observation and object must include evidenceIds that reference evidence entries.', 'Evidence must be grounded in the supplied frame artifacts.'].join(' ') }
  private extractText(response: ChatCompletionResponse): string { const content = response.choices?.[0]?.message?.content; if (typeof content === 'string') return content; if (Array.isArray(content)) return content.map((part) => part.text ?? '').join(''); throw new ModelAdapterError({ code: 'EMPTY_MODEL_RESPONSE', message: 'Nebius returned no model content', retryable: true }) }
  private parsePerceptionResult(text: string): PerceptionResult { let value: unknown; try { value = JSON.parse(extractJson(text)) } catch { throw new ModelAdapterError({ code: 'INVALID_MODEL_JSON', message: 'Nemotron returned invalid JSON', retryable: false }) } try { return validatePerception(value) } catch (error) { if (error instanceof PerceptionValidationError) throw new ModelAdapterError({ code: error.code, message: error.message, retryable: false }); throw error } }
  private parseReasoningResult(text: string, request: ReasoningInferenceRequest): AskBuildingResponse { let value: unknown; try { value = JSON.parse(extractJson(text)) } catch { throw new ModelAdapterError({ code: 'INVALID_REASONING_JSON', message: 'Nemotron returned invalid reasoning JSON', retryable: false }) }
    if (!isRecord(value) || typeof value.answer !== 'string' || typeof value.confidence !== 'number' || typeof value.stateId !== 'string' || !isStringArray(value.evidenceIds) || !isStringArray(value.relatedObjectIds) || !isStringArray(value.relatedIssueIds)) throw new ModelAdapterError({ code: 'INVALID_REASONING_SCHEMA', message: 'Nemotron reasoning response did not match the AskBuildingResponse schema', retryable: false })
    if (value.stateId !== request.request.stateId && !request.context.includes(`STATE_ID ${value.stateId}`)) throw new ModelAdapterError({ code: 'INVALID_REASONING_STATE', message: 'Reasoning response referenced a state outside the supplied context', retryable: false })
    return { answer: value.answer, confidence: Math.max(0, Math.min(1, value.confidence)), stateId: value.stateId, evidenceIds: value.evidenceIds, relatedObjectIds: value.relatedObjectIds, relatedIssueIds: value.relatedIssueIds }
  }
}
function extractJson(text: string): string { const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i); if (fenced) return fenced[1]; const start = text.indexOf('{'); const end = text.lastIndexOf('}'); return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim() }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string') }
export function createNebiusNemotronAdapter(apiKey: string, options: Omit<NebiusAdapterOptions, 'apiKey'> = {}) { return new NebiusNemotronAdapter({ apiKey, ...options }) }
