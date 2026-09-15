import type { Evidence, PerceptionResult } from '../domain/sentinel.js'
import type { ScanFrame } from '../scan/types.js'

export interface TrustedEvidenceGroundingResult {
  result: PerceptionResult
  remappedReferences: number
  addedEvidence: number
}

/**
 * Make the scan pipeline, rather than the vision provider, authoritative for
 * frame evidence identity.
 *
 * The provider is still free to emit descriptive evidence items, but every
 * selected scan frame is represented by a canonical Evidence record owned by
 * SENTINEL. Provider-local placeholders such as evidence_0, evidence-1, or
 * evidence:2 are remapped only when their numeric index identifies one of the
 * frames that SENTINEL actually supplied to the model.
 *
 * Unknown/out-of-range references remain untouched so downstream validation
 * fails closed instead of inventing evidence.
 */
export function groundPerceptionToTrustedFrames(
  result: PerceptionResult,
  frames: readonly ScanFrame[],
  sourceId: string,
  capturedAt: string,
): TrustedEvidenceGroundingResult {
  let remappedReferences = 0

  const mapEvidenceIds = (ids: readonly string[]): string[] => ids.map((id) => {
    const index = parseEvidencePlaceholderIndex(id)
    if (index === undefined || index >= frames.length) return id
    const trustedId = frames[index]?.frameId
    if (!trustedId || trustedId === id) return id
    remappedReferences += 1
    return trustedId
  })

  const existingEvidenceIds = new Set(result.evidence.map((item) => item.id))
  const trustedEvidence: Evidence[] = frames
    .map((frame, frameIndex): Evidence => ({
      id: frame.frameId,
      type: 'frame',
      sourceId,
      capturedAt,
      frameIndex,
      timestampMs: frame.timestampMs,
      description: `Trusted scan frame ${frameIndex + 1} captured at ${frame.timestampMs}ms.`,
    }))
    .filter((item) => !existingEvidenceIds.has(item.id))

  return {
    result: {
      ...result,
      observations: result.observations.map((item) => ({ ...item, evidenceIds: mapEvidenceIds(item.evidenceIds) })),
      objects: result.objects.map((item) => ({ ...item, evidenceIds: mapEvidenceIds(item.evidenceIds) })),
      conditions: result.conditions.map((item) => ({ ...item, evidenceIds: mapEvidenceIds(item.evidenceIds) })),
      relations: result.relations.map((item) => ({ ...item, evidenceIds: mapEvidenceIds(item.evidenceIds) })),
      evidence: [...result.evidence, ...trustedEvidence],
    },
    remappedReferences,
    addedEvidence: trustedEvidence.length,
  }
}

function parseEvidencePlaceholderIndex(value: string): number | undefined {
  const match = value.trim().match(/^evidence(?:[_:\-])?(\d+)$/i)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}
