import { jsonrepair } from 'jsonrepair'
import type { AskBuildingResponse, PerceptionResult } from '../domain/sentinel.js'
import type { ScanArtifact } from '../scan/types.js'
import { normalizePerceptionEvidenceReferences } from './perception-normalization.js'
import { validatePerception, PerceptionValidationError } from './perception-schema.js'
import {
  ModelAdapterError,
  type ArtifactResolver,
  type ModelAdapter,
  type ModelInferenceRequest,
  type ReasoningInferenceRequest,
  type ReasoningModelAdapter,
  type TemporalVerificationRequest,
  type TemporalVerificationResult,
} from './model.js'

const DEFAULT_BASE_URL = 'https://api.tokenfactory.us-central1.nebius.com/v1'
const LEGACY_GLOBAL_BASE_URL = 'https://api.tokenfactory.nebius.com/v1'
const DEFAULT_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'

interface NebiusAdapterOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  fetchImpl?: typeof fetch
  artifactResolver?: ArtifactResolver
  timeoutMs?: number
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>
}

export class NebiusNemotronAdapter implements ModelAdapter, ReasoningModelAdapter {
  readonly provider = 'nebius-token-factory'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly artifactResolver?: ArtifactResolver
  private readonly timeoutMs: number

  constructor(options: NebiusAdapterOptions) {
    const apiKey = options.apiKey.trim()
    if (!apiKey) throw new Error('NEBIUS_API_KEY is required')
    this.apiKey = apiKey
    this.baseUrl = resolveBaseUrl(options.baseUrl)
    this.model = options.model?.trim() || DEFAULT_MODEL
    this.fetchImpl = options.fetchImpl ?? fetch
    this.artifactResolver = options.artifactResolver
    this.timeoutMs = options.timeoutMs ?? 60_000
  }

  async infer(request: ModelInferenceRequest): Promise<PerceptionResult> {
    const content = await this.buildContent(request.prompt, request.artifacts)
    const response = await this.requestCompletion(this.systemPrompt(request.role), content)
    return this.parsePerceptionResult(this.extractText(response), request)
  }

  async verifyTemporal(request: TemporalVerificationRequest): Promise<TemporalVerificationResult> {
    const candidateLines = request.candidates.map((candidate) =>
      [
        `${candidate.key}: previous="${candidate.previousObjectName}" current="${candidate.currentObjectName}" category=${candidate.category}`,
        `previous_position="${candidate.previousPosition ?? 'unspecified'}"`,
        `current_position="${candidate.currentPosition ?? 'unspecified'}"`,
        `previous_description="${candidate.previousDescription ?? 'none'}"`,
        `current_description="${candidate.currentDescription ?? 'none'}"`,
      ].join(' | '),
    )

    const prompt = [
      `Compare two still images for environment ${request.environmentId}.`,
      `Previous source: ${request.previousSourceId}. Current source: ${request.currentSourceId}.`,
      'The FIRST supplied image is the PREVIOUS state. The SECOND supplied image is the CURRENT state.',
      'You are a temporal verification pass, not a scene inventory. Only evaluate the listed matched object candidates.',
      'Each candidate line identifies one physical object. Its name and position/description are identity hints. Never transfer a change from a nearby door, closet, cabinet, chair, shelf, or other object to the candidate.',
      'For an openable object, visually track the SAME leaf/panel/door in both images. A nearby open doorway does not prove that a closet or cabinet changed.',
      'For movement, compare the candidate itself, not the camera framing or nearby objects. Perspective change alone is not movement.',
      'Candidate to assess:',
      ...candidateLines,
      'Return ONLY one JSON object with shape {"candidateKey":"candidate_0","sameObject":true,"previousState":"open|closed|unknown","currentState":"open|closed|unknown","moved":"yes|no|unknown","confidence":0.0}.',
      'sameObject=true only when you can confidently track the listed candidate as the same physical object in both images.',
      'For an openable object, classify previousState and currentState from the candidate itself. Use unknown when the candidate geometry is not clear enough. Do not copy the state of a nearby opening.',
      'For a non-openable object, previousState and currentState should be unknown.',
      'moved=yes only when the candidate itself is clearly displaced between the images; moved=no when its physical placement is materially the same; use unknown if perspective prevents a reliable judgment.',
      'Do not report additions, removals, hazards, conditions, issues, recommendations, or other objects.',
      'Use a high confidence only when identity and the reported temporal fact are visually clear. Prefer unknown over guessing.',
    ].join('\n')

    const content = await this.buildContent(prompt, request.artifacts)
    const response = await this.requestCompletion(
      'You are SENTINEL temporal verification. Compare two physical-environment images conservatively and return only the requested JSON.',
      content,
    )
    return this.parseTemporalVerification(this.extractText(response), request)
  }

  async reason(request: ReasoningInferenceRequest): Promise<AskBuildingResponse> {
    const prompt = [
      'Answer the user question using ONLY the supplied SENTINEL environmental memory context.',
      'Every factual claim about the environment must be supported by evidenceIds from the context.',
      'If the memory does not contain enough evidence, say that clearly instead of guessing.',
      'Treat Observed conditions as direct evidence and Inferred conditions as interpretations with lower epistemic authority.',
      'Return ONLY JSON with: answer (string), confidence (0..1), stateId (string), evidenceIds (string[]), relatedObjectIds (string[]), relatedIssueIds (string[]).',
      `Question: ${request.request.question}`,
      `Requested state: ${request.request.stateId ?? 'current'}`,
      'Environmental memory context:',
      request.context,
    ].join('\n')
    const response = await this.requestCompletion(
      'You are SENTINEL, an evidence-grounded physical-environment reasoning agent.',
      [{ type: 'text', text: prompt }],
    )
    return this.parseReasoningResult(this.extractText(response), request)
  }

  private async requestCompletion(system: string, content: unknown): Promise<ChatCompletionResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [{ role: 'system', content: system }, { role: 'user', content }],
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
      return await response.json() as ChatCompletionResponse
    } catch (error) {
      if (error instanceof ModelAdapterError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ModelAdapterError({ code: 'NEBIUS_TIMEOUT', message: `Nebius inference exceeded ${this.timeoutMs}ms`, retryable: true })
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
    let frameIndex = 0
    for (const artifact of artifacts) {
      if (artifact.kind !== 'frame') continue
      const frameId = artifact.frameId ?? artifact.artifactId
      parts.push({ type: 'text', text: `FRAME_INDEX: ${frameIndex}\nFRAME_ID: ${frameId}` })
      frameIndex += 1

      if (!this.artifactResolver) {
        parts.push({ type: 'text', text: `FRAME_ARTIFACT ${artifact.artifactId}: ${artifact.uri}` })
        continue
      }
      const resolved = await this.artifactResolver.resolve(artifact)
      parts.push({ type: 'image_url', image_url: { url: resolved.uri } })
    }
    return parts
  }

  private systemPrompt(role: ModelInferenceRequest['role']): string {
    return [
      'You are SENTINEL, a physical-environment perception system.',
      `Current role: ${role}.`,
      'Return ONLY one complete JSON object. No prose and no markdown.',
      'The top-level JSON shape is {"sourceId":"string","observations":[],"objects":[],"conditions":[],"relations":[],"evidence":[]}.',
      'All six top-level fields are required. Use [] when a collection has no supported items.',
      'SENTINEL owns frame evidence identity. Each supplied image is preceded by FRAME_INDEX and FRAME_ID. Use the exact FRAME_ID in evidenceIds whenever possible.',
      'Do NOT invent frame evidence records or fabricate evidence IDs. The evidence array may be empty because SENTINEL will create trusted frame evidence from the supplied images.',
      'If you use a numeric placeholder instead of FRAME_ID, use only evidence_N or frame_N where N is the supplied FRAME_INDEX.',
      'Every observation, object, condition, and relation you return must be visibly supportable by at least one supplied frame.',
      'If an optional claim, relation, location, geometry, or condition is not visually supportable, omit that item or optional field instead of guessing.',
      'OBSERVATION means a direct visible fact only. Do not put diagnosis, cause, risk prediction, or recommendation in observations.',
      'Observation fields: id, environmentId, sourceId, modality (image|video|audio|document|sensor), capturedAt, label, description, confidence (0..1), basis="observed", optional position, evidenceIds (string[]).',
      'Object fields: id, environmentId, category (room|door|window|furniture|equipment|electrical|hvac|safety|signage|document|person|obstruction|other), name, optional description, optional position, optional boundingBox, optional state, confidence (0..1), firstSeenAt, lastSeenAt, evidenceIds (string[]).',
      'Use only canonical object categories. Put specific labels such as chair, sofa, desk, cable, locker, logo, screen, or monitor in name/description rather than category.',
      'For object position, prefer concise semantic physical context such as "left of green door", "beside metal shelving", or "inside server room" when directly visible. Do not put bounding-box or image-coordinate tuples in position.description.',
      'Use object state only for a directly visible state such as open/closed or visibly switched on/off. Omit state rather than inferring hidden operational status.',
      'When multiple similar objects are visible, preserve them as separate objects and use grounded semantic position/relations to distinguish instances when possible. Never invent labels or relationships just to force identity.',
      'Emit stable spatial relations such as located_in, adjacent_to, near, on, in_front_of, left_of, or right_of only when the relationship is visually direct and useful for distinguishing physical context.',
      'CONDITION means a state of the environment supported by evidence. Use basis="observed" only when directly visible. Use basis="inferred" for interpretations.',
      'Condition fields: id, environmentId, kind (normal|attention|hazard|damage|maintenance|access|compliance|unknown), title, description, status (present|uncertain), basis (observed|inferred), confidence (0..1), objectIds (string[]), evidenceIds (string[]), observedAt.',
      'For inferred conditions prefer status="uncertain" unless the evidence is unusually direct. Never output recommendations as conditions.',
      'Relation fields: id, environmentId, fromId, toId, type (contains|located_in|adjacent_to|near|attached_to|part_of|on|above|below|in_front_of|behind|left_of|right_of|has_issue|requires_action|supports), confidence (0..1), evidenceIds (string[]).',
      'A relation must reference object IDs that you actually returned. If either endpoint is uncertain, omit the relation.',
      'Evidence fields, only when needed for non-frame evidence: id, type (frame|image|audio|document|observation|previous_state), sourceId, capturedAt, optional frameIndex, optional timestampMs, optional uri, optional excerpt, optional boundingBox, optional confidence, description.',
      'Never invent an object, condition, location, measurement, relationship, cause, diagnosis, timestamp, or evidence source.',
    ].join(' ')
  }

  private extractText(response: ChatCompletionResponse): string {
    const content = response.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('')
    throw new ModelAdapterError({ code: 'EMPTY_MODEL_RESPONSE', message: 'Nebius returned no model content', retryable: true })
  }

  private parseTemporalVerification(text: string, request: TemporalVerificationRequest): TemporalVerificationResult {
    let value: unknown
    try {
      value = parseModelJson(text).value
    } catch {
      throw new ModelAdapterError({
        code: 'INVALID_TEMPORAL_JSON',
        message: 'Temporal verification returned invalid JSON',
        retryable: false,
      })
    }

    const allowed = new Set(request.candidates.map((candidate) => candidate.key))
    const changes: TemporalVerificationResult['changes'] = []

    // Backward-compatible parser for older provider-shaped responses.
    if (isRecord(value) && Array.isArray(value.changes)) {
      for (const raw of value.changes) {
        if (!isRecord(raw)) continue
        const candidateKey = typeof raw.candidateKey === 'string' ? raw.candidateKey : ''
        const kind = raw.kind === 'state_change' || raw.kind === 'moved' ? raw.kind : undefined
        const confidence = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence)
        if (!allowed.has(candidateKey) || !kind || !Number.isFinite(confidence)) continue

        if (kind === 'state_change') {
          const previousState = raw.previousState === 'open' || raw.previousState === 'closed' ? raw.previousState : undefined
          const currentState = raw.currentState === 'open' || raw.currentState === 'closed' ? raw.currentState : undefined
          if (!previousState || !currentState || previousState === currentState) continue
          changes.push({ candidateKey, kind, previousState, currentState, confidence: Math.max(0, Math.min(1, confidence)) })
          continue
        }
        changes.push({ candidateKey, kind, confidence: Math.max(0, Math.min(1, confidence)) })
      }
      return { changes }
    }

    if (!isRecord(value)) {
      throw new ModelAdapterError({
        code: 'INVALID_TEMPORAL_RESULT',
        message: 'Temporal verification result must be a JSON object',
        retryable: false,
      })
    }

    const candidateKey = typeof value.candidateKey === 'string' ? value.candidateKey : ''
    const confidence = typeof value.confidence === 'number' ? value.confidence : Number(value.confidence)
    if (!allowed.has(candidateKey) || value.sameObject !== true || !Number.isFinite(confidence)) return { changes }

    const boundedConfidence = Math.max(0, Math.min(1, confidence))
    const previousState = value.previousState === 'open' || value.previousState === 'closed' ? value.previousState : undefined
    const currentState = value.currentState === 'open' || value.currentState === 'closed' ? value.currentState : undefined
    if (previousState && currentState && previousState !== currentState) {
      changes.push({ candidateKey, kind: 'state_change', previousState, currentState, confidence: boundedConfidence })
    }

    if (value.moved === 'yes' || value.moved === true) {
      changes.push({ candidateKey, kind: 'moved', confidence: boundedConfidence })
    }

    return { changes }
  }

  private parsePerceptionResult(text: string, request: ModelInferenceRequest): PerceptionResult {
    let value: unknown
    try {
      const parsed = parseModelJson(text)
      value = parsed.value
      if (parsed.repaired) {
        console.warn('SENTINEL_MODEL_JSON_REPAIRED', { model: this.model, kind: 'perception', chars: text.length })
      }
    } catch {
      throw new ModelAdapterError({
        code: 'INVALID_MODEL_JSON',
        message: 'Vision model returned invalid JSON that could not be repaired safely',
        retryable: false,
      })
    }

    const sourceId = extractScanSourceId(request.prompt)
    const environmentId = extractScanEnvironmentId(request.prompt)
    const capturedAt = extractScanCapturedAt(request.prompt)

    if (isRecord(value)) {
      value = stampTrustedPerceptionIdentity(value, sourceId, environmentId, capturedAt)
      const normalization = normalizePerceptionEvidenceReferences(value)
      value = normalization.value

      const repairCount = normalization.remappedReferences
        + normalization.normalizedConfidences
        + normalization.normalizedNumericFields
        + normalization.normalizedRelations
        + normalization.normalizedArrays
        + normalization.normalizedOptionalFields
        + normalization.generatedIds
        + normalization.droppedItems

      if (repairCount > 0) {
        console.warn('SENTINEL_PROVIDER_PERCEPTION_CANONICALIZED', {
          model: this.model,
          remappedReferences: normalization.remappedReferences,
          normalizedConfidences: normalization.normalizedConfidences,
          normalizedNumericFields: normalization.normalizedNumericFields,
          normalizedRelations: normalization.normalizedRelations,
          normalizedArrays: normalization.normalizedArrays,
          normalizedOptionalFields: normalization.normalizedOptionalFields,
          generatedIds: normalization.generatedIds,
          droppedItems: normalization.droppedItems,
          droppedRelations: normalization.droppedRelations,
        })
      }
    }

    try {
      return validatePerception(value)
    } catch (error) {
      if (error instanceof PerceptionValidationError) {
        throw new ModelAdapterError({ code: error.code, message: error.message, retryable: false })
      }
      throw error
    }
  }

  private parseReasoningResult(text: string, request: ReasoningInferenceRequest): AskBuildingResponse {
    let value: unknown
    try {
      const parsed = parseModelJson(text)
      value = parsed.value
      if (parsed.repaired) {
        console.warn('SENTINEL_MODEL_JSON_REPAIRED', { model: this.model, kind: 'reasoning', chars: text.length })
      }
    } catch {
      throw new ModelAdapterError({
        code: 'INVALID_REASONING_JSON',
        message: 'Nemotron returned invalid reasoning JSON that could not be repaired safely',
        retryable: false,
      })
    }

    if (
      !isRecord(value)
      || typeof value.answer !== 'string'
      || typeof value.confidence !== 'number'
      || typeof value.stateId !== 'string'
      || !isStringArray(value.evidenceIds)
      || !isStringArray(value.relatedObjectIds)
      || !isStringArray(value.relatedIssueIds)
    ) {
      throw new ModelAdapterError({
        code: 'INVALID_REASONING_SCHEMA',
        message: 'Nemotron reasoning response did not match the AskBuildingResponse schema',
        retryable: false,
      })
    }

    if (value.stateId !== request.request.stateId && !request.context.includes(`STATE_ID ${value.stateId}`)) {
      throw new ModelAdapterError({
        code: 'INVALID_REASONING_STATE',
        message: 'Reasoning response referenced a state outside the supplied context',
        retryable: false,
      })
    }

    return {
      answer: value.answer,
      confidence: Math.max(0, Math.min(1, value.confidence)),
      stateId: value.stateId,
      evidenceIds: value.evidenceIds,
      relatedObjectIds: value.relatedObjectIds,
      relatedIssueIds: value.relatedIssueIds,
    }
  }
}

function stampTrustedPerceptionIdentity(
  value: Record<string, unknown>,
  sourceId?: string,
  environmentId?: string,
  capturedAt?: string,
): Record<string, unknown> {
  return {
    ...value,
    ...(sourceId ? { sourceId } : {}),
    observations: stampCollection(value.observations, (item) => ({
      ...item,
      ...(sourceId ? { sourceId } : {}),
      ...(environmentId ? { environmentId } : {}),
      ...(capturedAt ? { capturedAt } : {}),
      basis: 'observed',
      modality: item.modality ?? 'video',
    })),
    objects: stampCollection(value.objects, (item) => ({
      ...item,
      ...(environmentId ? { environmentId } : {}),
      ...(capturedAt ? { firstSeenAt: capturedAt, lastSeenAt: capturedAt } : {}),
    })),
    conditions: stampCollection(value.conditions, (item) => ({
      ...item,
      ...(environmentId ? { environmentId } : {}),
      ...(capturedAt ? { observedAt: capturedAt } : {}),
    })),
    relations: stampCollection(value.relations, (item) => ({
      ...item,
      ...(environmentId ? { environmentId } : {}),
    })),
    evidence: stampCollection(value.evidence, (item) => ({
      ...item,
      ...(sourceId ? { sourceId } : {}),
      ...(capturedAt ? { capturedAt } : {}),
    })),
  }
}

function stampCollection(
  value: unknown,
  stamp: (item: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) return value.map((item) => isRecord(item) ? stamp(item) : item)
  if (isRecord(value)) return stamp(value)
  return value
}

function resolveBaseUrl(value?: string): string {
  const configured = value?.trim().replace(/\/$/, '')
  if (!configured || configured === LEGACY_GLOBAL_BASE_URL) return DEFAULT_BASE_URL
  return configured
}

function parseModelJson(text: string): { value: unknown; repaired: boolean } {
  const candidate = extractJson(text)
  try {
    return { value: JSON.parse(candidate), repaired: false }
  } catch {
    const repaired = jsonrepair(candidate)
    return { value: JSON.parse(repaired), repaired: true }
  }
}

function extractScanSourceId(prompt: string): string | undefined {
  const match = prompt.match(/The scan source id is\s+([^\n.]+)\.?/i)
  return match?.[1]?.trim() || undefined
}

function extractScanEnvironmentId(prompt: string): string | undefined {
  const match = prompt.match(/for environment\s+([^\n.]+)\.?/i)
  return match?.[1]?.trim() || undefined
}

function extractScanCapturedAt(prompt: string): string | undefined {
  const match = prompt.match(/The trusted scan capturedAt is\s+([^\n.]+)\.?/i)
  return match?.[1]?.trim() || undefined
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) return fenced[1]
  const start = text.indexOf('{')
  if (start < 0) return text.trim()
  const end = text.lastIndexOf('}')
  return end > start ? text.slice(start, end + 1) : text.slice(start)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function createNebiusNemotronAdapter(
  apiKey: string,
  options: Omit<NebiusAdapterOptions, 'apiKey'> = {},
) {
  return new NebiusNemotronAdapter({ apiKey, ...options })
}
