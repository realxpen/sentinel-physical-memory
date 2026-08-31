/**
 * SENTINEL domain model.
 *
 * These contracts are intentionally model-agnostic: perception, memory,
 * reasoning, comparison, and verification can evolve without changing the
 * application's core representation of a physical environment.
 */

export type ID = string
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

export type ObjectCategory =
  | 'room'
  | 'door'
  | 'window'
  | 'furniture'
  | 'equipment'
  | 'electrical'
  | 'hvac'
  | 'safety'
  | 'signage'
  | 'document'
  | 'person'
  | 'obstruction'
  | 'other'

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type IssueStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'dismissed'
export type IssueType = 'safety' | 'maintenance' | 'damage' | 'access' | 'compliance' | 'unknown'

export type ChangeType = 'added' | 'removed' | 'moved' | 'changed' | 'resolved' | 'unchanged'

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
  | 'has_issue'
  | 'requires_action'
  | 'supports'

export interface SpatialPosition {
  /** Human-readable spatial grounding; exact coordinates are optional. */
  description: string
  x?: number
  y?: number
  z?: number
  roomId?: ID
  relativeToId?: ID
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameWidth?: number
  frameHeight?: number
}

export interface Evidence {
  id: ID
  type: EvidenceType
  sourceId: ID
  capturedAt: ISODateTime
  frameIndex?: number
  timestampMs?: number
  uri?: string
  excerpt?: string
  boundingBox?: BoundingBox
  confidence?: Confidence
  description: string
}

export interface Observation {
  id: ID
  environmentId: ID
  sourceId: ID
  modality: ObservationModality
  capturedAt: ISODateTime
  label: string
  description: string
  confidence: Confidence
  position?: SpatialPosition
  evidenceIds: ID[]
}

export interface SpatialObject {
  id: ID
  environmentId: ID
  category: ObjectCategory
  name: string
  description?: string
  position?: SpatialPosition
  boundingBox?: BoundingBox
  state?: string
  confidence: Confidence
  firstSeenAt: ISODateTime
  lastSeenAt: ISODateTime
  evidenceIds: ID[]
}

export interface Issue {
  id: ID
  environmentId: ID
  type: IssueType
  title: string
  description: string
  severity: IssueSeverity
  status: IssueStatus
  confidence: Confidence
  objectIds: ID[]
  roomId?: ID
  evidenceIds: ID[]
  firstDetectedAt: ISODateTime
  lastObservedAt: ISODateTime
  resolvedAt?: ISODateTime
  resolutionNote?: string
}

export interface EnvironmentRelation {
  id: ID
  environmentId: ID
  fromId: ID
  toId: ID
  type: RelationType
  confidence: Confidence
  evidenceIds: ID[]
}

export interface EnvironmentalState {
  id: ID
  environmentId: ID
  capturedAt: ISODateTime
  sourceIds: ID[]
  objectIds: ID[]
  issueIds: ID[]
  relationIds: ID[]
  summary: string
  version: number
}

export interface Environment {
  id: ID
  name: string
  type: EnvironmentType
  description?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  currentStateId?: ID
  stateIds: ID[]
  roomIds: ID[]
  objectIds: ID[]
  issueIds: ID[]
}

export interface Change {
  id: ID
  environmentId: ID
  fromStateId: ID
  toStateId: ID
  type: ChangeType
  entityId?: ID
  title: string
  description: string
  confidence: Confidence
  evidenceIds: ID[]
}

export interface EnvironmentalDiff {
  id: ID
  environmentId: ID
  fromStateId: ID
  toStateId: ID
  createdAt: ISODateTime
  changes: Change[]
  summary: string
}

export interface ActionStep {
  id: ID
  title: string
  description: string
  priority: ActionPriority
  status: ActionStatus
  issueIds: ID[]
  requiredSpecialist?: string
  estimatedCost?: MoneyEstimate
  evidenceIds: ID[]
}

export interface MoneyEstimate {
  currency: string
  min: number
  max: number
  basis: string
}

export interface ActionPlan {
  id: ID
  environmentId: ID
  createdAt: ISODateTime
  goal: string
  steps: ActionStep[]
  rationale: string
  evidenceIds: ID[]
}

export interface VerificationResult {
  id: ID
  environmentId: ID
  actionPlanId?: ID
  verifiedAt: ISODateTime
  status: 'passed' | 'partial' | 'failed' | 'inconclusive'
  resolvedIssueIds: ID[]
  remainingIssueIds: ID[]
  newIssueIds: ID[]
  changes: Change[]
  summary: string
  evidenceIds: ID[]
}

export interface ScanSource {
  id: ID
  environmentId: ID
  modality: ObservationModality
  uri: string
  capturedAt: ISODateTime
  durationMs?: number
  metadata?: Record<string, string | number | boolean>
}

export interface EnvironmentalMemory {
  environment: Environment
  states: EnvironmentalState[]
  objects: SpatialObject[]
  issues: Issue[]
  observations: Observation[]
  evidence: Evidence[]
  relations: EnvironmentRelation[]
  sources: ScanSource[]
  diffs: EnvironmentalDiff[]
}

export interface AskBuildingRequest {
  environmentId: ID
  question: string
  stateId?: ID
}

export interface AskBuildingResponse {
  answer: string
  confidence: Confidence
  stateId: ID
  evidenceIds: ID[]
  relatedObjectIds: ID[]
  relatedIssueIds: ID[]
}

export interface PerceptionResult {
  sourceId: ID
  observations: Observation[]
  objects: SpatialObject[]
  relations: EnvironmentRelation[]
  evidence: Evidence[]
}

export interface VerificationRequest {
  environmentId: ID
  previousStateId: ID
  currentStateId: ID
  actionPlanId?: ID
}
