import type { ConditionKind, EnvironmentType, PerceptionResult, SpatialObject } from '../domain/sentinel.js'
import { PerceptionValidationError, validatePerceptionForScan } from '../ai/perception-schema.js'
import { groundPerceptionToTrustedFrames } from '../ai/trusted-evidence.js'
import { ModelAdapterError, type ModelAdapter } from '../ai/model.js'
import { EnvironmentalMemoryStore } from '../memory/store.js'
import { InMemoryEnvironmentalMemoryRepository, type EnvironmentalMemoryRepository } from '../memory/repository.js'
import { deriveOperationalConditions } from '../perception/condition-derivation.js'
import type { ScanArtifact, ScanError, ScanFrame, ScanInput, ScanProgress, ScanResult } from './types.js'

export interface ScanPipelineDependencies {
  now?: () => Date
  id?: (prefix: string) => string
  onProgress?: (progress: ScanProgress) => void
  model?: ModelAdapter
  memoryRepository?: EnvironmentalMemoryRepository
}

const defaultId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const MAX_PERCEPTION_IMAGE_FRAMES = 10
const MAX_PERCEPTION_ATTEMPTS = 2
const ENVIRONMENT_TYPES = new Set<EnvironmentType>(['office', 'school', 'hotel', 'clinic', 'retail', 'home', 'warehouse', 'construction', 'other'])
const OPERATIONAL_CONDITION_KINDS = new Set<ConditionKind>(['attention', 'hazard', 'damage', 'maintenance', 'access', 'compliance'])

export class ScanPipeline {
  private readonly now: () => Date
  private readonly id: (prefix: string) => string
  private readonly onProgress?: (progress: ScanProgress) => void
  private readonly model?: ModelAdapter
  private readonly memoryRepository: EnvironmentalMemoryRepository

  constructor(deps: ScanPipelineDependencies = {}) {
    this.now = deps.now ?? (() => new Date())
    this.id = deps.id ?? defaultId
    this.onProgress = deps.onProgress
    this.model = deps.model
    this.memoryRepository = deps.memoryRepository ?? new InMemoryEnvironmentalMemoryRepository()
  }

  async run(input: ScanInput): Promise<ScanResult> {
    const scanId = this.id('scan')
    this.emit(scanId, 'queued', 0, 'Scan queued')
    this.validate(input)
    this.emit(scanId, 'validating', 15, 'Input validated')

    const memory = await this.loadMemoryStore(input.environmentId)
    this.ensureEnvironment(memory, input)

    const frames = this.sample(input)
    this.emit(scanId, 'sampling', 35, `${frames.length} key frame(s) selected`)
    const artifacts = this.createArtifacts(frames, input)
    this.emit(scanId, 'extracting', 55, `${artifacts.filter((artifact) => artifact.kind === 'frame').length} frame artifact(s) prepared`)

    const existingMemory = memory.get(input.environmentId)
    const priorSnapshot = existingMemory?.environment.currentStateId
      ? existingMemory.snapshots.find((item) => item.stateId === existingMemory.environment.currentStateId)
      : undefined
    const priorObjects = priorSnapshot?.objects ?? []

    const perceived = await this.perceive(scanId, artifacts, frames, input, priorObjects)
    const derived = deriveOperationalConditions(perceived, input.source.capturedAt)
    const perception = validatePerceptionForScan(derived.result, input.environmentId, input.source.id)
    console.warn('SENTINEL_CONDITION_DERIVATION_COMPLETED', {
      scanId,
      derivedConditions: derived.derivedConditions.length,
      operationalConditionsAfterDerivation: perception.conditions.filter((item) => OPERATIONAL_CONDITION_KINDS.has(item.kind)).length,
      conditions: derived.derivedConditions.map((item) => ({
        kind: item.kind,
        title: item.title,
        basis: item.basis,
        confidence: item.confidence,
        objectIds: item.objectIds,
      })),
    })

    const observations = perception.observations.map((item) => ({ ...item }))
    const conditions = perception.conditions.map((item) => ({ ...item, objectIds: [...item.objectIds], evidenceIds: [...item.evidenceIds] }))
    this.emit(scanId, 'normalizing', 75, `${observations.length} observation(s), ${conditions.length} condition(s) normalized`)

    const state = memory.ingestScan(input.environmentId, input.source, perception)
    console.warn('SENTINEL_SCAN_POLICY_RESULT', {
      scanId,
      stateVersion: state.version,
      conditionsPersisted: state.conditionIds.length,
      issuesPromoted: state.issueIds.length,
    })
    this.emit(scanId, 'memorizing', 88, `Environmental state v${state.version} created`)

    const previous = memory.get(input.environmentId)?.states.find((candidate) => candidate.version === state.version - 1)
    let diff
    if (previous) {
      this.emit(scanId, 'comparing', 94, `Comparing state v${previous.version} with v${state.version}`)
      diff = memory.compare(input.environmentId, previous.id, state.id)
    }

    const updatedMemory = memory.get(input.environmentId)
    if (!updatedMemory) throw new Error('Environmental memory was not created')
    await this.memoryRepository.save(updatedMemory)

    this.emit(scanId, 'complete', 100, diff ? `Scan complete: ${diff.changes.length} change(s) detected` : 'Scan pipeline complete')
    return { scanId, environmentId: input.environmentId, source: input.source, frames, artifacts, observations, conditions, state, diff, completedAt: this.now().toISOString() }
  }

  getMemory(environmentId: string) {
    return this.memoryRepository.get(environmentId)
  }

  private async loadMemoryStore(environmentId: string): Promise<EnvironmentalMemoryStore> {
    const store = new EnvironmentalMemoryStore({ now: this.now })
    const existing = await this.memoryRepository.get(environmentId)
    if (existing) store.hydrate(existing)
    return store
  }

  private ensureEnvironment(memory: EnvironmentalMemoryStore, input: ScanInput) {
    if (memory.get(input.environmentId)) return
    const name = input.source.metadata?.name?.toString().trim() || 'SENTINEL Environment'
    const type = environmentTypeFromMetadata(input.source.metadata?.environmentType)
    memory.createEnvironment({
      id: input.environmentId,
      name,
      type,
      description: 'Environment created automatically by the scan pipeline.',
      createdAt: input.source.capturedAt,
      updatedAt: input.source.capturedAt,
      stateIds: [],
      roomIds: [],
      objectIds: [],
      issueIds: [],
    })
  }

  private async perceive(scanId: string, artifacts: ScanArtifact[], frames: ScanFrame[], input: ScanInput, priorObjects: SpatialObject[]): Promise<PerceptionResult> {
    if (!this.model) return { sourceId: input.source.id, observations: [], objects: [], conditions: [], relations: [], evidence: [] }

    const priorNamingContext = priorObjects.length
      ? priorObjects.slice(0, 24).map((item) => `${item.name} (${item.category})`).join(', ')
      : 'none'

    const scenePrompt = [
      `Analyze scan ${scanId} for environment ${input.environmentId}.`,
      `The scan source id is ${input.source.id}.`,
      `The trusted scan capturedAt is ${input.source.capturedAt}.`,
      `Previously remembered object naming context (NOT evidence): ${priorNamingContext}.`,
      'Reuse a remembered name only when the same physical object is directly visible now. Never infer presence from memory and never use prior memory as evidence.',
      'Perform a grounded scene inventory: direct observations, visible objects, supported environmental conditions, and spatial relationships.',
      'For every durable physical item named in a direct observation, emit a corresponding object entry when the item is visually identifiable.',
      'Prefer stable physical identity names over viewpoint-dependent phrases. In warehouses, distinguish pallet jacks/carts/trolleys from ramps: a pallet jack is wheeled material-handling equipment with fork arms and a handle; a ramp is a fixed or sloped walking/loading surface. Distinguish a portable fire extinguisher (cylinder/handle/hose) from a hydrant or standpipe. If uncertain, use a conservative generic equipment label instead of a wrong specific label.',
      'If an emergency/exit sign is directly visible, emit both a grounded observation and a signage object for it.',
      'Separate direct visual observations from condition interpretations.',
      'Reference only the exact supplied FRAME_ID values in evidenceIds. SENTINEL owns frame evidence records; do not manufacture replacement frame evidence IDs.',
      'Omit unsupported optional claims instead of guessing.',
      'Return the SENTINEL PerceptionResult JSON schema exactly.',
    ].join('\n')

    const scene = await this.inferPerceptionPass('scene', scenePrompt, artifacts, frames, input)
    if (hasOperationalConditionCandidate(scene)) return scene

    const sceneObjectSummary = scene.objects.length
      ? scene.objects.map((item) => `${item.name} (${item.category})`).join(', ')
      : 'none'
    const sceneConditionSummary = scene.conditions.length
      ? scene.conditions.map((item) => `${item.title} [${item.kind}]`).join(', ')
      : 'none'

    const auditPrompt = [
      `Condition audit for scan ${scanId} in environment ${input.environmentId}.`,
      `The scan source id is ${input.source.id}.`,
      `The trusted scan capturedAt is ${input.source.capturedAt}.`,
      `The scene inventory already identified these visible objects: ${sceneObjectSummary}.`,
      `The scene inventory reported these conditions: ${sceneConditionSummary}. Benign/normal conditions do not count as a completed facility-condition audit.`,
      `Previously remembered object naming context (NOT evidence): ${priorNamingContext}.`,
      'Inspect every supplied frame specifically for visually defensible environmental conditions that a facility or operations manager would care about.',
      'Re-check object identity independently instead of blindly copying the scene label. In warehouses, verify whether wheeled/forked material-handling equipment is a pallet jack/cart/trolley rather than a ramp, and whether a portable red cylinder is a fire extinguisher rather than a hydrant. If uncertain, use a conservative generic equipment label.',
      'When a visible movable object is directly in front of, across, blocking, or obstructing a door/exit, state that relative placement explicitly in the observation/object description. If an emergency/exit sign is visible, emit it as a signage object as well as an observation.',
      'Check walking paths, doors, exits, floors, desks, furniture, boxes/packages, cables, electrical items, equipment, and visible maintenance state.',
      'Pay special attention to newly introduced or misplaced objects and whether their placement narrows, blocks, or changes a normal circulation path.',
      'Examples of relevant visible conditions include a blocked or narrowed passage, furniture or a box obstructing a normal walkway, a loose cable on a walking surface, a spill/wet floor, visible physical damage, unstable or misplaced equipment, a blocked door/exit, or an obvious maintenance defect.',
      'Do NOT force a condition. Ordinary furniture arrangement or a box stored safely out of the walking path is not a hazard unless the visual evidence supports obstruction or another condition.',
      'Use basis="observed" only for the directly visible state. Use basis="inferred" and status="uncertain" when interpreting what the visible state may mean.',
      'Do not recommend actions and do not infer invisible causes or risks.',
      'Reference only the exact supplied FRAME_ID values in evidenceIds. SENTINEL owns frame evidence records.',
      'Return the full SENTINEL PerceptionResult JSON schema. It is acceptable for conditions to be empty if no operational condition is visually supported.',
    ].join('\n')

    try {
      console.warn('SENTINEL_CONDITION_AUDIT_STARTED', {
        scanId,
        reason: scene.conditions.length === 0 ? 'scene_pass_returned_zero_conditions' : 'scene_pass_has_only_benign_conditions',
        sceneConditions: scene.conditions.map((item) => ({ kind: item.kind, title: item.title })),
      })
      const audit = await this.inferPerceptionPass('condition-audit', auditPrompt, artifacts, frames, input)
      let merged = mergePerceptionPasses(scene, audit, 'audit_')
      console.warn('SENTINEL_CONDITION_AUDIT_COMPLETED', {
        scanId,
        auditConditions: audit.conditions.length,
        mergedConditions: merged.conditions.length,
        providerOperationalConditions: merged.conditions.filter((item) => OPERATIONAL_CONDITION_KINDS.has(item.kind)).length,
      })

      if (!hasOperationalConditionCandidate(merged) && shouldRunIdentityAudit(merged)) {
        const identityPrompt = [
          `Targeted physical-object identity verification for scan ${scanId} in environment ${input.environmentId}.`,
          `The scan source id is ${input.source.id}.`,
          `The trusted scan capturedAt is ${input.source.capturedAt}.`,
          'The earlier grounded passes found an emergency/exit context and an access-adjacent object whose taxonomy is ambiguous.',
          'Inspect the supplied frames again, focusing specifically on the physical object directly in front of/across/near the door or exit.',
          'Classify by visible morphology, not by the earlier label and not by filenames or metadata.',
          'For warehouse material-handling equipment: a pallet jack/trolley/cart is movable and normally has wheels/casters, fork arms/platform and/or a steering handle; a ramp is a sloped or bridging surface and does not have those handling features.',
          'Return a specific pallet jack/trolley/cart label only when those visible features support it. If the evidence really supports a ramp, keep ramp. If neither is clear, use conservative generic equipment/object wording.',
          'State the object-to-door placement explicitly when visible (for example in front of, across, blocking, or beside).',
          'If exit signage is visible, include a grounded exit-sign observation/object so the access role remains independently evidenced.',
          'Do not force a hazard or access condition. Emit an operational condition only if the visible evidence itself supports one.',
          'Reference only exact supplied FRAME_ID values in evidenceIds. Return the full SENTINEL PerceptionResult JSON schema.',
        ].join('\n')

        console.warn('SENTINEL_IDENTITY_AUDIT_STARTED', { scanId, reason: 'ambiguous_access_adjacent_object' })
        const identityAudit = await this.inferPerceptionPass('identity-audit', identityPrompt, artifacts, frames, input)
        merged = mergePerceptionPasses(merged, identityAudit, 'identity_')
        console.warn('SENTINEL_IDENTITY_AUDIT_COMPLETED', {
          scanId,
          objects: identityAudit.objects.map((item) => ({ name: item.name, category: item.category, confidence: item.confidence })),
          conditions: identityAudit.conditions.map((item) => ({ title: item.title, kind: item.kind, confidence: item.confidence })),
        })
      }

      return validatePerceptionForScan(merged, input.environmentId, input.source.id)
    } catch (error) {
      console.warn('SENTINEL_CONDITION_AUDIT_SKIPPED', {
        scanId,
        code: errorCode(error),
        message: error instanceof Error ? error.message : 'Unknown condition-audit failure',
      })
      return scene
    }
  }

  private async inferPerceptionPass(
    pass: 'scene' | 'condition-audit' | 'identity-audit',
    prompt: string,
    artifacts: ScanArtifact[],
    frames: ScanFrame[],
    input: ScanInput,
  ): Promise<PerceptionResult> {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_PERCEPTION_ATTEMPTS; attempt += 1) {
      try {
        const retryInstruction = attempt > 1
          ? 'STRICT RETRY: Return one complete JSON object only. Use canonical enum values, finite numeric confidences, arrays for reference fields, and reference only supplied FRAME_ID evidence. Omit unsupported optional claims instead of guessing.'
          : undefined
        const result = await this.model!.infer({
          role: 'perception',
          artifacts,
          prompt: [prompt, retryInstruction].filter((item): item is string => Boolean(item)).join('\n'),
        })

        const grounded = groundPerceptionToTrustedFrames(result, frames, input.source.id, input.source.capturedAt)
        if (
          grounded.remappedReferences > 0 ||
          grounded.addedEvidence > 0 ||
          grounded.droppedUnknownEvidenceReferences > 0 ||
          grounded.droppedUngroundedItems > 0 ||
          grounded.droppedDanglingRelations > 0
        ) {
          console.warn('SENTINEL_TRUSTED_FRAME_EVIDENCE_GROUNDED', {
            pass,
            attempt,
            remappedReferences: grounded.remappedReferences,
            addedEvidence: grounded.addedEvidence,
            droppedUnknownEvidenceReferences: grounded.droppedUnknownEvidenceReferences,
            droppedUngroundedItems: grounded.droppedUngroundedItems,
            droppedDanglingRelations: grounded.droppedDanglingRelations,
          })
        }

        return validatePerceptionForScan(grounded.result, input.environmentId, input.source.id)
      } catch (error) {
        lastError = error
        if (attempt >= MAX_PERCEPTION_ATTEMPTS || !isRetryablePerceptionOutputError(error)) throw error
        console.warn('SENTINEL_PERCEPTION_SCHEMA_RETRY', {
          pass,
          attempt,
          nextAttempt: attempt + 1,
          code: errorCode(error),
          message: error instanceof Error ? error.message : 'Unknown perception output error',
        })
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Perception failed without an error')
  }

  private validate(input: ScanInput) {
    if (!input.environmentId) throw this.error('INVALID_ENVIRONMENT', 'environmentId is required')
    if (!input.source?.id) throw this.error('INVALID_SOURCE', 'source.id is required')
    if (!input.media.uri) throw this.error('INVALID_MEDIA', 'media.uri is required')
    if (!input.media.mimeType) throw this.error('INVALID_MEDIA', 'media.mimeType is required')
    if (input.media.kind === 'image' && input.media.durationMs !== undefined) throw this.error('INVALID_MEDIA', 'image media cannot declare durationMs')
    if (input.media.kind === 'video' && !input.media.extractedFrames?.length) throw this.error('VIDEO_FRAMES_REQUIRED', 'Video media must provide extracted frames before perception')
  }

  private sample(input: ScanInput): ScanFrame[] {
    if (input.media.kind !== 'video' || !input.media.extractedFrames?.length) {
      return [{ frameId: this.id('frame'), timestampMs: 0, uri: input.media.uri }]
    }

    const available = input.media.extractedFrames
    const requestedMax = Math.max(1, input.options?.maxFrames ?? available.length)
    const max = Math.min(requestedMax, MAX_PERCEPTION_IMAGE_FRAMES)
    const eligible = available.slice(0, requestedMax)

    if (eligible.length <= max) return eligible
    if (max === 1) return [eligible[0]]

    // Nebius currently accepts at most 10 images in one multimodal prompt.
    // Preserve the whole walkthrough by evenly sampling across the selected
    // browser evidence instead of simply truncating the final frames.
    const chosenIndexes = new Set<number>()
    for (let index = 0; index < max; index += 1) {
      chosenIndexes.add(Math.round(index * (eligible.length - 1) / (max - 1)))
    }

    return [...chosenIndexes].sort((a, b) => a - b).map((index) => eligible[index])
  }

  private createArtifacts(frames: ScanFrame[], input: ScanInput): ScanArtifact[] {
    const artifacts: ScanArtifact[] = frames.map((frame) => ({
      artifactId: this.id('artifact'),
      frameId: frame.frameId,
      kind: 'frame',
      uri: frame.uri,
    }))
    if (input.options?.preserveAudio && input.media.kind === 'video') {
      artifacts.push({ artifactId: this.id('artifact'), kind: 'audio', uri: input.media.uri })
    }
    artifacts.push({ artifactId: this.id('artifact'), kind: 'metadata', uri: input.media.uri })
    return artifacts
  }

  private emit(scanId: string, stage: ScanProgress['stage'], progress: number, message: string) {
    this.onProgress?.({ scanId, stage, progress, message })
  }

  private error(code: string, message: string): ScanError {
    return Object.assign(new Error(message), { code, recoverable: false })
  }
}

function hasOperationalConditionCandidate(result: PerceptionResult): boolean {
  return result.conditions.some((item) => OPERATIONAL_CONDITION_KINDS.has(item.kind))
}

function shouldRunIdentityAudit(result: PerceptionResult): boolean {
  const hasExitContext = [...result.observations, ...result.objects].some((item) => {
    const text = 'label' in item
      ? `${item.label} ${item.description}`
      : `${item.name} ${item.description ?? ''}`
    return /\b(?:emergency\s+)?exit\b/i.test(text) && /\b(?:sign|door)\b/i.test(text)
  })
  if (!hasExitContext) return false

  return result.objects.some((item) => {
    const text = `${item.name} ${item.description ?? ''}`
    const ambiguousTaxonomy = /\b(?:ramp|equipment|object|device|cart|trolley|pallet(?:\s+jack)?)\b/i.test(text)
    const accessPlacement = /\b(?:in front of|directly in front of|across|blocking|obstructing|near)\b.{0,48}\b(?:door|exit)\b/i.test(text)
    return ambiguousTaxonomy && accessPlacement
  })
}

function mergePerceptionPasses(scene: PerceptionResult, audit: PerceptionResult, prefix = 'audit_'): PerceptionResult {
  const objectIdMap = new Map(audit.objects.map((item) => [item.id, `${prefix}${item.id}`]))
  const prefixId = (id: string) => `${prefix}${id}`
  const mapObjectId = (id: string) => objectIdMap.get(id) ?? id

  const auditObservations = audit.observations.map((item) => ({ ...item, id: prefixId(item.id) }))
  const auditObjects = audit.objects.map((item) => ({ ...item, id: mapObjectId(item.id) }))
  const auditConditions = audit.conditions.map((item) => ({
    ...item,
    id: prefixId(item.id),
    objectIds: item.objectIds.map(mapObjectId),
  }))
  const auditRelations = audit.relations.map((item) => ({
    ...item,
    id: prefixId(item.id),
    fromId: mapObjectId(item.fromId),
    toId: mapObjectId(item.toId),
  }))

  return {
    sourceId: scene.sourceId,
    observations: uniqueById([...scene.observations, ...auditObservations]),
    objects: uniqueById([...scene.objects, ...auditObjects]),
    conditions: uniqueById([...scene.conditions, ...auditConditions]),
    relations: uniqueById([...scene.relations, ...auditRelations]),
    evidence: uniqueById([...scene.evidence, ...audit.evidence]),
  }
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value.id)) return false
    seen.add(value.id)
    return true
  })
}

function isRetryablePerceptionOutputError(error: unknown): boolean {
  if (error instanceof PerceptionValidationError) return true
  if (!(error instanceof ModelAdapterError)) return false
  return error.code === 'INVALID_MODEL_JSON' || error.code === 'INVALID_PERCEPTION_SCHEMA' || error.code === 'EMPTY_MODEL_RESPONSE'
}

function errorCode(error: unknown): string {
  if (error instanceof ModelAdapterError) return error.code
  if (error instanceof PerceptionValidationError) return error.code
  return 'PERCEPTION_OUTPUT_ERROR'
}

function environmentTypeFromMetadata(value: unknown): EnvironmentType {
  if (typeof value !== 'string') return 'other'
  return ENVIRONMENT_TYPES.has(value as EnvironmentType) ? value as EnvironmentType : 'other'
}
