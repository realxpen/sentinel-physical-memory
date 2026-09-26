import type { EnvironmentalCondition, Observation, PerceptionResult, SpatialObject } from '../domain/sentinel.js'

export interface ConditionDerivationResult {
  result: PerceptionResult
  derivedConditions: EnvironmentalCondition[]
}

const EXIT_CUE = /\b(?:emergency exit|exit sign|exit door)\b/i
const DOOR_COLOR = /\b(green|red|blue|orange|yellow|white|black|brown|gray|grey)\b/i

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
    item.evidenceIds.length > 0 &&
    item.category !== 'door' &&
    item.category !== 'room' &&
    item.category !== 'person' &&
    item.category !== 'signage' &&
    item.category !== 'window',
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
        description: `${obstacle.name} is observed ${placementEvidence.phrase} ${door.name}, which is independently identified by grounded exit signage as an emergency exit.`,
        status: 'present',
        basis: 'inferred',
        confidence,
        objectIds,
        evidenceIds,
        observedAt,
      })
    }
  }


  // Ordinary doorway access is intentionally separate from emergency-egress reasoning.
  // A grounded physical door may establish ordinary doorway identity, but an
  // emergency-labelled door still requires independent exit evidence and may
  // not silently fall back to this generic path.
  for (const door of doors) {
    if (findExitEvidenceForDoor(perception, door)) continue
    if (door.evidenceIds.length === 0) continue

    for (const obstacle of obstacles) {
      if (obstacle.id === door.id) continue
      const placementEvidence = findObstaclePlacementEvidence(perception, obstacle, door)
      if (!placementEvidence) continue

      const objectIds = [obstacle.id, door.id]
      if (hasExistingAccessCondition(perception.conditions, objectIds)) continue

      const confidence = boundedInferenceConfidence(placementEvidence.confidence, obstacle.confidence, door.confidence)
      if (confidence < 0.85) continue

      const evidenceIds = unique([
        ...placementEvidence.evidenceIds,
        ...obstacle.evidenceIds,
        ...door.evidenceIds,
      ])
      if (evidenceIds.length === 0) continue

      derivedConditions.push({
        id: 'derived_access_' + safeId(obstacle.id) + '_' + safeId(door.id),
        environmentId: door.environmentId,
        kind: 'access',
        title: 'Doorway access obstructed',
        description: obstacle.name + ' is observed ' + placementEvidence.phrase + ' ' + door.name + ', obstructing access through the doorway.',
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

  const consolidated = consolidateDoorAccessConditions(derivedConditions)
  return {
    result: {
      ...perception,
      conditions: [...perception.conditions, ...consolidated],
    },
    derivedConditions: consolidated,
  }
}

function consolidateDoorAccessConditions(conditions: EnvironmentalCondition[]): EnvironmentalCondition[] {
  const grouped = new Map<string, EnvironmentalCondition>()

  for (const condition of conditions) {
    const doorId = condition.objectIds.at(-1) ?? ''
    const key = `${condition.title}::${doorId}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, {
        ...condition,
        objectIds: [...condition.objectIds],
        evidenceIds: [...condition.evidenceIds],
      })
      continue
    }

    existing.objectIds = unique([...existing.objectIds, ...condition.objectIds])
    existing.evidenceIds = unique([...existing.evidenceIds, ...condition.evidenceIds])
    existing.confidence = Math.max(existing.confidence, condition.confidence)
  }

  return [...grouped.values()]
}

type GroundedFact = {
  confidence: number
  evidenceIds: string[]
  phrase: string
}

function findExitEvidenceForDoor(perception: PerceptionResult, door: SpatialObject): GroundedFact | undefined {
  const doorNames = entityAliases(door)
  const candidates: Array<Observation | SpatialObject> = [
    ...perception.observations,
    ...perception.objects.filter((item) => item.id !== door.id),
  ]

  for (const item of candidates) {
    const text = semanticText(item)
    if (!EXIT_CUE.test(text)) continue
    if (!doorNames.some((name) => text.includes(name))) continue
    if (item.evidenceIds.length === 0) continue
    return { confidence: item.confidence, evidenceIds: item.evidenceIds, phrase: 'at' }
  }

  const visibleDoors = perception.objects.filter((item) => item.category === 'door')
  if (visibleDoors.length === 1 && visibleDoors[0].id === door.id) {
    const groundedExitSign = perception.objects.find((item) =>
      item.id !== door.id &&
      item.category === 'signage' &&
      EXIT_CUE.test(semanticText(item)) &&
      item.evidenceIds.length > 0 &&
      /\b(?:above|over|on)\s+(?:the\s+)?door\b/i.test(item.position?.description ?? ''),
    )
    if (groundedExitSign) {
      return {
        confidence: groundedExitSign.confidence,
        evidenceIds: groundedExitSign.evidenceIds,
        phrase: 'at',
      }
    }
  }

  return undefined
}

function findObstaclePlacementEvidence(
  perception: PerceptionResult,
  obstacle: SpatialObject,
  door: SpatialObject,
): GroundedFact | undefined {
  const explicitRelation = perception.relations.find((item) =>
    item.type === 'in_front_of' &&
    item.fromId === obstacle.id &&
    item.toId === door.id &&
    item.evidenceIds.length > 0 &&
    (item.id.startsWith('geometry_') || obstacle.category === 'obstruction'),
  )
  if (explicitRelation) {
    return {
      confidence: explicitRelation.confidence,
      evidenceIds: explicitRelation.evidenceIds,
      phrase: 'blocking',
    }
  }

  const obstacleNames = entityAliases(obstacle)
  const doorNames = entityAliases(door)
  const candidates: Array<Observation | SpatialObject> = [
    ...perception.observations,
    ...perception.objects,
  ].filter((item) => !isGeometryAuditProse(item))

  for (const item of candidates) {
    const text = semanticText(item)
    const placement = explicitObstaclePlacement(text, obstacleNames, doorNames)
    if (!placement) continue
    if (item.evidenceIds.length === 0) continue
    return { confidence: item.confidence, evidenceIds: item.evidenceIds, phrase: placement }
  }

  return undefined
}

function isGeometryAuditProse(item: Observation | SpatialObject): boolean {
  // The targeted access-geometry audit is asked to prove placement with an
  // explicit obstacle -> door in_front_of relation. Its free-form prose is
  // intentionally non-authoritative because perspective overlap in a single
  // still image can make ordinary foreground furniture look like it blocks a
  // distant doorway. The relation path above remains eligible.
  return item.id.startsWith('geometry_')
}

function hasExistingAccessCondition(conditions: EnvironmentalCondition[], objectIds: string[]): boolean {
  return conditions.some((condition) =>
    condition.kind === 'access' && objectIds.every((id) => condition.objectIds.includes(id)),
  )
}

function explicitObstaclePlacement(text: string, obstacleNames: string[], doorNames: string[]): string | undefined {
  for (const obstacleName of obstacleNames) {
    for (const doorName of doorNames) {
      const obstacle = escapedPhrase(obstacleName)
      const door = escapedPhrase(doorName)
      const forward = new RegExp(`\\b${obstacle}\\b.{0,48}\\b(in front of|directly in front of|parked in front of|positioned in front of|across|blocking|obstructing)\\b.{0,32}\\b${door}\\b`)
      const passive = new RegExp(`\\b${door}\\b.{0,32}\\b(blocked|obstructed)\\s+by\\b.{0,32}\\b${obstacle}\\b`)
      const forwardMatch = text.match(forward)
      if (forwardMatch) return normalizePlacementPhrase(forwardMatch[1])
      const passiveMatch = text.match(passive)
      if (passiveMatch) return normalizePlacementPhrase(passiveMatch[1])
    }
  }
  return undefined
}

function normalizePlacementPhrase(value: string): string {
  if (value === 'blocking' || value === 'blocked' || value === 'obstructing' || value === 'obstructed') return 'blocking'
  if (value === 'across') return 'across'
  return 'in front of'
}

function escapedPhrase(value: string): string {
  return value.split(' ').map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
}

function entityAliases(item: SpatialObject): string[] {
  const aliases = [normalize(item.name)]
  const description = normalize(item.description ?? '')
  if (description && description.length <= 80) aliases.push(description)

  if (item.category === 'door') {
    const canonicalDoor = colorAnchoredDoorAlias(item.name) ?? colorAnchoredDoorAlias(item.description ?? '')
    if (canonicalDoor) aliases.push(canonicalDoor)
  }

  return unique(aliases.filter((value) => value.length >= 3))
}

function colorAnchoredDoorAlias(value: string): string | undefined {
  const normalized = normalize(value)
  if (!/\bdoor\b/.test(normalized)) return undefined
  const color = normalized.match(DOOR_COLOR)?.[1]
  return color ? `${color.toLowerCase()} door` : undefined
}

function semanticText(item: Observation | SpatialObject | EnvironmentalCondition): string {
  if ('label' in item) return normalize(item.label + ' ' + item.description)
  if ('title' in item) return normalize(item.title + ' ' + item.description)
  return normalize(item.name + ' ' + (item.description ?? '') + ' ' + (item.position?.description ?? ''))
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
