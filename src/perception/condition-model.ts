import type { EnvironmentalCondition, IssueSeverity, IssueType } from '../domain/sentinel.js'

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
 * Perception can describe conditions, but the model does not get to decide
 * whether a condition becomes an operational issue or how severe it is.
 * SENTINEL promotes only evidence-backed, present conditions above a bounded
 * confidence threshold. Inferred conditions require stronger confidence and
 * can never become critical/high solely from perception.
 */
export function assessCondition(condition: EnvironmentalCondition): ConditionAssessment {
  const trustLabel = condition.basis === 'observed' ? 'Observed' : 'Inferred'

  if (condition.kind === 'normal') {
    return { trustLabel, operational: false, reason: 'Normal conditions are memory context, not issues.' }
  }

  if (condition.status !== 'present') {
    return { trustLabel, operational: false, reason: 'Uncertain conditions remain context until directly supported.' }
  }

  if (condition.evidenceIds.length === 0) {
    return { trustLabel, operational: false, reason: 'A condition without evidence cannot become an issue.' }
  }

  const threshold = condition.basis === 'observed' ? OBSERVED_ISSUE_THRESHOLD : INFERRED_ISSUE_THRESHOLD
  if (condition.confidence < threshold) {
    return {
      trustLabel,
      operational: false,
      reason: `${trustLabel} condition confidence ${condition.confidence.toFixed(2)} is below the ${threshold.toFixed(2)} issue threshold.`,
    }
  }

  const issueType = issueTypeForCondition(condition)
  const severity = severityForCondition(condition)
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

export function issueTypeForCondition(condition: Pick<EnvironmentalCondition, 'kind'>): IssueType {
  switch (condition.kind) {
    case 'hazard': return 'safety'
    case 'damage': return 'damage'
    case 'maintenance': return 'maintenance'
    case 'access': return 'access'
    case 'compliance': return 'compliance'
    default: return 'unknown'
  }
}

export function severityForCondition(condition: Pick<EnvironmentalCondition, 'kind' | 'basis'>): IssueSeverity {
  if (condition.basis === 'inferred') {
    if (condition.kind === 'attention') return 'low'
    return 'medium'
  }

  switch (condition.kind) {
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
