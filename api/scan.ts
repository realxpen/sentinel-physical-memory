import { createNebiusNemotronAdapter } from '../src/ai/nebius.js'
import type { ScanArtifact, ScanFrame, ScanInput } from '../src/scan/types.js'
import { ScanPipeline } from '../src/scan/pipeline.js'
import { getMemoryPersistenceMode, getRuntimeEnvironmentalMemoryRepository } from '../server/memory-repository.js'

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }
type Response = { status(code: number): Response; json(body: unknown): void }

const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_VIDEO_FRAMES = 12
const MIN_VIDEO_FRAMES = 4
const MIN_VIDEO_DURATION_MS = 5_000
const MAX_VIDEO_DURATION_MS = 90_000
const MAX_SOURCE_VIDEO_BYTES = 300 * 1024 * 1024
const MAX_FRAME_DATA_URL_BYTES = 700 * 1024
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'])
const DEFAULT_PERCEPTION_MODEL = 'openbmb/MiniCPM-V-4_5'

class ScanRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ScanRequestError'
    this.status = status
    this.code = code
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST /api/scan' })
  const configuredOrigin = process.env.SENTINEL_ALLOWED_ORIGIN
  const origin = header(req, 'origin')
  if (configuredOrigin && origin && origin !== configuredOrigin) return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })
  const apiKey = process.env.NEBIUS_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'NEBIUS_NOT_CONFIGURED', message: 'Server inference credentials are not configured' })

  try {
    const rawSize = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8')
    if (rawSize > MAX_BODY_BYTES) {
      throw new ScanRequestError(413, 'PAYLOAD_TOO_LARGE', 'Scan request exceeds the 4 MB SENTINEL safety budget. Use fewer or smaller evidence frames.')
    }

    const input = parseScanInput(req.body)
    const repository = getRuntimeEnvironmentalMemoryRepository()
    const adapter = createNebiusNemotronAdapter(apiKey, {
      baseUrl: process.env.NEBIUS_TOKEN_FACTORY_BASE_URL,
      model: process.env.NEBIUS_PERCEPTION_MODEL?.trim() || DEFAULT_PERCEPTION_MODEL,
      artifactResolver: {
        resolve: async (artifact: ScanArtifact) => ({
          artifactId: artifact.artifactId,
          mimeType: artifact.kind === 'frame' ? 'image/jpeg' : input.media.mimeType,
          uri: artifact.uri,
        }),
      },
    })

    const pipeline = new ScanPipeline({ model: adapter, memoryRepository: repository })
    const result = await pipeline.run(input)
    const updatedMemory = await pipeline.getMemory(input.environmentId)
    if (!updatedMemory) throw new Error('Environmental memory was not created')

    return res.status(200).json({
      scanId: result.scanId,
      environmentId: result.environmentId,
      sourceId: result.source.id,
      completedAt: result.completedAt,
      persistence: getMemoryPersistenceMode(),
      frames: result.frames.map(({ frameId, timestampMs }) => ({ frameId, timestampMs })),
      artifacts: result.artifacts.filter((artifact) => artifact.kind === 'frame').map(({ artifactId, frameId }) => ({ artifactId, frameId })),
      observations: result.observations,
      state: result.state,
      diff: result.diff,
      memory: updatedMemory,
    })
  } catch (error) {
    if (error instanceof ScanRequestError) {
      console.warn('SENTINEL_SCAN_REJECTED', { code: error.code, message: error.message })
      return res.status(error.status).json({ error: error.code, message: error.message })
    }
    const message = error instanceof Error ? error.message : 'Unknown scan error'
    console.error('SENTINEL_SCAN_FAILED', summarizeError(error))
    return res.status(400).json({ error: 'SCAN_FAILED', message })
  }
}

function parseScanInput(value: unknown): ScanInput {
  if (!isRecord(value)) throw new ScanRequestError(400, 'INVALID_REQUEST', 'Request body must be a JSON object')
  const environmentId = requiredString(value.environmentId, 'environmentId')
  const sourceValue = record(value.source, 'source')
  const sourceId = requiredString(sourceValue.id, 'source.id')
  const capturedAt = requiredString(sourceValue.capturedAt, 'source.capturedAt')
  const media = record(value.media, 'media')
  const kind = media.kind
  if (kind !== 'image' && kind !== 'video') throw new ScanRequestError(400, 'INVALID_MEDIA', 'media.kind must be image or video')
  const uri = requiredString(media.uri, 'media.uri')
  const mimeType = resolveMediaMimeType(media.mimeType, uri, kind)
  const durationMs = optionalNumber(media.durationMs)
  const sizeBytes = optionalNumber(media.sizeBytes)

  if (kind === 'image' && !ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new ScanRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Supported images are JPEG, PNG, and WebP')
  }
  if (kind === 'video') {
    if (!ALLOWED_VIDEO_MIME.has(mimeType)) {
      throw new ScanRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Supported walkthrough videos are MP4, MOV/M4V, and WebM')
    }
    if (durationMs === undefined) throw new ScanRequestError(400, 'INVALID_MEDIA', 'Video media requires durationMs')
    if (durationMs < MIN_VIDEO_DURATION_MS) throw new ScanRequestError(422, 'VIDEO_TOO_SHORT', 'Walkthrough video is too short to provide reliable environmental coverage')
    if (durationMs > MAX_VIDEO_DURATION_MS) throw new ScanRequestError(422, 'VIDEO_TOO_LONG', 'Walkthrough video must be 90 seconds or shorter')
    if (sizeBytes !== undefined && sizeBytes > MAX_SOURCE_VIDEO_BYTES) {
      throw new ScanRequestError(413, 'SOURCE_VIDEO_TOO_LARGE', 'Source walkthrough exceeds the supported 300 MB browser-ingestion limit')
    }
  }

  if (!isSafeMediaUri(uri)) throw new ScanRequestError(400, 'INVALID_MEDIA_URI', 'media.uri must be an HTTPS URL or an image data URL')
  if (sourceValue.environmentId !== undefined && sourceValue.environmentId !== environmentId) {
    throw new ScanRequestError(400, 'ENVIRONMENT_MISMATCH', 'source.environmentId does not match environmentId')
  }

  const extractedFrames = kind === 'video' ? parseFrames(value.extractedFrames, durationMs ?? 0) : undefined
  if (kind === 'video' && (!extractedFrames || extractedFrames.length === 0)) {
    throw new ScanRequestError(400, 'VIDEO_FRAMES_REQUIRED', 'Video requires extractedFrames')
  }

  return {
    environmentId,
    source: { id: sourceId, environmentId, modality: kind, uri, capturedAt, durationMs },
    media: { kind, uri, mimeType, durationMs, sizeBytes, extractedFrames },
    options: { maxFrames: extractedFrames?.length ?? 1, sampleIntervalMs: 2000, preserveAudio: false },
  }
}

function parseFrames(value: unknown, durationMs: number): ScanFrame[] {
  if (!Array.isArray(value)) throw new ScanRequestError(400, 'INVALID_FRAMES', 'extractedFrames must be an array')
  if (value.length < MIN_VIDEO_FRAMES) {
    throw new ScanRequestError(422, 'TOO_FEW_FRAMES', `At least ${MIN_VIDEO_FRAMES} evidence frames are required for a video walkthrough`)
  }
  if (value.length > MAX_VIDEO_FRAMES) {
    throw new ScanRequestError(422, 'TOO_MANY_FRAMES', `A maximum of ${MAX_VIDEO_FRAMES} video frames is supported`)
  }

  const ids = new Set<string>()
  let previousTimestamp = -1
  return value.map((item, index) => {
    const frame = record(item, `extractedFrames[${index}]`)
    const frameId = requiredString(frame.frameId, `extractedFrames[${index}].frameId`)
    if (ids.has(frameId)) throw new ScanRequestError(400, 'DUPLICATE_FRAME_ID', `Duplicate frameId ${frameId}`)
    ids.add(frameId)

    const timestampMs = optionalNumber(frame.timestampMs)
    if (timestampMs === undefined) throw new ScanRequestError(400, 'INVALID_FRAME_TIMESTAMP', `extractedFrames[${index}].timestampMs is required`)
    if (timestampMs < previousTimestamp) throw new ScanRequestError(400, 'INVALID_FRAME_ORDER', 'extractedFrames must be ordered by timestampMs')
    if (timestampMs > durationMs + 250) throw new ScanRequestError(400, 'INVALID_FRAME_TIMESTAMP', `extractedFrames[${index}] occurs after the video duration`)
    previousTimestamp = timestampMs

    const uri = requiredString(frame.uri, `extractedFrames[${index}].uri`)
    const frameMime = dataUrlMime(uri)
    if (!frameMime || !ALLOWED_IMAGE_MIME.has(frameMime)) {
      throw new ScanRequestError(415, 'UNSUPPORTED_FRAME_TYPE', `extractedFrames[${index}] must be a JPEG, PNG, or WebP data URL`)
    }
    if (Buffer.byteLength(uri, 'utf8') > MAX_FRAME_DATA_URL_BYTES) {
      throw new ScanRequestError(413, 'FRAME_TOO_LARGE', `extractedFrames[${index}] exceeds the per-frame evidence budget`)
    }

    return { frameId, timestampMs, uri }
  })
}

function resolveMediaMimeType(value: unknown, uri: string, kind: 'image' | 'video'): string {
  if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase()

  const lowerUri = decodeURIComponent(uri.split('?')[0] ?? uri).toLowerCase()
  if (kind === 'video') {
    if (lowerUri.endsWith('.mp4')) return 'video/mp4'
    if (lowerUri.endsWith('.mov')) return 'video/quicktime'
    if (lowerUri.endsWith('.m4v')) return 'video/x-m4v'
    if (lowerUri.endsWith('.webm')) return 'video/webm'
  }
  if (kind === 'image') {
    if (lowerUri.endsWith('.jpg') || lowerUri.endsWith('.jpeg')) return 'image/jpeg'
    if (lowerUri.endsWith('.png')) return 'image/png'
    if (lowerUri.endsWith('.webp')) return 'image/webp'
  }

  throw new ScanRequestError(400, 'INVALID_MEDIA', 'media.mimeType is required when the media filename does not identify a supported format')
}

function summarizeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) }
  const result: Record<string, unknown> = { name: error.name, message: error.message }
  const candidate = error as Error & { code?: unknown; cause?: unknown; sourceError?: unknown }
  if (typeof candidate.code === 'string') result.code = candidate.code

  const cause = candidate.cause ?? candidate.sourceError
  if (cause instanceof Error) {
    result.cause = { name: cause.name, message: cause.message, code: typeof (cause as Error & { code?: unknown }).code === 'string' ? (cause as Error & { code?: string }).code : undefined }
  } else if (isRecord(cause)) {
    result.cause = {
      code: typeof cause.code === 'string' ? cause.code : undefined,
      message: typeof cause.message === 'string' ? cause.message : undefined,
    }
  }
  return result
}

function dataUrlMime(uri: string): string | undefined {
  const match = uri.match(/^data:([^;,]+);base64,/i)
  return match?.[1]?.toLowerCase()
}

function isSafeMediaUri(uri: string) { return uri.startsWith('https://') || uri.startsWith('data:image/') }
function requiredString(value: unknown, path: string): string { if (typeof value !== 'string' || !value.trim()) throw new ScanRequestError(400, 'INVALID_REQUEST', `${path} must be a non-empty string`); return value.trim() }
function optionalNumber(value: unknown): number | undefined { if (value === undefined || value === null) return undefined; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new ScanRequestError(400, 'INVALID_REQUEST', 'numeric media metadata must be a non-negative finite number'); return value }
function record(value: unknown, path: string): Record<string, unknown> { if (!isRecord(value)) throw new ScanRequestError(400, 'INVALID_REQUEST', `${path} must be an object`); return value }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function header(req: Request, name: string) { const value = req.headers?.[name]; return Array.isArray(value) ? value[0] : value }
