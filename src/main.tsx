import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { ingestVideoFile } from './scan/video-ingestion'

interface ScanResponse { scanId: string; frames: Array<{ frameId: string; timestampMs: number }>; observations: Array<{ label: string; description: string; confidence: number }> }

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('Ready')
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [error, setError] = useState('')

  async function handleVideo(file: File) {
    setError('')
    setResult(null)
    try {
      setStatus('Extracting key frames…')
      const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
      const ingestion = await ingestVideoFile(file, id, { maxFrames: 12, maxWidth: 960, jpegQuality: 0.68 })
      setStatus(`Sending ${ingestion.frames.length} evidence frames to SENTINEL…`)

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId: 'office-demo',
          source: { id: id('source'), environmentId: 'office-demo', capturedAt: new Date().toISOString() },
          media: { kind: 'video', uri: `https://local.sentinel/media/${encodeURIComponent(file.name)}`, mimeType: file.type, durationMs: ingestion.durationMs, sizeBytes: file.size },
          extractedFrames: ingestion.frames,
        }),
      })
      const payload = await response.json() as ScanResponse & { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Scan request failed')
      setResult(payload)
      setStatus(`Scan complete · ${payload.observations.length} observation(s)`) 
    } catch (scanError) {
      setStatus('Scan failed')
      setError(scanError instanceof Error ? scanError.message : 'Unknown scan error')
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">SENTINEL / PHYSICAL ENVIRONMENT INTELLIGENCE</div>
        <h1>Give the physical world a memory.</h1>
        <p>Record a walkthrough. SENTINEL extracts key frames, builds evidence, and sends the visual state to Nemotron for perception.</p>
        <div className="actions">
          <button type="button" onClick={() => inputRef.current?.click()}>Scan walkthrough video</button>
          <button type="button" className="secondary" onClick={() => setResult(null)}>Clear</button>
          <input ref={inputRef} hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleVideo(file); event.target.value = '' }} />
        </div>
        <div className="scan-status" role="status">{status}</div>
        {error && <div className="error" role="alert">{error}</div>}
      </section>

      <section className="status-grid" aria-label="Environment status">
        <article><span>Last scan</span><strong>{result ? result.scanId : 'Awaiting walkthrough'}</strong></article>
        <article><span>Frames</span><strong>{result ? result.frames.length : '—'}</strong></article>
        <article><span>Observations</span><strong>{result ? result.observations.length : '—'}</strong></article>
        <article><span>Memory</span><strong>{result ? 'Evidence captured' : 'Ready'}</strong></article>
      </section>

      {result && <section className="results">
        <div className="eyebrow">PERCEPTION / EVIDENCE</div>
        <h2>What SENTINEL saw</h2>
        {result.observations.length === 0 ? <p>No grounded observations were returned.</p> : result.observations.map((observation, index) => (
          <article key={`${observation.label}-${index}`}><strong>{observation.label}</strong><span>{observation.description}</span><small>Confidence {Math.round(observation.confidence * 100)}%</small></article>
        ))}
      </section>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
