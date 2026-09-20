import type { ConditionKind, EnvironmentType, PerceptionResult, SpatialObject, VerifiedTemporalChange, ScanSource, EnvironmentalStateSnapshot } from '../domain/sentinel.js'
import { PerceptionValidationError, validatePerceptionForScan } from '../ai/perception-schema.js'
import { groundPerceptionToTrustedFrames } from '../ai/trusted-evidence.js'
import { ModelAdapterError, type ModelAdapter, type TemporalVerificationCandidate } from '../ai/model.js'
import { EnvironmentalMemoryStore } from '../memory/store.js'
import { matchObjectsConservatively } from '../memory/object-identity.js'
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
    const expectedCurrentStateId = memory.get(input.environmentId)?.environment.currentStateId

    const frames = this.sample(input)
    this.emit(scanId, 'sampling', 35, `${frames.length} key frame(s) selected`)
    const artifacts = this.createArtifacts(frames, input)
    this.emit(scanId, 'extracting', 55, `${artifacts.filter((artifact) => artifact.kind === 'frame').length} frame artifact(s) prepared`)

    const existingMemory = memory.get(input.environmentId)
    const priorSnapshot = existingMemory?.environment.currentStateId
      ? existingMemory.snapshots.find((item) => item.stateId === existingMemory.environment.currentStateId)
      : undefined
    const priorObjects = priorSnapshot?.objects ?? []
    const priorState = priorSnapshot ? existingMemory?.states.find((item) => item.id === priorSnapshot.stateId) : undefined
    const priorImageSource = priorState
      ? existingMemory?.sources.find((source) => priorState.sourceIds.includes(source.id) && source.modality === 'image')
      : undefined

    const perceived = await this.perceive(scanId, artifacts, frames, input, priorObjects)
    const completed = materializeExplicitGroundedObjects(perceived, input.source.capturedAt)
    if (completed.materialized.length > 0) {
      console.warn('SENTINEL_GROUNDED_OBJECT_COMPLETION', {
        scanId,
        objects: completed.materialized.map((item) => ({
          name: item.name,
          category: item.category,
          confidence: item.confidence,
          evidenceIds: item.evidenceIds,
        })),
      })
    }
    const derived = deriveOperationalConditions(completed.result, input.source.capturedAt)
    let perception = validatePerceptionForScan(derived.result, input.environmentId, input.source.id)
    let verifiedTemporalChanges: VerifiedTemporalChange[] = []
    if (input.media.kind === 'image' && priorSnapshot && priorImageSource && this.model?.verifyTemporal) {
      const temporal = await this.verifyTemporalPhotoChanges(
        scanId,
        input,
        artifacts,
        priorSnapshot,
        priorImageSource,
        perception,
      )
      perception = temporal.perception
      verifiedTemporalChanges = temporal.verified
    }
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
      if (verifiedTemporalChanges.length > 0) {
        diff = memory.applyVerifiedTemporalChanges(
          input.environmentId,
          previous.id,
          state.id,
          verifiedTemporalChanges,
        )
      }
    }

    const updatedMemory = memory.get(input.environmentId)
    if (!updatedMemory) throw new Error('Environmental memory was not created')
    if (this.memoryRepository.saveIfCurrent) {
      const saved = await this.memoryRepository.saveIfCurrent(updatedMemory, expectedCurrentStateId)
      if (!saved) throw new Error('Environmental memory changed while this observation was processing. No stale state was written; retry the observation against the latest memory.')
    } else {
      await this.memoryRepository.save(updatedMemory)
    }

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

  private async verifyTemporalPhotoChanges(
    scanId: string,
    input: ScanInput,
    currentArtifacts: ScanArtifact[],
    priorSnapshot: EnvironmentalStateSnapshot,
    priorSource: ScanSource,
    perception: PerceptionResult,
  ): Promise<{ perception: PerceptionResult; verified: VerifiedTemporalChange[] }> {
    if (!this.model?.verifyTemporal) return { perception, verified: [] }

    const previousNameCounts = countObjectNames(priorSnapshot.objects)
    const currentNameCounts = countObjectNames(perception.objects)
    const candidates: TemporalVerificationCandidate[] = []
    const candidateByKey = new Map<string, { previous: SpatialObject; current: SpatialObject }>()
    const pairedCurrent = new Set<number>()

    // Temporal verification deliberately does NOT require stable position wording:
    // movement is one of the things this pass exists to verify. Unique exact names
    // are safe candidates even when the independent scene descriptions disagree.
    for (const [currentIndex, current] of perception.objects.entries()) {
      if (!temporalCandidateAllowed(current)) continue
      const nameKey = normalizeTemporalName(current.name)
      if ((currentNameCounts.get(nameKey) ?? 0) !== 1 || (previousNameCounts.get(nameKey) ?? 0) !== 1) continue
      const previousIndex = priorSnapshot.objects.findIndex((item) => normalizeTemporalName(item.name) === nameKey)
      if (previousIndex < 0) continue
      const previous = priorSnapshot.objects[previousIndex]
      const key = `candidate_${candidates.length}`
      candidates.push({ key, previousObjectName: previous.name, currentObjectName: current.name, category: current.category })
      candidateByKey.set(key, { previous, current })
      pairedCurrent.add(currentIndex)
      if (candidates.length >= 16) break
    }

    // Conservative semantic matching can add alias pairs such as a stable named
    // door variant, but it never overrides the unique exact-name candidates.
    if (candidates.length < 16) {
      const matches = matchObjectsConservatively(priorSnapshot.objects, perception.objects)
      for (const [currentIndex, previousIndex] of matches.entries()) {
        if (pairedCurrent.has(currentIndex)) continue
        const previous = priorSnapshot.objects[previousIndex]
        const current = perception.objects[currentIndex]
        if (!temporalCandidateAllowed(current)) continue
        if ((previousNameCounts.get(normalizeTemporalName(previous.name)) ?? 0) !== 1) continue
        if ((currentNameCounts.get(normalizeTemporalName(current.name)) ?? 0) !== 1) continue
        const key = `candidate_${candidates.length}`
        candidates.push({ key, previousObjectName: previous.name, currentObjectName: current.name, category: current.category })
        candidateByKey.set(key, { previous, current })
        if (candidates.length >= 16) break
      }
    }

    const currentFrame = currentArtifacts.find((artifact) => artifact.kind === 'frame')
    if (!currentFrame || candidates.length === 0) return { perception, verified: [] }

    const previousArtifact: ScanArtifact = {
      artifactId: `temporal_previous_${priorSource.id}`,
      frameId: `previous_${priorSource.id}`,
      kind: 'frame',
      uri: priorSource.uri,
    }

    try {
      const result = await this.model.verifyTemporal({
        environmentId: input.environmentId,
        previousSourceId: priorSource.id,
        currentSourceId: input.source.id,
        artifacts: [previousArtifact, currentFrame],
        candidates,
      })

      const verified = result.changes.flatMap((change): VerifiedTemporalChange[] => {
        if (change.confidence < 0.9) return []
        const pair = candidateByKey.get(change.candidateKey)
        if (!pair) return []

        if (change.kind === 'state_change') {
          if (!change.previousState || !change.currentState || change.previousState === change.currentState) return []
          return [{
            kind: 'state_change',
            previousObjectName: pair.previous.name,
            currentObjectName: pair.current.name,
            previousState: change.previousState,
            currentState: change.currentState,
            confidence: change.confidence,
          }]
        }

        return [{
          kind: 'moved',
          previousObjectName: pair.previous.name,
          currentObjectName: pair.current.name,
          confidence: change.confidence,
        }]
      })

      if (verified.length === 0) return { perception, verified: [] }

      const stateUpdates = new Map(
        verified
          .filter((change) => change.kind === 'state_change' && change.currentState)
          .map((change) => [normalizeTemporalName(change.currentObjectName), change.currentState!]),
      )
      const refined = {
        ...perception,
        objects: perception.objects.map((item) => {
          const state = stateUpdates.get(normalizeTemporalName(item.name))
          return state ? { ...item, state } : item
        }),
      }

      console.warn('SENTINEL_TEMPORAL_VERIFICATION_COMPLETED', {
        scanId,
        candidates: candidates.length,
        verified,
      })
      return { perception: refined, verified }
    } catch (error) {
      console.warn('SENTINEL_TEMPORAL_VERIFICATION_SKIPPED', {
        scanId,
        code: errorCode(error),
        message: error instanceof Error ? error.message : 'Unknown temporal verification failure',
      })
      return { perception, verified: [] }
    }
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
      ...(input.media.kind === 'image' ? [
        'This source is ONE still photo. Emit each visually distinguishable physical object once. Never repeat the same object many times just because it is salient.',
        'If multiple objects share the same name, keep separate entries only when the image gives a distinct visible position, bounding box, or relationship for each instance. If instance multiplicity is not visually distinguishable, prefer one conservative representative.',
        'For EVERY visible door, cabinet door, drawer, gate, and similar openable object, inspect its geometry specifically for open versus closed. When directly visually obvious, object.state MUST be exactly "open" or "closed". An angled door leaf, visible doorway/interior beyond the leaf, or visibly separated door plane supports "open"; a leaf flush in its frame supports "closed". Omit state only when genuinely occluded or ambiguous.',
        'Use stable object nouns. Treat "plant pot" and "potted plant" as the same physical-object concept when they describe the same grounded plant at the same location; do not emit both aliases for one plant.',
        'Represent physical objects at the operationally useful whole-object level. A cabinet/cupboard/closet should not also be emitted as cabinet door 1/2, left/right door, top/bottom panel, handle, hinge, or other component unless that component itself has a distinct observed condition that matters.',
        'Do not emit the same bag, chair, appliance, door, or other movable object twice under duplicate or near-synonym labels. One visible physical instance should have one object entry.',
      ] : []),
      'Treat all supplied frames as one walkthrough of the same environment. Repeated sightings of the same physical entity across frames should resolve to one object, not one object per frame.',
      'Do not emit the overall scene/environment itself (for example "warehouse" or "office") as a SpatialObject. A room/area object requires a distinct bounded physical-space identity.',
      'For every durable physical item named in a direct observation, emit a corresponding object entry when the item is visually identifiable.',
      'Prefer stable physical identity names over viewpoint-dependent phrases. In warehouses, distinguish pallet jacks/carts/trolleys from ramps: a pallet jack is wheeled material-handling equipment with fork arms and a handle; a ramp is a fixed or sloped walking/loading surface. Distinguish a portable fire extinguisher (cylinder/handle/hose) from a hydrant or standpipe. If uncertain, use a conservative generic equipment label instead of a wrong specific label.',
      'If an emergency/exit sign is directly visible, emit both a grounded observation and a signage object for it.',
      'Separate direct visual observations from condition interpretations.',
      'Reference only the exact supplied FRAME_ID values in evidenceIds. SENTINEL owns frame evidence records; do not manufacture replacement frame evidence IDs.',
      'Omit unsupported optional claims instead of guessing.',
      'Return the SENTINEL PerceptionResult JSON schema exactly.',
    ].join('\n')

    let scene = await this.inferPerceptionPass('scene', scenePrompt, artifacts, frames, input)

    // Still-photo state audit: open/closed is operationally important but the broad
    // scene pass can omit it. Re-inspect only visible openable objects whose state
    // is missing; this pass may confirm state but must not invent unseen objects.
    if (input.media.kind === 'image' && priorObjects.length === 0 && shouldRunOpenableStateAudit(scene)) {
      const candidates = scene.objects
        .filter(isOpenableObject)
        .filter((item) => !hasExplicitOpenClosedState(item))
        .map((item) => `${item.name} (${item.category})`)
        .join(', ')
      const statePrompt = [
        `Targeted openable-object state verification for scan ${scanId} in environment ${input.environmentId}.`,
        `The scan source id is ${input.source.id}.`,
        `Visible openable candidates with missing state: ${candidates}.`,
        'Inspect the supplied still image only. For each named candidate that is directly visible, determine whether it is open or closed from visible geometry.',
        'Use object.state exactly "open" or "closed" only when visually defensible. An angled leaf, visible opening/interior, or separated door plane supports open; a leaf flush in its frame supports closed.',
        'Do not infer from prior memory, filenames, metadata, expected room layout, or the earlier model wording. If ambiguous or occluded, omit state.',
        'Do not split one cabinet/door into numbered, left/right, top/bottom, panel, handle, or hinge pseudo-objects. Return the whole visible openable object using the stable scene name.',
        'Do not create conditions, issues, or recommendations in this audit. Reference only exact supplied FRAME_ID values in evidenceIds.',
        'Return the full SENTINEL PerceptionResult JSON schema.',
      ].join('\n')
      try {
        const stateAudit = sanitizeStateAudit(await this.inferPerceptionPass('state-audit', statePrompt, artifacts, frames, input))
        const stateUpdate = applyOpenableStateAudit(scene, stateAudit)
        scene = stateUpdate.scene

        console.warn('SENTINEL_OPENABLE_STATE_AUDIT_COMPLETED', {
          scanId,
          objects: stateUpdate.accepted.map((item) => ({ name: item.name, state: item.state, confidence: item.confidence })),
          unresolved: scene.objects
            .filter(isOpenableObject)
            .filter((item) => !hasExplicitOpenClosedState(item))
            .map((item) => item.name),
        })
      } catch (error) {
        console.warn('SENTINEL_OPENABLE_STATE_AUDIT_SKIPPED', {
          scanId,
          code: errorCode(error),
          message: error instanceof Error ? error.message : 'Unknown openable-state audit failure',
        })
      }
    }

    if (hasOperationalConditionCandidate(scene)) return scene
    if (input.media.kind === 'image' && !shouldRunStillImageConditionAudit(scene)) return scene

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
      'Do not enumerate negative findings. Never emit observations such as "no visible damage", "no visible obstruction", "no visible hazard", "area is clear", or statements about rooms/areas that are not directly visible. If there is no concrete operational condition, return conditions=[] and do not add audit observations.',
      'Return the full SENTINEL PerceptionResult JSON schema. It is acceptable for conditions to be empty if no operational condition is visually supported.',
    ].join('\n')

    try {
      console.warn('SENTINEL_CONDITION_AUDIT_STARTED', {
        scanId,
        reason: scene.conditions.length === 0 ? 'scene_pass_returned_zero_conditions' : 'scene_pass_has_only_benign_conditions',
        sceneConditions: scene.conditions.map((item) => ({ kind: item.kind, title: item.title })),
      })
      const audit = pruneNegativeAuditObservations(await this.inferPerceptionPass('condition-audit', auditPrompt, artifacts, frames, input))
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
        try {
          const identityAudit = await this.inferPerceptionPass('identity-audit', identityPrompt, artifacts, frames, input)
          merged = mergePerceptionPasses(merged, identityAudit, 'identity_')
          console.warn('SENTINEL_IDENTITY_AUDIT_COMPLETED', {
            scanId,
            objects: identityAudit.objects.map((item) => ({ name: item.name, category: item.category, confidence: item.confidence })),
            conditions: identityAudit.conditions.map((item) => ({ title: item.title, kind: item.kind, confidence: item.confidence })),
          })
        } catch (error) {
          console.warn('SENTINEL_IDENTITY_AUDIT_SKIPPED', {
            scanId,
            code: errorCode(error),
            message: error instanceof Error ? error.message : 'Unknown identity-audit failure',
          })
        }
      }

      if (!hasOperationalConditionCandidate(merged) && shouldRunAccessGeometryAudit(merged)) {
        const geometryCandidates = materialHandlingCandidates(merged)
          .map((item) => `${item.name} (${item.category})`)
          .join(', ')
        const geometryDoors = merged.objects
          .filter((item) => item.category === 'door')
          .map((item) => item.name)
          .join(', ')

        const geometryPrompt = [
          `Targeted access-geometry verification for scan ${scanId} in environment ${input.environmentId}.`,
          `The scan source id is ${input.source.id}.`,
          `The trusted scan capturedAt is ${input.source.capturedAt}.`,
          `Visible material-handling/obstruction candidates: ${geometryCandidates || 'none'}.`,
          `Visible door candidates: ${geometryDoors || 'none'}.`,
          'Inspect the supplied frames only to verify the physical relationship between the named current-scan candidate object(s) and the visible door/exit.',
          'If a candidate is directly in front of the door, emit an explicit relation with type="in_front_of", fromId=candidate object id, toId=door object id, plus grounded evidenceIds. The direction must be obstacle -> door.',
          'Also state the placement explicitly in a direct observation when visually supported.',
          'Near, beside, left/right, or sharing the center of the image is NOT sufficient evidence of obstruction and must not be converted to in_front_of.',
          'If exit signage is visible, include the exit-sign observation/object so emergency-exit identity remains independently grounded.',
          'Do not infer from filenames, metadata, prior memory, or the earlier model wording. Use only visible frame evidence.',
          'Do not force a relation or operational condition when geometry is unclear.',
          'Reference only exact supplied FRAME_ID values in evidenceIds. Return the full SENTINEL PerceptionResult JSON schema.',
        ].join('\n')

        console.warn('SENTINEL_ACCESS_GEOMETRY_AUDIT_STARTED', {
          scanId,
          reason: 'material_handling_object_and_exit_without_explicit_placement',
          candidates: geometryCandidates,
        })
        try {
          const geometryAudit = await this.inferPerceptionPass('access-geometry-audit', geometryPrompt, artifacts, frames, input)
          merged = mergePerceptionPasses(merged, geometryAudit, 'geometry_')
          console.warn('SENTINEL_ACCESS_GEOMETRY_AUDIT_COMPLETED', {
            scanId,
            relations: geometryAudit.relations.map((item) => ({
              type: item.type,
              fromId: item.fromId,
              toId: item.toId,
              confidence: item.confidence,
            })),
            observations: geometryAudit.observations.map((item) => ({
              label: item.label,
              description: item.description,
              confidence: item.confidence,
            })),
          })
        } catch (error) {
          console.warn('SENTINEL_ACCESS_GEOMETRY_AUDIT_SKIPPED', {
            scanId,
            code: errorCode(error),
            message: error instanceof Error ? error.message : 'Unknown access-geometry-audit failure',
          })
        }
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
    pass: 'scene' | 'state-audit' | 'condition-audit' | 'identity-audit' | 'access-geometry-audit',
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

function applyOpenableStateAudit(
  scene: PerceptionResult,
  audit: PerceptionResult,
): { scene: PerceptionResult; accepted: SpatialObject[] } {
  const sceneOpenables = scene.objects.filter(isOpenableObject)
  const accepted: SpatialObject[] = []
  const updates = new Map<string, SpatialObject>()

  for (const target of sceneOpenables) {
    const matches = audit.objects
      .filter(hasExplicitOpenClosedState)
      .filter((candidate) => stateAuditObjectMatchesTarget(candidate, target))

    if (matches.length === 0) continue

    const states = new Set(matches.map((item) => normalizeSemanticText(item.state ?? '')))
    if (states.size !== 1) continue

    const chosen = [...matches].sort((a, b) => b.confidence - a.confidence)[0]
    updates.set(target.id, chosen)
    accepted.push(chosen)
  }

  if (updates.size === 0) return { scene, accepted }

  return {
    scene: {
      ...scene,
      objects: scene.objects.map((item) => {
        const update = updates.get(item.id)
        if (!update) return item
        return {
          ...item,
          state: normalizeSemanticText(update.state ?? ''),
          confidence: Math.max(item.confidence, update.confidence),
          evidenceIds: [...new Set([...item.evidenceIds, ...update.evidenceIds])],
        }
      }),
    },
    accepted,
  }
}

function stateAuditObjectMatchesTarget(candidate: SpatialObject, target: SpatialObject): boolean {
  if (!isOpenableObject(candidate) || !isOpenableObject(target)) return false

  const candidateName = stableAuditObjectName(candidate.name)
  const targetName = stableAuditObjectName(target.name)
  if (!candidateName || !targetName) return false
  if (candidateName === targetName) return true

  const partWords = /\b(?:handle|hinge|frame|leaf|threshold|sill|hardware|panel|knob|latch)\b/
  if (partWords.test(candidateName)) return false

  const kind = (value: string) => value.match(/\b(?:closet|cabinet|cupboard|drawer|gate|door)\b/)?.[0]
  const candidateKind = kind(candidateName)
  const targetKind = kind(targetName)
  if (!candidateKind || !targetKind || candidateKind !== targetKind) return false

  return candidateName.includes(targetName) || targetName.includes(candidateName)
}

function stableAuditObjectName(value: string): string {
  return normalizeSemanticText(value.replace(/\([^)]*\)/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeStateAudit(result: PerceptionResult): PerceptionResult {
  return {
    ...result,
    observations: [],
    conditions: [],
    relations: [],
  }
}

function pruneNegativeAuditObservations(result: PerceptionResult): PerceptionResult {
  // Condition-audit conditions already carry grounded evidence. Audit prose is
  // intentionally not persisted: it is a common source of repetitive "normal"
  // inventory narration and does not add operational truth.
  return { ...result, observations: [] }
}

function normalizeTemporalName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function countObjectNames(objects: SpatialObject[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of objects) {
    const key = normalizeTemporalName(item.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function temporalCandidateAllowed(item: SpatialObject): boolean {
  if (isOpenableObject(item)) return true
  if (!new Set(['furniture', 'equipment', 'obstruction']).has(item.category)) return false
  const name = normalizeTemporalName(item.name)
  return !/^(?:desk|bookshelf|shelf|rug|carpet|lamp|table lamp|picture|picture frame|books|globe|plant|potted plant|wicker basket|basket|cup|mouse|computer mouse|laptop)$/.test(name)
}

function isOpenableObject(item: SpatialObject): boolean {
  const name = normalizeSemanticText(item.name)
  const text = normalizeSemanticText(`${item.name} ${item.description ?? ''}`)
  // Reject hardware only when the OBJECT itself is a part. A real door may
  // naturally mention its handle/hinges in the description.
  if (/\b(?:handle|hinge|frame|threshold|sill|hardware|panel|knob|latch)\b/.test(name)) return false
  return item.category === 'door' || /\b(?:door|cabinet|drawer|gate|cupboard|closet)\b/.test(text)
}

function hasExplicitOpenClosedState(item: SpatialObject): boolean {
  const state = normalizeSemanticText(item.state ?? '')
  return state === 'open' || state === 'closed'
}

function shouldRunOpenableStateAudit(result: PerceptionResult): boolean {
  return result.objects.some((item) => isOpenableObject(item) && !hasExplicitOpenClosedState(item))
}

function shouldRunStillImageConditionAudit(result: PerceptionResult): boolean {
  const text = normalizeSemanticText([
    ...result.observations.flatMap((item) => [item.label, item.description]),
    ...result.objects.flatMap((item) => [item.name, item.description ?? '', item.position?.description ?? '']),
    ...result.conditions.flatMap((item) => [item.title, item.description]),
  ].join(' '))

  return /\b(?:emergency exit|exit sign|blocked|blocking|obstruction|obstructed|walkway|access route|spill|leak|smoke|fire|broken|cracked|damaged|damage|loose cable|exposed wire|unstable|fallen|pallet jack|trolley|cart in front|box in doorway|across walkway)\b/.test(text)
}

function hasOperationalConditionCandidate(result: PerceptionResult): boolean {
  return result.conditions.some((item) => OPERATIONAL_CONDITION_KINDS.has(item.kind))
}

function materializeExplicitGroundedObjects(
  result: PerceptionResult,
  capturedAt: string,
): { result: PerceptionResult; materialized: SpatialObject[] } {
  const hasDurableExitSign = result.objects.some((item) => {
    const name = normalizeSemanticText(item.name)
    const description = normalizeSemanticText(item.description ?? '')
    const explicitInName = /\b(?:emergency\s+)?exit\s+(?:sign|symbol)\b/.test(name)
    const explicitSignageObject = item.category === 'signage' &&
      /\b(?:emergency\s+)?exit\b/.test(`${name} ${description}`) &&
      /\b(?:sign|symbol)\b/.test(`${name} ${description}`)
    return explicitInName || explicitSignageObject
  })
  if (hasDurableExitSign) return { result, materialized: [] }

  const groundedMentions = [
    ...result.observations.map((item) => ({
      text: `${item.label} ${item.description}`,
      confidence: item.confidence,
      evidenceIds: item.evidenceIds,
    })),
    ...result.objects.map((item) => ({
      text: `${item.name} ${item.description ?? ''}`,
      confidence: item.confidence,
      evidenceIds: item.evidenceIds,
    })),
  ].filter((item) =>
    /\b(?:emergency\s+)?exit\s+(?:sign|symbol)\b/i.test(item.text) &&
    item.evidenceIds.length > 0,
  )

  if (groundedMentions.length === 0) return { result, materialized: [] }

  const evidenceIds = [...new Set(groundedMentions.flatMap((item) => item.evidenceIds))]
  const confidence = Math.min(...groundedMentions.map((item) => item.confidence))
  const explicitlyEmergency = groundedMentions.some((item) => /\bemergency\s+exit\s+(?:sign|symbol)\b/i.test(item.text))
  const object: SpatialObject = {
    id: 'sentinel_materialized_exit_sign',
    environmentId: result.objects[0]?.environmentId ?? result.observations[0]?.environmentId ?? '',
    category: 'signage',
    name: explicitlyEmergency ? 'emergency exit sign' : 'exit sign',
    description: 'Exit signage explicitly referenced by grounded visual evidence.',
    confidence,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    evidenceIds,
  }

  return {
    result: { ...result, objects: [...result.objects, object] },
    materialized: [object],
  }
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

function shouldRunAccessGeometryAudit(result: PerceptionResult): boolean {
  if (!hasIndependentExitContext(result)) return false

  const doors = result.objects.filter((item) => item.category === 'door')
  if (doors.length === 0) return false

  return materialHandlingCandidates(result).some((candidate) =>
    !hasExplicitPlacementForCandidate(result, candidate, doors),
  )
}

function hasIndependentExitContext(result: PerceptionResult): boolean {
  return [...result.observations, ...result.objects].some((item) => {
    const text = 'label' in item
      ? `${item.label} ${item.description}`
      : `${item.name} ${item.description ?? ''}`
    return /\b(?:emergency\s+)?exit\b/i.test(text) && /\b(?:sign|symbol)\b/i.test(text)
  })
}

function materialHandlingCandidates(result: PerceptionResult): SpatialObject[] {
  return result.objects.filter((item) => {
    if (item.category === 'obstruction') return true
    const text = `${item.name} ${item.description ?? ''}`
    return /\b(?:pallet\s+jack|trolley|cart|forklift|material[-\s]+handling\s+equipment)\b/i.test(text)
  })
}

function hasExplicitPlacementForCandidate(
  result: PerceptionResult,
  candidate: SpatialObject,
  doors: SpatialObject[],
): boolean {
  if (result.relations.some((item) =>
    item.type === 'in_front_of' &&
    item.fromId === candidate.id &&
    doors.some((door) => door.id === item.toId) &&
    item.evidenceIds.length > 0,
  )) return true

  const candidateName = normalizeSemanticText(candidate.name)
  const texts = [...result.observations, ...result.objects].map((item) =>
    normalizeSemanticText('label' in item ? `${item.label} ${item.description}` : `${item.name} ${item.description ?? ''}`),
  )

  return texts.some((text) =>
    text.includes(candidateName) &&
    /\b(?:in front of|directly in front of|across|blocking|obstructing)\b.{0,48}\b(?:door|exit)\b/.test(text),
  )
}

function normalizeSemanticText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
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
