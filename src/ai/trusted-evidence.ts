import type { Evidence, PerceptionResult } from '../domain/sentinel.js'
import type { ScanFrame } from '../scan/types.js'

export interface TrustedEvidenceGroundingResult {
  result: PerceptionResult
  remappedReferences: number
  addedEvidence: number
  droppedUnknownEvidenceReferences: number
  droppedUngroundedItems: number
  droppedDanglingRelations: number
}

/**
 * Make SENTINEL-owned scan frames the evidence authority after provider parsing.
 *
 * The vision provider may describe what it saw, but it does not own frame
 * identity. Every selected frame becomes canonical evidence. Provider-local
 * placeholders such as evidence_0, frame-1, or frame:2 are mapped only when
 * their index identifies a frame that SENTINEL actually supplied.
 *
 * A malformed optional provider item no longer destroys the whole walkthrough:
 * - unknown evidence references are removed;
 * - an observation/object/condition left with no grounded evidence is dropped;
 * - a relation whose endpoints are not retained objects is dropped;
 * - when exactly one frame was supplied, an item with no evidenceIds can be
 *   grounded to that sole frame deterministically;
 * - out-of-range placeholders never create evidence.
 */
export function groundPerceptionToTrustedFrames(
  result: PerceptionResult,
  frames: readonly ScanFrame[],
  sourceId: string,
  capturedAt: string,
): TrustedEvidenceGroundingResult {
  let remappedReferences = 0
  let droppedUnknownEvidenceReferences = 0
  let droppedUngroundedItems = 0
  let droppedDanglingRelations = 0

  const trustedEvidence: Evidence[] = frames.map((frame, frameIndex): Evidence => ({
    id: frame.frameId,
    type: 'frame',
    sourceId,
    capturedAt,
    frameIndex,
    timestampMs: frame.timestampMs,
    description: `Trusted scan frame ${frameIndex + 1} captured at ${frame.timestampMs}ms.`,
  }))

  const evidenceById = new Map<string, Evidence>()
  for (const item of result.evidence) {
    if (!item.id || evidenceById.has(item.id)) continue
    evidenceById.set(item.id, { ...item, sourceId, capturedAt })
  }
  for (const item of trustedEvidence) evidenceById.set(item.id, item)

  const knownEvidenceIds = new Set(evidenceById.keys())

  const mapEvidenceIds = (ids: readonly string[]): string[] => {
    const mapped: string[] = []
    for (const rawId of ids) {
      const id = rawId.trim()
      if (!id) continue
      const placeholderIndex = parseEvidencePlaceholderIndex(id)
      let candidate = id
      if (placeholderIndex !== undefined && placeholderIndex < frames.length) {
        const trustedId = frames[placeholderIndex]?.frameId
        if (trustedId && trustedId !== id) {
          candidate = trustedId
          remappedReferences += 1
        }
      }
      if (!knownEvidenceIds.has(candidate)) {
        droppedUnknownEvidenceReferences += 1
        continue
      }
      mapped.push(candidate)
    }
    return unique(mapped)
  }

  const groundIds = (ids: readonly string[]): string[] => {
    const mapped = mapEvidenceIds(ids)
    if (mapped.length > 0) return mapped
    if (ids.length === 0 && frames.length === 1 && frames[0]?.frameId) {
      remappedReferences += 1
      return [frames[0].frameId]
    }
    return []
  }

  const observations = result.observations.flatMap((item) => {
    const evidenceIds = groundIds(item.evidenceIds)
    if (!evidenceIds.length) {
      droppedUngroundedItems += 1
      return []
    }
    return [{ ...item, sourceId, capturedAt, basis: 'observed' as const, evidenceIds }]
  })

  const objects = result.objects.flatMap((item) => {
    const evidenceIds = groundIds(item.evidenceIds)
    if (!evidenceIds.length) {
      droppedUngroundedItems += 1
      return []
    }
    return [{ ...item, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds }]
  })
  const objectIds = new Set(objects.map((item) => item.id))

  const conditions = result.conditions.flatMap((item) => {
    const evidenceIds = groundIds(item.evidenceIds)
    if (!evidenceIds.length) {
      droppedUngroundedItems += 1
      return []
    }
    return [{
      ...item,
      observedAt: capturedAt,
      objectIds: unique(item.objectIds.filter((id) => objectIds.has(id))),
      evidenceIds,
    }]
  })

  const relations = result.relations.flatMap((item) => {
    const evidenceIds = groundIds(item.evidenceIds)
    if (!evidenceIds.length) {
      droppedUngroundedItems += 1
      return []
    }
    if (!objectIds.has(item.fromId) || !objectIds.has(item.toId)) {
      droppedDanglingRelations += 1
      return []
    }
    return [{ ...item, evidenceIds }]
  })

  const providerEvidenceIds = new Set(result.evidence.map((item) => item.id))
  const addedEvidence = trustedEvidence.filter((item) => !providerEvidenceIds.has(item.id)).length

  return {
    result: {
      ...result,
      observations: uniqueById(observations),
      objects: uniqueById(objects),
      conditions: uniqueById(conditions),
      relations: uniqueById(relations),
      evidence: [...evidenceById.values()],
    },
    remappedReferences,
    addedEvidence,
    droppedUnknownEvidenceReferences,
    droppedUngroundedItems,
    droppedDanglingRelations,
  }
}

function parseEvidencePlaceholderIndex(value: string): number | undefined {
  const match = value.trim().match(/^(?:evidence|frame)(?:[_:\-])?(\d+)$/i)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value.id)) return false
    seen.add(value.id)
    return true
  })
}
