import type { ActionPlanningRequest, ActionPriority, AskBuildingRequest, AskBuildingResponse, PerceptionResult, TemporalChangeKind, VerificationConditionStatus, VerificationRequest } from '../domain/sentinel'
import type { ScanArtifact } from '../scan/types'

export type ModelRole = 'perception' | 'reasoning' | 'verification'

export interface ModelInferenceRequest {
  role: ModelRole
  prompt: string
  artifacts: ScanArtifact[]
}

export interface ReasoningInferenceRequest {
  role: 'reasoning' | 'verification'
  request: AskBuildingRequest
  context: string
}
export interface ActionPlanningDraftStep {
  title: string
  description: string
  priority: ActionPriority
  relatedConditionIds: string[]
  relatedIssueIds: string[]
  relatedObjectIds: string[]
  evidenceIds: string[]
  requiredSpecialist?: string
}
export interface ActionPlanningDraft {
  goal: string
  rationale: string
  steps: ActionPlanningDraftStep[]
}
export interface ActionPlanningInferenceRequest {
  role: 'action'
  request: ActionPlanningRequest & { stateId: string }
  context: string
}
export interface TemporalVerificationCandidate {
  key: string
  previousObjectName: string
  currentObjectName: string
  category: string
  previousPosition?: string
  currentPosition?: string
  previousDescription?: string
  currentDescription?: string
}

export interface TemporalVerificationRequest {
  environmentId: string
  previousSourceId: string
  currentSourceId: string
  artifacts: ScanArtifact[]
  candidates: TemporalVerificationCandidate[]
}

export interface TemporalVerificationChange {
  candidateKey: string
  kind: TemporalChangeKind
  previousState?: 'open' | 'closed'
  currentState?: 'open' | 'closed'
  confidence: number
}

export interface TemporalVerificationResult {
  changes: TemporalVerificationChange[]
}


export interface ModelAdapter {
  readonly provider: string
  readonly model: string
  infer(request: ModelInferenceRequest): Promise<PerceptionResult>
  verifyTemporal?(request: TemporalVerificationRequest): Promise<TemporalVerificationResult>
}

export interface ReasoningModelAdapter {
  readonly provider: string
  readonly model: string
  reason(request: ReasoningInferenceRequest): Promise<AskBuildingResponse>
}
export interface ActionPlanningModelAdapter {
  readonly provider: string
  readonly model: string
  plan(request: ActionPlanningInferenceRequest): Promise<ActionPlanningDraft>
}
export interface VerificationDraftVerdict {
  conditionId: string
  status: VerificationConditionStatus
  confidence: number
  reason: string
  evidenceIds: string[]
  relatedObjectIds: string[]
}
export interface VerificationDraft {
  verdicts: VerificationDraftVerdict[]
}
export interface VerificationInferenceRequest {
  role: 'verification'
  request: VerificationRequest
  context: string
  artifacts: ScanArtifact[]
}
export interface VerificationModelAdapter {
  readonly provider: string
  readonly model: string
  verifyConditions(request: VerificationInferenceRequest): Promise<VerificationDraft>
}

export interface ArtifactContent {
  artifactId: string
  mimeType: string
  /** Public URL or data URL. Never expose provider credentials here. */
  uri: string
}

export interface ArtifactResolver {
  resolve(artifact: ScanArtifact): Promise<ArtifactContent>
}

export interface ModelAdapterErrorInfo {
  code: string
  message: string
  status?: number
  retryable: boolean
}

export class ModelAdapterError extends Error {
  readonly code: string
  readonly status?: number
  readonly retryable: boolean

  constructor(info: ModelAdapterErrorInfo) {
    super(info.message)
    this.name = 'ModelAdapterError'
    this.code = info.code
    this.status = info.status
    this.retryable = info.retryable
  }
}
