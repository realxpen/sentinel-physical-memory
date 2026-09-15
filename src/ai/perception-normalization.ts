export interface EvidenceReferenceNormalizationResult {
  value: unknown
  remappedReferences: number
  normalizedConfidences: number
  normalizedRelations: number
  droppedRelations: number
}

const SENTINEL_RELATION_TYPES = new Set([
  'contains',
  'located_in',
  'adjacent_to',
  'near',
  'attached_to',
  'part_of',
  'on',
  'above',
  'below',
  'in_front_of',
  'behind',
  'left_of',
  'right_of',
  'has_issue',
  'requires_action',
  'supports',
])

const RELATION_TYPE_ALIASES: Record<string, string> = {
  in: 'located_in',
  inside: 'located_in',
  within: 'located_in',
  located_inside: 'located_in',
  adjacent: 'adjacent_to',
  beside: 'adjacent_to',
  next_to: 'adjacent_to',
  nextto: 'adjacent_to',
  nearby: 'near',
  located_near: 'near',
  close_to: 'near',
  mounted_on: 'attached_to',
  mounted_to: 'attached_to',
  fixed_to: 'attached_to',
  affixed_to: 'attached_to',
  component_of: 'part_of',
  partof: 'part_of',
  on_top_of: 'on',
  atop: 'on',
  over: 'above',
  under: 'below',
  underneath: 'below',
  in_front: 'in_front_of',
  front_of: 'in_front_of',
  behind_of: 'behind',
  to_left_of: 'left_of',
  to_right_of: 'right_of',
}

/**
 * Repair bounded provider formatting variance without inventing evidence or
 * semantic confidence values.
 *
 * Evidence references are rewritten only when they can be mapped
 * deterministically to an evidence item that already exists in the model
 * response:
 * 1. exact evidence id wins;
 * 2. a numeric placeholder such as evidence_3 maps to the unique evidence item
 *    whose frameIndex is 3;
 * 3. when no evidence item provides that frameIndex, evidence_3 may map to the
 *    existing evidence item at array index 3;
 * 4. a single string evidenceIds value is normalized to a one-item string[] so
 *    provider formatting variance does not discard an otherwise grounded item.
 *
 * Confidence values are normalized only when the provider returned a plain
 * decimal string already representing a valid SENTINEL confidence in [0, 1].
 * Values such as percentages, labels, null, NaN, infinity, or out-of-range
 * numbers remain untouched so the strict validator can reject them.
 *
 * Relation types are normalized only for canonical labels or unambiguous
 * synonyms. Directional relations such as on/above/below/front/behind/left/right
 * remain explicit rather than being collapsed into a vague near relation.
 * Unknown relation semantics remain untouched and therefore fail strict
 * validation.
 *
 * A relation without a usable fromId or toId is dropped rather than guessed.
 * Relations are auxiliary graph edges; discarding an unanchored edge preserves
 * the grounded objects/observations while avoiding invented object identity.
 */
export function normalizePerceptionEvidenceReferences(value: unknown): EvidenceReferenceNormalizationResult {
  if (!isRecord(value)) return { value, remappedReferences: 0, normalizedConfidences: 0, normalizedRelations: 0, droppedRelations: 0 }

  const evidence = Array.isArray(value.evidence) ? value.evidence : []
  const index = buildEvidenceIndex(evidence)
  let remappedReferences = 0
  let normalizedConfidences = 0
  let normalizedRelations = 0
  let droppedRelations = 0

  const normalizeConfidence = (item: Record<string, unknown>): Record<string, unknown> => {
    const confidence = normalizeConfidenceValue(item.confidence)
    if (confidence === item.confidence) return item
    normalizedConfidences += 1
    return { ...item, confidence }
  }

  const normalizeCollection = (collection: unknown, relationCollection = false): unknown[] => {
    if (!Array.isArray(collection)) return []
    return collection.map((item) => {
      if (!isRecord(item)) return item

      let normalizedItem = normalizeConfidence(item)
      if (relationCollection) {
        const type = normalizeRelationType(normalizedItem.type)
        if (type !== normalizedItem.type) {
          normalizedRelations += 1
          normalizedItem = { ...normalizedItem, type }
        }
      }

      let rawEvidenceIds: unknown[]
      if (Array.isArray(normalizedItem.evidenceIds)) {
        rawEvidenceIds = normalizedItem.evidenceIds
      } else if (typeof normalizedItem.evidenceIds === 'string' && normalizedItem.evidenceIds.trim()) {
        rawEvidenceIds = [normalizedItem.evidenceIds]
        remappedReferences += 1
      } else {
        return normalizedItem
      }

      const evidenceIds = rawEvidenceIds.map((reference) => {
        if (typeof reference !== 'string') return reference
        const normalized = resolveEvidenceReference(reference, index)
        if (normalized !== reference) remappedReferences += 1
        return normalized
      })

      return { ...normalizedItem, evidenceIds }
    })
  }

  const normalizedEvidence = evidence.map((item) => isRecord(item) ? normalizeConfidence(item) : item)
  const normalizedRelationItems = normalizeCollection(value.relations, true).filter((item) => {
    if (!isRecord(item)) return true
    if (isNonEmptyString(item.fromId) && isNonEmptyString(item.toId)) return true
    droppedRelations += 1
    return false
  })

  return {
    value: {
      ...value,
      observations: normalizeCollection(value.observations),
      objects: normalizeCollection(value.objects),
      conditions: normalizeCollection(value.conditions),
      relations: normalizedRelationItems,
      evidence: normalizedEvidence,
    },
    remappedReferences,
    normalizedConfidences,
    normalizedRelations,
    droppedRelations,
  }
}

type EvidenceIndex = {
  exactIds: ReadonlySet<string>
  byFrameIndex: ReadonlyMap<number, string | null>
  byArrayIndex: ReadonlyMap<number, string>
}

function buildEvidenceIndex(evidence: unknown[]): EvidenceIndex {
  const exactIds = new Set<string>()
  const byFrameIndex = new Map<number, string | null>()
  const byArrayIndex = new Map<number, string>()

  evidence.forEach((item, arrayIndex) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) return
    const id = item.id.trim()
    exactIds.add(id)
    byArrayIndex.set(arrayIndex, id)

    if (typeof item.frameIndex !== 'number' || !Number.isInteger(item.frameIndex) || item.frameIndex < 0) return
    const frameIndex = item.frameIndex
    if (!byFrameIndex.has(frameIndex)) {
      byFrameIndex.set(frameIndex, id)
    } else if (byFrameIndex.get(frameIndex) !== id) {
      byFrameIndex.set(frameIndex, null)
    }
  })

  return { exactIds, byFrameIndex, byArrayIndex }
}

function resolveEvidenceReference(reference: string, index: EvidenceIndex): string {
  const normalizedReference = reference.trim()
  if (!normalizedReference || index.exactIds.has(normalizedReference)) return reference

  const placeholderIndex = parseEvidencePlaceholderIndex(normalizedReference)
  if (placeholderIndex === undefined) return reference

  if (index.byFrameIndex.has(placeholderIndex)) {
    const frameMatch = index.byFrameIndex.get(placeholderIndex)
    return frameMatch ?? reference
  }

  return index.byArrayIndex.get(placeholderIndex) ?? reference
}

function parseEvidencePlaceholderIndex(value: string): number | undefined {
  const match = value.match(/^evidence(?:[_:\-])?(\d+)$/i)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function normalizeConfidenceValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(trimmed)) return value
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : value
}

function normalizeRelationType(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (SENTINEL_RELATION_TYPES.has(normalized)) return normalized
  return RELATION_TYPE_ALIASES[normalized] ?? value
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
