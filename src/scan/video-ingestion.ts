import type { ScanFrame } from './types'

const TARGET_DURATION_MIN_MS = 30_000
const TARGET_DURATION_MAX_MS = 60_000
const HARD_DURATION_MIN_MS = 5_000
const HARD_DURATION_MAX_MS = 90_000
const MAX_SOURCE_FILE_BYTES = 300 * 1024 * 1024
const DEFAULT_MIN_FRAMES = 8
const DEFAULT_MAX_FRAMES = 12
const DEFAULT_CANDIDATE_FRAMES = 24
const DEFAULT_MAX_WIDTH = 960
const DEFAULT_JPEG_QUALITY = 0.68
const DEFAULT_MAX_ENCODED_BYTES = 3.2 * 1024 * 1024
const DEFAULT_LOW_LIGHT_THRESHOLD = 0.11
const DEFAULT_DUPLICATE_THRESHOLD = 0.035

const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
])

export interface VideoIngestionOptions {
  minFrames?: number
  maxFrames?: number
  candidateFrames?: number
  maxWidth?: number
  jpegQuality?: number
  maxEncodedBytes?: number
  lowLightThreshold?: number
  duplicateThreshold?: number
}

export interface VideoIngestionDiagnostics {
  targetDuration: boolean
  candidateFrameCount: number
  selectedFrameCount: number
  duplicateFramesRejected: number
  lowLightFramesRejected: number
  averageBrightness: number
  encodedBytes: number
  warnings: string[]
}

export interface VideoIngestionResult {
  durationMs: number
  mimeType: string
  frames: ScanFrame[]
  diagnostics: VideoIngestionDiagnostics
}

export class VideoIngestionError extends Error {
  readonly code: string
  readonly recoverable: boolean

  constructor(code: string, message: string, recoverable = true) {
    super(message)
    this.name = 'VideoIngestionError'
    this.code = code
    this.recoverable = recoverable
  }
}

type CandidateFrame = {
  timestampMs: number
  brightness: number
  signature: Uint8Array
}

type EncodedFrames = {
  frames: ScanFrame[]
  encodedBytes: number
}

/**
 * Browser-side video hardening for Phase 4.
 *
 * The original video never crosses the serverless boundary. We inspect a wider
 * candidate set locally, keep visually useful frames, then encode only 8–12
 * compact JPEG evidence frames for /api/scan.
 */
export async function ingestVideoFile(
  file: File,
  id: (prefix: string) => string = (prefix) => `${prefix}_${crypto.randomUUID()}`,
  options: VideoIngestionOptions = {},
): Promise<VideoIngestionResult> {
  const mimeType = resolveVideoMimeType(file)
  if (!mimeType || !SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) {
    throw new VideoIngestionError(
      'UNSUPPORTED_VIDEO_TYPE',
      'Use an MP4, MOV/M4V, or WebM walkthrough video.',
    )
  }
  if (file.size <= 0) throw new VideoIngestionError('EMPTY_VIDEO', 'The selected walkthrough video is empty.')
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new VideoIngestionError(
      'SOURCE_VIDEO_TOO_LARGE',
      'This walkthrough is too large to inspect reliably in the browser. Record a 30–60 second walkthrough at normal phone resolution.',
    )
  }

  const minFrames = clampInteger(options.minFrames ?? DEFAULT_MIN_FRAMES, 4, 10)
  const maxFrames = clampInteger(options.maxFrames ?? DEFAULT_MAX_FRAMES, minFrames, 12)
  const candidateFrames = clampInteger(options.candidateFrames ?? DEFAULT_CANDIDATE_FRAMES, maxFrames, 32)
  const maxWidth = clampInteger(options.maxWidth ?? DEFAULT_MAX_WIDTH, 480, 1280)
  const jpegQuality = clamp(options.jpegQuality ?? DEFAULT_JPEG_QUALITY, 0.45, 0.86)
  const maxEncodedBytes = clamp(options.maxEncodedBytes ?? DEFAULT_MAX_ENCODED_BYTES, 1.5 * 1024 * 1024, 3.6 * 1024 * 1024)
  const lowLightThreshold = clamp(options.lowLightThreshold ?? DEFAULT_LOW_LIGHT_THRESHOLD, 0.05, 0.3)
  const duplicateThreshold = clamp(options.duplicateThreshold ?? DEFAULT_DUPLICATE_THRESHOLD, 0.015, 0.12)
  const objectUrl = URL.createObjectURL(file)

  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl
    await waitForMetadata(video)

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new VideoIngestionError('INVALID_DURATION', 'Unable to determine the walkthrough duration.')
    }
    if (!video.videoWidth || !video.videoHeight) {
      throw new VideoIngestionError('INVALID_VIDEO_DIMENSIONS', 'Unable to read video dimensions from this walkthrough.')
    }

    const durationMs = Math.round(video.duration * 1000)
    if (durationMs < HARD_DURATION_MIN_MS) {
      throw new VideoIngestionError('VIDEO_TOO_SHORT', 'Walk through the environment for at least a few seconds. A 30–60 second observation works best.')
    }
    if (durationMs > HARD_DURATION_MAX_MS) {
      throw new VideoIngestionError('VIDEO_TOO_LONG', 'Keep the observation under 90 seconds. A 30–60 second walkthrough works best.')
    }

    const timestamps = selectCandidateTimestamps(durationMs, candidateFrames)
    const candidates: CandidateFrame[] = []
    for (const timestampMs of timestamps) {
      await seek(video, timestampMs / 1000)
      candidates.push({ timestampMs, ...captureSignature(video) })
    }

    const brightCandidates = candidates.filter((candidate) => candidate.brightness >= lowLightThreshold)
    const lowLightFramesRejected = candidates.length - brightCandidates.length
    if (brightCandidates.length < minFrames) {
      throw new VideoIngestionError(
        'LOW_LIGHT_VIDEO',
        'This walkthrough is too dark to produce enough reliable evidence. Add light and observe the space again.',
      )
    }

    const selected = selectUsefulCandidates(brightCandidates, durationMs, minFrames, maxFrames, duplicateThreshold)
    if (selected.length < minFrames) {
      throw new VideoIngestionError(
        'INSUFFICIENT_VISUAL_VARIETY',
        'SENTINEL could not find enough distinct views. Move naturally through the space and include different areas in the walkthrough.',
      )
    }

    const encoded = await encodeSelectedFrames(video, selected, id, maxWidth, jpegQuality, maxEncodedBytes)
    const averageBrightness = candidates.reduce((sum, candidate) => sum + candidate.brightness, 0) / candidates.length
    const warnings: string[] = []
    const targetDuration = durationMs >= TARGET_DURATION_MIN_MS && durationMs <= TARGET_DURATION_MAX_MS
    if (!targetDuration) warnings.push('A 30–60 second walkthrough usually gives the most stable environmental coverage.')
    if (lowLightFramesRejected > 0) warnings.push(`${lowLightFramesRejected} low-light candidate frame(s) were excluded.`)
    const duplicateFramesRejected = Math.max(0, brightCandidates.length - selected.length)
    if (duplicateFramesRejected > 0) warnings.push(`${duplicateFramesRejected} duplicate or low-novelty candidate frame(s) were excluded.`)

    return {
      durationMs,
      mimeType,
      frames: encoded.frames,
      diagnostics: {
        targetDuration,
        candidateFrameCount: candidates.length,
        selectedFrameCount: encoded.frames.length,
        duplicateFramesRejected,
        lowLightFramesRejected,
        averageBrightness,
        encodedBytes: encoded.encodedBytes,
        warnings,
      },
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function resolveVideoMimeType(file: File): string | undefined {
  const declared = file.type.trim().toLowerCase()
  if (declared) return declared
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'mp4') return 'video/mp4'
  if (extension === 'mov') return 'video/quicktime'
  if (extension === 'm4v') return 'video/x-m4v'
  if (extension === 'webm') return 'video/webm'
  return undefined
}

function selectCandidateTimestamps(durationMs: number, count: number): number[] {
  const edgePaddingMs = Math.min(700, Math.max(100, Math.round(durationMs * 0.015)))
  const start = Math.min(edgePaddingMs, Math.max(0, durationMs - 100))
  const end = Math.max(start, durationMs - edgePaddingMs)
  if (count <= 1 || end <= start) return [start]
  return Array.from({ length: count }, (_, index) =>
    Math.round(start + (index / (count - 1)) * (end - start)),
  ).filter((value, index, values) => index === 0 || value !== values[index - 1])
}

function selectUsefulCandidates(
  candidates: CandidateFrame[],
  durationMs: number,
  minFrames: number,
  maxFrames: number,
  duplicateThreshold: number,
): CandidateFrame[] {
  const selected: CandidateFrame[] = [candidates[0]]
  const last = candidates[candidates.length - 1]
  if (last && last !== candidates[0] && signatureDifference(last.signature, candidates[0].signature) >= duplicateThreshold * 0.65) {
    selected.push(last)
  }

  while (selected.length < maxFrames) {
    let best: CandidateFrame | undefined
    let bestScore = -1
    let bestNovelty = 0

    for (const candidate of candidates) {
      if (selected.includes(candidate)) continue
      const novelty = Math.min(...selected.map((item) => signatureDifference(candidate.signature, item.signature)))
      const temporalDistance = Math.min(...selected.map((item) => Math.abs(candidate.timestampMs - item.timestampMs))) / Math.max(1, durationMs)
      const score = novelty * 0.82 + temporalDistance * 0.18
      if (score > bestScore) {
        best = candidate
        bestScore = score
        bestNovelty = novelty
      }
    }

    if (!best) break
    const threshold = selected.length < minFrames ? duplicateThreshold * 0.55 : duplicateThreshold
    if (bestNovelty < threshold) break
    selected.push(best)
  }

  return selected.sort((a, b) => a.timestampMs - b.timestampMs)
}

async function encodeSelectedFrames(
  video: HTMLVideoElement,
  selected: CandidateFrame[],
  id: (prefix: string) => string,
  maxWidth: number,
  initialQuality: number,
  maxEncodedBytes: number,
): Promise<EncodedFrames> {
  const passes = [
    { width: maxWidth, quality: initialQuality },
    { width: Math.min(maxWidth, 820), quality: Math.max(0.54, initialQuality - 0.08) },
    { width: Math.min(maxWidth, 720), quality: Math.max(0.5, initialQuality - 0.14) },
    { width: Math.min(maxWidth, 640), quality: 0.48 },
  ]

  for (const pass of passes) {
    const encoded: Array<{ timestampMs: number; uri: string }> = []
    let encodedBytes = 0
    for (const candidate of selected) {
      await seek(video, candidate.timestampMs / 1000)
      const uri = captureFrame(video, pass.width, pass.quality)
      encodedBytes += byteLength(uri)
      encoded.push({ timestampMs: candidate.timestampMs, uri })
    }
    if (encodedBytes <= maxEncodedBytes) {
      return {
        encodedBytes,
        frames: encoded.map((frame) => ({ frameId: id('frame'), timestampMs: frame.timestampMs, uri: frame.uri })),
      }
    }
  }

  throw new VideoIngestionError(
    'FRAME_PAYLOAD_TOO_LARGE',
    'The selected evidence frames are still too large for a reliable scan request. Record at a lower phone resolution and try again.',
  )
}

function captureSignature(video: HTMLVideoElement): { brightness: number; signature: Uint8Array } {
  const width = 32
  const height = 18
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new VideoIngestionError('CANVAS_UNAVAILABLE', 'Canvas rendering is unavailable in this browser.', false)
  context.drawImage(video, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  const signature = new Uint8Array(width * height)
  let luminanceTotal = 0
  for (let pixelIndex = 0, signatureIndex = 0; pixelIndex < pixels.length; pixelIndex += 4, signatureIndex += 1) {
    const luminance = Math.round(0.2126 * pixels[pixelIndex] + 0.7152 * pixels[pixelIndex + 1] + 0.0722 * pixels[pixelIndex + 2])
    signature[signatureIndex] = luminance
    luminanceTotal += luminance
  }
  return { brightness: luminanceTotal / (signature.length * 255), signature }
}

function signatureDifference(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length)
  if (!length) return 1
  let difference = 0
  for (let index = 0; index < length; index += 1) difference += Math.abs(a[index] - b[index])
  return difference / (length * 255)
}

function captureFrame(video: HTMLVideoElement, maxWidth: number, quality: number): string {
  const scale = Math.min(1, maxWidth / video.videoWidth)
  const width = Math.max(1, Math.round(video.videoWidth * scale))
  const height = Math.max(1, Math.round(video.videoHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new VideoIngestionError('CANVAS_UNAVAILABLE', 'Canvas rendering is unavailable in this browser.', false)
  context.drawImage(video, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new VideoIngestionError('VIDEO_METADATA_TIMEOUT', 'The browser could not open this walkthrough in time. Try MP4 or MOV.'))
    }, 12_000)
    const onLoaded = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new VideoIngestionError('VIDEO_DECODE_FAILED', 'The browser could not decode this walkthrough. Try MP4, MOV/M4V, or WebM.')) }
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
  })
}

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new VideoIngestionError('VIDEO_SEEK_TIMEOUT', 'A frame could not be extracted from this walkthrough. Try a shorter MP4 or MOV.'))
    }, 8_000)
    const onSeeked = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new VideoIngestionError('VIDEO_SEEK_FAILED', 'A frame could not be extracted from this walkthrough.')) }
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    const safeSeconds = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.05))
    if (Math.abs(video.currentTime - safeSeconds) < 0.01) {
      cleanup()
      resolve()
      return
    }
    video.currentTime = safeSeconds
  })
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max))
}
