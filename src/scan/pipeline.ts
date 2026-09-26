import type { ConditionKind, EnvironmentType, PerceptionResult, SpatialObject, VerifiedTemporalChange, ScanSource, EnvironmentalStateSnapshot } from '../domain/sentinel.js'
import { PerceptionValidationError, validatePerceptionForScan } from '../ai/perception-schema.js'
import { groundPerceptionToTrustedFrames } from '../ai/trusted-evidence.js'
import { ModelAdapterError, type ModelAdapter, type TemporalVerificationCandidate } from '../ai/model.js'
import { EnvironmentalMemoryStore } from '../memory/store.js'
import { matchObjectsConservatively } from '../memory/object-identity.js'
import { InMemoryEnvironmentalMemoryRepository, type EnvironmentalMemoryRepository } from '../memory/repository.js'
import { deriveOperationalConditions } from '../perception/condition-derivation.js'
import { resolvePersonGrounding } from '../perception/person-grounding.js'
import { isPersonObject, isUnconfirmedPersonObject } from '../domain/object-policy.js'
import type { ScanArtifact, ScanError, ScanFrame, ScanInput, ScanProgress, ScanResult } from './types.js'

export interface ScanPipelineDependencies {
  now?: () => Date
  nowMs?: () => number
  deadlineAtMs?: number
  id?: (prefix: string) => string
  onProgress?: (progress: ScanProgress) => void
  model?: ModelAdapter
  memoryRepository?: EnvironmentalMemoryRepository
}

const defaultId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const MAX_PERCEPTION_IMAGE_FRAMES = 10
const MAX_PERCEPTION_ATTEMPTS = 2
const OPTIONAL_AUDIT_TIMEOUT_MS = 25_000
const TEMPORAL_VERIFICATION_TIMEOUT_MS = 40_000
const PERSISTENCE_RESERVE_MS = 15_000
const ENVIRONMENT_TYPES = new Set<EnvironmentType>(['office', 'school', 'hotel', 'clinic', 'retail', 'home', 'warehouse', 'construction', 'other'])
const OPERATIONAL_CONDITION_KINDS = new Set<ConditionKind>(['attention', 'hazard', 'damage', 'maintenance', 'access', 'compliance'])

export class ScanPipeline {
  private readonly now: () => Date
  private readonly nowMs: () => number
  private readonly deadlineAtMs?: number
  private readonly id: (prefix: string) => string
  private readonly onProgress?: (progress: ScanProgress) => void
  private readonly model?: ModelAdapter
  private readonly memoryRepository: EnvironmentalMemoryRepository
  private recoveredSceneProviderFailure = false

  constructor(deps: ScanPipelineDependencies = {}) {
    this.now = deps.now ?? (() => new Date())
    this.nowMs = deps.nowMs ?? (() => Date.now())
    this.deadlineAtMs = deps.deadlineAtMs
    this.id = deps.id ?? defaultId
    this.onProgress = deps.onProgress
    this.model = deps.model
    this.memoryRepository = deps.memoryRepository ?? new InMemoryEnvironmentalMemoryRepository()
  }

  async run(input: ScanInput): Promise<ScanResult> {
    this.recoveredSceneProviderFailure = false
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
    const priorObjects = (priorSnapshot?.objects ?? []).filter((item) => !isUnconfirmedPersonObject(item))
    const priorState = priorSnapshot ? existingMemory?.states.find((item) => item.id === priorSnapshot.stateId) : undefined
    const priorImageSource = priorState
      ? existingMemory?.sources.find((source) => priorState.sourceIds.includes(source.id) && source.modality === 'image')
      : undefined

    const reserveAfterPerceptionMs = input.media.kind === 'image' && priorSnapshot && priorImageSource && this.model?.verifyTemporal
      ? TEMPORAL_VERIFICATION_TIMEOUT_MS + PERSISTENCE_RESERVE_MS
      : PERSISTENCE_RESERVE_MS
    const perceived = await this.perceive(scanId, artifacts, frames, input, priorObjects, reserveAfterPerceptionMs)
    const personGrounded = await this.confirmPersonCandidates(
      scanId,
      perceived,
      artifacts,
      frames,
      input,
      reserveAfterPerceptionMs,
    )
    const observationRecovered = materializeDirectlyObservedRememberedObjects(
      personGrounded,
      priorObjects,
      input.source.capturedAt,
    )
    if (observationRecovered.materialized.length > 0) {
      console.warn('SENTINEL_OBSERVED_OBJECT_RECOVERY', {
        scanId,
        objects: observationRecovered.materialized.map((item) => ({
          name: item.name,
          category: item.category,
          confidence: item.confidence,
          evidenceIds: item.evidenceIds,
        })),
        policy: 'current direct observations may recover uniquely named remembered objects; prior memory supplies identity context only, never current evidence',
      })
    }
    const completed = materializeExplicitGroundedObjects(observationRecovered.result, input.source.capturedAt)
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
    if (
      input.media.kind === 'image'
      && priorSnapshot
      && priorImageSource
      && this.model?.verifyTemporal
      && !this.recoveredSceneProviderFailure
      && this.hasRuntimeBudget(TEMPORAL_VERIFICATION_TIMEOUT_MS + PERSISTENCE_RESERVE_MS)
    ) {
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
    } else if (input.media.kind === 'image' && priorSnapshot && priorImageSource && this.model?.verifyTemporal) {
      console.warn('SENTINEL_TEMPORAL_VERIFICATION_SKIPPED_FOR_RUNTIME_BUDGET', {
        scanId,
        recoveredSceneProviderFailure: this.recoveredSceneProviderFailure,
        remainingMs: this.remainingRuntimeMs(),
      })
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
      if (input.media.kind === 'image') {
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

  private async confirmPersonCandidates(
    scanId: string,
    scene: PerceptionResult,
    artifacts: ScanArtifact[],
    frames: ScanFrame[],
    input: ScanInput,
    reserveAfterPerceptionMs: number,
  ): Promise<PerceptionResult> {
    const candidates = scene.objects.filter(isPersonObject)
    if (candidates.length === 0) return scene

    const emptyAudit: PerceptionResult = {
      sourceId: input.source.id,
      observations: [],
      objects: [],
      conditions: [],
      relations: [],
      evidence: [],
    }

    if (!this.model || !this.hasRuntimeBudget(OPTIONAL_AUDIT_TIMEOUT_MS + reserveAfterPerceptionMs)) {
      const resolution = resolvePersonGrounding(scene, emptyAudit)
      console.warn('SENTINEL_PERSON_CONFIRMATION_FAIL_CLOSED', {
        scanId,
        reason: this.model ? 'insufficient-runtime-budget' : 'confirmation-model-unavailable',
        rejectedObjectIds: resolution.rejectedObjectIds,
        remainingMs: this.remainingRuntimeMs(),
      })
      return resolution.result
    }

    const candidateSummary = candidates.map((item, index) => [
      `candidate_${index} id=${item.id} name="${item.name}" confidence=${item.confidence}`,
      `description="${item.description ?? 'none'}"`,
      `position="${item.position?.description ?? 'unspecified'}"`,
      `boundingBox=${item.boundingBox ? JSON.stringify(item.boundingBox) : 'missing'}`,
    ].join(' | ')).join('\n')

    const prompt = [
      `Person confirmation audit for scan ${scanId} in environment ${input.environmentId}.`,
      `The scan source id is ${input.source.id}.`,
      `The trusted scan capturedAt is ${input.source.capturedAt}.`,
      'An earlier perception pass produced the following PERSON CANDIDATES. These candidate claims are NOT evidence and may be false positives:',
      candidateSummary,
      'Inspect the supplied CURRENT image/frame evidence independently. This is a conservative confirmation pass, not a general scene inventory.',
      'Return a category="person" object only for an unmistakably visible real human being. Do not infer a person from a distant or ambiguous silhouette, reflection, poster/photo, signage, mannequin-like shape, foliage, furniture, shadows, or outdoor background detail.',
      'For every confirmed person, boundingBox is REQUIRED and must tightly localize that same visible human. In description, explicitly name at least two directly visible human cue groups: head/face, torso/body/shoulders, or limbs such as arms/hands/legs/feet.',
      'Use confidence >= 0.95 only when the human identity is visually unmistakable. If the candidate is small, blurry, occluded, distant, or otherwise ambiguous, omit it.',
      'Do not return non-person objects. Do not create conditions, issues, relations, recommendations, demographics, identity, emotion, or other personal attributes.',
      'If no candidate is independently confirmed, return the full SENTINEL PerceptionResult JSON shape with observations=[], objects=[], conditions=[], relations=[], evidence=[].',
      'Reference only exact supplied FRAME_ID values in evidenceIds for any confirmed person object.',
    ].join('\n')

    try {
      const audit = await this.inferPerceptionPass(
        'person-confirmation-audit',
        prompt,
        artifacts,
        frames,
        input,
      )
      const resolution = resolvePersonGrounding(scene, audit)
      console.warn('SENTINEL_PERSON_CONFIRMATION_COMPLETED', {
        scanId,
        candidates: candidates.length,
        confirmedObjectIds: resolution.confirmedObjectIds,
        rejectedObjectIds: resolution.rejectedObjectIds,
      })
      return resolution.result
    } catch (error) {
      const resolution = resolvePersonGrounding(scene, emptyAudit)
      console.warn('SENTINEL_PERSON_CONFIRMATION_FAIL_CLOSED', {
        scanId,
        reason: 'confirmation-pass-failed',
        code: errorCode(error),
        message: error instanceof Error ? error.message : 'Unknown person-confirmation failure',
        rejectedObjectIds: resolution.rejectedObjectIds,
      })
      return resolution.result
    }
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

    const addCandidate = (previous: SpatialObject, current: SpatialObject) => {
      if (!temporalCandidateAllowed(current)) return
      const key = `candidate_${candidates.length}`
      candidates.push({
        key,
        previousObjectName: previous.name,
        currentObjectName: current.name,
        category: current.category,
        previousPosition: previous.position?.description,
        currentPosition: current.position?.description,
        previousDescription: previous.description,
        currentDescription: current.description,
      })
      candidateByKey.set(key, { previous, current })
    }

    // Exact unique-name identity is preferred and does not depend on position
    // wording, because movement is one of the things this pass exists to test.
    for (const [currentIndex, current] of perception.objects.entries()) {
      if (!temporalCandidateAllowed(current)) continue
      const nameKey = normalizeTemporalName(current.name)
      if ((currentNameCounts.get(nameKey) ?? 0) !== 1 || (previousNameCounts.get(nameKey) ?? 0) !== 1) continue
      const previous = priorSnapshot.objects.find((item) => normalizeTemporalName(item.name) === nameKey)
      if (!previous) continue
      addCandidate(previous, current)
      pairedCurrent.add(currentIndex)
      if (candidates.length >= 8) break
    }

    // Conservative semantic matching can add a small number of stable aliases.
    if (candidates.length < 8) {
      const matches = matchObjectsConservatively(priorSnapshot.objects, perception.objects)
      for (const [currentIndex, previousIndex] of matches.entries()) {
        if (pairedCurrent.has(currentIndex)) continue
        const previous = priorSnapshot.objects[previousIndex]
        const current = perception.objects[currentIndex]
        if (!temporalCandidateAllowed(current)) continue
        if ((previousNameCounts.get(normalizeTemporalName(previous.name)) ?? 0) !== 1) continue
        if ((currentNameCounts.get(normalizeTemporalName(current.name)) ?? 0) !== 1) continue
        addCandidate(previous, current)
        if (candidates.length >= 8) break
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

    // Verify each candidate independently. This prevents a nearby open door
    // from being incorrectly transferred to a closet/cabinet candidate.
    const settled = await Promise.allSettled(candidates.map(async (candidate) => {
      const result = await this.model!.verifyTemporal!({
        environmentId: input.environmentId,
        previousSourceId: priorSource.id,
        currentSourceId: input.source.id,
        artifacts: [previousArtifact, currentFrame],
        candidates: [candidate],
        timeoutMs: TEMPORAL_VERIFICATION_TIMEOUT_MS,
      })
      return { candidate, result }
    }))

    const verified: VerifiedTemporalChange[] = []
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        console.warn('SENTINEL_TEMPORAL_CANDIDATE_SKIPPED', {
          scanId,
          message: outcome.reason instanceof Error ? outcome.reason.message : 'Unknown candidate verification failure',
        })
        continue
      }

      const { candidate, result } = outcome.value
      const pair = candidateByKey.get(candidate.key)
      if (!pair) continue

      for (const change of result.changes) {
        if (change.candidateKey !== candidate.key || change.confidence < 0.9) continue

        if (change.kind === 'state_change') {
          if (!temporalStateCandidateAllowed(pair.current)) continue
          if (!change.previousState || !change.currentState || change.previousState === change.currentState) continue
          if (isCompositeOpenable(pair.current) && !hasIndependentOpenClosedCue(pair.previous, pair.current)) continue

          verified.push({
            kind: 'state_change',
            previousObjectName: pair.previous.name,
            currentObjectName: pair.current.name,
            previousState: change.previousState,
            currentState: change.currentState,
            confidence: change.confidence,
          })
          continue
        }

        if (change.kind === 'moved' && temporalMovementCandidateAllowed(pair.current)) {
          verified.push({
            kind: 'moved',
            previousObjectName: pair.previous.name,
            currentObjectName: pair.current.name,
            confidence: change.confidence,
          })
        }
      }
    }

    const stateUpdates = new Map(
      verified
        .filter((change) => change.kind === 'state_change' && change.currentState)
        .map((change) => [normalizeTemporalName(change.currentObjectName), change.currentState!]),
    )
    const refined = {
      ...perception,
      objects: perception.objects.map((item) => {
        const verifiedState = stateUpdates.get(normalizeTemporalName(item.name))
        if (verifiedState) return { ...item, state: verifiedState }
        if (isOpenableObject(item)) return { ...item, state: undefined }
        return item
      }),
    }

    console.warn('SENTINEL_TEMPORAL_VERIFICATION_COMPLETED', {
      scanId,
      candidates: candidates.length,
      verified,
    })
    return { perception: refined, verified }
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

  private async perceive(
    scanId: string,
    artifacts: ScanArtifact[],
    frames: ScanFrame[],
    input: ScanInput,
    priorObjects: SpatialObject[],
    reserveAfterPerceptionMs: number,
  ): Promise<PerceptionResult> {
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
      'Prefer stable whole-object identity names over viewpoint-dependent phrases. Classify from visible morphology and context, never from an expected room type, prior demo scenario, filename, or remembered change. If a specific identity is uncertain, use a conservative generic physical-object label instead of forcing a familiar noun.',
      'For any directly visible operational signage, safety device, access feature, equipment, fixture, or other durable scene anchor, emit a corresponding grounded object when visually identifiable.',
      'Separate direct visual observations from condition interpretations.',
      'Reference only the exact supplied FRAME_ID values in evidenceIds. SENTINEL owns frame evidence records; do not manufacture replacement frame evidence IDs.',
      'Omit unsupported optional claims instead of guessing.',
      'Return the SENTINEL PerceptionResult JSON schema exactly.',
    ].join('\n')

    let scene = await this.inferPerceptionPass('scene', scenePrompt, artifacts, frames, input)

    // If the primary scene call only succeeded after a transient provider retry,
    // persist that grounded scene immediately instead of spending the remaining
    // Vercel execution budget on optional audits. A later observation can enrich
    // state, but a recovered scene must not be lost to a second slow provider call.
    if (this.recoveredSceneProviderFailure) {
      console.warn('SENTINEL_SECONDARY_AUDITS_SKIPPED_AFTER_PROVIDER_RETRY', { scanId })
      return scene
    }

    // Update-photo integrity audit: the broad scene pass can miss a material current
    // object, relationship, or condition in any kind of environment. Re-read the
    // CURRENT image once without assuming a demo object list. Prior memory is naming
    // context only, never evidence, and every recovered claim still requires trusted
    // current-frame grounding.
    if (
      input.media.kind === 'image'
      && priorObjects.length > 0
      && this.hasRuntimeBudget(OPTIONAL_AUDIT_TIMEOUT_MS + reserveAfterPerceptionMs)
    ) {
      const priorOperationalAnchors = priorObjects
        .filter(isOperationalChangeAuditObject)
        .slice(0, 20)
        .map((item) => `${item.name} (${item.category})`)
        .join(', ')
      const currentSceneObjects = scene.objects
        .filter(isOperationalChangeAuditObject)
        .map((item) => `${item.name} (${item.category})`)
        .join(', ')

      const changeAuditPrompt = [
        `Current-state integrity audit for scan ${scanId} in environment ${input.environmentId}.`,
        `The scan source id is ${input.source.id}.`,
        `The trusted scan capturedAt is ${input.source.capturedAt}.`,
        `Current scene pass already found these grounded objects: ${currentSceneObjects || 'none'}.`,
        `Previously remembered names (NAMING CONTEXT ONLY, NOT EVIDENCE): ${priorOperationalAnchors || 'none'}.`,
        'Inspect the supplied CURRENT still image independently. Recover any materially useful directly visible physical object, relationship, or environmental condition that the broad scene pass missed or under-described.',
        'Do not use a fixed inventory or expected demo objects. Evaluate the actual image across access/circulation, safety, maintenance, damage, equipment/fixture state, electrical/HVAC context, compliance cues, and other visibly operational conditions supported by the scene.',
        'Re-observe a previously named anchor only when that physical object is directly visible in the CURRENT image. Never infer presence from prior memory.',
        'Use stable whole-object names and concise semantic physical positions when directly visible. If the physical relationship between objects matters operationally, encode the supported relation and condition rather than relying on vague prose.',
        'Do not claim an object is new, moved, removed, resolved, or changed. This pass describes CURRENT visible state only; SENTINEL compares states later.',
        'Do not force a condition. Ordinary scene arrangement remains ordinary unless current visual evidence supports an operational condition.',
        'Omit anything ambiguous. Do not use filenames, metadata, prior memory, room labels, or expected changes as evidence.',
        'Reference only exact supplied FRAME_ID values in evidenceIds. Return the full SENTINEL PerceptionResult JSON schema.',
      ].join('\n')

      try {
        const changeAudit = await this.inferPerceptionPass('operational-change-audit', changeAuditPrompt, artifacts, frames, input)
        const recovered = mergeOperationalChangeAudit(scene, changeAudit)
        scene = recovered.scene
        console.warn('SENTINEL_OPERATIONAL_CHANGE_AUDIT_COMPLETED', {
          scanId,
          recovered: recovered.added.map((item) => ({ name: item.name, category: item.category, confidence: item.confidence })),
          enriched: recovered.enriched.map((item) => ({ name: item.name, category: item.category, confidence: item.confidence })),
        })
      } catch (error) {
        console.warn('SENTINEL_OPERATIONAL_CHANGE_AUDIT_SKIPPED', {
          scanId,
          code: errorCode(error),
          message: error instanceof Error ? error.message : 'Unknown operational change audit failure',
        })
      }
    }

    // Still-photo state audit: open/closed is operationally important but the broad
    // scene pass can omit it. Re-inspect only visible openable objects whose state
    // is missing; this pass may confirm state but must not invent unseen objects.
    if (
      input.media.kind === 'image'
      && priorObjects.length === 0
      && shouldRunOpenableStateAudit(scene)
      && this.hasRuntimeBudget(OPTIONAL_AUDIT_TIMEOUT_MS + reserveAfterPerceptionMs)
    ) {
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
    if (input.media.kind === 'image' && !shouldRunStillImageConditionAudit(scene) && !shouldRunAccessGeometryAudit(scene)) return scene
    if (!this.hasRuntimeBudget(OPTIONAL_AUDIT_TIMEOUT_MS + reserveAfterPerceptionMs)) {
      console.warn('SENTINEL_CONDITION_AUDIT_SKIPPED_FOR_RUNTIME_BUDGET', {
        scanId,
        remainingMs: this.remainingRuntimeMs(),
        reserveAfterPerceptionMs,
      })
      return scene
    }

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

      if (
        !hasOperationalConditionCandidate(merged)
        && shouldRunIdentityAudit(merged)
        && this.hasRuntimeBudget(OPTIONAL_AUDIT_TIMEOUT_MS + reserveAfterPerceptionMs)
      ) {
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

      if (
        !hasOperationalConditionCandidate(merged)
        && shouldRunAccessGeometryAudit(merged)
        && this.hasRuntimeBudget(OPTIONAL_AUDIT_TIMEOUT_MS + reserveAfterPerceptionMs)
      ) {
        const geometryCandidates = accessGeometryCandidates(merged)
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
          `Visible physical-obstruction candidates: ${geometryCandidates || 'none'}.`,
          `Visible door candidates: ${geometryDoors || 'none'}.`,
          'Inspect the supplied frames only to verify the physical relationship between the named current-scan candidate object(s) and the visible door or doorway.',
          'If a candidate is directly in front of the door, emit an explicit relation with type="in_front_of", fromId=candidate object id, toId=door object id, plus grounded evidenceIds. The direction must be obstacle -> door.',
          'Also state the placement explicitly in a direct observation when visually supported.',
          'Near, beside, left/right, perspective overlap, or sharing the center of the image is NOT sufficient evidence of obstruction and must not be converted to in_front_of.',
          'Do not reinterpret ordinary room furniture merely visible in the foreground as blocking a more distant door. Confirm in_front_of only when the candidate footprint visibly occupies the door opening, threshold, or access path.',
          'For this targeted audit, the explicit obstacle -> door in_front_of relation is the authoritative geometry output. If that relation cannot be supported, do not use obstruction/blocking language in observations.',
          'If exit signage is visible, include the exit-sign observation/object so emergency-exit identity remains independently grounded. If no exit signage is visible, do not call the doorway an emergency exit.',
          'Do not infer from filenames, metadata, prior memory, or the earlier model wording. Use only visible frame evidence.',
          'Do not force a relation or operational condition when geometry is unclear.',
          'Reference only exact supplied FRAME_ID values in evidenceIds. Return the full SENTINEL PerceptionResult JSON schema.',
        ].join('\n')

        console.warn('SENTINEL_ACCESS_GEOMETRY_AUDIT_STARTED', {
          scanId,
          reason: 'physical_obstacle_and_door_without_explicit_placement',
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
    pass: 'scene' | 'state-audit' | 'condition-audit' | 'identity-audit' | 'access-geometry-audit' | 'operational-change-audit' | 'person-confirmation-audit',
    prompt: string,
    artifacts: ScanArtifact[],
    frames: ScanFrame[],
    input: ScanInput,
  ): Promise<PerceptionResult> {
    let lastError: unknown
    const maxAttempts = pass === 'scene' ? MAX_PERCEPTION_ATTEMPTS : 1
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const sparseStillRetry = lastError instanceof ModelAdapterError
          && lastError.code === 'INSUFFICIENT_SCENE_INVENTORY'
        const retryInstruction = attempt > 1
          ? sparseStillRetry
            ? 'SPARSE STILL-PHOTO RETRY: The prior grounded result contained no usable physical objects. Re-inspect the CURRENT still image from scratch and return a concise inventory of the major directly visible physical objects needed to represent this environment. Include stable whole-object entries for clearly visible doors, furniture, safety equipment, signage, fixtures, storage/cabinet units, plants, and other substantial scene anchors when actually visible. Do not invent objects, do not recover from memory, do not pad with decorative micro-items, and do not repeat aliases. Every object must reference the supplied FRAME_ID evidence. Return one complete JSON object only.'
            : 'FAST STRICT RETRY: Return one complete JSON object only. Prioritize operationally meaningful visible objects and anchors; for a still image keep the inventory concise (prefer at most 12 objects). Use canonical enum values, finite numeric confidences, arrays for reference fields, and reference only supplied FRAME_ID evidence. Omit decorative micro-inventory and unsupported optional claims instead of guessing.'
          : undefined
        const result = await this.model!.infer({
          role: 'perception',
          artifacts,
          prompt: [prompt, retryInstruction].filter((item): item is string => Boolean(item)).join('\n'),
          ...(pass === 'scene' ? {} : { timeoutMs: OPTIONAL_AUDIT_TIMEOUT_MS }),
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

        const groundedItemCount = grounded.result.observations.length
          + grounded.result.objects.length
          + grounded.result.conditions.length
        if (pass === 'person-confirmation-audit' && groundedItemCount === 0) {
          return grounded.result
        }

        if (pass === 'scene' && input.media.kind === 'image') {
          const groundedPhysicalObjects = grounded.result.objects.filter((item) => !isPersonObject(item))
          if (groundedPhysicalObjects.length === 0) {
            const willRetry = attempt < maxAttempts
            console.warn(willRetry ? 'SENTINEL_SPARSE_SCENE_RETRY' : 'SENTINEL_SPARSE_SCENE_REJECTED', {
              attempt,
              nextAttempt: willRetry ? attempt + 1 : undefined,
              observations: grounded.result.observations.length,
              conditions: grounded.result.conditions.length,
              people: grounded.result.objects.filter(isPersonObject).length,
              message: 'Still-photo scene produced no grounded non-person physical objects',
            })
            throw new ModelAdapterError({
              code: 'INSUFFICIENT_SCENE_INVENTORY',
              message: 'SENTINEL could not establish a grounded physical-object inventory from this still image. No environmental state was saved; try the observation again.',
              retryable: willRetry,
            })
          }
        }

        return validatePerceptionForScan(grounded.result, input.environmentId, input.source.id)
      } catch (error) {
        lastError = error
        const outputRetry = isRetryablePerceptionOutputError(error)
        const providerRetry = pass === 'scene' && isTransientPerceptionProviderError(error)
        if (attempt >= maxAttempts || (!outputRetry && !providerRetry)) throw error

        if (providerRetry) this.recoveredSceneProviderFailure = true
        console.warn(providerRetry ? 'SENTINEL_PERCEPTION_PROVIDER_RETRY' : 'SENTINEL_PERCEPTION_SCHEMA_RETRY', {
          pass,
          attempt,
          nextAttempt: attempt + 1,
          code: errorCode(error),
          retryKind: providerRetry ? 'provider-transient' : 'output-contract',
          message: error instanceof Error ? error.message : 'Unknown perception output error',
        })
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Perception failed without an error')
  }

  private remainingRuntimeMs(): number | undefined {
    if (this.deadlineAtMs === undefined) return undefined
    return Math.max(0, this.deadlineAtMs - this.nowMs())
  }

  private hasRuntimeBudget(requiredMs: number): boolean {
    const remaining = this.remainingRuntimeMs()
    return remaining === undefined || remaining >= requiredMs
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


const OPERATIONAL_CHANGE_AUDIT_TERMS = /\b(?:box|boxes|carton|package|fire extinguisher|extinguisher|chair|stool|bench|cart|trolley|pallet jack|hand truck|dolly|wheelchair|ladder|barrier|cone|toolbox|bag|suitcase|equipment case|door|doorway|exit|egress|walkway|walking path|passage|aisle|obstruction|blocking|blocked|obstructing|obstructed)\b/i

function isOperationalChangeAuditObject(item: SpatialObject): boolean {
  if (item.confidence < 0.9) return false
  if (item.category === 'obstruction' || item.category === 'safety' || item.category === 'door') return true
  const text = `${item.name} ${item.description ?? ''}`
  return OPERATIONAL_CHANGE_AUDIT_TERMS.test(text)
}

function mergeOperationalChangeAudit(
  scene: PerceptionResult,
  audit: PerceptionResult,
): { scene: PerceptionResult; added: SpatialObject[]; enriched: SpatialObject[] } {
  const matches = matchObjectsConservatively(scene.objects, audit.objects)
  const idMap = new Map<string, string>()
  const added: SpatialObject[] = []
  const enriched: SpatialObject[] = []
  const mergedObjects = scene.objects.map((item) => ({ ...item, evidenceIds: [...item.evidenceIds] }))

  for (const [auditIndex, candidate] of audit.objects.entries()) {
    if (!isOperationalChangeAuditObject(candidate)) continue

    let sceneIndex = matches.get(auditIndex)
    if (sceneIndex === undefined) {
      const candidateName = normalizeTemporalName(candidate.name)
      const exact = mergedObjects
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => normalizeTemporalName(item.name) === candidateName)
      if (exact.length === 1) sceneIndex = exact[0].index
    }

    if (sceneIndex !== undefined) {
      const existing = mergedObjects[sceneIndex]
      idMap.set(candidate.id, existing.id)
      const next: SpatialObject = {
        ...existing,
        ...(existing.position ? {} : candidate.position ? { position: candidate.position } : {}),
        ...(existing.state ? {} : candidate.state ? { state: candidate.state } : {}),
        evidenceIds: [...new Set([...existing.evidenceIds, ...candidate.evidenceIds])],
        confidence: Math.max(existing.confidence, candidate.confidence),
      }
      mergedObjects[sceneIndex] = next
      enriched.push(next)
      continue
    }

    const nextId = `change_audit_${candidate.id}`
    idMap.set(candidate.id, nextId)
    const next = { ...candidate, id: nextId }
    mergedObjects.push(next)
    added.push(next)
  }

  const mappedObservationText = audit.observations.filter((item) =>
    item.confidence >= 0.9 && OPERATIONAL_CHANGE_AUDIT_TERMS.test(`${item.label} ${item.description}`),
  ).map((item) => ({ ...item, id: `change_audit_${item.id}` }))

  const mappedConditions = audit.conditions.flatMap((item) => {
    if (item.confidence < 0.85 || !OPERATIONAL_CHANGE_AUDIT_TERMS.test(`${item.title} ${item.description}`)) return []
    const objectIds = item.objectIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id))
    if (item.objectIds.length > 0 && objectIds.length !== item.objectIds.length) return []
    return [{ ...item, id: `change_audit_${item.id}`, objectIds }]
  })

  const knownIds = new Set(mergedObjects.map((item) => item.id))
  const mappedRelations = audit.relations.flatMap((item) => {
    const fromId = idMap.get(item.fromId)
    const toId = idMap.get(item.toId)
    if (!fromId || !toId || !knownIds.has(fromId) || !knownIds.has(toId)) return []
    return [{ ...item, id: `change_audit_${item.id}`, fromId, toId }]
  })

  const existingConditionKeys = new Set(scene.conditions.map((item) =>
    `${normalizeSemanticText(item.title)}::${[...item.objectIds].sort().join('|')}`,
  ))
  const newConditions = mappedConditions.filter((item) => {
    const key = `${normalizeSemanticText(item.title)}::${[...item.objectIds].sort().join('|')}`
    if (existingConditionKeys.has(key)) return false
    existingConditionKeys.add(key)
    return true
  })

  return {
    scene: {
      ...scene,
      observations: uniqueById([...scene.observations, ...mappedObservationText]),
      objects: mergedObjects,
      conditions: uniqueById([...scene.conditions, ...newConditions]),
      relations: uniqueById([...scene.relations, ...mappedRelations]),
      evidence: uniqueById([...scene.evidence, ...audit.evidence]),
    },
    added,
    enriched,
  }
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
  return temporalStateCandidateAllowed(item) || temporalMovementCandidateAllowed(item)
}

function temporalStateCandidateAllowed(item: SpatialObject): boolean {
  return isOpenableObject(item)
}

function temporalMovementCandidateAllowed(item: SpatialObject): boolean {
  const name = normalizeTemporalName(item.name)
  return /\b(?:chair|stool|bench|cart|trolley|pallet jack|hand truck|dolly|wheelchair|ladder|box|crate|bin|barrier|cone|toolbox|bag|suitcase|equipment case|fire extinguisher|extinguisher)\b/.test(name)
}

function isCompositeOpenable(item: SpatialObject): boolean {
  const name = normalizeTemporalName(item.name)
  return /\b(?:closet|cabinet|cupboard|drawer)\b/.test(name) && item.category !== 'door'
}

function hasIndependentOpenClosedCue(previous: SpatialObject, current: SpatialObject): boolean {
  // Do not use object.state here: that field is exactly what temporal
  // verification is auditing and may be a single-photo provider mistake.
  const text = normalizeSemanticText([
    previous.name,
    previous.description ?? '',
    current.name,
    current.description ?? '',
  ].join(' '))
  return /\b(?:open|opened|closed|ajar)\b/.test(text)
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

function materializeDirectlyObservedRememberedObjects(
  result: PerceptionResult,
  priorObjects: SpatialObject[],
  capturedAt: string,
): { result: PerceptionResult; materialized: SpatialObject[] } {
  if (priorObjects.length === 0 || result.observations.length === 0) {
    return { result, materialized: [] }
  }

  const priorByStableName = new Map<string, SpatialObject[]>()
  for (const prior of priorObjects) {
    if (isPersonObject(prior)) continue
    const key = normalizeTemporalName(prior.name)
    if (!key) continue
    const items = priorByStableName.get(key) ?? []
    items.push(prior)
    priorByStableName.set(key, items)
  }

  const currentNames = new Set(result.objects.map((item) => normalizeTemporalName(item.name)))
  const materialized: SpatialObject[] = []

  for (const observation of result.observations) {
    if (observation.basis !== 'observed' || observation.confidence < 0.9 || observation.evidenceIds.length === 0) continue

    const key = normalizeTemporalName(observation.label)
    if (!key || currentNames.has(key)) continue

    const candidates = priorByStableName.get(key) ?? []
    if (candidates.length !== 1) continue
    const prior = candidates[0]

    // Presence comes only from the current observation + current frame evidence.
    // Prior memory supplies stable identity/category context, never current
    // position, state, or evidence.
    const object: SpatialObject = {
      id: `observed_recovery_${observation.id}`,
      environmentId: observation.environmentId,
      category: prior.category,
      name: prior.name,
      description: observation.description,
      confidence: observation.confidence,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: [...new Set(observation.evidenceIds)],
    }
    materialized.push(object)
    currentNames.add(key)
  }

  if (materialized.length === 0) return { result, materialized: [] }
  return {
    result: {
      ...result,
      objects: [...result.objects, ...materialized],
    },
    materialized,
  }
}

function materializeExplicitGroundedObjects(
  result: PerceptionResult,
  capturedAt: string,
): { result: PerceptionResult; materialized: SpatialObject[] } {
  const hasDurableExitSign = result.objects.some((item) => {
    const text = normalizeSemanticText(`${item.name} ${item.description ?? ''} ${item.position?.description ?? ''}`)
    const explicitInName = hasExplicitExitSignText(item.name)
    const explicitSignageObject = item.category === 'signage' && hasExplicitExitSignText(text)
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
    hasExplicitExitSignText(item.text) &&
    item.evidenceIds.length > 0,
  )

  if (groundedMentions.length === 0) return { result, materialized: [] }

  const evidenceIds = [...new Set(groundedMentions.flatMap((item) => item.evidenceIds))]
  const confidence = Math.min(...groundedMentions.map((item) => item.confidence))
  const explicitlyEmergency = groundedMentions.some((item) => /\bemergency exit (?:sign|symbol|signage)\b/.test(normalizeSemanticText(item.text)))
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

function hasExplicitExitSignText(value: string): boolean {
  const text = normalizeSemanticText(value)
  return /\b(?:emergency )?exit (?:sign|symbol|signage)\b/.test(text)
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
  const doors = result.objects.filter((item) =>
    item.category === 'door' &&
    item.evidenceIds.length > 0
  )
  if (doors.length === 0) return false

  return accessGeometryCandidates(result).some((candidate) =>
    !hasExplicitPlacementForCandidate(result, candidate, doors) &&
    sharesTrustedEvidenceWithAnyDoor(candidate, doors),
  )
}

function accessGeometryCandidates(result: PerceptionResult): SpatialObject[] {
  return result.objects.filter((item) => {
    if (item.evidenceIds.length === 0) return false
    if (item.category === 'obstruction') return true

    const text = `${item.name} ${item.description ?? ''}`
    // Do not proactively reinterpret ordinary office furniture as an access
    // obstacle from a single perspective. If a chair/table/desk truly blocks
    // a doorway, the broad scene or condition audit may state that directly;
    // this targeted geometry pass is reserved for obstruction-like objects.
    return /\b(?:pallet\s+jack|pallet|trolley|cart|forklift|box|carton|barrier|cone|ladder|equipment\s+case|material[-\s]+handling\s+equipment)\b/i.test(text)
  })
}

function sharesTrustedEvidenceWithAnyDoor(candidate: SpatialObject, doors: SpatialObject[]): boolean {
  const evidence = new Set(candidate.evidenceIds)
  return doors.some((door) => door.evidenceIds.some((id) => evidence.has(id)))
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
    normalizeSemanticText('label' in item
      ? `${item.label} ${item.description}`
      : `${item.name} ${item.description ?? ''} ${item.position?.description ?? ''}`),
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
  return error.code === 'INVALID_MODEL_JSON'
    || error.code === 'INVALID_PERCEPTION_SCHEMA'
    || error.code === 'EMPTY_MODEL_RESPONSE'
    || error.code === 'INSUFFICIENT_SCENE_INVENTORY'
}

function isTransientPerceptionProviderError(error: unknown): boolean {
  if (!(error instanceof ModelAdapterError) || !error.retryable) return false
  if (error.code === 'NEBIUS_TIMEOUT' || error.code === 'NEBIUS_REQUEST_FAILED') return true
  if (error.code !== 'NEBIUS_HTTP_ERROR') return false
  return error.status === 429 || (typeof error.status === 'number' && error.status >= 500)
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
