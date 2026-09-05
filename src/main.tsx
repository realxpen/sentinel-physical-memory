import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './integration.css'
import type { AskBuildingResponse, EnvironmentalDiff, EnvironmentalMemory, EnvironmentalState } from './domain/sentinel'
import { ingestVideoFile } from './scan/video-ingestion'

interface Observation {
  label: string
  description: string
  confidence: number
}

interface ScanResponse {
  scanId: string
  frames: Array<{ frameId: string; timestampMs: number }>
  observations: Observation[]
  state: EnvironmentalState
  diff?: EnvironmentalDiff
  memory: EnvironmentalMemory
}

type View = 'memory' | 'observe' | 'changes'

const previewChanges = [
  { mark: '+', type: 'Added', detail: 'New conditions appear here after a second observation.' },
  { mark: '↔', type: 'Moved', detail: 'SENTINEL compares remembered positions between scans.' },
  { mark: '✓', type: 'Resolved', detail: 'Verified changes close the physical-world memory loop.' },
]

function SentinelMark({ active = false }: { active?: boolean }) {
  return <div className="brand" aria-label="SENTINEL"><span>SENTINEL</span><i className={active ? 'brand-dot active' : 'brand-dot'} /></div>
}

function Confidence({ value }: { value: number }) {
  const percent = Math.round(value * 100)
  return <div className="confidence" aria-label={`Confidence ${percent}%`}><span>Observed confidence</span><div className="confidence-track"><i style={{ width: `${percent}%` }} /></div><strong>{percent}%</strong></div>
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('Ready to observe')
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [memory, setMemory] = useState<EnvironmentalMemory | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('memory')
  const [selectedObservation, setSelectedObservation] = useState<number | null>(null)
  const [question, setQuestion] = useState('')
  const [askStatus, setAskStatus] = useState('')
  const [answer, setAnswer] = useState<AskBuildingResponse | null>(null)

  const isWorking = status.startsWith('Observing') || status.startsWith('Understanding') || status.startsWith('Remembering')
  const latestDiff = result?.diff ?? memory?.diffs.at(-1)

  async function handleVideo(file: File) {
    setError('')
    setResult(null)
    setAnswer(null)
    setView('observe')
    setSelectedObservation(null)

    try {
      setStatus('Observing · extracting evidence')
      const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
      const ingestion = await ingestVideoFile(file, id, { maxFrames: 12, maxWidth: 960, jpegQuality: 0.68 })
      setStatus(`Understanding · ${ingestion.frames.length} evidence frames`)

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId: 'office-demo',
          source: { id: id('source'), environmentId: 'office-demo', capturedAt: new Date().toISOString() },
          media: { kind: 'video', uri: `https://local.sentinel/media/${encodeURIComponent(file.name)}`, mimeType: file.type, durationMs: ingestion.durationMs, sizeBytes: file.size },
          extractedFrames: ingestion.frames,
          memory,
        }),
      })

      setStatus('Remembering · grounding observations')
      const payload = await response.json() as ScanResponse & { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Scan request failed')
      setResult(payload)
      setMemory(payload.memory)
      setStatus(payload.diff ? `${payload.diff.changes.length} supported change(s) remembered` : 'This space is now remembered')
      setView(payload.diff ? 'changes' : 'memory')
    } catch (scanError) {
      setStatus('Observation interrupted')
      setError(scanError instanceof Error ? scanError.message : 'Unknown scan error')
    }
  }

  async function askBuilding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    if (!memory) {
      setAskStatus('Observe this environment first so SENTINEL has grounded memory to reason over.')
      return
    }

    setAskStatus('Reasoning across environmental memory…')
    setAnswer(null)
    try {
      const response = await fetch('/api/ask-building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId: memory.environment.id, question: trimmed, stateId: memory.environment.currentStateId, memory }),
      })
      const payload = await response.json() as AskBuildingResponse & { message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Ask request failed')
      setAnswer(payload)
      setAskStatus('')
      setView('memory')
    } catch (askError) {
      setAskStatus(askError instanceof Error ? askError.message : 'Unable to ask SENTINEL')
    }
  }

  const observation = selectedObservation === null ? null : result?.observations[selectedObservation]

  return (
    <main className={`app view-${view}`}>
      <header className="topbar">
        <SentinelMark active={isWorking} />
        <div className="environment-status"><span className="environment-name">Office 01</span><span>{memory ? `memory v${memory.states.length}` : 'demo environment'}</span></div>
        <button className="profile-button" type="button" aria-label="Profile">XP</button>
      </header>

      <nav className="desktop-rail" aria-label="Primary navigation">
        <button className={view === 'memory' ? 'active' : ''} type="button" onClick={() => setView('memory')}><span>◎</span><em>Memory</em></button>
        <button className={view === 'observe' ? 'active' : ''} type="button" onClick={() => setView('observe')}><span>◉</span><em>Observe</em></button>
        <button className={view === 'changes' ? 'active' : ''} type="button" onClick={() => setView('changes')}><span>↺</span><em>Changes</em></button>
      </nav>

      {view === 'memory' && <section className="memory-view">
        <div className="hero-copy">
          <div className="eyebrow">PHYSICAL MEMORY / OFFICE 01</div>
          <h1>{memory ? 'This space remembers.' : 'Give this place a memory.'}</h1>
          <p>{memory ? `SENTINEL holds ${memory.states.length} grounded environmental state${memory.states.length === 1 ? '' : 's'}, ${memory.objects.length} remembered objects and ${memory.issues.length} tracked conditions.` : 'Walk through your environment once. SENTINEL extracts visual evidence, understands what it can support, and begins a persistent environmental memory.'}</p>
        </div>

        {answer && <section className="answer-panel" aria-live="polite">
          <span className="eyebrow">SENTINEL / CONCLUSION</span>
          <h2>{answer.answer}</h2>
          <div className="answer-meta"><span>Confidence {Math.round(answer.confidence * 100)}%</span><span>{answer.evidenceIds.length} evidence reference(s)</span><span>State {answer.stateId}</span></div>
        </section>}

        <div className="environment-stage" aria-label="Environmental memory canvas">
          <div className="ambient-orb orb-one" /><div className="ambient-orb orb-two" /><div className="stage-grid" />
          <div className="space-label reception"><span>Reception</span><small>remembered area</small></div>
          <div className="space-label workspace"><span>Workspace</span><small>{memory ? `${memory.observations.length} grounded observations` : 'awaiting first observation'}</small></div>
          <div className="space-label server"><span>Server Room</span><small>spatial memory</small></div>
          <div className="memory-node node-a" /><div className="memory-node node-b" /><div className="memory-node node-c" /><div className="memory-path path-a" /><div className="memory-path path-b" />
          <div className="stage-caption"><span>{memory ? 'LIVE MEMORY' : 'MEMORY CANVAS'}</span><strong>{memory ? `${memory.evidence.length} evidence records across ${memory.states.length} state(s)` : 'Observe the environment to create its first state'}</strong></div>
        </div>

        <div className="memory-summary">
          <div><span>Since you were last here</span><strong>{latestDiff ? latestDiff.summary : memory ? 'No comparison yet' : 'No previous state yet'}</strong></div>
          <button className="observe-cta" type="button" onClick={() => inputRef.current?.click()}><span className="observe-orb"><i /></span><span><strong>{memory ? 'Observe again' : 'Observe environment'}</strong><small>{memory ? 'Create the next physical state' : 'Create a new physical memory'}</small></span></button>
        </div>

        {result && <section className="evidence-section">
          <div className="section-heading"><div><span className="eyebrow">EVIDENCE / CURRENT STATE</span><h2>What SENTINEL observed.</h2></div><span className="scan-id">{result.scanId}</span></div>
          <div className="observation-list">{result.observations.length === 0 ? <div className="empty-observation">No grounded observations were returned for this walkthrough.</div> : result.observations.map((item, index) => <button className="observation-row" type="button" key={`${item.label}-${index}`} onClick={() => setSelectedObservation(index)}><span className="observation-index">{String(index + 1).padStart(2, '0')}</span><span className="observation-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="observation-confidence">{Math.round(item.confidence * 100)}%</span><span className="arrow">↗</span></button>)}</div>
        </section>}
      </section>}

      {view === 'observe' && <section className="observe-view">
        <div className="observe-camera"><div className="camera-noise" /><div className="scan-line" /><div className="camera-topline"><SentinelMark active /><span>{isWorking ? status : 'OBSERVATION MODE'}</span></div><div className="focus-frame focus-one"><span>Workspace</span></div><div className="focus-frame focus-two"><span>Evidence region</span></div><div className="observe-message"><span className="eyebrow">LIVE STATE</span><h2>{isWorking ? status : memory ? 'Observe what changed.' : 'Move naturally through the environment.'}</h2><p>SENTINEL extracts selected key frames as evidence, grounds its observations, then updates the persistent environmental state.</p></div><button className="capture-button" type="button" onClick={() => inputRef.current?.click()} aria-label="Choose walkthrough video"><span><i /></span><strong>{isWorking ? 'Observing' : memory ? 'Rescan environment' : 'Begin observation'}</strong></button></div>
        {error && <div className="error" role="alert"><strong>Observation interrupted</strong><span>{error}</span></div>}
      </section>}

      {view === 'changes' && <section className="changes-view">
        <div className="hero-copy compact"><div className="eyebrow">REALITY DIFF / PHYSICAL HISTORY</div><h1>What changed.</h1><p>{latestDiff ? latestDiff.summary : memory ? 'Observe the same environment again. SENTINEL will compare the new grounded state with the one it remembers.' : 'Reality Diff becomes available after SENTINEL has at least two observations of the same environment.'}</p></div>
        <div className="diff-stage"><div className="diff-half previous"><span>PREVIOUS</span><strong>{latestDiff ? latestDiff.fromStateId : memory?.environment.currentStateId ?? 'No state'}</strong></div><div className="diff-divider"><i /></div><div className="diff-half current"><span>{latestDiff ? 'CURRENT' : 'NEXT OBSERVATION'}</span><strong>{latestDiff ? latestDiff.toStateId : 'Awaiting rescan'}</strong></div><div className="diff-label">BEFORE <b>↔</b> AFTER</div></div>
        <div className="change-list" aria-label="Environmental changes">{latestDiff ? latestDiff.changes.length === 0 ? <div className="empty-diff">No supported environmental changes were detected between these states.</div> : latestDiff.changes.map((change) => <div className="change-row" key={change.id}><span className={`change-mark ${change.type}`}>{change.type === 'added' ? '+' : change.type === 'removed' ? '−' : change.type === 'moved' ? '↔' : change.type === 'resolved' ? '✓' : '△'}</span><div><strong>{change.title}</strong><small>{change.description} · {Math.round(change.confidence * 100)}% confidence</small></div></div>) : <><div className="preview-label">INTERACTION PREVIEW — NOT DETECTED EVENTS</div>{previewChanges.map((change) => <div className="change-row" key={change.type}><span className={`change-mark ${change.type.toLowerCase()}`}>{change.mark}</span><div><strong>{change.type}</strong><small>{change.detail}</small></div></div>)}</>}</div>
        <button className="wide-observe" type="button" onClick={() => inputRef.current?.click()}><span>Observe this space again</span><span>Build the next environmental state ↗</span></button>
      </section>}

      {observation && <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedObservation(null)}><aside className="evidence-drawer" role="dialog" aria-modal="true" aria-label={`${observation.label} evidence`} onClick={(event) => event.stopPropagation()}><button className="drawer-close" type="button" onClick={() => setSelectedObservation(null)}>×</button><span className="eyebrow">OBSERVED / EVIDENCE-BACKED</span><h2>{observation.label}</h2><p>{observation.description}</p><Confidence value={observation.confidence} /><div className="evidence-rule" /><div className="evidence-note"><span>What this means</span><strong>SENTINEL stores this as an observation, not a professional diagnosis.</strong><p>Interpretation and recommended action remain separate from what the visual evidence directly supports.</p></div></aside></div>}

      <form className={`ask-bar ${answer ? 'has-answer' : ''}`} role="search" onSubmit={askBuilding}>
        <span className="ask-spark">✦</span>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={memory ? 'Ask this environment…' : 'Observe first, then ask this environment…'} aria-label="Ask this environment" />
        <button type="submit" aria-label="Ask SENTINEL" disabled={!question.trim() || !!askStatus}>↗</button>
        {askStatus && <span className="ask-status">{askStatus}</span>}
      </form>

      <nav className="mobile-nav" aria-label="Primary navigation"><button className={view === 'memory' ? 'active' : ''} type="button" onClick={() => setView('memory')}><span>◎</span><small>Memory</small></button><button className={view === 'observe' ? 'active observe-nav' : 'observe-nav'} type="button" onClick={() => setView('observe')}><span>◉</span><small>Observe</small></button><button className={view === 'changes' ? 'active' : ''} type="button" onClick={() => setView('changes')}><span>↺</span><small>Changes</small></button></nav>

      <input ref={inputRef} hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleVideo(file); event.target.value = '' }} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
