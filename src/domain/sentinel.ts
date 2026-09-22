/**
 * SENTINEL domain model.
 *
 * These contracts are intentionally model-agnostic: perception, memory,
 * reasoning, comparison, and verification can evolve without changing the
 * application's core representation of a physical environment.
 */

export type ID = string
export type EnvironmentId = ID
export type ISODateTime = string
export type Confidence = number // 0..1

export type EnvironmentType =
  | 'office'
  | 'school'
  | 'hotel'
  | 'clinic'
  | 'retail'
  | 'home'
  | 'warehouse'
  | 'construction'
  | 'other'

export type ObservationModality = 'video' | 'image' | 'audio' | 'document' | 'sensor'
export type ObjectCategory = 'room' | 'door' | 'window' | 'furniture' | 'equipment' | 'electrical' | 'hvac' | 'safety' | 'signage' | 'document' | 'person' | 'obstruction' | 'other'
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type IssueStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed'
export type IssueType = 'safety' | 'maintenance' | 'damage' | 'access' | 'compliance' | 'unknown'
export type ChangeType = 'added' | 'removed' | 'moved' | 'changed' | 'resolved' | 'unchanged' | 'uncertain'
export type EvidenceType = 'frame' | 'image' | 'audio' | 'document' | 'observation' | 'previous_state'
export type ActionStatus = 'recommended' | 'approved' | 'in_progress' | 'completed' | 'verified' | 'cancelled'
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low'
export type RelationType =
  | 'contains'
  | 'located_in'
  | 'adjacent_to'
  | 'near'
  | 'attached_to'
  | 'part_of'
  | 'on'
  | 'above'
  | 'below'
  | 'in_front_of'
  | 'behind'
  | 'left_of'
  | 'right_of'
  | 'has_issue'
  | 'requires_action'
  | 'supports'
export type ClaimBasis = 'observed' | 'inferred'
export type ConditionKind = 'normal' | 'attention' | 'hazard' | 'damage' | 'maintenance' | 'access' | 'compliance' | 'unknown'
export type ConditionStatus = 'present' | 'uncertain'

export interface SpatialPosition { description: string; x?: number; y?: number; z?: number; roomId?: ID; relativeToId?: ID }
export interface BoundingBox { x: number; y: number; width: number; height: number; frameWidth?: number; frameHeight?: number }
export interface Evidence { id: ID; type: EvidenceType; sourceId: ID; capturedAt: ISODateTime; frameIndex?: number; timestampMs?: number; uri?: string; excerpt?: string; boundingBox?: BoundingBox; confidence?: Confidence; description: string }
export interface Observation { id: ID; environmentId: ID; sourceId: ID; modality: ObservationModality; capturedAt: ISODateTime; label: string; description: string; confidence: Confidence; basis: 'observed'; position?: SpatialPosition; evidenceIds: ID[] }
export interface SpatialObject { id: ID; environmentId: ID; category: ObjectCategory; name: string; description?: string; position?: SpatialPosition; boundingBox?: BoundingBox; state?: string; confidence: Confidence; firstSeenAt: ISODateTime; lastSeenAt: ISODateTime; evidenceIds: ID[] }
export interface EnvironmentalCondition { id: ID; environmentId: ID; kind: ConditionKind; title: string; description: string; status: ConditionStatus; basis: ClaimBasis; confidence: Confidence; objectIds: ID[]; evidenceIds: ID[]; observedAt: ISODateTime }
export interface Issue { id: ID; environmentId: ID; type: IssueType; title: string; description: string; severity: IssueSeverity; status: IssueStatus; confidence: Confidence; objectIds: ID[]; roomId?: ID; evidenceIds: ID[]; firstDetectedAt: ISODateTime; lastObservedAt: ISODateTime; resolvedAt?: ISODateTime; resolutionNote?: string }
export interface EnvironmentRelation { id: ID; environmentId: ID; fromId: ID; toId: ID; type: RelationType; confidence: Confidence; evidenceIds: ID[] }
export interface EnvironmentalState { id: ID; environmentId: ID; capturedAt: ISODateTime; sourceIds: ID[]; objectIds: ID[]; conditionIds: ID[]; issueIds: ID[]; relationIds: ID[]; summary: string; version: number }
export interface EnvironmentalStateSnapshot { stateId: ID; environmentId: ID; objects: SpatialObject[]; conditions: EnvironmentalCondition[]; issues: Issue[]; relations: EnvironmentRelation[] }
export interface Environment { id: ID; name: string; type: EnvironmentType; description?: string; createdAt: ISODateTime; updatedAt: ISODateTime; currentStateId?: ID; stateIds: ID[]; roomIds: ID[]; objectIds: ID[]; issueIds: ID[] }
export interface Change { id: ID; environmentId: ID; fromStateId: ID; toStateId: ID; type: ChangeType; entityId?: ID; entityKind?: 'object' | 'condition' | 'issue'; title: string; description: string; confidence: Confidence; evidenceIds: ID[] }
export interface EnvironmentalDiff { id: ID; environmentId: ID; fromStateId: ID; toStateId: ID; createdAt: ISODateTime; changes: Change[]; summary: string }
export interface ActionStep {
  id: ID
  title: string
  description: string
  priority: ActionPriority
  status: ActionStatus
  relatedConditionIds: ID[]
  relatedIssueIds: ID[]
  relatedObjectIds: ID[]
  requiredSpecialist?: string
  evidenceIds: ID[]
}
export interface MoneyEstimate { currency: string; min: number; max: number; basis: string }
export interface ActionPlan {
  id: ID
  environmentId: ID
  stateId: ID
  createdAt: ISODateTime
  goal: string
  steps: ActionStep[]
  rationale: string
  evidenceIds: ID[]
}
export type VerificationStatus = 'passed' | 'partial' | 'failed' | 'inconclusive'
export type VerificationConditionStatus = 'resolved' | 'remaining' | 'inconclusive'
export interface VerificationConditionVerdict {
  conditionId: ID
  status: VerificationConditionStatus
  confidence: Confidence
  reason: string
  currentConditionId?: ID
  relatedObjectIds: ID[]
  evidenceIds: ID[]
}
export interface VerificationRequest {
  environmentId: ID
  previousStateId: ID
  currentStateId: ID
  actionPlanId?: ID
  conditionIds?: ID[]
}
export interface VerificationGrounding {
  previousState: AskBuildingStateReference
  currentState: AskBuildingStateReference
  evidence: AskBuildingEvidenceReference[]
  baselineConditions: ActionPlanConditionReference[]
  currentConditions: ActionPlanConditionReference[]
  objects: AskBuildingObjectReference[]
  diffId?: ID
}
export interface VerificationResult {
  id: ID
  environmentId: ID
  actionPlanId?: ID
  previousStateId: ID
  currentStateId: ID
  verifiedAt: ISODateTime
  status: VerificationStatus
  resolvedConditionIds: ID[]
  remainingConditionIds: ID[]
  inconclusiveConditionIds: ID[]
  newConditionIds: ID[]
  verdicts: VerificationConditionVerdict[]
  changes: Change[]
  summary: string
  evidenceIds: ID[]
  grounding: VerificationGrounding
}
export interface ScanSource { id: ID; environmentId: ID; modality: ObservationModality; uri: string; capturedAt: ISODateTime; durationMs?: number; metadata?: Record<string, string | number | boolean> }
export interface EnvironmentalMemory { environment: Environment; states: EnvironmentalState[]; snapshots: EnvironmentalStateSnapshot[]; objects: SpatialObject[]; conditions: EnvironmentalCondition[]; issues: Issue[]; observations: Observation[]; evidence: Evidence[]; relations: EnvironmentRelation[]; sources: ScanSource[]; diffs: EnvironmentalDiff[] }
export interface AskBuildingRequest { environmentId: ID; question: string; stateId?: ID }
export type AskBuildingIntent = 'attention' | 'location' | 'nearby' | 'change' | 'priority' | 'action' | 'resolution' | 'general'
export interface AskBuildingStateReference { id: ID; version: number; capturedAt: ISODateTime; summary: string; isCurrent: boolean }
export interface AskBuildingEvidenceReference { id: ID; sourceId: ID; type: EvidenceType; capturedAt: ISODateTime; description: string; frameIndex?: number; timestampMs?: number; uri?: string; stateIds: ID[] }
export interface AskBuildingObjectReference { id: ID; name: string; category: ObjectCategory; state?: string; position?: string; confidence: Confidence; stateIds: ID[]; isCurrent: boolean }
export interface AskBuildingIssueReference { id: ID; title: string; severity: IssueSeverity; status: IssueStatus; confidence: Confidence; stateIds: ID[]; isCurrent: boolean }
export interface AskBuildingGrounding {
  intent: AskBuildingIntent
  state: AskBuildingStateReference
  historyStateIds: ID[]
  evidence: AskBuildingEvidenceReference[]
  objects: AskBuildingObjectReference[]
  issues: AskBuildingIssueReference[]
}
export interface AskBuildingResponse {
  answer: string
  rationale?: string
  confidence: Confidence
  stateId: ID
  evidenceIds: ID[]
  relatedObjectIds: ID[]
  relatedIssueIds: ID[]
  grounding?: AskBuildingGrounding
}
export interface ActionPlanningRequest {
  environmentId: ID
  stateId?: ID
  goal?: string
  relatedConditionIds?: ID[]
  relatedIssueIds?: ID[]
  relatedObjectIds?: ID[]
}
export interface ActionPlanConditionReference {
  id: ID
  title: string
  description: string
  kind: ConditionKind
  basis: ClaimBasis
  status: ConditionStatus
  confidence: Confidence
  objectIds: ID[]
  evidenceIds: ID[]
}
export interface ActionPlanGrounding {
  state: AskBuildingStateReference
  evidence: AskBuildingEvidenceReference[]
  conditions: ActionPlanConditionReference[]
  issues: AskBuildingIssueReference[]
  objects: AskBuildingObjectReference[]
}
export interface ActionPlanningResponse {
  plan: ActionPlan
  grounding: ActionPlanGrounding
}
export interface PerceptionResult { sourceId: ID; observations: Observation[]; objects: SpatialObject[]; conditions: EnvironmentalCondition[]; relations: EnvironmentRelation[]; evidence: Evidence[] }
export type TemporalChangeKind = 'state_change' | 'moved'
export interface VerifiedTemporalChange {
  kind: TemporalChangeKind
  previousObjectName: string
  currentObjectName: string
  previousState?: 'open' | 'closed'
  currentState?: 'open' | 'closed'
  confidence: Confidence
}
