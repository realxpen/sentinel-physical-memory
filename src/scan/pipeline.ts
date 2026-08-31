import type { PerceptionResult } from '../domain/sentinel'
import { validatePerceptionForScan } from '../ai/perception-schema'
import type { ModelAdapter } from '../ai/model'
import type { PerceptionBatch, ScanArtifact, ScanError, ScanFrame, ScanInput, ScanProgress, ScanResult } from './types'

export interface ScanPipelineDependencies { now?: () => Date; id?: (prefix: string) => string; onProgress?: (progress: ScanProgress) => void; model?: ModelAdapter }
const defaultId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`

/** Orchestrates media preparation, artifact generation, and model perception. */
export class ScanPipeline {
  private readonly now: () => Date; private readonly id: (prefix: string) => string; private readonly onProgress?: (progress: ScanProgress) => void; private readonly model?: ModelAdapter
  constructor(deps: ScanPipelineDependencies = {}) { this.now = deps.now ?? (() => new Date()); this.id = deps.id ?? defaultId; this.onProgress = deps.onProgress; this.model = deps.model }
  async run(input: ScanInput): Promise<ScanResult> {
    const scanId = this.id('scan'); this.emit(scanId, 'queued', 0, 'Scan queued'); this.validate(input); this.emit(scanId, 'validating', 15, 'Input validated')
    const frames = this.sample(input); this.emit(scanId, 'sampling', 35, `${frames.length} key frame(s) selected`)
    const artifacts = this.createArtifacts(frames, input); this.emit(scanId, 'extracting', 55, `${artifacts.filter((a) => a.kind === 'frame').length} frame artifact(s) prepared`)
    const perception = await this.perceive(scanId, artifacts, input); const observations = this.normalize(perception.observations)
    this.emit(scanId, 'normalizing', 85, `${observations.length} observation(s) normalized`); this.emit(scanId, 'complete', 100, 'Scan pipeline complete')
    return { scanId, environmentId: input.environmentId, source: input.source, frames, artifacts, observations, completedAt: this.now().toISOString() }
  }
  private async perceive(scanId: string, artifacts: ScanArtifact[], input: ScanInput): Promise<PerceptionResult> {
    if (!this.model) { const batch: PerceptionBatch = { scanId, artifacts, observations: [] }; return { sourceId: input.source.id, observations: batch.observations, objects: [], relations: [], evidence: [] } }
    const result = await this.model.infer({ role: 'perception', artifacts, prompt: [`Analyze scan ${scanId} for environment ${input.environmentId}.`, `The scan source id is ${input.source.id}.`, 'Identify only visually supported rooms, objects, conditions, and spatial relationships.', 'Create evidence entries for every observation and object that can be grounded to a supplied frame.', 'Return the SENTINEL PerceptionResult JSON schema exactly.'].join('\n') })
    return validatePerceptionForScan(result, input.environmentId, input.source.id)
  }
  private validate(input: ScanInput): void {
    if (!input.environmentId) throw this.error('INVALID_ENVIRONMENT', 'environmentId is required')
    if (!input.source?.id) throw this.error('INVALID_SOURCE', 'source.id is required')
    if (!input.media.uri) throw this.error('INVALID_MEDIA', 'media.uri is required')
    if (!input.media.mimeType) throw this.error('INVALID_MEDIA', 'media.mimeType is required')
    if (input.media.kind === 'image' && input.media.durationMs !== undefined) throw this.error('INVALID_MEDIA', 'image media cannot declare durationMs')
    if (input.media.kind === 'video' && (!input.media.extractedFrames || input.media.extractedFrames.length === 0)) throw this.error('VIDEO_FRAMES_REQUIRED', 'Video media must provide extracted frames before perception')
  }
  private sample(input: ScanInput): ScanFrame[] {
    if (input.media.kind === 'video' && input.media.extractedFrames?.length) {
      const maxFrames = Math.max(1, input.options?.maxFrames ?? input.media.extractedFrames.length)
      return input.media.extractedFrames.slice(0, maxFrames)
    }
    return [{ frameId: this.id('frame'), timestampMs: 0, uri: input.media.uri }]
  }
  private createArtifacts(frames: ScanFrame[], input: ScanInput): ScanArtifact[] {
    const artifacts: ScanArtifact[] = frames.map((frame) => ({ artifactId: this.id('artifact'), frameId: frame.frameId, kind: 'frame', uri: frame.uri }))
    if (input.options?.preserveAudio && input.media.kind === 'video') artifacts.push({ artifactId: this.id('artifact'), kind: 'audio', uri: input.media.uri })
    artifacts.push({ artifactId: this.id('artifact'), kind: 'metadata', uri: input.media.uri })
    return artifacts
  }
  private normalize<T>(items: T[]): T[] { return items.map((item) => ({ ...item })) }
  private emit(scanId: string, stage: ScanProgress['stage'], progress: number, message: string): void { this.onProgress?.({ scanId, stage, progress, message }) }
  private error(code: string, message: string): ScanError { return Object.assign(new Error(message), { code, recoverable: false }) }
}
