import { createNebiusNemotronAdapter } from '../src/ai/nebius'
import { validatePerceptionForScan } from '../src/ai/perception-schema'
import type { ScanInput } from '../src/scan/types'
import { ScanPipeline } from '../src/scan/pipeline'

type Request = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown }
type Response = { status(code: number): Response; json(body: unknown): void; setHeader(name: string, value: string): void }

const MAX_BODY_BYTES = 6 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST /api/scan' })

  const configuredOrigin = process.env.SENTINEL_ALLOWED_ORIGIN
  const origin = header(req, 'origin')
  if (configuredOrigin && origin && origin !== configuredOrigin) return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })

  const apiKey = process.env.NEBIUS_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'NEBIUS_NOT_CONFIGURED', message: 'Server inference credentials are not configured' })

  try {
    const rawSize = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8')
    if (rawSize > MAX_BODY_BYTES) return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Scan request exceeds 6 MB' })

    const input = parseScanInput(req.body)
    if (input.media.kind === 'video') return res.status(422).json({ error: 'VIDEO_FRAME_EXTRACTION_REQUIRED', message: 'Video scanning is supported by the domain contract, but server-side frame extraction must be enabled before live video inference.' })

    const adapter = createNebiusNemotronAdapter(apiKey, {
      baseUrl: process.env.NEBIUS_TOKEN_FACTORY_BASE_URL,
      model: process.env.NEBIUS_NEMOTRON_MODEL,
      artifactResolver: { resolve: async (artifact) => ({ artifactId: artifact.artifactId, mimeType: input.media.mimeType, uri: artifact.uri }) },
    })

    const pipeline = new ScanPipeline({ model: adapter })
    const result = await pipeline.run(input)

    // Re-validate scan-level identity after model inference before returning data to the client.
    const perception = adapter ? await Promise.resolve(result.observations) : []
    validatePerceptionForScan({ sourceId: input.source.id, observations: perception, objects: [], relations: [], evidence: [] }, input.environmentId, input.source.id)

    return res.status(200).json({
      scanId: result.scanId,
      environmentId: result.environmentId,
      sourceId: result.source.id,
      completedAt: result.completedAt,
      frames: result.frames,
      observations: result.observations,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scan error'
    return res.status(400).json({ error: 'SCAN_FAILED', message })
  }
}

function parseScanInput(value: unknown): ScanInput {
  if (!isRecord(value)) throw new Error('Request body must be a JSON object')
  const environmentId = requiredString(value.environmentId, 'environmentId')
  const sourceValue = record(value.source, 'source')
  const sourceId = requiredString(sourceValue.id, 'source.id')
  const capturedAt = requiredString(sourceValue.capturedAt, 'source.capturedAt')
  const media = record(value.media, 'media')
  const kind = media.kind
  if (kind !== 'image' && kind !== 'video') throw new Error('media.kind must be image or video')
  const uri = requiredString(media.uri, 'media.uri')
  const mimeType = requiredString(media.mimeType, 'media.mimeType')
  if (kind === 'image' && !ALLOWED_MIME.has(mimeType)) throw new Error('Unsupported image MIME type')
  if (!isSafeMediaUri(uri)) throw new Error('media.uri must be an HTTPS URL or a data URL')
  if (sourceValue.environmentId !== undefined && sourceValue.environmentId !== environmentId) throw new Error('source.environmentId does not match environmentId')

  return {
    environmentId,
    source: { id: sourceId, environmentId, modality: kind, uri, capturedAt, durationMs: optionalNumber(media.durationMs) },
    media: { kind, uri, mimeType, durationMs: optionalNumber(media.durationMs), sizeBytes: optionalNumber(media.sizeBytes) },
    options: { maxFrames: 1, sampleIntervalMs: 2000, preserveAudio: false },
  }
}

function isSafeMediaUri(uri: string) { return uri.startsWith('https://') || uri.startsWith('data:image/') }
function requiredString(value: unknown, path: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`); return value }
function optionalNumber(value: unknown): number | undefined { if (value === undefined || value === null) return undefined; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('numeric media metadata must be a non-negative finite number'); return value }
function record(value: unknown, path: string): Record<string, unknown> { if (!isRecord(value)) throw new Error(`${path} must be an object`); return value }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function header(req: Request, name: string) { const value = req.headers?.[name]; return Array.isArray(value) ? value[0] : value }
