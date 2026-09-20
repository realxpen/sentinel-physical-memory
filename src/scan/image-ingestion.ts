export interface ImageIngestionOptions {
  maxWidth?: number
  jpegQuality?: number
  maxBytes?: number
}

export interface ImageIngestionResult {
  uri: string
  width: number
  height: number
  sizeBytes: number
}

export class ImageIngestionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImageIngestionError'
    this.code = code
  }
}

const DEFAULT_MAX_WIDTH = 1280
const DEFAULT_QUALITY = 0.78
const DEFAULT_MAX_BYTES = 900_000

/** Phone-first image ingestion: resize/compress camera photos before /api/scan. */
export async function ingestImageFile(file: File, options: ImageIngestionOptions = {}): Promise<ImageIngestionResult> {
  if (!file.type.startsWith('image/')) throw new ImageIngestionError('UNSUPPORTED_IMAGE', 'Choose a photo or image file.')

  const maxWidth = clampInteger(options.maxWidth ?? DEFAULT_MAX_WIDTH, 480, 1920)
  const maxBytes = clampInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, 200_000, 1_500_000)
  let quality = clamp(options.jpegQuality ?? DEFAULT_QUALITY, 0.45, 0.9)
  const loaded = await loadImage(file)
  const image = loaded.image
  let targetWidth = Math.min(image.naturalWidth, maxWidth)
  let targetHeight = Math.max(1, Math.round(image.naturalHeight * targetWidth / image.naturalWidth))

  if (!Number.isFinite(targetWidth) || targetWidth <= 0 || !Number.isFinite(targetHeight) || targetHeight <= 0) {
    URL.revokeObjectURL(loaded.objectUrl)
    throw new ImageIngestionError('INVALID_IMAGE_DIMENSIONS', 'The selected photo has invalid dimensions.')
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(targetWidth))
    canvas.height = Math.max(1, Math.round(targetHeight))
    const context = canvas.getContext('2d')
    if (!context) {
      URL.revokeObjectURL(loaded.objectUrl)
      throw new ImageIngestionError('CANVAS_UNAVAILABLE', 'Photo processing is unavailable in this browser.')
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const uri = canvas.toDataURL('image/jpeg', quality)
    const sizeBytes = dataUrlByteLength(uri)
    if (sizeBytes <= maxBytes) {
      URL.revokeObjectURL(loaded.objectUrl)
      return { uri, width: canvas.width, height: canvas.height, sizeBytes }
    }
    if (quality > 0.52) quality = Math.max(0.5, quality - 0.08)
    else {
      targetWidth = Math.max(480, Math.round(targetWidth * 0.84))
      targetHeight = Math.max(1, Math.round(image.naturalHeight * targetWidth / image.naturalWidth))
    }
  }

  URL.revokeObjectURL(loaded.objectUrl)
  throw new ImageIngestionError('IMAGE_TOO_LARGE', 'This photo could not be compressed enough for a reliable scan. Try a closer or simpler photo.')
}

async function loadImage(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = objectUrl
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      reject(new ImageIngestionError('IMAGE_DECODE_TIMEOUT', 'The browser could not open this photo in time. Try taking another photo.'))
    }, 12_000)
    image.onload = () => { window.clearTimeout(timeout); resolve() }
    image.onerror = () => {
      window.clearTimeout(timeout)
      URL.revokeObjectURL(objectUrl)
      reject(new ImageIngestionError('IMAGE_DECODE_FAILED', 'The browser could not decode this photo. Try JPEG, PNG, WebP, or take a new camera photo.'))
    }
  })
  return { image, objectUrl }
}

function dataUrlByteLength(uri: string): number {
  const comma = uri.indexOf(',')
  if (comma < 0) return new TextEncoder().encode(uri).byteLength
  const base64 = uri.slice(comma + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding)
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }
function clampInteger(value: number, min: number, max: number): number { return Math.round(clamp(value, min, max)) }
