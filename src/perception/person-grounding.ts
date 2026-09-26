import type { BoundingBox, PerceptionResult, SpatialObject } from '../domain/sentinel.js'
import { isPersonObject } from '../domain/object-policy.js'

const CONFIRMATION_MIN_CONFIDENCE = 0.95
const PRIMARY_MIN_CONFIDENCE = 0.85
const PERSON_TEXT = /\b(?:person|people|human|occupant|worker|employee|staff|man|woman|adult|child)\b/i

const HUMAN_CUE_GROUPS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'head-or-face', pattern: /\b(?:head|face|facial|hair)\b/i },
  { name: 'torso-or-body', pattern: /\b(?:torso|body|shoulder|shoulders|chest|upper body)\b/i },
  { name: 'limbs', pattern: /\b(?:arm|arms|hand|hands|leg|legs|foot|feet|limb|limbs)\b/i },
]

export interface PersonGroundingResolution {
  result: PerceptionResult
  confirmedObjectIds: string[]
  rejectedObjectIds: string[]
}

export function resolvePersonGrounding(
  scene: PerceptionResult,
  independentAudit: PerceptionResult,
): PersonGroundingResolution {
  const candidates = scene.objects.filter(isPersonObject)
  if (candidates.length === 0) {
    return { result: scene, confirmedObjectIds: [], rejectedObjectIds: [] }
  }

  const auditPeople = independentAudit.objects
    .filter(isPersonObject)
    .filter((item) => item.confidence >= CONFIRMATION_MIN_CONFIDENCE)
    .map((item) => ({ item, cues: humanCueNames(item) }))
    .filter(({ item, cues }) => Boolean(item.boundingBox) && cues.length >= 2)

  const usedAuditIds = new Set<string>()
  const confirmed = new Map<string, { confidence: number; cues: string[] }>()
  const rejected = new Set<string>()

  for (const candidate of candidates) {
    if (candidate.confidence < PRIMARY_MIN_CONFIDENCE || !candidate.boundingBox) {
      rejected.add(candidate.id)
      continue
    }

    const matches = auditPeople
      .filter(({ item }) => !usedAuditIds.has(item.id))
      .map(({ item, cues }) => ({
        item,
        cues,
        overlap: comparableBoxOverlap(candidate.boundingBox!, item.boundingBox!),
      }))
      .filter((match) => match.overlap >= 0.5)
      .sort((a, b) => b.overlap - a.overlap || b.item.confidence - a.item.confidence)

    if (matches.length === 0) {
      rejected.add(candidate.id)
      continue
    }

    const best = matches[0]
    usedAuditIds.add(best.item.id)
    confirmed.set(candidate.id, {
      confidence: Math.min(candidate.confidence, best.item.confidence),
      cues: best.cues,
    })
  }

  const objects = scene.objects.flatMap((item) => {
    if (!isPersonObject(item)) return [item]
    const grounding = confirmed.get(item.id)
    if (!grounding) return []
    return [{
      ...item,
      personGrounding: {
        status: 'confirmed' as const,
        method: 'independent-visual-confirmation' as const,
        confidence: grounding.confidence,
        cues: grounding.cues,
      },
    }]
  })

  const keptObjectIds = new Set(objects.map((item) => item.id))

  // Person prose does not carry object identity, so a shared still-frame evidence
  // ID cannot tell us whether a sentence refers to a confirmed human or to a
  // rejected silhouette. Keep the confirmed object itself as the durable claim
  // and remove free-form person observations whenever this gate runs.
  const observations = scene.observations.filter((item) =>
    !PERSON_TEXT.test(`${item.label} ${item.description}`),
  )

  const conditions = scene.conditions.filter((item) => {
    if (item.objectIds.some((id) => rejected.has(id))) return false
    if (item.objectIds.some((id) => !keptObjectIds.has(id))) return false
    if (!PERSON_TEXT.test(`${item.title} ${item.description}`)) return true

    // A person-related condition may survive only when it is explicitly tied to
    // an independently confirmed person object. Text-only occupancy claims are
    // too ambiguous to retain after a person candidate needed confirmation.
    return item.objectIds.some((id) => confirmed.has(id))
  })

  const relations = scene.relations.filter((item) =>
    keptObjectIds.has(item.fromId) && keptObjectIds.has(item.toId),
  )

  return {
    result: { ...scene, observations, objects, conditions, relations },
    confirmedObjectIds: [...confirmed.keys()],
    rejectedObjectIds: [...rejected],
  }
}

function humanCueNames(item: SpatialObject): string[] {
  const text = `${item.name} ${item.description ?? ''}`
  return HUMAN_CUE_GROUPS.filter((group) => group.pattern.test(text)).map((group) => group.name)
}

function comparableBoxOverlap(a: BoundingBox, b: BoundingBox): number {
  const left = normalizeBox(a)
  const right = normalizeBox(b)
  if (!left || !right) return 0

  const x1 = Math.max(left.x, right.x)
  const y1 = Math.max(left.y, right.y)
  const x2 = Math.min(left.x + left.width, right.x + right.width)
  const y2 = Math.min(left.y + left.height, right.y + right.height)
  if (x2 <= x1 || y2 <= y1) return 0

  const intersection = (x2 - x1) * (y2 - y1)
  const smaller = Math.min(left.width * left.height, right.width * right.height)
  return smaller > 0 ? intersection / smaller : 0
}

function normalizeBox(box: BoundingBox): Pick<BoundingBox, 'x' | 'y' | 'width' | 'height'> | undefined {
  if (box.width <= 0 || box.height <= 0) return undefined

  if (
    typeof box.frameWidth === 'number' && box.frameWidth > 0
    && typeof box.frameHeight === 'number' && box.frameHeight > 0
  ) {
    return {
      x: box.x / box.frameWidth,
      y: box.y / box.frameHeight,
      width: box.width / box.frameWidth,
      height: box.height / box.frameHeight,
    }
  }

  const maxX = box.x + box.width
  const maxY = box.y + box.height
  if (maxX <= 1.5 && maxY <= 1.5) return { x: box.x, y: box.y, width: box.width, height: box.height }
  if (maxX <= 100 && maxY <= 100) {
    return { x: box.x / 100, y: box.y / 100, width: box.width / 100, height: box.height / 100 }
  }
  return undefined
}
