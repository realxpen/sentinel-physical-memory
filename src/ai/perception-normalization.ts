export interface EvidenceReferenceNormalizationResult {
  value: unknown
  remappedReferences: number
}

/**
 * Repair model-local evidence reference formatting without inventing evidence.
 *
 * A reference is rewritten only when it can be mapped deterministically to an
 * evidence item that already exists in the model response:
 * 1. exact evidence id wins;
 * 2. a numeric placeholder such as evidence_3 maps to the unique evidence item
 *    whose frameIndex is 3;
 * 3. when no evidence item provides that frameIndex, evidence_3 may map to the
 *    existing evidence item at array index 3;
 * 4. a single string evidenceIds value is normalized to a one-item string[] so
 *    provider formatting variance does not discard an otherwise grounded item.
 *
 * Missing, non-string, unknown, or ambiguous references are intentionally left
 * invalid so the strict perception validator can reject them.
 */
export function normalizePerceptionEvidenceReferences(value: unknown): EvidenceReferenceNormalizationResult {
  if (!isRecord(value)) return { value, remappedReferences: 0 }

  const evidence = Array.isArray(value.evidence) ? value.evidence : []
  const index = buildEvidenceIndex(evidence)
  let remappedReferences = 0

  const normalizeCollection = (collection: unknown): unknown[] => {
    if (!Array.isArray(collection)) return []
    return collection.map((item) => {
      if (!isRecord(item)) return item

      let rawEvidenceIds: unknown[]
      if (Array.isArray(item.evidenceIds)) {
        rawEvidenceIds = item.evidenceIds
      } else if (typeof item.evidenceIds === 'string' && item.evidenceIds.trim()) {
        rawEvidenceIds = [item.evidenceIds]
        remappedReferences += 1
      } else {
        return item
      }

      const evidenceIds = rawEvidenceIds.map((reference) => {
        if (typeof reference !== 'string') return reference
        const normalized = resolveEvidenceReference(reference, index)
        if (normalized !== reference) remappedReferences += 1
        return normalized
      })

      return { ...item, evidenceIds }
    })
  }

  return {
    value: {
      ...value,
      observations: normalizeCollection(value.observations),
      objects: normalizeCollection(value.objects),
      conditions: normalizeCollection(value.conditions),
      relations: normalizeCollection(value.relations),
    },
    remappedReferences,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
