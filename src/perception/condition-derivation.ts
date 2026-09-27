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
 * The model may correctly observe separate physical facts without composing
 * them into an operational condition. SENTINEL may join those facts only when
 * current evidence independently grounds the relevant objects and blocking
 * geometry. No environment name or object-noun whitelist participates in the
 * decision. The derived condition remains an inference; confidence is bounded
 * below the source observations and evidence is inherited unchanged.
 */
export function deriveOperationalConditions(
  perception: PerceptionResult,
  observedAt: string,
): ConditionDerivationResult {
  const derivedConditions: EnvironmentalCondition[] = deriveGroundedOperationalCues(perception, observedAt)

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

      const approachOnly = placementEvidence.phrase === 'in front of'
      derivedConditions.push({
        id: `derived_access_${safeId(obstacle.id)}_${safeId(door.id)}`,
        environmentId: door.environmentId,
        kind: 'access',
        title: approachOnly ? 'Emergency exit approach obstructed' : 'Emergency exit access obstructed',
        description: approachOnly
          ? `${obstacle.name} is visibly positioned in front of ${door.name}, reducing the clear approach area to a doorway independently identified by grounded exit signage as an emergency exit.`
          : `${obstacle.name} is observed ${placementEvidence.phrase} ${door.name}, which is independently identified by grounded exit signage as an emergency exit.`,
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

      const approachOnly = placementEvidence.phrase === 'in front of'
      derivedConditions.push({
        id: 'derived_access_' + safeId(obstacle.id) + '_' + safeId(door.id),
        environmentId: door.environmentId,
        kind: 'access',
        title: approachOnly ? 'Doorway approach obstructed' : 'Doorway access obstructed',
        description: approachOnly
          ? obstacle.name + ' is visibly positioned in front of ' + door.name + ', reducing the clear approach area to the doorway.'
          : obstacle.name + ' is observed ' + placementEvidence.phrase + ' ' + door.name + ', obstructing access through the doorway.',
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

  const accessConditions = derivedConditions.filter((item) => item.kind === 'access')
  const nonAccessConditions = derivedConditions.filter((item) => item.kind !== 'access')
  const consolidated = [...nonAccessConditions, ...consolidateDoorAccessConditions(accessConditions)]
  return {
    result: {
      ...perception,
      conditions: [...perception.conditions, ...consolidated],
    },
    derivedConditions: consolidated,
  }
}

type OperationalCueRule = {
  kind: EnvironmentalCondition['kind']
  title: string
  pattern: RegExp
  category?: SpatialObject['category'][]
}

const OPERATIONAL_CUE_RULES: OperationalCueRule[] = [
  {
    kind: 'hazard',
    title: 'Slip hazard',
    pattern: /\b(?:wet|slippery)\s+(?:floor|surface|walkway|path)\b|\b(?:puddle|spill|spilled liquid|standing water)\b.{0,48}\b(?:floor|surface|walkway|path|aisle)\b|\b(?:floor|surface|walkway|path|aisle)\b.{0,48}\b(?:wet|slippery|puddle|spill|standing water)\b/i,
  },
  {
    kind: 'hazard',
    title: 'Trip hazard',
    pattern: /\b(?:cable|cord|wire|hose)\b.{0,56}\b(?:across|crossing|over|on)\b.{0,40}\b(?:floor|walkway|path|aisle|passage)\b|\b(?:floor|walkway|path|aisle|passage)\b.{0,56}\b(?:cable|cord|wire|hose)\b/i,
  },
  {
    kind: 'hazard',
    title: 'Electrical hazard',
    pattern: /\b(?:exposed|bare|frayed|damaged|broken|burnt|burned|loose)\b.{0,40}\b(?:wire|wiring|conductor|cable|socket|outlet|receptacle|plug)\b|\b(?:wire|wiring|conductor|socket|outlet|receptacle|plug)\b.{0,40}\b(?:exposed|bare|frayed|damaged|broken|burnt|burned|loose)\b/i,
    category: ['electrical', 'other', 'equipment'],
  },
  {
    kind: 'damage',
    title: 'Visible physical damage',
    pattern: /\b(?:broken|damaged|cracked|detached|missing|loose)\b.{0,40}\b(?:door handle|handle|latch|hinge|fixture|panel|cover|cabinet|door|gate|guard|rail)\b|\b(?:door handle|handle|latch|hinge|fixture|panel|cover|cabinet|door|gate|guard|rail)\b.{0,40}\b(?:broken|damaged|cracked|detached|missing|loose)\b/i,
  },
  {
    kind: 'hazard',
    title: 'Sharp object hazard',
    pattern: /\b(?:sharp object|sharp metal|metal shard|glass shard|glass shards|broken glass|exposed nail|nails?|blade|knife|pointed debris)\b.{0,64}\b(?:floor|walkway|walking path|path|aisle|passage|corridor|ground)\b|\b(?:floor|walkway|walking path|path|aisle|passage|corridor|ground)\b.{0,64}\b(?:sharp object|sharp metal|metal shard|glass shard|glass shards|broken glass|exposed nail|nails?|blade|knife|pointed debris)\b/i,
  },
  {
    kind: 'access',
    title: 'Circulation path obstructed',
    pattern: /\b(?:chair|chairs|cart|trolley|box|boxes|equipment|furniture|bag|bags|materials?|items?|object|objects?)\b.{0,64}\b(?:on|across|blocking|obstructing|occupying|narrowing)\b.{0,48}\b(?:walkway|walking path|path|aisle|passage|corridor|access route)\b|\b(?:walkway|walking path|path|aisle|passage|corridor|access route)\b.{0,64}\b(?:blocked|obstructed|occupied|narrowed)\b.{0,48}\b(?:chair|chairs|cart|trolley|box|boxes|equipment|furniture|bag|bags|materials?|items?|object|objects?)\b/i,
  },
  {
    kind: 'hazard',
    title: 'Unsafe stacking or storage',
    pattern: /\b(?:stack|stacked|pile|piled|stored items?|boxes?|materials?)\b.{0,56}\b(?:unstable|precarious|leaning|tipping|toppling|falling|unsafe)\b|\b(?:unstable|precarious|leaning|tipping|toppling|falling|unsafe)\b.{0,56}\b(?:stack|stacked|pile|piled|stored items?|boxes?|materials?)\b/i,
  },
  {
    kind: 'attention',
    title: 'Workspace organization needs attention',
    pattern: /\b(?:workspace|work area|office|room|floor|walkway|aisle|passage)\b.{0,64}\b(?:cluttered|disorganized|disorganised|poorly arranged|messy|scattered)\b|\b(?:cluttered|disorganized|disorganised|poorly arranged|messy|scattered)\b.{0,64}\b(?:workspace|work area|office|room|floor|walkway|aisle|passage)\b/i,
  },
]

function deriveGroundedOperationalCues(
  perception: PerceptionResult,
  observedAt: string,
): EnvironmentalCondition[] {
  const derived: EnvironmentalCondition[] = []
  const candidates = [
    ...perception.objects.map((item) => ({
      id: item.id,
      object: item,
      text: semanticText(item),
      confidence: item.confidence,
      evidenceIds: item.evidenceIds,
    })),
    ...perception.observations.map((item) => ({
      id: item.id,
      object: undefined,
      text: semanticText(item),
      confidence: item.confidence,
      evidenceIds: item.evidenceIds,
    })),
  ]

  for (const rule of OPERATIONAL_CUE_RULES) {
    const matches = candidates.filter((candidate) => {
      if (!candidate.evidenceIds.length || candidate.confidence < 0.85) return false
      if (rule.category && candidate.object && !rule.category.includes(candidate.object.category)) return false
      return rule.pattern.test(candidate.text)
    })
    if (matches.length === 0) continue

    const objectIds = unique(matches.flatMap((item) => item.object ? [item.object.id] : []))
    if (hasEquivalentOperationalCondition(perception.conditions, rule.title, objectIds)) continue

    const evidenceIds = unique(matches.flatMap((item) => item.evidenceIds))
    const confidence = Math.max(0, Math.min(0.95, Number((Math.min(...matches.map((item) => item.confidence)) * 0.9).toFixed(3))))
    if (confidence < 0.85) continue

    derived.push({
      id: `derived_operational_${safeId(rule.title)}_${derived.length + 1}`,
      environmentId: perception.objects[0]?.environmentId ?? perception.observations[0]?.environmentId ?? '',
      kind: rule.kind,
      title: rule.title,
      description: operationalCueDescription(rule.title, matches.map((item) => item.text)),
      status: 'present',
      basis: 'inferred',
      confidence,
      objectIds,
      evidenceIds,
      observedAt,
    })
  }

  return derived
}

function operationalCueDescription(title: string, texts: string[]): string {
  const grounded = texts[0] ?? ''
  switch (title) {
    case 'Slip hazard':
      return `Current visual evidence shows a wet/slippery floor condition: ${grounded}.`
    case 'Trip hazard':
      return `Current visual evidence shows a cable/cord/wire/hose condition across a walking surface: ${grounded}.`
    case 'Electrical hazard':
      return `Current visual evidence shows exposed or damaged electrical hardware/wiring: ${grounded}.`
    case 'Visible physical damage':
      return `Current visual evidence shows visible damage to a physical fixture or access component: ${grounded}.`
    case 'Sharp object hazard':
      return `Current visual evidence shows a sharp or cutting object on a floor or circulation surface: ${grounded}.`
    case 'Circulation path obstructed':
      return `Current visual evidence shows an object occupying or narrowing a walking/circulation path: ${grounded}.`
    case 'Unsafe stacking or storage':
      return `Current visual evidence shows unstable or unsafe storage/stacking: ${grounded}.`
    case 'Workspace organization needs attention':
      return `Current visual evidence describes a cluttered or poorly arranged work area that may reduce safe, clear use of the space: ${grounded}.`
    default:
      return `Current visual evidence supports ${title.toLowerCase()}: ${grounded}.`
  }
}

function hasEquivalentOperationalCondition(
  conditions: EnvironmentalCondition[],
  title: string,
  objectIds: string[],
): boolean {
  const normalizedTitle = normalize(title)
  return conditions.some((condition) => {
    if (normalize(condition.title) === normalizedTitle) return true
    if (objectIds.length === 0 || condition.objectIds.length === 0) return false
    return condition.objectIds.some((id) => objectIds.includes(id)) && condition.kind !== 'normal'
  })
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

  // A current-scan object already classified by perception as a physical
  // obstruction may ground doorway-approach encroachment from its structured
  // position even when a stricter geometry audit decides that the literal
  // threshold is still clear. This is intentionally weaker than a proved
  // obstacle→door relation: it supports an approach/access concern, not a claim
  // that the doorway opening itself is fully blocked.
  if (obstacle.category === 'obstruction' && obstacle.evidenceIds.length > 0) {
    const position = normalize(obstacle.position?.description ?? '')
    const inFrontOfDoor = doorNames.some((doorName) =>
      position === `in front of ${doorName}` ||
      position.includes(`in front of ${doorName}`) ||
      position === `in front of the ${doorName}`,
    )
    if (inFrontOfDoor) {
      return {
        confidence: obstacle.confidence,
        evidenceIds: obstacle.evidenceIds,
        phrase: 'in front of',
      }
    }
  }

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
      const forward = new RegExp(`\\b${obstacle}\\b.{0,64}\\b(directly in front of|across|blocking|obstructing|occupying|narrowing)\\b.{0,48}\\b${door}\\b`)
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
  if (/block|obstruct|occup|narrow/i.test(value)) return 'blocking'
  if (value === 'across') return 'across'
  return 'directly in front of'
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
