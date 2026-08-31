import type { ScanFrame } from './types'

export interface VideoIngestionOptions {
  maxFrames?: number
  maxWidth?: number
  jpegQuality?: number
}

export interface VideoIngestionResult {
  durationMs: number
  frames: ScanFrame[]
}

/**
 * Extracts a compact, deterministic set of key frames in the browser.
 * Keeping extraction client-side avoids requiring FFmpeg in the Vercel function.
 */
export async function ingestVideoFile(
  file: File,
  id: (prefix: string) => string = (prefix) => `${prefix}_${crypto.randomUUID()}`,
  options: VideoIngestionOptions = {},
): Promise<VideoIngestionResult> {
  if (!file.type.startsWith('video/')) throw new Error('Selected file is not a video')

  const maxFrames = Math.min(24, Math.max(2, options.maxFrames ?? 12))
  const maxWidth = Math.min(1280, Math.max(320, options.maxWidth ?? 960))
  const quality = Math.min(0.9, Math.max(0.45, options.jpegQuality ?? 0.72))
  const objectUrl = URL.createObjectURL(file)

  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl
    await waitForMetadata(video)

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('Unable to determine video duration')
    }

    const durationMs = Math.round(video.duration * 1000)
    const timestamps = selectKeyFrameTimestamps(durationMs, maxFrames)
    const frames: ScanFrame[] = []

    for (const timestampMs of timestamps) {
      await seek(video, timestampMs / 1000)
      const frame = captureFrame(video, maxWidth, quality)
      frames.push({
        frameId: id('frame'),
        timestampMs,
        uri: frame,
      })
    }

    return { durationMs, frames }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function selectKeyFrameTimestamps(durationMs: number, maxFrames: number): number[] {
  if (maxFrames === 1) return [0]
  const last = Math.max(0, durationMs - 80)
  return Array.from({ length: maxFrames }, (_, index) =>
    Math.round((index / (maxFrames - 1)) * last),
  ).filter((value, index, values) => index === 0 || value !== values[index - 1])
}

function captureFrame(video: HTMLVideoElement, maxWidth: number, quality: number): string {
  const scale = Math.min(1, maxWidth / video.videoWidth)
  const width = Math.max(1, Math.round(video.videoWidth * scale))
  const height = Math.max(1, Math.round(video.videoHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable')
  context.drawImage(video, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoaded = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Unable to load video')) }
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
  })
}

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); reject(new Error('Unable to seek video frame')) }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = seconds
  })
}
