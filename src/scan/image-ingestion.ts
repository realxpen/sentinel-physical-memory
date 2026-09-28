export interface ImageIngestionOptions {
  maxWidth?: number
  jpegQuality?: number
  maxBytes?: number
}

export interface ImageDetailFrame {
  label: string
  uri: string
  width: number
  height: number
  sizeBytes: number
}

export interface ImageIngestionResult {
  uri: string
  width: number
  height: number
  sizeBytes: number
  detailFrames: ImageDetailFrame[]
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
      const detailFrames = createDetailFrames(image)
      URL.revokeObjectURL(loaded.objectUrl)
      return { uri, width: canvas.width, height: canvas.height, sizeBytes, detailFrames }
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

function createDetailFrames(image: HTMLImageElement): ImageDetailFrame[] {
  // Four overlapping crops make small localized details materially larger to the
  // vision model while preserving the full image as the canonical source.
  // These are not separate observations in time; they are alternate views of the
  // same capture and are used only by the detail-audit pass.
  const regions = [
    { label: 'top-left', x: 0, y: 0 },
    { label: 'top-right', x: 0.4, y: 0 },
    { label: 'bottom-left', x: 0, y: 0.4 },
    { label: 'bottom-right', x: 0.4, y: 0.4 },
  ]
  const cropWidth = Math.max(1, Math.round(image.naturalWidth * 0.6))
  const cropHeight = Math.max(1, Math.round(image.naturalHeight * 0.6))

  return regions.flatMap((region): ImageDetailFrame[] => {
    const sourceX = Math.min(Math.max(0, Math.round(image.naturalWidth * region.x)), Math.max(0, image.naturalWidth - cropWidth))
    const sourceY = Math.min(Math.max(0, Math.round(image.naturalHeight * region.y)), Math.max(0, image.naturalHeight - cropHeight))
    const outputWidth = Math.min(960, Math.max(640, cropWidth))
    const outputHeight = Math.max(1, Math.round(cropHeight * outputWidth / cropWidth))
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return []

    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    )

    let quality = 0.74
    let uri = canvas.toDataURL('image/jpeg', quality)
    let sizeBytes = dataUrlByteLength(uri)
    while (sizeBytes > 280_000 && quality > 0.5) {
      quality -= 0.06
      uri = canvas.toDataURL('image/jpeg', quality)
      sizeBytes = dataUrlByteLength(uri)
    }

    if (sizeBytes > 320_000) return []
    return [{ label: region.label, uri, width: outputWidth, height: outputHeight, sizeBytes }]
  })
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
