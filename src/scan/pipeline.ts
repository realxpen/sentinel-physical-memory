import type { PerceptionResult } from '../domain/sentinel.js'
import { validatePerceptionForScan } from '../ai/perception-schema.js'
import type { ModelAdapter } from '../ai/model.js'
import { EnvironmentalMemoryStore } from '../memory/store.js'
import { InMemoryEnvironmentalMemoryRepository, type EnvironmentalMemoryRepository } from '../memory/repository.js'
import type { ScanArtifact, ScanError, ScanFrame, ScanInput, ScanProgress, ScanResult } from './types.js'

export interface ScanPipelineDependencies {
  now?: () => Date
  id?: (prefix: string) => string
  onProgress?: (progress: ScanProgress) => void
  model?: ModelAdapter
  memoryRepository?: EnvironmentalMemoryRepository
}

const defaultId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

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

    const perception = await this.perceive(scanId, artifacts, input)
    const observations = perception.observations.map((item) => ({ ...item }))
    this.emit(scanId, 'normalizing', 75, `${observations.length} observation(s) normalized`)

    const state = memory.ingestScan(input.environmentId, input.source, perception)
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
    return { scanId, environmentId: input.environmentId, source: input.source, frames, artifacts, observations, state, diff, completedAt: this.now().toISOString() }
  }

  getMemory(environmentId: string) { return this.memoryRepository.get(environmentId) }

  private async loadMemoryStore(environmentId: string): Promise<EnvironmentalMemoryStore> {
    const store = new EnvironmentalMemoryStore({ now: this.now })
    const existing = await this.memoryRepository.get(environmentId)
    if (existing) store.hydrate(existing)
    return store
  }

  private ensureEnvironment(memory: EnvironmentalMemoryStore, input: ScanInput) {
    if (memory.get(input.environmentId)) return
    memory.createEnvironment({ id: input.environmentId, name: input.source.metadata?.name?.toString() ?? 'SENTINEL Environment', type: 'other', description: 'Environment created automatically by the scan pipeline.', createdAt: input.source.capturedAt, updatedAt: input.source.capturedAt, stateIds: [], roomIds: [], objectIds: [], issueIds: [] })
  }

  private async perceive(scanId: string, artifacts: ScanArtifact[], input: ScanInput): Promise<PerceptionResult> {
    if (!this.model) return { sourceId: input.source.id, observations: [], objects: [], relations: [], evidence: [] }
    const result = await this.model.infer({ role: 'perception', artifacts, prompt: [`Analyze scan ${scanId} for environment ${input.environmentId}.`, `The scan source id is ${input.source.id}.`, 'Identify only visually supported rooms, objects, conditions, and spatial relationships.', 'Create evidence entries for every observation and object grounded to supplied frames.', 'Return the SENTINEL PerceptionResult JSON schema exactly.'].join('\n') })
    return validatePerceptionForScan(result, input.environmentId, input.source.id)
  }

  private validate(input: ScanInput) { if (!input.environmentId) throw this.error('INVALID_ENVIRONMENT', 'environmentId is required'); if (!input.source?.id) throw this.error('INVALID_SOURCE', 'source.id is required'); if (!input.media.uri) throw this.error('INVALID_MEDIA', 'media.uri is required'); if (!input.media.mimeType) throw this.error('INVALID_MEDIA', 'media.mimeType is required'); if (input.media.kind === 'image' && input.media.durationMs !== undefined) throw this.error('INVALID_MEDIA', 'image media cannot declare durationMs'); if (input.media.kind === 'video' && !input.media.extractedFrames?.length) throw this.error('VIDEO_FRAMES_REQUIRED', 'Video media must provide extracted frames before perception') }
  private sample(input: ScanInput): ScanFrame[] { if (input.media.kind === 'video' && input.media.extractedFrames?.length) { const max = Math.max(1, input.options?.maxFrames ?? input.media.extractedFrames.length); return input.media.extractedFrames.slice(0, max) } return [{ frameId: this.id('frame'), timestampMs: 0, uri: input.media.uri }] }
  private createArtifacts(frames: ScanFrame[], input: ScanInput): ScanArtifact[] { const artifacts: ScanArtifact[] = frames.map((frame) => ({ artifactId: this.id('artifact'), frameId: frame.frameId, kind: 'frame', uri: frame.uri })); if (input.options?.preserveAudio && input.media.kind === 'video') artifacts.push({ artifactId: this.id('artifact'), kind: 'audio', uri: input.media.uri }); artifacts.push({ artifactId: this.id('artifact'), kind: 'metadata', uri: input.media.uri }); return artifacts }
  private emit(scanId: string, stage: ScanProgress['stage'], progress: number, message: string) { this.onProgress?.({ scanId, stage, progress, message }) }
  private error(code: string, message: string): ScanError { return Object.assign(new Error(message), { code, recoverable: false }) }
}
