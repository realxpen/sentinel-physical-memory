import type { ConditionReasoningDraft } from '../ai/model.js'
import type { EnvironmentalCondition, PerceptionResult } from '../domain/sentinel.js'

export interface ConditionReasoningGroundingResult {
  conditions: EnvironmentalCondition[]
  rejected: Array<{ title: string; reason: string }>
}

export function buildConditionReasoningContext(perception: PerceptionResult): string {
  return [
    'CURRENT GROUNDED OBSERVATIONS:',
    ...perception.observations.map((item) =>
      `- OBSERVATION_ID ${item.id} | confidence=${item.confidence} | evidence=${item.evidenceIds.join(',')} | label="${item.label}" | description="${item.description}" | position="${item.position?.description ?? 'unspecified'}"`,
    ),
    'CURRENT GROUNDED OBJECTS:',
    ...perception.objects.map((item) =>
      `- OBJECT_ID ${item.id} | category=${item.category} | confidence=${item.confidence} | evidence=${item.evidenceIds.join(',')} | name="${item.name}" | description="${item.description ?? 'none'}" | state="${item.state ?? 'unspecified'}" | position="${item.position?.description ?? 'unspecified'}"`,
    ),
    'CURRENT GROUNDED RELATIONS:',
    ...perception.relations.map((item) =>
      `- RELATION_ID ${item.id} | ${item.fromId} -[${item.type}]-> ${item.toId} | confidence=${item.confidence} | evidence=${item.evidenceIds.join(',')}`,
    ),
    'ALREADY RECORDED CONDITIONS:',
    ...perception.conditions.map((item) =>
      `- CONDITION_ID ${item.id} | kind=${item.kind} | status=${item.status} | basis=${item.basis} | confidence=${item.confidence} | objects=${item.objectIds.join(',')} | evidence=${item.evidenceIds.join(',')} | title="${item.title}" | description="${item.description}"`,
    ),
    'TRUSTED CURRENT EVIDENCE:',
    ...perception.evidence.map((item) =>
      `- EVIDENCE_ID ${item.id} | type=${item.type} | source=${item.sourceId} | description="${item.description}"`,
    ),
  ].join('\n')
}

export function groundReasonedConditions(
  perception: PerceptionResult,
  draft: ConditionReasoningDraft,
  environmentId: string,
  capturedAt: string,
): ConditionReasoningGroundingResult {
  const allowedObservationIds = new Set(perception.observations.filter((item) => item.basis === 'observed').map((item) => item.id))
  const allowedObjectIds = new Set(perception.objects.map((item) => item.id))
  const allowedEvidenceIds = new Set(perception.evidence.map((item) => item.id))
  const existingTitles = new Set(perception.conditions.map((item) => normalizeText(item.title)))
  const accepted: EnvironmentalCondition[] = []
  const rejected: ConditionReasoningGroundingResult['rejected'] = []

  for (const [index, candidate] of draft.conditions.entries()) {
    const title = candidate.title.trim()
    const description = candidate.description.trim()
    if (!title || !description) {
      rejected.push({ title: title || '(untitled)', reason: 'empty-title-or-description' })
      continue
    }

    if (candidate.kind === 'normal' || candidate.kind === 'unknown') {
      rejected.push({ title, reason: 'non-operational-kind' })
      continue
    }

    const supportingObservationIds = unique(candidate.supportingObservationIds)
    const objectIds = unique(candidate.objectIds)
    const evidenceIds = unique(candidate.evidenceIds)

    if (supportingObservationIds.length === 0 || supportingObservationIds.some((id) => !allowedObservationIds.has(id))) {
      rejected.push({ title, reason: 'unknown-or-missing-observation-reference' })
      continue
    }
    if (objectIds.some((id) => !allowedObjectIds.has(id))) {
      rejected.push({ title, reason: 'unknown-object-reference' })
      continue
    }
    if (evidenceIds.length === 0 || evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
      rejected.push({ title, reason: 'unknown-or-missing-evidence-reference' })
      continue
    }

    const evidenceSet = new Set(evidenceIds)
    const citedObjects = objectIds.map((id) => perception.objects.find((item) => item.id === id)!).filter(Boolean)
    if (citedObjects.some((item) => !item.evidenceIds.some((id) => evidenceSet.has(id)))) {
      rejected.push({ title, reason: 'object-not-grounded-by-cited-evidence' })
      continue
    }

    const supportingObservations = perception.observations.filter((item) =>
      supportingObservationIds.includes(item.id)
      && item.basis === 'observed'
      && item.evidenceIds.some((id) => evidenceSet.has(id)),
    )
    const supportingObjects = perception.objects.filter((item) =>
      item.evidenceIds.some((id) => evidenceSet.has(id))
      && (objectIds.length === 0 || objectIds.includes(item.id)),
    )
    const supportingRelations = perception.relations.filter((item) =>
      item.evidenceIds.some((id) => evidenceSet.has(id))
      && (objectIds.length === 0 || objectIds.includes(item.fromId) || objectIds.includes(item.toId)),
    )

    if (supportingObservations.length !== supportingObservationIds.length) {
      rejected.push({ title, reason: 'observation-not-grounded-by-cited-evidence' })
      continue
    }
    if (supportingObservations.length === 0) {
      rejected.push({ title, reason: 'no-current-grounded-observation-support' })
      continue
    }

    const supportConfidence = Math.max(
      0,
      ...supportingObservations.map((item) => item.confidence),
      ...supportingObjects.map((item) => item.confidence),
      ...supportingRelations.map((item) => item.confidence),
    )
    if (supportConfidence <= 0) {
      rejected.push({ title, reason: 'support-confidence-missing' })
      continue
    }

    const confidence = Number(Math.min(
      Math.max(0, candidate.confidence),
      supportConfidence * 0.95,
      0.95,
    ).toFixed(3))

    const normalizedTitle = normalizeText(title)
    if (existingTitles.has(normalizedTitle) || accepted.some((item) => normalizeText(item.title) === normalizedTitle)) {
      rejected.push({ title, reason: 'duplicate-condition-title' })
      continue
    }

    accepted.push({
      id: `reasoned_condition_${index + 1}_${safeId(title)}`,
      environmentId,
      kind: candidate.kind,
      title,
      description,
      status: candidate.kind === 'attention' ? 'uncertain' : candidate.status,
      basis: 'inferred',
      confidence,
      objectIds,
      evidenceIds,
      observedAt: capturedAt,
    })
  }

  return { conditions: accepted, rejected }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function safeId(value: string): string {
  const slug = normalizeText(value).replace(/\s+/g, '_').slice(0, 48)
  return slug || 'condition'
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
