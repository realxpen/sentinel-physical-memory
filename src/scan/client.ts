import type { ScanResult } from './types'

export interface ScanUpload { environmentId: string; sourceId: string; file: File }

export async function scanImage(upload: ScanUpload): Promise<ScanResult> {
  if (!upload.file.type.startsWith('image/')) throw new Error('SENTINEL currently accepts images for live inference; video frame extraction is the next pipeline stage.')
  const uri = await fileToDataUrl(upload.file)
  const response = await fetch('/api/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      environmentId: upload.environmentId,
      source: { id: upload.sourceId, environmentId: upload.environmentId, capturedAt: new Date().toISOString() },
      media: { kind: 'image', uri, mimeType: upload.file.type, sizeBytes: upload.file.size },
    }),
  })
  const payload = await response.json() as unknown
  if (!response.ok) throw new Error(readApiError(payload))
  return payload as ScanResult
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read scan file'))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not encode scan file'))
    reader.readAsDataURL(file)
  })
}

function readApiError(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string') return value.message
  return 'SENTINEL scan failed'
}
