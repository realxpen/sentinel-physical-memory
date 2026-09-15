export interface EvidenceReferenceNormalizationResult {
  value: unknown
  remappedReferences: number
  normalizedConfidences: number
  normalizedNumericFields: number
  normalizedRelations: number
  normalizedArrays: number
  normalizedOptionalFields: number
  generatedIds: number
  droppedItems: number
  droppedRelations: number
}

const PROVIDER_TIMESTAMP_PLACEHOLDER = '1970-01-01T00:00:00.000Z'

const SENTINEL_OBJECT_CATEGORIES = new Set([
  'room', 'door', 'window', 'furniture', 'equipment', 'electrical', 'hvac',
  'safety', 'signage', 'document', 'person', 'obstruction', 'other',
])
const OBJECT_CATEGORY_ALIASES: Record<string, string> = {
  chair: 'furniture', chairs: 'furniture', sofa: 'furniture', sofas: 'furniture',
  couch: 'furniture', couches: 'furniture', desk: 'furniture', desks: 'furniture',
  table: 'furniture', tables: 'furniture', locker: 'furniture', lockers: 'furniture',
  cabinet: 'furniture', cabinets: 'furniture', shelf: 'furniture', shelves: 'furniture',
  logo: 'signage', sign: 'signage', display: 'equipment', monitor: 'equipment',
  screen: 'equipment', appliance: 'equipment', cable: 'electrical', wire: 'electrical',
}

const SENTINEL_CONDITION_KINDS = new Set([
  'normal', 'attention', 'hazard', 'damage', 'maintenance', 'access', 'compliance', 'unknown',
])
const CONDITION_KIND_ALIASES: Record<string, string> = {
  safety_hazard: 'hazard', risk: 'hazard', damaged: 'damage', broken: 'damage',
  maintenance_needed: 'maintenance', needs_maintenance: 'maintenance',
  access_issue: 'access', blocked_access: 'access', obstruction: 'access',
  non_compliance: 'compliance', noncompliance: 'compliance', warning: 'attention',
}

const SENTINEL_RELATION_TYPES = new Set([
  'contains', 'located_in', 'adjacent_to', 'near', 'attached_to', 'part_of',
  'on', 'above', 'below', 'in_front_of', 'behind', 'left_of', 'right_of',
  'has_issue', 'requires_action', 'supports',
])
const RELATION_TYPE_ALIASES: Record<string, string> = {
  in: 'located_in', inside: 'located_in', within: 'located_in', located_inside: 'located_in',
  adjacent: 'adjacent_to', beside: 'adjacent_to', next_to: 'adjacent_to', nextto: 'adjacent_to',
  nearby: 'near', located_near: 'near', close_to: 'near', close: 'near',
  mounted_on: 'attached_to', mounted_to: 'attached_to', fixed_to: 'attached_to', affixed_to: 'attached_to',
  component_of: 'part_of', partof: 'part_of', on_top_of: 'on', atop: 'on', over: 'above',
  under: 'below', underneath: 'below', in_front: 'in_front_of', front_of: 'in_front_of',
  behind_of: 'behind', to_left_of: 'left_of', to_right_of: 'right_of',
}

const SENTINEL_MODALITIES = new Set(['video', 'image', 'audio', 'document', 'sensor'])
const MODALITY_ALIASES: Record<string, string> = {
  frame: 'video', video_frame: 'video', photo: 'image', photograph: 'image', screenshot: 'image', still: 'image',
}

const SENTINEL_EVIDENCE_TYPES = new Set(['frame', 'image', 'audio', 'document', 'observation', 'previous_state'])
const EVIDENCE_TYPE_ALIASES: Record<string, string> = {
  video_frame: 'frame', keyframe: 'frame', key_frame: 'frame', screenshot: 'image', photo: 'image',
  photograph: 'image', text: 'document', document_text: 'document', prior_state: 'previous_state', previous: 'previous_state',
}

/**
 * Canonicalize bounded model/provider variance before strict schema validation.
 *
 * Principles:
 * - technical serialization differences may be repaired deterministically;
 * - scan identity remains authoritative outside the provider;
 * - missing technical IDs may be generated because model IDs are scan-local aliases;
 * - malformed optional geometry/metadata is removed rather than trusted;
 * - a malformed optional item is dropped instead of discarding an otherwise grounded scan;
 * - semantic facts are never invented: unknown relations remain unsupported and
 *   entities without usable semantic text/confidence are discarded;
 * - unknown evidence references remain untouched so trusted-frame grounding can
 *   resolve them later or strict scan validation can fail closed.
 */
export function normalizePerceptionEvidenceReferences(value: unknown): EvidenceReferenceNormalizationResult {
  const stats = {
    remappedReferences: 0,
    normalizedConfidences: 0,
    normalizedNumericFields: 0,
    normalizedRelations: 0,
    normalizedArrays: 0,
    normalizedOptionalFields: 0,
    generatedIds: 0,
    droppedItems: 0,
    droppedRelations: 0,
  }

  if (!isRecord(value)) return { value, ...stats }

  const topSourceId = nonEmptyString(value.sourceId)

  const rawEvidence = toCollection(value.evidence, stats)
  const evidence = dedupeById(rawEvidence.map((item, index) => normalizeEvidence(item, index, topSourceId, stats)).filter(isRecord), stats)
  const evidenceIndex = buildEvidenceIndex(evidence)

  const rawObservations = toCollection(value.observations, stats)
  const observations = dedupeById(rawObservations.map((item, index) => normalizeObservation(item, index, stats)).filter(isRecord), stats)

  const rawObjects = toCollection(value.objects, stats)
  const objects = dedupeById(rawObjects.map((item, index) => normalizeObject(item, index, stats)).filter(isRecord), stats)
  const objectIds = new Set(objects.map((item) => String(item.id)))

  const rawConditions = toCollection(value.conditions, stats)
  const conditions = dedupeById(rawConditions.map((item, index) => normalizeCondition(item, index, objectIds, stats)).filter(isRecord), stats)

  const rawRelations = toCollection(value.relations, stats)
  const relations = dedupeById(rawRelations.map((item, index) => normalizeRelation(item, index, objectIds, stats)).filter(isRecord), stats)

  const normalizeEvidenceRefs = (item: Record<string, unknown>): Record<string, unknown> => {
    const ids = normalizeStringArray(item.evidenceIds, stats)
    const remapped = ids.map((reference) => {
      const resolved = resolveEvidenceReference(reference, evidenceIndex)
      if (resolved !== reference) stats.remappedReferences += 1
      return resolved
    })
    return { ...item, evidenceIds: uniqueStrings(remapped) }
  }

  return {
    value: {
      ...value,
      observations: observations.map(normalizeEvidenceRefs),
      objects: objects.map(normalizeEvidenceRefs),
      conditions: conditions.map(normalizeEvidenceRefs),
      relations: relations.map(normalizeEvidenceRefs),
      evidence,
    },
    ...stats,
  }
}

type Stats = Omit<EvidenceReferenceNormalizationResult, 'value'>
type EvidenceIndex = {
  exactIds: ReadonlySet<string>
  byFrameIndex: ReadonlyMap<number, string | null>
  byArrayIndex: ReadonlyMap<number, string>
}

function normalizeObservation(value: unknown, index: number, stats: Stats): Record<string, unknown> | null {
  if (!isRecord(value)) return drop(stats)
  const label = semanticString(value.label) ?? semanticString(value.description)
  const description = semanticString(value.description) ?? label
  const confidence = requiredConfidence(value.confidence, stats)
  if (!label || !description || confidence === undefined) return drop(stats)

  return compact({
    ...value,
    id: technicalId(value.id, 'observation', index, stats),
    modality: normalizeModality(value.modality),
    capturedAt: timestampString(value.capturedAt),
    label,
    description,
    confidence,
    basis: 'observed',
    position: normalizePosition(value.position, stats),
    evidenceIds: normalizeStringArray(value.evidenceIds, stats),
  })
}

function normalizeObject(value: unknown, index: number, stats: Stats): Record<string, unknown> | null {
  if (!isRecord(value)) return drop(stats)
  const name = semanticString(value.name)
  const confidence = requiredConfidence(value.confidence, stats)
  if (!name || confidence === undefined) return drop(stats)

  return compact({
    ...value,
    id: technicalId(value.id, 'object', index, stats),
    category: normalizeObjectCategory(value.category),
    name,
    description: optionalString(value.description, stats),
    position: normalizePosition(value.position, stats),
    boundingBox: normalizeBoundingBox(value.boundingBox, stats),
    state: optionalString(value.state, stats),
    confidence,
    firstSeenAt: timestampString(value.firstSeenAt),
    lastSeenAt: timestampString(value.lastSeenAt),
    evidenceIds: normalizeStringArray(value.evidenceIds, stats),
  })
}

function normalizeCondition(value: unknown, index: number, objectIds: ReadonlySet<string>, stats: Stats): Record<string, unknown> | null {
  if (!isRecord(value)) return drop(stats)
  const title = semanticString(value.title) ?? semanticString(value.description)
  const description = semanticString(value.description) ?? title
  const confidence = requiredConfidence(value.confidence, stats)
  if (!title || !description || confidence === undefined) return drop(stats)

  const basis = normalizeToken(value.basis) === 'observed' ? 'observed' : 'inferred'
  const statusToken = normalizeToken(value.status)
  const status = statusToken === 'present' || statusToken === 'uncertain'
    ? statusToken
    : (basis === 'observed' ? 'present' : 'uncertain')

  return compact({
    ...value,
    id: technicalId(value.id, 'condition', index, stats),
    kind: normalizeConditionKind(value.kind),
    title,
    description,
    status,
    basis,
    confidence,
    objectIds: normalizeStringArray(value.objectIds, stats).filter((id) => objectIds.has(id)),
    evidenceIds: normalizeStringArray(value.evidenceIds, stats),
    observedAt: timestampString(value.observedAt),
  })
}

function normalizeRelation(value: unknown, index: number, objectIds: ReadonlySet<string>, stats: Stats): Record<string, unknown> | null {
  if (!isRecord(value)) return dropRelation(stats)
  const fromId = nonEmptyString(value.fromId)
  const toId = nonEmptyString(value.toId)
  const type = normalizeRelationType(value.type)
  const confidence = requiredConfidence(value.confidence, stats)
  if (!fromId || !toId || !type || confidence === undefined) return dropRelation(stats)

  // Perception relations are spatial/object graph edges. If the provider points
  // at an entity it did not actually return, keep the objects and drop the edge.
  if (!objectIds.has(fromId) || !objectIds.has(toId)) return dropRelation(stats)

  return {
    ...value,
    id: technicalId(value.id, 'relation', index, stats),
    fromId,
    toId,
    type,
    confidence,
    evidenceIds: normalizeStringArray(value.evidenceIds, stats),
  }
}

function normalizeEvidence(value: unknown, index: number, topSourceId: string | undefined, stats: Stats): Record<string, unknown> | null {
  if (!isRecord(value)) return drop(stats)

  const frameIndex = optionalNonNegativeInteger(value.frameIndex, stats)
  const type = normalizeEvidenceType(value.type, frameIndex)
  if (!type) return drop(stats)

  const confidence = optionalConfidence(value.confidence, stats)
  const sourceId = nonEmptyString(value.sourceId) ?? topSourceId
  if (!sourceId) return drop(stats)

  return compact({
    ...value,
    id: technicalId(value.id, 'evidence', index, stats),
    type,
    sourceId,
    capturedAt: timestampString(value.capturedAt),
    frameIndex,
    timestampMs: optionalNonNegativeNumber(value.timestampMs, stats),
    uri: optionalString(value.uri, stats),
    excerpt: optionalString(value.excerpt, stats),
    boundingBox: normalizeBoundingBox(value.boundingBox, stats),
    confidence,
    description: semanticString(value.description) ?? `Provider evidence ${index + 1}`,
  })
}

function toCollection(value: unknown, stats: Stats): unknown[] {
  if (Array.isArray(value)) return value
  if (isRecord(value)) {
    stats.normalizedArrays += 1
    return [value]
  }
  if (value !== undefined && value !== null) stats.normalizedArrays += 1
  return []
}

function technicalId(value: unknown, prefix: string, index: number, stats: Stats): string {
  const existing = nonEmptyString(value)
  if (existing) return existing
  stats.generatedIds += 1
  return `${prefix}_${index}`
}

function normalizeStringArray(value: unknown, stats: Stats): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    stats.normalizedArrays += 1
    return trimmed ? [trimmed] : []
  }
  if (!Array.isArray(value)) return []
  const result = value.map(nonEmptyString).filter((item): item is string => Boolean(item))
  if (result.length !== value.length) stats.normalizedArrays += 1
  return uniqueStrings(result)
}

function requiredConfidence(value: unknown, stats: Stats): number | undefined {
  const normalized = normalizeConfidenceValue(value)
  if (normalized !== value) stats.normalizedConfidences += 1
  return typeof normalized === 'number' && Number.isFinite(normalized) && normalized >= 0 && normalized <= 1
    ? normalized
    : undefined
}

function optionalConfidence(value: unknown, stats: Stats): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = requiredConfidence(value, stats)
  if (normalized === undefined) stats.normalizedOptionalFields += 1
  return normalized
}

function normalizeConfidenceValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(trimmed)) return value
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : value
}

function optionalNonNegativeInteger(value: unknown, stats: Stats): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = normalizeNonNegativeIntegerValue(value)
  if (normalized !== value) stats.normalizedNumericFields += 1
  if (typeof normalized === 'number' && Number.isSafeInteger(normalized) && normalized >= 0) return normalized
  stats.normalizedOptionalFields += 1
  return undefined
}

function optionalNonNegativeNumber(value: unknown, stats: Stats): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = normalizeNonNegativeFiniteNumberValue(value)
  if (normalized !== value) stats.normalizedNumericFields += 1
  if (typeof normalized === 'number' && Number.isFinite(normalized) && normalized >= 0) return normalized
  stats.normalizedOptionalFields += 1
  return undefined
}

function optionalFiniteNumber(value: unknown, stats: Stats): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = normalizeFiniteNumberValue(value)
  if (normalized !== value) stats.normalizedNumericFields += 1
  if (typeof normalized === 'number' && Number.isFinite(normalized)) return normalized
  stats.normalizedOptionalFields += 1
  return undefined
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
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return value
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : value
}

function normalizePosition(value: unknown, stats: Stats): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const description = value.trim()
    if (!description) return undefined
    stats.normalizedOptionalFields += 1
    return { description }
  }
  if (!isRecord(value)) return undefined
  const description = semanticString(value.description)
  if (!description) {
    stats.normalizedOptionalFields += 1
    return undefined
  }
  return compact({
    description,
    x: optionalFiniteNumber(value.x, stats),
    y: optionalFiniteNumber(value.y, stats),
    z: optionalFiniteNumber(value.z, stats),
    roomId: optionalString(value.roomId, stats),
    relativeToId: optionalString(value.relativeToId, stats),
  })
}

function normalizeBoundingBox(value: unknown, stats: Stats): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === '') return undefined
  let x: number | undefined
  let y: number | undefined
  let width: number | undefined
  let height: number | undefined
  let frameWidth: number | undefined
  let frameHeight: number | undefined

  if (Array.isArray(value)) {
    x = optionalFiniteNumber(value[0], stats)
    y = optionalFiniteNumber(value[1], stats)
    width = optionalFiniteNumber(value[2], stats)
    height = optionalFiniteNumber(value[3], stats)
    frameWidth = optionalFiniteNumber(value[4], stats)
    frameHeight = optionalFiniteNumber(value[5], stats)
  } else if (isRecord(value)) {
    x = optionalFiniteNumber(value.x, stats)
    y = optionalFiniteNumber(value.y, stats)
    width = optionalFiniteNumber(value.width, stats)
    height = optionalFiniteNumber(value.height, stats)
    frameWidth = optionalFiniteNumber(value.frameWidth, stats)
    frameHeight = optionalFiniteNumber(value.frameHeight, stats)
  } else {
    stats.normalizedOptionalFields += 1
    return undefined
  }

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    stats.normalizedOptionalFields += 1
    return undefined
  }
  return compact({ x, y, width, height, frameWidth, frameHeight })
}

function normalizeObjectCategory(value: unknown): string {
  const normalized = normalizeToken(value)
  if (normalized && SENTINEL_OBJECT_CATEGORIES.has(normalized)) return normalized
  return (normalized && OBJECT_CATEGORY_ALIASES[normalized]) || 'other'
}

function normalizeConditionKind(value: unknown): string {
  const normalized = normalizeToken(value)
  if (normalized && SENTINEL_CONDITION_KINDS.has(normalized)) return normalized
  return (normalized && CONDITION_KIND_ALIASES[normalized]) || 'unknown'
}

function normalizeModality(value: unknown): string {
  const normalized = normalizeToken(value)
  if (normalized && SENTINEL_MODALITIES.has(normalized)) return normalized
  return (normalized && MODALITY_ALIASES[normalized]) || 'video'
}

function normalizeEvidenceType(value: unknown, frameIndex: number | undefined): string | undefined {
  const normalized = normalizeToken(value)
  if (normalized && SENTINEL_EVIDENCE_TYPES.has(normalized)) return normalized
  if (normalized && EVIDENCE_TYPE_ALIASES[normalized]) return EVIDENCE_TYPE_ALIASES[normalized]
  if (frameIndex !== undefined) return 'frame'
  return undefined
}

function normalizeRelationType(value: unknown): string | undefined {
  const normalized = normalizeToken(value)
  if (!normalized) return undefined
  if (SENTINEL_RELATION_TYPES.has(normalized)) return normalized
  return RELATION_TYPE_ALIASES[normalized]
}

function buildEvidenceIndex(evidence: Record<string, unknown>[]): EvidenceIndex {
  const exactIds = new Set<string>()
  const byFrameIndex = new Map<number, string | null>()
  const byArrayIndex = new Map<number, string>()

  evidence.forEach((item, arrayIndex) => {
    const id = nonEmptyString(item.id)
    if (!id) return
    exactIds.add(id)
    byArrayIndex.set(arrayIndex, id)
    const frameIndex = item.frameIndex
    if (typeof frameIndex !== 'number' || !Number.isInteger(frameIndex) || frameIndex < 0) return
    if (!byFrameIndex.has(frameIndex)) byFrameIndex.set(frameIndex, id)
    else if (byFrameIndex.get(frameIndex) !== id) byFrameIndex.set(frameIndex, null)
  })

  return { exactIds, byFrameIndex, byArrayIndex }
}

function resolveEvidenceReference(reference: string, index: EvidenceIndex): string {
  const normalizedReference = reference.trim()
  if (!normalizedReference || index.exactIds.has(normalizedReference)) return normalizedReference || reference
  const placeholderIndex = parseEvidencePlaceholderIndex(normalizedReference)
  if (placeholderIndex === undefined) return normalizedReference
  if (index.byFrameIndex.has(placeholderIndex)) return index.byFrameIndex.get(placeholderIndex) ?? normalizedReference
  return index.byArrayIndex.get(placeholderIndex) ?? normalizedReference
}

function parseEvidencePlaceholderIndex(value: string): number | undefined {
  const match = value.match(/^(?:evidence|frame)(?:[_:\-])?(\d+)$/i)
  if (!match) return undefined
  const parsed = Number(match[1])
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function dedupeById(values: Record<string, unknown>[], stats: Stats): Record<string, unknown>[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const id = String(value.id)
    if (seen.has(id)) {
      stats.droppedItems += 1
      return false
    }
    seen.add(id)
    return true
  })
}

function drop(stats: Stats): null {
  stats.droppedItems += 1
  return null
}

function dropRelation(stats: Stats): null {
  stats.droppedItems += 1
  stats.droppedRelations += 1
  return null
}

function timestampString(value: unknown): string {
  return nonEmptyString(value) ?? PROVIDER_TIMESTAMP_PLACEHOLDER
}

function optionalString(value: unknown, stats: Stats): string | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = nonEmptyString(value)
  if (!normalized) stats.normalizedOptionalFields += 1
  return normalized
}

function semanticString(value: unknown): string | undefined {
  return nonEmptyString(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeToken(value: unknown): string | undefined {
  const stringValue = nonEmptyString(value)
  return stringValue?.toLowerCase().replace(/[\s-]+/g, '_')
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
