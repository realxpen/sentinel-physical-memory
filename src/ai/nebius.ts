import { jsonrepair } from 'jsonrepair'
import type { AskBuildingResponse, PerceptionResult } from '../domain/sentinel.js'
import type { ScanArtifact } from '../scan/types.js'
import { normalizePerceptionEvidenceReferences } from './perception-normalization.js'
import { validatePerception, PerceptionValidationError } from './perception-schema.js'
import {
  ModelAdapterError,
  type ActionPlanningDraft,
  type ActionPlanningInferenceRequest,
  type ActionPlanningModelAdapter,
  type ArtifactResolver,
  type ModelAdapter,
  type ModelInferenceRequest,
  type ReasoningInferenceRequest,
  type ReasoningModelAdapter,
  type TemporalVerificationRequest,
  type TemporalVerificationResult,
  type VerificationDraft,
  type VerificationInferenceRequest,
  type VerificationModelAdapter,
} from './model.js'

const DEFAULT_BASE_URL = 'https://api.tokenfactory.us-central1.nebius.com/v1'
const LEGACY_GLOBAL_BASE_URL = 'https://api.tokenfactory.nebius.com/v1'
const DEFAULT_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'

export type NebiusInferenceRole = 'perception' | 'temporal-verification' | 'reasoning' | 'action' | 'verification'

export interface NebiusInferenceTrace {
  provider: 'nebius-token-factory'
  model: string
  role: NebiusInferenceRole
  latencyMs: number
  outcome: 'success' | 'error'
  completedAt: string
  httpStatus?: number
  errorCode?: string
}

interface NebiusAdapterOptions {
  apiKey: string
  baseUrl?: string
  model?: string
  fetchImpl?: typeof fetch
  artifactResolver?: ArtifactResolver
  timeoutMs?: number
  onTrace?: (trace: NebiusInferenceTrace) => void
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>
}

export class NebiusNemotronAdapter implements ModelAdapter, ReasoningModelAdapter, ActionPlanningModelAdapter, VerificationModelAdapter {
  readonly provider = 'nebius-token-factory'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly artifactResolver?: ArtifactResolver
  private readonly timeoutMs: number
  private readonly onTrace?: (trace: NebiusInferenceTrace) => void

  constructor(options: NebiusAdapterOptions) {
    const apiKey = options.apiKey.trim()
    if (!apiKey) throw new Error('NEBIUS_API_KEY is required')
    this.apiKey = apiKey
    this.baseUrl = resolveBaseUrl(options.baseUrl)
    this.model = options.model?.trim() || DEFAULT_MODEL
    this.fetchImpl = options.fetchImpl ?? fetch
    this.artifactResolver = options.artifactResolver
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.onTrace = options.onTrace
  }

  async infer(request: ModelInferenceRequest): Promise<PerceptionResult> {
    const content = await this.buildContent(request.prompt, request.artifacts)
    const response = await this.requestCompletion(this.systemPrompt(request.role), content, 'perception', request.timeoutMs)
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
      'temporal-verification',
      request.timeoutMs,
    )
    return this.parseTemporalVerification(this.extractText(response), request)
  }

  async reason(request: ReasoningInferenceRequest): Promise<AskBuildingResponse> {
    const prompt = [
      'Answer the user question using ONLY the supplied SENTINEL environmental memory context.',
      'Every factual claim about the environment must be supported by evidenceIds from the context.',
      'If the memory does not contain enough evidence, say that clearly instead of guessing.',
      'Treat Observed conditions as direct evidence and Inferred conditions as interpretations with lower epistemic authority.',
      'Write answer as a concise editorial conclusion, not a chatty assistant preamble. Lead with the conclusion.',
      'Write rationale as a short explanation of why the memory supports that conclusion. Keep recommendations explicitly framed as recommendations.',
      'For location questions, never invent metric distance or room geometry that is absent from context.',
      'For change/resolution questions, use persisted state history and diffs. Not re-observed is uncertainty, not proof of removal or resolution.',
      'For historical-state questions, never use later states as evidence for what was true then.',
      'Return ONLY JSON with: answer (string), rationale (string), confidence (0..1), stateId (string), evidenceIds (string[]), relatedObjectIds (string[]), relatedIssueIds (string[]).',
      `Question: ${request.request.question}`,
      `Requested state: ${request.request.stateId ?? 'current'}`,
      'Environmental memory context:',
      request.context,
    ].join('\n')
    const response = await this.requestCompletion(
      'You are SENTINEL, an evidence-grounded physical-environment reasoning agent.',
      [{ type: 'text', text: prompt }],
      'reasoning',
    )
    return this.parseReasoningResult(this.extractText(response), request)
  }

  async plan(request: ActionPlanningInferenceRequest): Promise<ActionPlanningDraft> {
    const prompt = [
      'Create a compact recommended action plan using ONLY the supplied SENTINEL planning context.',
      'This is planning, not execution. Never claim that work is completed, resolved, or verified.',
      'Every step must reference supplied relatedConditionIds or relatedIssueIds and supplied evidenceIds.',
      'Use relatedObjectIds only when those IDs appear in context.',
      'Do not invent diagnoses, distances, costs, parts, vendors, contractors, payments, procurement, or schedules.',
      'Do not give unqualified hazardous repair instructions. For specialist electrical, fire-safety, structural, gas, pressurized, or similar work, recommend safe isolation when directly supportable and a qualified professional.',
      'For uncertain conditions, prefer inspection or re-observation.',
      'Keep the plan to 1-3 practical corrective steps. Each description should be concise (prefer under 180 characters). SENTINEL will append the final rescan/verification step deterministically.',
      'Return ONLY JSON with shape: {"goal":"string","rationale":"string","steps":[{"title":"string","description":"string","priority":"critical|high|medium|low","relatedConditionIds":["id"],"relatedIssueIds":["id"],"relatedObjectIds":["id"],"evidenceIds":["id"],"requiredSpecialist":"optional string"}]}.',
      'Planning context:',
      request.context,
    ].join('\n')

    const response = await this.requestCompletion(
      'You are SENTINEL Action Planner. Produce only safe, evidence-grounded recommended actions for the selected physical-environment state.',
      [{ type: 'text', text: prompt }],
      'action',
    )
    return this.parseActionPlanningDraft(this.extractText(response))
  }

  private parseActionPlanningDraft(text: string): ActionPlanningDraft {
    let value: unknown
    try {
      const parsed = parseModelJson(text)
      value = parsed.value
      if (parsed.repaired) console.warn('SENTINEL_MODEL_JSON_REPAIRED', { model: this.model, kind: 'action-plan', chars: text.length })
    } catch {
      throw new ModelAdapterError({ code: 'INVALID_ACTION_PLAN_JSON', message: 'Nemotron returned invalid action-plan JSON', retryable: false })
    }

    if (!isRecord(value) || typeof value.goal !== 'string' || typeof value.rationale !== 'string' || !Array.isArray(value.steps)) {
      throw new ModelAdapterError({ code: 'INVALID_ACTION_PLAN_SCHEMA', message: 'Nemotron action plan did not match the required schema', retryable: false })
    }

    const steps = value.steps.flatMap((raw): ActionPlanningDraft['steps'] => {
      if (!isRecord(raw) || typeof raw.title !== 'string' || typeof raw.description !== 'string') return []
      const priority = raw.priority === 'critical' || raw.priority === 'high' || raw.priority === 'medium' || raw.priority === 'low' ? raw.priority : undefined
      if (!priority || !isStringArray(raw.relatedConditionIds) || !isStringArray(raw.relatedIssueIds) || !isStringArray(raw.relatedObjectIds) || !isStringArray(raw.evidenceIds)) return []
      return [{
        title: raw.title,
        description: raw.description,
        priority,
        relatedConditionIds: raw.relatedConditionIds,
        relatedIssueIds: raw.relatedIssueIds,
        relatedObjectIds: raw.relatedObjectIds,
        evidenceIds: raw.evidenceIds,
        ...(typeof raw.requiredSpecialist === 'string' ? { requiredSpecialist: raw.requiredSpecialist } : {}),
      }]
    })

    if (!steps.length) {
      throw new ModelAdapterError({ code: 'INVALID_ACTION_PLAN_STEPS', message: 'Nemotron action plan contained no valid steps', retryable: false })
    }

    return { goal: value.goal, rationale: value.rationale, steps }
  }

  async verifyConditions(request: VerificationInferenceRequest): Promise<VerificationDraft> {
    const prompt = [
      'Verify earlier physical-environment conditions against the CURRENT state using the supplied SENTINEL verification context and comparison images.',
      'Images whose FRAME_ID starts with "verification_previous_" are BASELINE localization references only. They may help you identify the exact physical object/area that contained the earlier condition, but they can NEVER prove resolution.',
      'Images whose FRAME_ID starts with "verification_current_" are CURRENT-state images. Only these, together with CURRENT_EVIDENCE and CURRENT_OBJECTS, may support resolved or remaining.',
      'Use the baseline image to localize where the earlier obstruction/damage/condition physically was, then inspect that exact location in the current image.',
      'Missing from the current condition list is NOT evidence of resolution.',
      'resolved = positive current visual evidence from the same physical object/area shows the earlier condition is no longer present.',
      'For access obstruction, resolved may be supported when the baseline image localizes the former obstruction and the CURRENT image positively shows that same floor/doorway/path segment clear and traversable, anchored by a durable feature such as the same EXIT sign or exit door.',
      'A clear path is positive geometry: the relevant current floor/doorway segment is visibly open with no object occupying or blocking it. Do not use mere non-detection of the old obstacle as proof.',
      'remaining = positive current visual evidence still supports the earlier condition.',
      'inconclusive = the relevant object/area was not clearly re-observed or current evidence cannot distinguish resolved from remaining.',
      'Use only CURRENT_EVIDENCE IDs and CURRENT_OBJECT IDs from the context. Link visual claims to the CURRENT_EVIDENCE ID whose source matches the supplied image source.',
      'Never infer resolution from an action plan, issue disappearance, generic normal wording, or lack of detection alone.',
      'Keep each reason concise and factual.',
      'Return ONLY JSON with shape: {"verdicts":[{"conditionId":"id","status":"resolved|remaining|inconclusive","confidence":0.0,"reason":"string","evidenceIds":["id"],"relatedObjectIds":["id"]}]}.',
      'Verification context:',
      request.context,
    ].join('\n')

    const content = await this.buildContent(prompt, request.artifacts)
    const response = await this.requestCompletion(
      'You are SENTINEL Verification Agent. Inspect the supplied CURRENT rescan image(s) conservatively. Positive visual evidence is required for resolved or remaining; otherwise return inconclusive.',
      content,
      'verification',
    )
    return this.parseVerificationDraft(this.extractText(response))
  }

  private parseVerificationDraft(text: string): VerificationDraft {
    let value: unknown
    try {
      const parsed = parseModelJson(text)
      value = parsed.value
      if (parsed.repaired) console.warn('SENTINEL_MODEL_JSON_REPAIRED', { model: this.model, kind: 'verification', chars: text.length })
    } catch {
      throw new ModelAdapterError({ code: 'INVALID_VERIFICATION_JSON', message: 'Nemotron returned invalid verification JSON', retryable: false })
    }

    if (!isRecord(value) || !Array.isArray(value.verdicts)) {
      throw new ModelAdapterError({ code: 'INVALID_VERIFICATION_SCHEMA', message: 'Nemotron verification did not match the required schema', retryable: false })
    }

    const verdicts = value.verdicts.flatMap((raw): VerificationDraft['verdicts'] => {
      if (!isRecord(raw) || typeof raw.conditionId !== 'string' || typeof raw.reason !== 'string') return []
      const status = raw.status === 'resolved' || raw.status === 'remaining' || raw.status === 'inconclusive' ? raw.status : undefined
      const confidence = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence)
      if (!status || !Number.isFinite(confidence) || !isStringArray(raw.evidenceIds) || !isStringArray(raw.relatedObjectIds)) return []
      return [{
        conditionId: raw.conditionId,
        status,
        confidence: Math.max(0, Math.min(1, confidence)),
        reason: raw.reason,
        evidenceIds: raw.evidenceIds,
        relatedObjectIds: raw.relatedObjectIds,
      }]
    })

    return { verdicts }
  }

  private async requestCompletion(
    system: string,
    content: unknown,
    role: NebiusInferenceRole,
    timeoutOverrideMs?: number,
  ): Promise<ChatCompletionResponse> {
    const requestTimeoutMs = timeoutOverrideMs ?? this.timeoutMs
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    const startedAt = Date.now()
    let traceEmitted = false

    const emit = (trace: Omit<NebiusInferenceTrace, 'provider' | 'model' | 'role' | 'latencyMs' | 'completedAt'>) => {
      if (traceEmitted) return
      traceEmitted = true
      const event: NebiusInferenceTrace = {
        provider: 'nebius-token-factory',
        model: this.model,
        role,
        latencyMs: Math.max(0, Date.now() - startedAt),
        completedAt: new Date().toISOString(),
        ...trace,
      }
      console.info('SENTINEL_NEBIUS_INFERENCE', event)
      this.onTrace?.(event)
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: maxTokensForRole(role),
          messages: [{ role: 'system', content: system }, { role: 'user', content }],
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        emit({ outcome: 'error', httpStatus: response.status, errorCode: 'NEBIUS_HTTP_ERROR' })
        throw new ModelAdapterError({
          code: 'NEBIUS_HTTP_ERROR',
          message: `Nebius inference failed (${response.status}): ${body.slice(0, 500)}`,
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        })
      }
      const parsed = await response.json() as ChatCompletionResponse
      emit({ outcome: 'success', httpStatus: response.status })
      return parsed
    } catch (error) {
      if (error instanceof ModelAdapterError) {
        emit({ outcome: 'error', ...(error.status === undefined ? {} : { httpStatus: error.status }), errorCode: error.code })
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        emit({ outcome: 'error', errorCode: 'NEBIUS_TIMEOUT' })
        throw new ModelAdapterError({ code: 'NEBIUS_TIMEOUT', message: `Nebius inference exceeded ${requestTimeoutMs}ms`, retryable: true })
      }
      emit({ outcome: 'error', errorCode: 'NEBIUS_REQUEST_FAILED' })
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
      ...(typeof value.rationale === 'string' && value.rationale.trim() ? { rationale: value.rationale.trim() } : {}),
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

function maxTokensForRole(role: NebiusInferenceRole): number {
  switch (role) {
    case 'perception': return 2200
    case 'temporal-verification': return 320
    case 'reasoning': return 900
    case 'action': return 1200
    case 'verification': return 1000
  }
}
