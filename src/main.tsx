import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './integration.css'
import './environment.css'
import './history.css'
import type { AskBuildingResponse, Change, EnvironmentalCondition, EnvironmentalDiff, EnvironmentalMemory, EnvironmentalState, EnvironmentalStateSnapshot, EnvironmentRelation, EnvironmentType, Observation, SpatialObject } from './domain/sentinel'
import type { EnvironmentalStateHistoryEntry, EnvironmentalStateHistoryRecord } from './memory/history'
import { changesForPresentation, presentedChangeSummary } from './memory/change-presentation'
import { createEnvironmentProfile, DEFAULT_ENVIRONMENT, ENVIRONMENT_TYPES, loadActiveEnvironmentId, loadEnvironmentDirectory, saveActiveEnvironmentId, saveEnvironmentDirectory, type EnvironmentProfile } from './environment/directory'
import { ingestImageFile } from './scan/image-ingestion'
import { ingestVideoFile } from './scan/video-ingestion'

interface ScanResponse {
  scanId: string
  frames: Array<{ frameId: string; timestampMs: number }>
  observations: Observation[]
  conditions: EnvironmentalCondition[]
  state: EnvironmentalState
  diff?: EnvironmentalDiff
  memory: EnvironmentalMemory
}

interface MemoryResponse {
  memory: EnvironmentalMemory | null
  persistence: 'neon' | 'volatile'
  message?: string
}

interface StateHistoryResponse {
  environmentId: string
  currentStateId: string | null
  previousStateId: string | null
  states: EnvironmentalStateHistoryEntry[]
  selection?: EnvironmentalStateHistoryRecord
  persistence: 'neon' | 'volatile'
  message?: string
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
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [environments, setEnvironments] = useState<EnvironmentProfile[]>(loadEnvironmentDirectory)
  const [activeEnvironmentId, setActiveEnvironmentId] = useState(() => loadActiveEnvironmentId(environments))
  const [showEnvironmentDialog, setShowEnvironmentDialog] = useState(false)
  const [newEnvironmentName, setNewEnvironmentName] = useState('')
  const [newEnvironmentType, setNewEnvironmentType] = useState<EnvironmentType>('office')
  const [status, setStatus] = useState('Ready to observe')
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [memory, setMemory] = useState<EnvironmentalMemory | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('memory')
  const [selectedObservation, setSelectedObservation] = useState<number | null>(null)
  const [question, setQuestion] = useState('')
  const [askStatus, setAskStatus] = useState('')
  const [answer, setAnswer] = useState<AskBuildingResponse | null>(null)
  const [history, setHistory] = useState<EnvironmentalStateHistoryEntry[]>([])
  const [historySelection, setHistorySelection] = useState<EnvironmentalStateHistoryRecord | null>(null)
  const [historyStatus, setHistoryStatus] = useState('')
  const [historyAt, setHistoryAt] = useState('')
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null)
  const [selectedSpatialObjectId, setSelectedSpatialObjectId] = useState<string | null>(null)
  const [showAllObservations, setShowAllObservations] = useState(false)

  const activeEnvironment = environments.find((item) => item.id === activeEnvironmentId) ?? environments[0] ?? DEFAULT_ENVIRONMENT
  const isWorking = status.startsWith('Observing') || status.startsWith('Understanding') || status.startsWith('Remembering')
  const latestDiff = result?.diff ?? memory?.diffs.at(-1)
  const presentedChanges = latestDiff ? changesForPresentation(latestDiff.changes) : []
  const selectedChange = selectedChangeId ? presentedChanges.find((change) => change.id === selectedChangeId) ?? null : null
  const attentionChanges = presentedChanges.filter((change) => changeBucket(change) === 'attention')
  const physicalChanges = presentedChanges.filter((change) => changeBucket(change) === 'physical')
  const resolvedChanges = presentedChanges.filter((change) => changeBucket(change) === 'resolved')
  const verificationChanges = presentedChanges.filter((change) => changeBucket(change) === 'verification')
  const displayObservations = (result?.observations ?? []).filter(isDisplayableObservation)
  const visibleObservations = showAllObservations ? displayObservations : displayObservations.slice(0, 14)
  const previousDiffState = latestDiff ? memory?.states.find((state) => state.id === latestDiff.fromStateId) : undefined
  const currentDiffState = latestDiff ? memory?.states.find((state) => state.id === latestDiff.toStateId) : undefined
  const previousDiffImage = previousDiffState ? memory?.sources.find((source) => previousDiffState.sourceIds.includes(source.id) && source.modality === 'image')?.uri : undefined
  const currentDiffImage = currentDiffState ? memory?.sources.find((source) => currentDiffState.sourceIds.includes(source.id) && source.modality === 'image')?.uri : undefined
  const currentSnapshot = memory?.environment.currentStateId
    ? memory.snapshots.find((snapshot) => snapshot.stateId === memory.environment.currentStateId)
    : undefined
  const spatialGroups = currentSnapshot ? buildSpatialGroups(currentSnapshot, activeEnvironment.name) : []
  const selectedSpatialObject = selectedSpatialObjectId && currentSnapshot
    ? currentSnapshot.objects.find((item) => item.id === selectedSpatialObjectId) ?? null
    : null
  const selectedSpatialConditions = selectedSpatialObject && currentSnapshot
    ? currentSnapshot.conditions.filter((item) => item.objectIds.includes(selectedSpatialObject.id))
    : []
  const selectedSpatialIssues = selectedSpatialObject && currentSnapshot
    ? currentSnapshot.issues.filter((item) => item.objectIds.includes(selectedSpatialObject.id))
    : []
  const selectedSpatialRelations = selectedSpatialObject && currentSnapshot
    ? describeSpatialRelations(selectedSpatialObject, currentSnapshot)
    : []
  const selectedSpatialHistoryCount = selectedSpatialObject && memory
    ? memory.snapshots.filter((snapshot) => snapshot.objects.some((item) => item.id === selectedSpatialObject.id)).length
    : 0

  useEffect(() => {
    saveEnvironmentDirectory(environments)
  }, [environments])

  useEffect(() => {
    saveActiveEnvironmentId(activeEnvironment.id)
  }, [activeEnvironment.id])

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setMemory(null)
    setAnswer(null)
    setSelectedObservation(null)
    setHistory([])
    setHistorySelection(null)
    setHistoryStatus('')
    setHistoryAt('')
    setSelectedChangeId(null)
    setSelectedSpatialObjectId(null)
    setShowAllObservations(false)
    setError('')
    setStatus(`Loading ${activeEnvironment.name} memory`)

    async function restoreEnvironmentalMemory() {
      try {
        const response = await fetch(`/api/memory?environmentId=${encodeURIComponent(activeEnvironment.id)}`, { headers: { Accept: 'application/json' } })
        const payload = await readApiResponse<MemoryResponse>(response, 'Unable to restore environmental memory')
        if (!response.ok) throw new Error(payload.message ?? 'Unable to restore environmental memory')
        if (cancelled) return
        if (payload.memory) {
          setMemory(payload.memory)
          setStatus(payload.persistence === 'neon' ? `${activeEnvironment.name} memory restored` : `${activeEnvironment.name} volatile memory restored`)
        } else {
          setStatus(`Ready to observe ${activeEnvironment.name}`)
        }
      } catch {
        if (!cancelled) setStatus(`Ready to observe ${activeEnvironment.name}`)
      }
    }

    void restoreEnvironmentalMemory()
    return () => { cancelled = true }
  }, [activeEnvironment.id, activeEnvironment.name])

  useEffect(() => {
    if (!memory) {
      setHistory([])
      setHistorySelection(null)
      setHistoryStatus('')
      return
    }

    let cancelled = false
    setHistoryStatus('Loading immutable state history…')

    async function restoreStateHistory() {
      try {
        const response = await fetch(`/api/states?environmentId=${encodeURIComponent(memory!.environment.id)}`, { headers: { Accept: 'application/json' } })
        const payload = await readApiResponse<StateHistoryResponse>(response, 'Unable to restore environmental state history')
        if (!response.ok) throw new Error(payload.message ?? 'Unable to restore environmental state history')
        if (cancelled) return
        setHistory(payload.states)
        setHistoryStatus('')
      } catch (historyError) {
        if (cancelled) return
        setHistory([])
        setHistoryStatus(historyError instanceof Error ? historyError.message : 'Unable to restore environmental state history')
      }
    }

    void restoreStateHistory()
    return () => { cancelled = true }
  }, [memory?.environment.id, memory?.states.length])

  function switchEnvironment(environmentId: string) {
    if (environmentId === activeEnvironment.id) return
    setActiveEnvironmentId(environmentId)
    setQuestion('')
    setAskStatus('')
    setView('memory')
  }

  function addEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newEnvironmentName.trim()
    if (!name) return
    const profile = createEnvironmentProfile(name, newEnvironmentType)
    setEnvironments((current) => [...current, profile])
    setActiveEnvironmentId(profile.id)
    setNewEnvironmentName('')
    setNewEnvironmentType('office')
    setShowEnvironmentDialog(false)
    setView('memory')
  }

  async function handleImage(file: File) {
    setError('')
    setResult(null)
    setAnswer(null)
    setView('observe')
    setSelectedObservation(null)
    setSelectedChangeId(null)
    setShowAllObservations(false)

    try {
      setStatus('Observing · preparing photo evidence')
      const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
      const ingestion = await ingestImageFile(file, { maxWidth: 1280, jpegQuality: 0.78, maxBytes: 900_000 })
      setStatus('Understanding · 1 grounded photo')

      const scanPayload = {
        environmentId: activeEnvironment.id,
        source: {
          id: id('source'),
          environmentId: activeEnvironment.id,
          capturedAt: new Date().toISOString(),
          metadata: { name: activeEnvironment.name, environmentType: activeEnvironment.type, captureMode: 'photo' },
        },
        media: {
          kind: 'image',
          uri: ingestion.uri,
          mimeType: 'image/jpeg',
          sizeBytes: ingestion.sizeBytes,
        },
      }
      const response = await postScanWithRetry(scanPayload, () => setStatus('Reconnecting · retrying observation safely'))

      setStatus('Remembering · grounding observations')
      const payload = await readApiResponse<ScanResponse & { error?: string; message?: string }>(response, 'Observation request failed')
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Scan request failed (${response.status})`)
      setResult(payload)
      setMemory(payload.memory)
      setStatus(payload.diff ? `${payload.diff.changes.length} supported change(s) remembered` : `${activeEnvironment.name} is now remembered`)
      setView(payload.diff ? 'changes' : 'memory')
    } catch (scanError) {
      setStatus('Observation interrupted')
      setError(scanError instanceof Error ? scanError.message : 'Unknown scan error')
    }
  }

  async function handleVideo(file: File) {
    setError('')
    setResult(null)
    setAnswer(null)
    setView('observe')
    setSelectedObservation(null)
    setSelectedChangeId(null)

    try {
      setStatus('Observing · extracting evidence')
      const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
      const ingestion = await ingestVideoFile(file, id, { maxFrames: 12, maxWidth: 960, jpegQuality: 0.68 })
      setStatus(`Understanding · ${ingestion.frames.length} evidence frames`)

      const scanPayload = {
        environmentId: activeEnvironment.id,
        source: {
          id: id('source'),
          environmentId: activeEnvironment.id,
          capturedAt: new Date().toISOString(),
          metadata: { name: activeEnvironment.name, environmentType: activeEnvironment.type },
        },
        media: { kind: 'video', uri: `https://local.sentinel/media/${encodeURIComponent(file.name)}`, mimeType: file.type, durationMs: ingestion.durationMs, sizeBytes: file.size },
        extractedFrames: ingestion.frames,
      }
      const response = await postScanWithRetry(scanPayload, () => setStatus('Reconnecting · retrying observation safely'))

      setStatus('Remembering · grounding observations')
      const payload = await readApiResponse<ScanResponse & { error?: string; message?: string }>(response, 'Observation request failed')
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Scan request failed (${response.status})`)
      setResult(payload)
      setMemory(payload.memory)
      setStatus(payload.diff ? `${payload.diff.changes.length} supported change(s) remembered` : `${activeEnvironment.name} is now remembered`)
      setView(payload.diff ? 'changes' : 'memory')
    } catch (scanError) {
      setStatus('Observation interrupted')
      setError(scanError instanceof Error ? scanError.message : 'Unknown scan error')
    }
  }

  async function inspectHistoricalState(query: { selector?: 'current' | 'previous'; stateId?: string; at?: string }) {
    if (!memory) return
    setHistoryStatus('Opening immutable state snapshot…')

    try {
      const params = new URLSearchParams({ environmentId: memory.environment.id })
      if (query.selector) params.set('selector', query.selector)
      if (query.stateId) params.set('stateId', query.stateId)
      if (query.at) params.set('at', query.at)

      const response = await fetch(`/api/states?${params.toString()}`, { headers: { Accept: 'application/json' } })
      const payload = await readApiResponse<StateHistoryResponse>(response, 'Unable to inspect historical state')
      if (!response.ok || !payload.selection) throw new Error(payload.message ?? 'Historical state was not found')
      setHistory(payload.states)
      setHistorySelection(payload.selection)
      setHistoryStatus('')
    } catch (historyError) {
      setHistoryStatus(historyError instanceof Error ? historyError.message : 'Unable to inspect historical state')
    }
  }

  function inspectHistoricalDate() {
    if (!historyAt) return
    const parsed = new Date(historyAt)
    if (!Number.isFinite(parsed.getTime())) {
      setHistoryStatus('Choose a valid date and time.')
      return
    }
    void inspectHistoricalState({ at: parsed.toISOString() })
  }

  async function askBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    if (!memory) {
      setAskStatus(`Observe ${activeEnvironment.name} first so SENTINEL has grounded memory to reason over.`)
      return
    }

    setAskStatus('Reasoning across environmental memory…')
    setAnswer(null)
    try {
      const response = await fetch('/api/ask-building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId: memory.environment.id, question: trimmed, stateId: memory.environment.currentStateId }),
      })
      const payload = await readApiResponse<AskBuildingResponse & { message?: string }>(response, 'Ask request failed')
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
        <div className="environment-status environment-switcher">
          <div className="environment-select-row">
            <select className="environment-select" value={activeEnvironment.id} onChange={(event) => switchEnvironment(event.target.value)} aria-label="Current SENTINEL location">
              {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
            </select>
            <button className="add-environment-button" type="button" onClick={() => setShowEnvironmentDialog(true)} aria-label="Add another location">＋</button>
          </div>
          <span>{memory ? `memory v${memory.states.length}` : 'new physical memory'}</span>
        </div>
        <button className="profile-button" type="button" aria-label="Profile">XP</button>
      </header>

      <nav className="desktop-rail" aria-label="Primary navigation">
        <button className={view === 'memory' ? 'active' : ''} type="button" onClick={() => setView('memory')}><span>◎</span><em>Memory</em></button>
        <button className={view === 'observe' ? 'active' : ''} type="button" onClick={() => setView('observe')}><span>◉</span><em>Observe</em></button>
        <button className={view === 'changes' ? 'active' : ''} type="button" onClick={() => setView('changes')}><span>↺</span><em>Changes</em></button>
      </nav>

      {view === 'memory' && <section className="memory-view">
        <div className="hero-copy">
          <div className="eyebrow">PHYSICAL MEMORY / {activeEnvironment.name.toUpperCase()}</div>
          <h1>{memory ? 'This space remembers.' : 'Give this place a memory.'}</h1>
          <p>{memory ? `SENTINEL holds ${memory.states.length} grounded environmental state${memory.states.length === 1 ? '' : 's'}, ${memory.objects.length} remembered objects, ${memory.conditions.length} condition${memory.conditions.length === 1 ? '' : 's'} and ${memory.issues.length} actionable issue${memory.issues.length === 1 ? '' : 's'} for ${activeEnvironment.name}.` : `${activeEnvironment.name} has no saved observation yet. Take a photo of the area or use a walkthrough video and SENTINEL will create its own independent environmental memory.`}</p>
        </div>

        {answer && <section className="answer-panel" aria-live="polite">
          <span className="eyebrow">SENTINEL / CONCLUSION</span>
          <h2>{answer.answer}</h2>
          <div className="answer-meta"><span>Confidence {Math.round(answer.confidence * 100)}%</span><span>{answer.evidenceIds.length} evidence reference(s)</span><span>State {answer.stateId}</span></div>
        </section>}

        <div className="environment-stage spatial-memory-stage" aria-label={activeEnvironment.name + ' environmental memory canvas'}>
          <div className="ambient-orb orb-one" /><div className="ambient-orb orb-two" /><div className="stage-grid" />
          {memory && currentSnapshot ? <>
            <div className="spatial-stage-header">
              <div>
                <span className="eyebrow">SPATIAL MEMORY / LIVE STATE</span>
                <strong>{activeEnvironment.name}</strong>
                <small>{currentSnapshot.objects.length} remembered objects · {currentSnapshot.relations.length} grounded relation{currentSnapshot.relations.length === 1 ? '' : 's'}</small>
              </div>
              <span>STATE v{memory.states.find((item) => item.id === currentSnapshot.stateId)?.version ?? memory.states.length}</span>
            </div>
            <div className="spatial-room-grid">
              {spatialGroups.map((group) => <section className="spatial-room" key={group.id}>
                <div className="spatial-room-heading">
                  <div><span>{group.name}</span><small>{group.kind === 'room' ? 'remembered area' : 'observed space'}</small></div>
                  <strong>{group.objects.length}</strong>
                </div>
                <div className="spatial-object-cloud">
                  {group.objects.length === 0 ? <span className="spatial-room-empty">No grounded objects assigned to this area yet.</span> : group.objects.map((item) => {
                    const tone = spatialObjectTone(item, currentSnapshot)
                    return <button className={'spatial-object ' + tone} type="button" key={item.id} onClick={() => setSelectedSpatialObjectId(item.id)}>
                      <i />
                      <span><strong>{item.name}</strong><small>{spatialObjectSubtitle(item)}</small></span>
                      <em>{Math.round(item.confidence * 100)}%</em>
                    </button>
                  })}
                </div>
              </section>)}
            </div>
          </> : <div className="spatial-empty-state">
            <span className="eyebrow">SPATIAL MEMORY</span>
            <strong>Nothing has been grounded here yet.</strong>
            <p>Your first observation will turn this canvas into a live map of remembered objects, areas and relationships.</p>
          </div>}
          <div className="stage-caption"><span>{memory ? 'LIVE SPATIAL MEMORY' : 'MEMORY CANVAS'}</span><strong>{memory ? memory.evidence.length + ' evidence records across ' + memory.states.length + ' state(s)' : 'No state exists yet for ' + activeEnvironment.name}</strong></div>
        </div>

        <div className="memory-summary">
          <div><span>Since you were last here</span><strong>{latestDiff ? latestDiff.summary : memory ? 'No comparison yet' : 'No previous state yet'}</strong></div>
          <button className="observe-cta" type="button" onClick={() => libraryInputRef.current?.click()}><span className="observe-orb"><i /></span><span><strong>{memory ? 'Choose update photo' : 'Choose first photo'}</strong><small>{memory ? `Select an image for the next ${activeEnvironment.name} state` : `Select an image to create ${activeEnvironment.name} memory v1`}</small></span></button>
        </div>

        {memory && <section className="history-section" aria-label="Environmental state history">
          <div className="section-heading history-heading">
            <div>
              <span className="eyebrow">TIME / IMMUTABLE MEMORY</span>
              <h2>State history.</h2>
              <p>Each observation creates a locked environmental snapshot. Inspect what SENTINEL believed then—not today's mutated object values.</p>
            </div>
            <div className="history-quick-actions">
              <button type="button" onClick={() => void inspectHistoricalState({ selector: 'current' })}>Current</button>
              <button type="button" disabled={history.length < 2} onClick={() => void inspectHistoricalState({ selector: 'previous' })}>Previous</button>
            </div>
          </div>

          <div className="history-time-query">
            <label htmlFor="history-at">Jump to state at or before</label>
            <div>
              <input id="history-at" type="datetime-local" value={historyAt} onChange={(event) => setHistoryAt(event.target.value)} />
              <button type="button" disabled={!historyAt} onClick={inspectHistoricalDate}>Inspect time</button>
            </div>
          </div>

          {historyStatus && <div className="history-status" role="status">{historyStatus}</div>}

          <div className="history-track">
            {history.map((entry) => (
              <button className={entry.isCurrent ? 'history-card current' : 'history-card'} type="button" key={entry.stateId} onClick={() => void inspectHistoricalState({ stateId: entry.stateId })}>
                <span className="history-version">STATE v{entry.version}</span>
                <strong>{formatStateTimestamp(entry.capturedAt)}</strong>
                <small>{entry.summary}</small>
                <div className="history-counts">
                  <span>{entry.objectCount} objects</span>
                  <span>{entry.conditionCount} conditions</span>
                  <span>{entry.issueCount} issues</span>
                </div>
                <em>{entry.isCurrent ? 'Current memory' : 'Immutable snapshot'} ↗</em>
              </button>
            ))}
          </div>
        </section>}

        {result && <section className="evidence-section">
          <div className="section-heading"><div><span className="eyebrow">EVIDENCE / CURRENT STATE</span><h2>What SENTINEL observed.</h2></div><span className="scan-id">{result.scanId}</span></div>
          <div className="observation-list">{displayObservations.length === 0 ? <div className="empty-observation">No material grounded observations were returned for this scan.</div> : visibleObservations.map((item) => {
            const index = result.observations.indexOf(item)
            return <button className="observation-row" type="button" key={item.id} onClick={() => setSelectedObservation(index)}><span className="observation-index">{String(index + 1).padStart(2, '0')}</span><span className="observation-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="observation-confidence">{Math.round(item.confidence * 100)}%</span><span className="arrow">↗</span></button>
          })}</div>
          {displayObservations.length > 14 && <button className="observation-expand" type="button" onClick={() => setShowAllObservations((value) => !value)}>{showAllObservations ? 'Show less evidence' : `Show all ${displayObservations.length} observations`}</button>}
        </section>}
      </section>}

      {view === 'observe' && <section className="observe-view">
        <div className="observe-camera"><div className="camera-noise" /><div className="scan-line" /><div className="camera-topline"><SentinelMark active /><span>{isWorking ? status : `${activeEnvironment.name.toUpperCase()} / OBSERVATION MODE`}</span></div><div className="focus-frame focus-one"><span>Workspace</span></div><div className="focus-frame focus-two"><span>Evidence region</span></div><div className="observe-message"><span className="eyebrow">PHONE-FIRST OBSERVATION</span><h2>{isWorking ? status : memory ? `Photograph what changed in ${activeEnvironment.name}.` : `Create the first memory for ${activeEnvironment.name}.`}</h2><p>Take one clear photo or choose one from Photos. SENTINEL grounds visible evidence and updates only this location's persistent environmental state. Video remains optional for larger spaces.</p></div><div className="observe-capture-actions"><button className="capture-button" type="button" onClick={() => libraryInputRef.current?.click()} aria-label="Choose a photo from library"><span><i /></span><strong>{isWorking ? 'Observing' : memory ? 'Choose update photo' : 'Choose first photo'}</strong></button><div className="observe-secondary-actions"><button className="walkthrough-option" type="button" onClick={() => inputRef.current?.click()} disabled={isWorking}>Take photo</button><button className="walkthrough-option" type="button" onClick={() => videoInputRef.current?.click()} disabled={isWorking}>Choose video</button></div></div></div>
        {error && <div className="error" role="alert"><strong>Observation interrupted</strong><span>{error}</span></div>}
      </section>}

      {view === 'changes' && <section className="changes-view operations-diff">
        <div className="hero-copy compact operations-diff-hero">
          <div className="eyebrow">FACILITY OPERATIONS / REALITY DIFF / {activeEnvironment.name.toUpperCase()}</div>
          <h1>{latestDiff ? 'Operations update.' : 'What changed.'}</h1>
          <p>{latestDiff ? `SENTINEL compared the previous remembered state with the current one and found ${presentedChanges.length} supported change${presentedChanges.length === 1 ? '' : 's'}. Review what needs attention, what physically changed, and what has been resolved.` : memory ? `Observe ${activeEnvironment.name} again. SENTINEL will compare the new grounded state with the one it remembers for this location.` : `${activeEnvironment.name} needs a first observation before Reality Diff can begin.`}</p>
        </div>

        {latestDiff && <div className="operations-summary" aria-label="Facility operations change summary">
          <div className={attentionChanges.length > 0 ? 'operations-stat attention active' : 'operations-stat attention'}>
            <span>Needs attention</span>
            <strong>{attentionChanges.length}</strong>
            <small>{attentionChanges.length ? 'Operational changes to review' : 'No new operational concern'}</small>
          </div>
          <div className={physicalChanges.length > 0 ? 'operations-stat physical active' : 'operations-stat physical'}>
            <span>Physical changes</span>
            <strong>{physicalChanges.length}</strong>
            <small>{physicalChanges.length ? 'Added, moved, removed or changed' : 'No supported physical change'}</small>
          </div>
          <div className={resolvedChanges.length > 0 ? 'operations-stat resolved active' : 'operations-stat resolved'}>
            <span>Resolved</span>
            <strong>{resolvedChanges.length}</strong>
            <small>{resolvedChanges.length ? 'Supported resolution events' : 'No newly verified resolution'}</small>
          </div>
          <div className={verificationChanges.length > 0 ? 'operations-stat verification active' : 'operations-stat verification'}>
            <span>Needs verification</span>
            <strong>{verificationChanges.length}</strong>
            <small>{verificationChanges.length ? 'Not re-observed is not resolved' : 'No uncertain disappearance'}</small>
          </div>
        </div>}

        <div className="reality-compare" aria-label="Before and after physical memory">
          <article className="reality-frame">
            <div className="reality-frame-head"><strong>{latestDiff ? stateLabel(memory, latestDiff.fromStateId) : 'Previous state'}</strong><span>BEFORE</span></div>
            <div className="reality-media previous">
              {previousDiffImage ? <img src={previousDiffImage} alt="Previous environmental observation" /> : <div className="reality-placeholder"><i /><span>Previous physical memory</span></div>}
            </div>
            {latestDiff && <code>{shortStateId(latestDiff.fromStateId)}</code>}
          </article>
          <article className="reality-frame">
            <div className="reality-frame-head"><strong>{latestDiff ? stateLabel(memory, latestDiff.toStateId) : 'Next state'}</strong><span>AFTER</span></div>
            <div className="reality-media current">
              {currentDiffImage ? <img src={currentDiffImage} alt="Current environmental observation" /> : <div className="reality-placeholder"><i /><span>Current physical memory</span></div>}
            </div>
            {latestDiff && <code>{shortStateId(latestDiff.toStateId)}</code>}
          </article>
          {latestDiff && <div className="reality-compare-caption"><span>PHYSICAL MEMORY UPDATED</span><strong>{presentedChangeSummary(presentedChanges)}</strong></div>}
        </div>

        {latestDiff ? presentedChanges.length === 0 ? <div className="empty-diff operations-empty"><strong>No material change detected.</strong><span>The building state is materially consistent with the previous observation.</span></div> : <div className="operations-change-groups">
          {attentionChanges.length > 0 && <ChangeGroup title="Needs attention" subtitle="Operational conditions or issues that deserve review." changes={attentionChanges} onSelect={setSelectedChangeId} />}
          {physicalChanges.length > 0 && <ChangeGroup title="Physical changes" subtitle="Grounded changes to objects or their visible state/location." changes={physicalChanges} onSelect={setSelectedChangeId} />}
          {resolvedChanges.length > 0 && <ChangeGroup title="Resolved" subtitle="Changes explicitly supported as resolved." changes={resolvedChanges} onSelect={setSelectedChangeId} />}
          {verificationChanges.length > 0 && <ChangeGroup title="Needs verification" subtitle="Previously remembered items were not re-observed. SENTINEL does not call that resolved." changes={verificationChanges} onSelect={setSelectedChangeId} />}
        </div> : <div className="change-list" aria-label="Environmental changes"><div className="preview-label">INTERACTION PREVIEW — NOT DETECTED EVENTS</div>{previewChanges.map((change) => <div className="change-row" key={change.type}><span className={`change-mark ${change.type.toLowerCase()}`}>{change.mark}</span><div><strong>{change.type}</strong><small>{change.detail}</small></div></div>)}</div>}

        <div className="operations-next-step">
          <div><span className="eyebrow">NEXT OPERATION</span><strong>{latestDiff && attentionChanges.length > 0 ? 'Review what needs attention, then ask SENTINEL what should happen next.' : latestDiff && verificationChanges.length > 0 ? 'Verification is required before treating this as resolved. Re-observe the area and confirm the physical condition.' : latestDiff ? 'No urgent action is implied by the diff alone. Observe again when the physical state changes.' : 'Create a second state to unlock Reality Diff.'}</strong></div>
          <button className="wide-observe" type="button" onClick={() => libraryInputRef.current?.click()}><span>Choose update photo</span><span>Select the next environmental state image ↗</span></button>
        </div>
      </section>}

      {selectedChange && latestDiff && <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedChangeId(null)}>
        <aside className="evidence-drawer change-drawer" role="dialog" aria-modal="true" aria-label={selectedChange.title} onClick={(event) => event.stopPropagation()}>
          <button className="drawer-close" type="button" onClick={() => setSelectedChangeId(null)}>×</button>
          <span className="eyebrow">{changeTypeLabel(selectedChange.type)} / {changeEntityLabel(selectedChange)}</span>
          <div className="change-drawer-mark"><span className={`change-mark ${selectedChange.type}`}>{changeMark(selectedChange.type)}</span><small>{Math.round(selectedChange.confidence * 100)}% confidence</small></div>
          <h2>{selectedChange.title}</h2>
          <p>{selectedChange.description}</p>

          <div className="change-state-transition">
            <div><span>Previous</span><strong>{stateLabel(memory, latestDiff.fromStateId)}</strong><small>{shortStateId(latestDiff.fromStateId)}</small></div>
            <b>→</b>
            <div><span>Current</span><strong>{stateLabel(memory, latestDiff.toStateId)}</strong><small>{shortStateId(latestDiff.toStateId)}</small></div>
          </div>

          <div className="history-lock-note change-evidence-note">
            <span>Grounded change</span>
            <strong>SENTINEL only reports this change from persisted environmental evidence.</strong>
            <p>{selectedChange.evidenceIds.length > 0 ? `${selectedChange.evidenceIds.length} evidence reference${selectedChange.evidenceIds.length === 1 ? '' : 's'} support this change.` : 'This change is supported by the immutable state comparison; no standalone evidence reference was attached.'}</p>
          </div>

          {selectedChange.evidenceIds.length > 0 && <div className="change-evidence-ids">
            <span className="eyebrow">EVIDENCE REFERENCES</span>
            {selectedChange.evidenceIds.map((id) => <code key={id}>{id}</code>)}
          </div>}

          <div className="change-manager-actions">
            {(changeBucket(selectedChange) === 'attention' || changeBucket(selectedChange) === 'verification') && <button type="button" className="change-ask-action" onClick={() => {
              setQuestion(`What should I do about: ${selectedChange.title}?`)
              setSelectedChangeId(null)
              setView('memory')
            }}>Ask SENTINEL what to do ↗</button>}
            <button type="button" onClick={() => { setSelectedChangeId(null); libraryInputRef.current?.click() }}>Choose verification photo</button>
          </div>
        </aside>
      </div>}

      {historySelection && <div className="drawer-backdrop" role="presentation" onClick={() => setHistorySelection(null)}>
        <aside className="evidence-drawer history-drawer" role="dialog" aria-modal="true" aria-label={`State v${historySelection.state.version} historical snapshot`} onClick={(event) => event.stopPropagation()}>
          <button className="drawer-close" type="button" onClick={() => setHistorySelection(null)}>×</button>
          <span className="eyebrow">{historySelection.isCurrent ? 'CURRENT STATE' : 'HISTORICAL STATE'} / IMMUTABLE SNAPSHOT</span>
          <h2>State v{historySelection.state.version}</h2>
          <p className="history-captured">{formatStateTimestamp(historySelection.state.capturedAt)} · {historySelection.state.id}</p>
          <p>{historySelection.state.summary}</p>

          <div className="history-snapshot-meta">
            <span>{historySelection.snapshot.objects.length} objects</span>
            <span>{historySelection.snapshot.conditions.length} conditions</span>
            <span>{historySelection.snapshot.issues.length} issues</span>
            <span>{historySelection.snapshot.relations.length} relations</span>
          </div>

          <div className="history-lock-note">
            <span>Historical truth</span>
            <strong>This view reads the values captured in this state snapshot.</strong>
            <p>Later scans can update today's canonical objects, but they cannot rewrite what this state believed.</p>
          </div>

          <div className="history-drawer-nav">
            <button type="button" disabled={!historySelection.previousStateId} onClick={() => historySelection.previousStateId && void inspectHistoricalState({ stateId: historySelection.previousStateId })}>← Older state</button>
            <button type="button" disabled={!historySelection.nextStateId} onClick={() => historySelection.nextStateId && void inspectHistoricalState({ stateId: historySelection.nextStateId })}>Newer state →</button>
          </div>

          <div className="history-snapshot-section">
            <span className="eyebrow">OBJECTS AS REMEMBERED</span>
            <div className="history-snapshot-list">
              {historySelection.snapshot.objects.length === 0 ? <p>No objects belonged to this state.</p> : historySelection.snapshot.objects.map((item) => <div key={item.id}><strong>{item.name}</strong><small>{item.category} · {Math.round(item.confidence * 100)}%</small><p>{item.description ?? item.state ?? 'No additional state description.'}</p></div>)}
            </div>
          </div>

          <div className="history-snapshot-section">
            <span className="eyebrow">CONDITIONS</span>
            <div className="history-snapshot-list">
              {historySelection.snapshot.conditions.length === 0 ? <p>No conditions belonged to this state.</p> : historySelection.snapshot.conditions.map((item) => <div key={item.id}><strong>{item.title}</strong><small>{item.basis} · {item.kind} · {Math.round(item.confidence * 100)}%</small><p>{item.description}</p></div>)}
            </div>
          </div>

          {historySelection.snapshot.issues.length > 0 && <div className="history-snapshot-section">
            <span className="eyebrow">OPERATIONAL ISSUES</span>
            <div className="history-snapshot-list">
              {historySelection.snapshot.issues.map((item) => <div key={item.id}><strong>{item.title}</strong><small>{item.severity} · {item.status} · {Math.round(item.confidence * 100)}%</small><p>{item.description}</p></div>)}
            </div>
          </div>}
        </aside>
      </div>}

      {observation && <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedObservation(null)}><aside className="evidence-drawer" role="dialog" aria-modal="true" aria-label={`${observation.label} evidence`} onClick={(event) => event.stopPropagation()}><button className="drawer-close" type="button" onClick={() => setSelectedObservation(null)}>×</button><span className="eyebrow">OBSERVED / EVIDENCE-BACKED</span><h2>{observation.label}</h2><p>{observation.description}</p><Confidence value={observation.confidence} /><div className="evidence-rule" /><div className="evidence-note"><span>What this means</span><strong>SENTINEL stores this as an observation, not a professional diagnosis.</strong><p>Interpretation and recommended action remain separate from what the visual evidence directly supports.</p></div></aside></div>}

      {showEnvironmentDialog && <div className="drawer-backdrop location-backdrop" role="presentation" onClick={() => setShowEnvironmentDialog(false)}><form className="location-dialog" onSubmit={addEnvironment} onClick={(event) => event.stopPropagation()}><button className="drawer-close" type="button" onClick={() => setShowEnvironmentDialog(false)}>×</button><span className="eyebrow">NEW PHYSICAL MEMORY</span><h2>Add another location.</h2><p>Each location gets its own environment ID, scans, state history, Reality Diffs and questions. Scanning a new location will not overwrite {activeEnvironment.name}.</p><label><span>Location name</span><input autoFocus value={newEnvironmentName} onChange={(event) => setNewEnvironmentName(event.target.value)} placeholder="e.g. Head Office, Warehouse A" maxLength={80} /></label><label><span>Space type</span><select value={newEnvironmentType} onChange={(event) => setNewEnvironmentType(event.target.value as EnvironmentType)}>{ENVIRONMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div className="location-actions"><button type="button" onClick={() => setShowEnvironmentDialog(false)}>Cancel</button><button className="location-create" type="submit" disabled={!newEnvironmentName.trim()}>Create location</button></div></form></div>}

      <form className={`ask-bar ${answer ? 'has-answer' : ''}`} role="search" onSubmit={askBuilding}>
        <span className="ask-spark">✦</span>
        <input value={question} onChange={(event) => { setQuestion(event.target.value); if (askStatus) setAskStatus('') }} placeholder={memory ? `Ask ${activeEnvironment.name}…` : `Observe ${activeEnvironment.name} first…`} aria-label="Ask this environment" />
        <button type="submit" aria-label="Ask SENTINEL" disabled={!question.trim() || askStatus.startsWith('Reasoning')}>↗</button>
        {askStatus && <span className="ask-status">{askStatus}</span>}
      </form>

      <nav className="mobile-nav" aria-label="Primary navigation"><button className={view === 'memory' ? 'active' : ''} type="button" onClick={() => setView('memory')}><span>◎</span><small>Memory</small></button><button className={view === 'observe' ? 'active observe-nav' : 'observe-nav'} type="button" onClick={() => setView('observe')}><span>◉</span><small>Observe</small></button><button className={view === 'changes' ? 'active' : ''} type="button" onClick={() => setView('changes')}><span>↺</span><small>Changes</small></button></nav>

      <input ref={inputRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImage(file); event.target.value = '' }} />
      <input ref={libraryInputRef} hidden type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImage(file); event.target.value = '' }} />
      <input ref={videoInputRef} hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleVideo(file); event.target.value = '' }} />
    </main>
  )
}

interface SpatialGroup {
  id: string
  name: string
  kind: 'room' | 'environment'
  objects: SpatialObject[]
}

interface SpatialRelationDescription {
  id: string
  label: string
  confidence: number
}

function buildSpatialGroups(snapshot: EnvironmentalStateSnapshot, environmentName: string): SpatialGroup[] {
  const rooms = snapshot.objects.filter((item) => item.category === 'room')
  const objects = snapshot.objects.filter((item) => item.category !== 'room')
  const assigned = new Set<string>()

  const groups: SpatialGroup[] = rooms.map((room) => {
    const roomObjects = objects.filter((item) => {
      if (item.position?.roomId === room.id) return true
      return snapshot.relations.some((relation) =>
        (relation.type === 'located_in' && relation.fromId === item.id && relation.toId === room.id) ||
        (relation.type === 'contains' && relation.fromId === room.id && relation.toId === item.id),
      )
    })
    roomObjects.forEach((item) => assigned.add(item.id))
    return { id: room.id, name: room.name, kind: 'room', objects: sortSpatialObjects(roomObjects, snapshot) }
  })

  const unassigned = objects.filter((item) => !assigned.has(item.id))
  if (rooms.length === 0 || unassigned.length > 0) {
    groups.push({
      id: 'environment:' + snapshot.environmentId,
      name: rooms.length === 0 ? environmentName : 'Other remembered objects',
      kind: 'environment',
      objects: sortSpatialObjects(unassigned.length > 0 ? unassigned : objects, snapshot),
    })
  }

  if (groups.every((group) => group.objects.length === 0) && objects.length > 0) {
    return [{ id: 'environment:' + snapshot.environmentId, name: environmentName, kind: 'environment', objects: sortSpatialObjects(objects, snapshot) }]
  }

  return groups
}

function sortSpatialObjects(objects: SpatialObject[], snapshot: EnvironmentalStateSnapshot): SpatialObject[] {
  const score = (item: SpatialObject) => {
    if (snapshot.issues.some((issue) => issue.objectIds.includes(item.id) && issue.status !== 'resolved' && issue.status !== 'dismissed')) return 0
    if (snapshot.conditions.some((condition) => condition.objectIds.includes(item.id) && condition.kind !== 'normal')) return 1
    if (['safety', 'electrical', 'equipment', 'door', 'obstruction'].includes(item.category)) return 2
    return 3
  }
  return [...objects].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
}

function spatialObjectTone(item: SpatialObject, snapshot: EnvironmentalStateSnapshot): 'attention' | 'condition' | 'normal' {
  if (snapshot.issues.some((issue) => issue.objectIds.includes(item.id) && issue.status !== 'resolved' && issue.status !== 'dismissed')) return 'attention'
  if (snapshot.conditions.some((condition) => condition.objectIds.includes(item.id) && condition.kind !== 'normal')) return 'condition'
  return 'normal'
}

function spatialObjectSubtitle(item: SpatialObject): string {
  const parts = [item.category]
  if (item.state) parts.push(item.state)
  else if (item.position?.description) parts.push(item.position.description)
  return parts.join(' · ')
}

function describeSpatialRelations(item: SpatialObject, snapshot: EnvironmentalStateSnapshot): SpatialRelationDescription[] {
  const names = new Map(snapshot.objects.map((object) => [object.id, object.name]))
  return snapshot.relations
    .filter((relation) => relation.fromId === item.id || relation.toId === item.id)
    .map((relation: EnvironmentRelation) => {
      const outgoing = relation.fromId === item.id
      const otherId = outgoing ? relation.toId : relation.fromId
      const otherName = names.get(otherId) ?? 'remembered object'
      const relationLabel = relation.type.replace(/_/g, ' ')
      return {
        id: relation.id,
        label: outgoing ? relationLabel + ' → ' + otherName : otherName + ' → ' + relationLabel,
        confidence: relation.confidence,
      }
    })
}

function ChangeGroup({ title, subtitle, changes, onSelect }: { title: string; subtitle: string; changes: Change[]; onSelect: (id: string) => void }) {
  return <section className="operations-change-group">
    <div className="operations-group-heading"><div><span>{title.toUpperCase()}</span><strong>{title}</strong></div><small>{subtitle}</small></div>
    <div className="operations-change-list">
      {changes.map((change) => <button className="operations-change-card" type="button" key={change.id} onClick={() => onSelect(change.id)}>
        <span className={`change-mark ${change.type}`}>{changeMark(change.type)}</span>
        <span className="operations-change-copy">
          <span className="change-card-meta"><b>{changeTypeLabel(change.type)}</b><i>{changeEntityLabel(change)}</i></span>
          <strong>{change.title}</strong>
          <small>{change.description}</small>
        </span>
        <span className="change-card-confidence">{Math.round(change.confidence * 100)}%<i>↗</i></span>
      </button>)}
    </div>
  </section>
}

function changeBucket(change: Change): 'attention' | 'physical' | 'resolved' | 'verification' {
  if (change.type === 'resolved') return 'resolved'
  if (change.type === 'uncertain') return 'verification'
  const entityKind = change.entityKind ?? (/issue|condition/i.test(change.title) ? 'issue' : 'object')
  if (entityKind === 'issue' || entityKind === 'condition') return 'attention'
  return 'physical'
}

function changeMark(type: Change['type']): string {
  if (type === 'added') return '+'
  if (type === 'removed') return '−'
  if (type === 'moved') return '↔'
  if (type === 'changed') return '!'
  if (type === 'resolved') return '✓'
  if (type === 'uncertain') return '?'
  return '·'
}

function changeTypeLabel(type: Change['type']): string {
  if (type === 'added') return 'Added'
  if (type === 'removed') return 'Removed'
  if (type === 'moved') return 'Moved'
  if (type === 'changed') return 'Changed'
  if (type === 'resolved') return 'Resolved'
  if (type === 'uncertain') return 'Needs verification'
  return 'Unchanged'
}

function changeEntityLabel(change: Change): string {
  if (change.entityKind === 'issue') return 'Operational issue'
  if (change.entityKind === 'condition') return 'Environmental condition'
  if (change.entityKind === 'object') return 'Physical object'
  if (/issue/i.test(change.title)) return 'Operational issue'
  if (/condition/i.test(change.title)) return 'Environmental condition'
  return 'Physical change'
}

function stateLabel(memory: EnvironmentalMemory | null, stateId: string): string {
  const state = memory?.states.find((item) => item.id === stateId)
  return state ? `State v${state.version}` : 'Remembered state'
}

function shortStateId(value: string): string {
  return value.length > 22 ? `${value.slice(0, 18)}…` : value
}

async function postScanWithRetry(payload: unknown, onRetry?: () => void): Promise<Response> {
  const body = JSON.stringify(payload)
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      })

      if (attempt === 0 && [502, 503, 504].includes(response.status)) {
        onRetry?.()
        await delay(900)
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt === 1) break
      onRetry?.()
      await delay(900)
    }
  }

  throw lastError instanceof Error
    ? new Error(`Network connection to SENTINEL was interrupted. Automatic retry also failed: ${lastError.message}`)
    : new Error('Network connection to SENTINEL was interrupted and the automatic retry failed.')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text()
  if (!text.trim()) {
    throw new Error(response.ok ? `${fallback}: server returned an empty response` : `${fallback} (${response.status})`)
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const looksJson = contentType.includes('application/json') || /^[\s]*[\[{]/.test(text)

  if (looksJson) {
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`${fallback}: server returned malformed JSON`)
    }
  }

  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)

  const statusHint = response.status === 504
    ? 'The observation timed out before inference completed.'
    : response.status >= 500
      ? 'The observation service returned a server error.'
      : fallback

  throw new Error(cleaned ? `${statusHint} ${cleaned}` : `${statusHint} (${response.status})`)
}

function isDisplayableObservation(item: Observation): boolean {
  const text = `${item.label} ${item.description}`.toLowerCase()
  return !(
    /^\s*(?:no|none)\b/.test(text) ||
    /\bno visible\b/.test(text) ||
    /\bno signs? of\b/.test(text) ||
    /\bno evidence of\b/.test(text)
  )
}

function formatStateTimestamp(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
