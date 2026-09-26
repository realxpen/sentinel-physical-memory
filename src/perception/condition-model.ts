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
const EXPLICIT_OBSERVED_ACCESS_THRESHOLD = 0.60

const ACCESS_ROUTE = '(?:doorway|door|exit|egress|walkway|passage|aisle|walking path|circulation path|access path|route)'
const EXPLICIT_ACCESS_PATTERNS = [
  new RegExp(`\\b${ACCESS_ROUTE}\\b.{0,100}\\b(?:blocked|obstructed|occupied|narrowed|impeded|inaccessible)\\b`, 'i'),
  new RegExp(`\\b(?:blocking|obstructing|occupying|narrowing|impeding)\\b.{0,100}\\b${ACCESS_ROUTE}\\b`, 'i'),
  new RegExp(`\\b(?:directly in front of|across)\\b.{0,100}\\b${ACCESS_ROUTE}\\b`, 'i'),
]

/**
 * Phase 5 trust policy.
 *
 * Perception can describe conditions, but the model does not get to decide
 * whether a condition becomes an operational issue or how severe it is.
 * SENTINEL promotes only evidence-backed, present conditions above a bounded
 * confidence threshold. Inferred conditions require stronger confidence and
 * can never become critical/high solely from perception.
 *
 * A provider can occasionally label an explicitly described obstruction as
 * "normal". SENTINEL corrects only a very narrow class of those conflicts:
 * grounded text that explicitly describes an access route as blocked,
 * obstructed, occupied, narrowed, impeded, or directly crossed by a physical
 * object. The policy is noun-agnostic: it does not depend on a demo-specific
 * list of boxes, chairs, carts, or equipment. The policy never raises
 * confidence above the model's own value.
 */
export function assessCondition(condition: EnvironmentalCondition): ConditionAssessment {
  const trustLabel = condition.basis === 'observed' ? 'Observed' : 'Inferred'
  const effectiveKind = effectiveConditionKind(condition)
  const explicitAccessCue = effectiveKind === 'access' && condition.kind !== 'access' && hasExplicitAccessCue(condition)

  if (effectiveKind === 'normal') {
    return { trustLabel, operational: false, reason: 'Normal conditions are memory context, not issues.' }
  }

  if (condition.status !== 'present') {
    return { trustLabel, operational: false, reason: 'Uncertain conditions remain context until directly supported.' }
  }

  if (condition.evidenceIds.length === 0) {
    return { trustLabel, operational: false, reason: 'A condition without evidence cannot become an issue.' }
  }

  const threshold = thresholdForCondition(condition, effectiveKind, explicitAccessCue)
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
    reason: explicitAccessCue
      ? `${trustLabel} condition contains an explicit grounded access-route obstruction cue and meets the bounded access threshold.`
      : `${trustLabel} condition is present, evidence-backed, and above the issue threshold.`,
  }
}

export function conditionTrustLabel(condition: Pick<EnvironmentalCondition, 'basis'>): 'Observed' | 'Inferred' {
  return condition.basis === 'observed' ? 'Observed' : 'Inferred'
}

/** Return the policy-effective kind without mutating the persisted model claim. */
export function effectiveConditionKind(condition: Pick<EnvironmentalCondition, 'kind' | 'title' | 'description'>): ConditionKind {
  if ((condition.kind === 'normal' || condition.kind === 'unknown') && hasExplicitAccessCue(condition)) return 'access'
  return condition.kind
}

export function issueTypeForCondition(condition: Pick<EnvironmentalCondition, 'kind' | 'title' | 'description'>): IssueType {
  return issueTypeForKind(effectiveConditionKind(condition))
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

function thresholdForCondition(condition: EnvironmentalCondition, effectiveKind: ConditionKind, explicitAccessCue: boolean): number {
  if (condition.basis === 'inferred') return INFERRED_ISSUE_THRESHOLD
  if (effectiveKind === 'access' && explicitAccessCue) return EXPLICIT_OBSERVED_ACCESS_THRESHOLD
  return OBSERVED_ISSUE_THRESHOLD
}

function hasExplicitAccessCue(condition: Pick<EnvironmentalCondition, 'title' | 'description'>): boolean {
  const text = `${condition.title} ${condition.description}`.replace(/\s+/g, ' ').trim()
  return EXPLICIT_ACCESS_PATTERNS.some((pattern) => pattern.test(text))
}
