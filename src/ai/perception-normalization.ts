export interface EvidenceReferenceNormalizationResult {
  value: unknown
  remappedReferences: number
  normalizedConfidences: number
  normalizedNumericFields: number
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
 * Repair bounded provider formatting variance without inventing evidence,
 * identity, or semantic confidence values.
 *
 * Safe numeric serialization variance is normalized only for known numeric
 * schema fields. Plain decimal strings such as "3" or "1250.5" may become
 * numbers; percentages, labels, NaN/infinity, blank strings, and malformed
 * values remain untouched so strict validation can reject them.
 *
 * Evidence references are rewritten only when they can be mapped
 * deterministically to an evidence item that already exists in the model
 * response. Unknown or ambiguous references remain invalid.
 *
 * Relation types are normalized only for canonical labels or unambiguous
 * synonyms. A relation without a usable fromId or toId is dropped rather than
 * guessed because relations are auxiliary graph edges.
 */
export function normalizePerceptionEvidenceReferences(value: unknown): EvidenceReferenceNormalizationResult {
  if (!isRecord(value)) {
    return {
      value,
      remappedReferences: 0,
      normalizedConfidences: 0,
      normalizedNumericFields: 0,
      normalizedRelations: 0,
      droppedRelations: 0,
    }
  }

  let remappedReferences = 0
  let normalizedConfidences = 0
  let normalizedNumericFields = 0
  let normalizedRelations = 0
  let droppedRelations = 0

  const normalizeConfidence = (item: Record<string, unknown>): Record<string, unknown> => {
    const confidence = normalizeConfidenceValue(item.confidence)
    if (confidence === item.confidence) return item
    normalizedConfidences += 1
    return { ...item, confidence }
  }

  const normalizeNumericMetadata = (item: Record<string, unknown>): Record<string, unknown> => {
    let normalized = item

    const replaceField = (
      target: Record<string, unknown>,
      key: string,
      normalizer: (value: unknown) => unknown = normalizeFiniteNumberValue,
    ): Record<string, unknown> => {
      if (!(key in target)) return target
      const next = normalizer(target[key])
      if (next === target[key]) return target
      normalizedNumericFields += 1
      return { ...target, [key]: next }
    }

    normalized = replaceField(normalized, 'frameIndex', normalizeNonNegativeIntegerValue)
    normalized = replaceField(normalized, 'timestampMs', normalizeNonNegativeFiniteNumberValue)

    if (isRecord(normalized.position)) {
      let position = normalized.position
      for (const key of ['x', 'y', 'z']) position = replaceField(position, key)
      if (position !== normalized.position) normalized = { ...normalized, position }
    }

    const boundingBox = normalizeBoundingBoxNumericFields(normalized.boundingBox, () => { normalizedNumericFields += 1 })
    if (boundingBox !== normalized.boundingBox) normalized = { ...normalized, boundingBox }

    return normalized
  }

  const normalizeItem = (item: Record<string, unknown>): Record<string, unknown> =>
    normalizeNumericMetadata(normalizeConfidence(item))

  const rawEvidence = Array.isArray(value.evidence) ? value.evidence : []
  const normalizedEvidence = rawEvidence.map((item) => isRecord(item) ? normalizeItem(item) : item)
  const index = buildEvidenceIndex(normalizedEvidence)

  const normalizeCollection = (collection: unknown, relationCollection = false): unknown[] => {
    if (!Array.isArray(collection)) return []
    return collection.map((item) => {
      if (!isRecord(item)) return item

      let normalizedItem = normalizeItem(item)
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
        const normalizedReference = resolveEvidenceReference(reference, index)
        if (normalizedReference !== reference) remappedReferences += 1
        return normalizedReference
      })

      return { ...normalizedItem, evidenceIds }
    })
  }

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
    normalizedNumericFields,
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

function normalizeFiniteNumberValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) return value
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : value
}

function normalizeNonNegativeFiniteNumberValue(value: unknown): unknown {
  const normalized = normalizeFiniteNumberValue(value)
  return typeof normalized === 'number' && normalized >= 0 ? normalized : value
}

function normalizeNonNegativeIntegerValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return value
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : value
}

function normalizeBoundingBoxNumericFields(value: unknown, onNormalized: () => void): unknown {
  if (Array.isArray(value)) {
    let changed = false
    const normalized = value.map((entry, index) => {
      if (index > 5) return entry
      const next = normalizeFiniteNumberValue(entry)
      if (next !== entry) {
        changed = true
        onNormalized()
      }
      return next
    })
    return changed ? normalized : value
  }

  if (!isRecord(value)) return value
  let normalized = value
  for (const key of ['x', 'y', 'width', 'height', 'frameWidth', 'frameHeight']) {
    if (!(key in normalized)) continue
    const next = normalizeFiniteNumberValue(normalized[key])
    if (next === normalized[key]) continue
    onNormalized()
    normalized = { ...normalized, [key]: next }
  }
  return normalized
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
