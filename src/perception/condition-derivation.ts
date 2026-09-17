import type { EnvironmentalCondition, Observation, PerceptionResult, SpatialObject } from '../domain/sentinel.js'

export interface ConditionDerivationResult {
  result: PerceptionResult
  derivedConditions: EnvironmentalCondition[]
}

const OBSTACLE_NAME = /\b(?:pallet jack|pallet|trolley|cart|box|carton|chair|cabinet|desk|table|equipment|object)\b/i
const IN_FRONT_OF = /\b(?:in front of|directly in front of|parked in front of|positioned in front of|across|blocking|obstructing)\b/i
const EXIT_CUE = /\b(?:emergency exit|exit sign|exit door)\b/i

/**
 * Deterministic Phase 5 derivation from already-grounded perception facts.
 *
 * The model may correctly observe two facts without composing them into an
 * operational condition (for example, "pallet jack in front of the green
 * door" + "emergency exit sign above the green door"). SENTINEL may join
 * those facts only when both are explicit, evidence-backed, and point to the
 * same named door. The derived condition remains an inference; confidence is
 * bounded below the source observations and evidence is inherited unchanged.
 */
export function deriveOperationalConditions(
  perception: PerceptionResult,
  observedAt: string,
): ConditionDerivationResult {
  const derivedConditions: EnvironmentalCondition[] = []

  const doors = perception.objects.filter((item) => item.category === 'door')
  const obstacles = perception.objects.filter((item) =>
    item.category === 'obstruction' || OBSTACLE_NAME.test(`${item.name} ${item.description ?? ''}`),
  )

  for (const door of doors) {
    const exitEvidence = findExitEvidenceForDoor(perception, door)
    if (!exitEvidence) continue

    for (const obstacle of obstacles) {
      if (obstacle.id === door.id) continue
      const placementEvidence = findObstaclePlacementEvidence(perception, obstacle, door)
      if (!placementEvidence) continue

      const objectIds = [obstacle.id, door.id]
      if (hasExistingAccessCondition(perception.conditions, objectIds)) continue

      const confidence = boundedInferenceConfidence(exitEvidence.confidence, placementEvidence.confidence, obstacle.confidence, door.confidence)
      if (confidence < 0.85) continue

      const evidenceIds = unique([
        ...exitEvidence.evidenceIds,
        ...placementEvidence.evidenceIds,
        ...obstacle.evidenceIds,
        ...door.evidenceIds,
      ])
      if (evidenceIds.length === 0) continue

      derivedConditions.push({
        id: `derived_access_${safeId(obstacle.id)}_${safeId(door.id)}`,
        environmentId: door.environmentId,
        kind: 'access',
        title: 'Emergency exit access obstructed',
        description: `${obstacle.name} is observed ${placementEvidence.phrase} ${door.name}, which is identified by grounded exit signage as an emergency exit.`,
        status: 'present',
        basis: 'inferred',
        confidence,
        objectIds,
        evidenceIds,
        observedAt,
      })
    }
  }

  if (derivedConditions.length === 0) return { result: perception, derivedConditions }

  return {
    result: {
      ...perception,
      conditions: [...perception.conditions, ...derivedConditions],
    },
    derivedConditions,
  }
}

type GroundedFact = {
  confidence: number
  evidenceIds: string[]
  phrase: string
}

function findExitEvidenceForDoor(perception: PerceptionResult, door: SpatialObject): GroundedFact | undefined {
  const doorNames = entityAliases(door)
  const candidates: Array<Observation | SpatialObject | EnvironmentalCondition> = [
    ...perception.observations,
    ...perception.objects,
    ...perception.conditions,
  ]

  for (const item of candidates) {
    const text = semanticText(item)
    if (!EXIT_CUE.test(text)) continue
    if (!doorNames.some((name) => text.includes(name))) continue
    if (item.evidenceIds.length === 0) continue
    return { confidence: item.confidence, evidenceIds: item.evidenceIds, phrase: 'at' }
  }

  return undefined
}

function findObstaclePlacementEvidence(
  perception: PerceptionResult,
  obstacle: SpatialObject,
  door: SpatialObject,
): GroundedFact | undefined {
  const obstacleNames = entityAliases(obstacle)
  const doorNames = entityAliases(door)
  const candidates: Array<Observation | SpatialObject | EnvironmentalCondition> = [
    ...perception.observations,
    ...perception.objects,
    ...perception.conditions,
  ]

  for (const item of candidates) {
    const text = semanticText(item)
    if (!IN_FRONT_OF.test(text)) continue
    if (!obstacleNames.some((name) => text.includes(name))) continue
    if (!doorNames.some((name) => text.includes(name))) continue
    if (item.evidenceIds.length === 0) continue

    const phrase = text.includes('blocking') || text.includes('obstructing')
      ? 'blocking'
      : text.includes('across')
        ? 'across'
        : 'in front of'

    return { confidence: item.confidence, evidenceIds: item.evidenceIds, phrase }
  }

  return undefined
}

function hasExistingAccessCondition(conditions: EnvironmentalCondition[], objectIds: string[]): boolean {
  const ids = new Set(objectIds)
  return conditions.some((condition) =>
    condition.kind === 'access' && condition.objectIds.some((id) => ids.has(id)),
  )
}

function entityAliases(item: SpatialObject): string[] {
  const aliases = [normalize(item.name)]
  const description = normalize(item.description ?? '')
  if (description && description.length <= 80) aliases.push(description)
  return unique(aliases.filter((value) => value.length >= 3))
}

function semanticText(item: Observation | SpatialObject | EnvironmentalCondition): string {
  if ('label' in item) return normalize(`${item.label} ${item.description}`)
  if ('title' in item) return normalize(`${item.title} ${item.description}`)
  return normalize(`${item.name} ${item.description ?? ''}`)
}

function boundedInferenceConfidence(...values: number[]): number {
  const sourceMinimum = Math.min(...values.filter((value) => Number.isFinite(value)))
  return Math.max(0, Math.min(0.95, Number((sourceMinimum * 0.9).toFixed(3))))
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
