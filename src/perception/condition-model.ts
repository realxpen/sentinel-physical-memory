import type { ConditionKind, EnvironmentalCondition, IssueSeverity, IssueType } from '../domain/sentinel.js'

export interface ConditionAssessment {
  trustLabel: 'Observed' | 'Inferred'
  operational: boolean
  severity?: IssueSeverity
  issueType?: IssueType
  reason: string
}

const OBSERVED_ISSUE_THRESHOLD = 0.65
const INFERRED_ISSUE_THRESHOLD = 0.85

/**
 * Phase 5 trust policy.
 *
 * Perception/reasoning may propose conditions, but the model does not decide
 * whether a condition becomes an operational issue or how severe it is.
 * Promotion depends only on structural trust properties: present status,
 * current evidence references, claim basis, condition kind, and bounded
 * confidence. The trust gate does not inspect hazard-specific words.
 */
export function assessCondition(condition: EnvironmentalCondition): ConditionAssessment {
  const trustLabel = condition.basis === 'observed' ? 'Observed' : 'Inferred'
  const effectiveKind = effectiveConditionKind(condition)

  if (effectiveKind === 'normal') {
    return { trustLabel, operational: false, reason: 'Normal conditions are memory context, not issues.' }
  }

  if (condition.status !== 'present') {
    return { trustLabel, operational: false, reason: 'Uncertain conditions remain context until directly supported.' }
  }

  if (condition.evidenceIds.length === 0) {
    return { trustLabel, operational: false, reason: 'A condition without evidence cannot become an issue.' }
  }

  const threshold = thresholdForCondition(condition)
  if (condition.confidence < threshold) {
    return {
      trustLabel,
      operational: false,
      reason: `${trustLabel} condition confidence ${condition.confidence.toFixed(2)} is below the ${threshold.toFixed(2)} issue threshold.`,
    }
  }

  const issueType = issueTypeForKind(effectiveKind)
  const severity = severityForKind(effectiveKind, condition.basis)
  return {
    trustLabel,
    operational: true,
    issueType,
    severity,
    reason: `${trustLabel} condition is present, evidence-backed, and above the issue threshold.`,
  }
}

export function conditionTrustLabel(condition: Pick<EnvironmentalCondition, 'basis'>): 'Observed' | 'Inferred' {
  return condition.basis === 'observed' ? 'Observed' : 'Inferred'
}

/** Return the persisted semantic kind. Trust policy never reclassifies by keywords. */
export function effectiveConditionKind(condition: Pick<EnvironmentalCondition, 'kind'>): ConditionKind {
  return condition.kind
}

export function issueTypeForCondition(condition: Pick<EnvironmentalCondition, 'kind'>): IssueType {
  return issueTypeForKind(condition.kind)
}

export function severityForCondition(condition: Pick<EnvironmentalCondition, 'kind' | 'basis' | 'title' | 'description'>): IssueSeverity {
  return severityForKind(effectiveConditionKind(condition), condition.basis)
}

function issueTypeForKind(kind: ConditionKind): IssueType {
  switch (kind) {
    case 'hazard': return 'safety'
    case 'damage': return 'damage'
    case 'maintenance': return 'maintenance'
    case 'access': return 'access'
    case 'compliance': return 'compliance'
    default: return 'unknown'
  }
}

function severityForKind(kind: ConditionKind, basis: EnvironmentalCondition['basis']): IssueSeverity {
  if (basis === 'inferred') {
    if (kind === 'attention') return 'low'
    return 'medium'
  }

  switch (kind) {
    case 'hazard': return 'high'
    case 'damage':
    case 'maintenance':
    case 'access':
    case 'compliance': return 'medium'
    case 'attention':
    case 'unknown': return 'low'
    case 'normal': return 'info'
  }
}

function thresholdForCondition(condition: EnvironmentalCondition): number {
  return condition.basis === 'inferred' ? INFERRED_ISSUE_THRESHOLD : OBSERVED_ISSUE_THRESHOLD
}


