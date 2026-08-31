import type { EnvironmentId, Observation, ScanSource } from '../domain/sentinel'

export type ScanStage =
  | 'queued'
  | 'validating'
  | 'sampling'
  | 'extracting'
  | 'normalizing'
  | 'complete'
  | 'failed'

export interface ScanInput {
  environmentId: EnvironmentId
  source: ScanSource
  media: ScanMedia
  options?: ScanOptions
}

export interface ScanMedia {
  kind: 'video' | 'image'
  uri: string
  mimeType: string
  durationMs?: number
  sizeBytes?: number
}

export interface ScanOptions {
  maxFrames?: number
  sampleIntervalMs?: number
  preserveAudio?: boolean
}

export interface ScanProgress {
  scanId: string
  stage: ScanStage
  progress: number
  message: string
}

export interface ScanFrame {
  frameId: string
  timestampMs: number
  uri: string
}

export interface ScanArtifact {
  artifactId: string
  frameId?: string
  kind: 'frame' | 'audio' | 'metadata'
  uri: string
}

export interface PerceptionBatch {
  scanId: string
  artifacts: ScanArtifact[]
  observations: Observation[]
}

export interface ScanResult {
  scanId: string
  environmentId: EnvironmentId
  source: ScanSource
  frames: ScanFrame[]
  artifacts: ScanArtifact[]
  observations: Observation[]
  completedAt: string
}

export interface ScanError {
  code: string
  message: string
  recoverable: boolean
}
