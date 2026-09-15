export interface EvidenceReferenceNormalizationResult {
  value: unknown
  remappedReferences: number
  normalizedConfidences: number
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
 * Missing, non-string, unknown, or ambiguous evidence references are likewise
 * left invalid so strict perception validation still fails closed.
 */
export function normalizePerceptionEvidenceReferences(value: unknown): EvidenceReferenceNormalizationResult {
  if (!isRecord(value)) return { value, remappedReferences: 0, normalizedConfidences: 0 }

  const evidence = Array.isArray(value.evidence) ? value.evidence : []
  const index = buildEvidenceIndex(evidence)
  let remappedReferences = 0
  let normalizedConfidences = 0

  const normalizeConfidence = (item: Record<string, unknown>): Record<string, unknown> => {
    const confidence = normalizeConfidenceValue(item.confidence)
    if (confidence === item.confidence) return item
    normalizedConfidences += 1
    return { ...item, confidence }
  }

  const normalizeCollection = (collection: unknown): unknown[] => {
    if (!Array.isArray(collection)) return []
    return collection.map((item) => {
      if (!isRecord(item)) return item

      const normalizedItem = normalizeConfidence(item)
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

  return {
    value: {
      ...value,
      observations: normalizeCollection(value.observations),
      objects: normalizeCollection(value.objects),
      conditions: normalizeCollection(value.conditions),
      relations: normalizeCollection(value.relations),
      evidence: normalizedEvidence,
    },
    remappedReferences,
    normalizedConfidences,
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
      // Multiple evidence items claim the same frame index. Mark ambiguous and
      // leave any placeholder reference untouched so validation fails closed.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
