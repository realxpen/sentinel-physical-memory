import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './integration.css'
import './environment.css'
import './history.css'
import './phase13.css'
import type { ActionPlanningResponse, AskBuildingResponse, Change, EnvironmentalCondition, EnvironmentalDiff, EnvironmentalMemory, EnvironmentalState, EnvironmentType, Observation, SpatialObject, VerificationResult } from './domain/sentinel'
import type { EnvironmentalStateHistoryEntry, EnvironmentalStateHistoryRecord } from './memory/history'
import { changesForPresentation, presentedChangeSummary } from './memory/change-presentation'
import { buildSpatialGroups, buildSpatialObjectDisplayNames, buildSpatialRelationEdges, describeSpatialRelations, focusSpatialGroups, spatialGroupForObject, spatialObjectSubtitle, spatialObjectTone } from './memory/spatial-memory'
import { createEnvironmentProfile, DEFAULT_ENVIRONMENT, ENVIRONMENT_TYPES, loadActiveEnvironmentId, loadEnvironmentDirectory, saveActiveEnvironmentId, saveEnvironmentDirectory, type EnvironmentProfile } from './environment/directory'
import { ingestImageFile } from './scan/image-ingestion'
import { ingestVideoFile } from './scan/video-ingestion'
import { findPriorConditionVerificationCandidate } from './verification/candidate'
import { fetchSentinel, readSentinelApiResponse } from './reliability/api-client'

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

interface ActionPlannerOptions {
  stateId?: string
  goal?: string
  relatedConditionIds?: string[]
  relatedIssueIds?: string[]
  relatedObjectIds?: string[]
}

type View = 'memory' | 'observe' | 'changes'

const previewChanges = [
  { mark: '+', type: 'Added', detail: 'New conditions appear here after a second observation.' },
  { mark: '↔', type: 'Moved', detail: 'SENTINEL compares remembered positions between scans.' },
  { mark: '✓', type: 'Resolved', detail: 'Verified changes close the physical-world memory loop.' },
]

const ASK_BUILDING_PROMPTS = [
  { label: 'Attention', question: 'What needs my attention?' },
  { label: 'Locate', question: 'Where is the electrical panel?' },
  { label: 'Nearby', question: 'What did you see near the server room?' },
  { label: 'Changes', question: 'What changed since the last scan?' },
  { label: 'Priority', question: 'Which change matters most?' },
  { label: 'Next step', question: 'What should I do?' },
  { label: 'Verify', question: 'Has it been resolved?' },
] as const

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
  const [askStateId, setAskStateId] = useState<string>('current')
  const [answer, setAnswer] = useState<AskBuildingResponse | null>(null)
  const [actionPlan, setActionPlan] = useState<ActionPlanningResponse | null>(null)
  const [actionPlanStatus, setActionPlanStatus] = useState('')
  const [verification, setVerification] = useState<VerificationResult | null>(null)
  const [verificationStatus, setVerificationStatus] = useState('')
  const [history, setHistory] = useState<EnvironmentalStateHistoryEntry[]>([])
  const [historySelection, setHistorySelection] = useState<EnvironmentalStateHistoryRecord | null>(null)
  const [historyStatus, setHistoryStatus] = useState('')
  const [historyAt, setHistoryAt] = useState('')
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null)
  const [selectedSpatialObjectId, setSelectedSpatialObjectId] = useState<string | null>(null)
  const [selectedSpatialAreaId, setSelectedSpatialAreaId] = useState<string>('all')
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
  const spatialObjectDisplayNames = currentSnapshot ? buildSpatialObjectDisplayNames(currentSnapshot) : new Map<string, string>()
  const normalizedSpatialAreaId = selectedSpatialAreaId === 'all' || spatialGroups.some((group) => group.id === selectedSpatialAreaId) ? selectedSpatialAreaId : 'all'
  const focusedSpatialGroups = focusSpatialGroups(spatialGroups, normalizedSpatialAreaId)
  const hasGroundedSpatialAreas = spatialGroups.some((group) => group.kind === 'room')
  const selectedSpatialObject = selectedSpatialObjectId && currentSnapshot
    ? currentSnapshot.objects.find((item) => item.id === selectedSpatialObjectId) ?? null
    : null
  const selectedSpatialObjectDisplayName = selectedSpatialObject
    ? spatialObjectDisplayNames.get(selectedSpatialObject.id) ?? selectedSpatialObject.name
    : ''
  const selectedSpatialConditions = selectedSpatialObject && currentSnapshot
    ? currentSnapshot.conditions.filter((item) => item.objectIds.includes(selectedSpatialObject.id))
    : []
  const selectedSpatialIssues = selectedSpatialObject && currentSnapshot
    ? currentSnapshot.issues.filter((item) => item.objectIds.includes(selectedSpatialObject.id))
    : []
  const selectedSpatialRelations = selectedSpatialObject && currentSnapshot
    ? describeSpatialRelations(selectedSpatialObject, currentSnapshot, spatialObjectDisplayNames)
    : []
  const selectedSpatialRelationEdges = selectedSpatialObject && currentSnapshot
    ? buildSpatialRelationEdges(selectedSpatialObject, currentSnapshot, spatialObjectDisplayNames)
    : []
  const relatedSpatialObjectIds = new Set(selectedSpatialRelationEdges.map((edge) => edge.otherId))
  const selectedSpatialTimeline = selectedSpatialObject && memory
    ? buildSpatialObjectTimeline(memory, selectedSpatialObject.id)
    : []
  const selectedSpatialChanges = selectedSpatialObject && memory
    ? buildSpatialObjectChanges(memory, selectedSpatialObject)
    : []
  const selectedSpatialHistoryCount = selectedSpatialTimeline.length
  const resolvedAskStateId = askStateId === 'current' ? memory?.environment.currentStateId : askStateId
  const askState = resolvedAskStateId ? memory?.states.find((item) => item.id === resolvedAskStateId) : undefined
  const askHistoryCount = askState && memory ? memory.states.filter((item) => item.version <= askState.version).length : memory?.states.length ?? 0
  const answerState = answer?.grounding?.state ?? (answer && memory ? (() => {
    const state = memory.states.find((item) => item.id === answer.stateId)
    return state ? { id: state.id, version: state.version, capturedAt: state.capturedAt, summary: state.summary, isCurrent: state.id === memory.environment.currentStateId } : undefined
  })() : undefined)
  const answerPreviousState = answerState && memory ? memory.states.find((item) => item.version === answerState.version - 1) : undefined
  const answerDiff = answerState && memory ? memory.diffs.find((item) => item.toStateId === answerState.id) : undefined
  const answerRelatedObjectIds = new Set(answer?.grounding?.objects.filter((item) => item.isCurrent).map((item) => item.id) ?? answer?.relatedObjectIds ?? [])
  const actionPlanObjectIds = new Set(actionPlan?.grounding.objects.filter((item) => item.isCurrent).map((item) => item.id) ?? [])
  const verificationObjectIds = new Set(verification?.grounding.objects.filter((item) => item.stateIds.includes(verification.currentStateId)).map((item) => item.id) ?? [])
  const actionPlanBaselineState = actionPlan && memory ? memory.states.find((item) => item.id === actionPlan.plan.stateId) : undefined
  const currentMemoryState = memory?.environment.currentStateId ? memory.states.find((item) => item.id === memory.environment.currentStateId) : undefined
  const priorConditionVerificationCandidate = memory && currentMemoryState
    ? findPriorConditionVerificationCandidate(memory, currentMemoryState.id)
    : undefined
  const currentMemoryImage = currentMemoryState && memory
    ? memory.sources.find((source) => currentMemoryState.sourceIds.includes(source.id) && source.modality === 'image')?.uri
    : undefined
  const currentAttentionCount = currentSnapshot
    ? currentSnapshot.conditions.filter((item) => item.kind !== 'normal').length + currentSnapshot.issues.filter((item) => item.status !== 'resolved').length
    : 0
  const currentStateLabel = currentMemoryState ? `State v${currentMemoryState.version}` : 'No state yet'
  const canVerifyActionPlan = Boolean(actionPlan && actionPlanBaselineState && currentMemoryState && currentMemoryState.version > actionPlanBaselineState.version)
  const overlayOpen = Boolean(selectedChange || historySelection || selectedSpatialObject || selectedObservation !== null || showEnvironmentDialog)

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
    setActionPlan(null)
    setActionPlanStatus('')
    setVerification(null)
    setVerificationStatus('')
    setAskStateId('current')
    setSelectedObservation(null)
    setHistory([])
    setHistorySelection(null)
    setHistoryStatus('')
    setHistoryAt('')
    setSelectedChangeId(null)
    setSelectedSpatialObjectId(null)
    setSelectedSpatialAreaId('all')
    setShowAllObservations(false)
    setError('')
    setStatus(`Loading ${activeEnvironment.name} memory`)

    async function restoreEnvironmentalMemory() {
      try {
        const response = await fetchSentinel(`/api/memory?environmentId=${encodeURIComponent(activeEnvironment.id)}`, { headers: { Accept: 'application/json' } }, 'memory')
        const payload = await readSentinelApiResponse<MemoryResponse>(response, 'memory')
        if (cancelled) return
        if (payload.memory) {
          setMemory(payload.memory)
          setStatus(payload.persistence === 'neon' ? `${activeEnvironment.name} memory restored` : `${activeEnvironment.name} volatile memory restored`)
        } else {
          setStatus(`Ready to observe ${activeEnvironment.name}`)
        }
      } catch (memoryError) {
        if (!cancelled) {
          setStatus(`Unable to restore ${activeEnvironment.name} memory`)
          setError(memoryError instanceof Error ? memoryError.message : 'SENTINEL could not restore this location safely.')
        }
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
        const response = await fetchSentinel(`/api/states?environmentId=${encodeURIComponent(memory!.environment.id)}`, { headers: { Accept: 'application/json' } }, 'history')
        const payload = await readSentinelApiResponse<StateHistoryResponse>(response, 'history')
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
    setAskStateId('current')
    setAnswer(null)
    setActionPlan(null)
    setActionPlanStatus('')
    setVerification(null)
    setVerificationStatus('')
    setSelectedSpatialAreaId('all')
    setView('memory')
  }

  function inspectSpatialObject(objectId: string) {
    setSelectedSpatialObjectId(objectId)
    const groupId = spatialGroupForObject(spatialGroups, objectId)
    if (groupId) setSelectedSpatialAreaId(groupId)
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
    setVerification(null)
    setVerificationStatus('')
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
      const payload = await readSentinelApiResponse<ScanResponse>(response, 'observation')
      setResult(payload)
      setMemory(payload.memory)
      setStatus(payload.diff ? `${payload.diff.changes.length} supported change(s) remembered` : `${activeEnvironment.name} is now remembered`)
      if (actionPlan && actionPlan.plan.stateId !== payload.state.id) {
        const baseline = payload.memory.states.find((item) => item.id === actionPlan.plan.stateId)
        if (baseline && payload.state.version > baseline.version) {
          void runVerification({
            previousStateId: actionPlan.plan.stateId,
            currentStateId: payload.state.id,
            actionPlanId: actionPlan.plan.id,
            conditionIds: actionPlan.grounding.conditions.map((item) => item.id),
          })
        } else {
          setView(payload.diff ? 'changes' : 'memory')
        }
      } else {
        setView(payload.diff ? 'changes' : 'memory')
      }
    } catch (scanError) {
      setStatus('Observation interrupted')
      setError(scanError instanceof Error ? scanError.message : 'Unknown scan error')
    }
  }

  async function handleVideo(file: File) {
    setError('')
    setResult(null)
    setAnswer(null)
    setVerification(null)
    setVerificationStatus('')
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
      const payload = await readSentinelApiResponse<ScanResponse>(response, 'observation')
      setResult(payload)
      setMemory(payload.memory)
      setStatus(payload.diff ? `${payload.diff.changes.length} supported change(s) remembered` : `${activeEnvironment.name} is now remembered`)
      if (actionPlan && actionPlan.plan.stateId !== payload.state.id) {
        const baseline = payload.memory.states.find((item) => item.id === actionPlan.plan.stateId)
        if (baseline && payload.state.version > baseline.version) {
          void runVerification({
            previousStateId: actionPlan.plan.stateId,
            currentStateId: payload.state.id,
            actionPlanId: actionPlan.plan.id,
            conditionIds: actionPlan.grounding.conditions.map((item) => item.id),
          })
        } else {
          setView(payload.diff ? 'changes' : 'memory')
        }
      } else {
        setView(payload.diff ? 'changes' : 'memory')
      }
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

      const response = await fetchSentinel(`/api/states?${params.toString()}`, { headers: { Accept: 'application/json' } }, 'history')
      const payload = await readSentinelApiResponse<StateHistoryResponse>(response, 'history')
      if (!payload.selection) throw new Error('Historical state was not found')
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

  async function runVerification(options: { previousStateId: string; currentStateId: string; actionPlanId?: string; conditionIds?: string[] }) {
    setVerification(null)
    setVerificationStatus('Verifying the physical result against the new state…')
    setView('memory')

    try {
      const response = await fetchSentinel('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          environmentId: activeEnvironment.id,
          previousStateId: options.previousStateId,
          currentStateId: options.currentStateId,
          actionPlanId: options.actionPlanId,
          conditionIds: options.conditionIds,
        }),
      }, 'verification')
      const payload = await readSentinelApiResponse<VerificationResult>(response, 'verification')
      setVerification(payload)
      setVerificationStatus('')
    } catch (verificationError) {
      setVerificationStatus(verificationError instanceof Error ? verificationError.message : 'Unable to verify the physical result')
    }
  }

  async function runActionPlanner(options: ActionPlannerOptions = {}) {
    if (!memory) {
      setActionPlanStatus(`Observe ${activeEnvironment.name} first so SENTINEL has grounded conditions to plan from.`)
      return
    }

    const stateId = options.stateId ?? resolvedAskStateId ?? memory.environment.currentStateId
    setActionPlan(null)
    setActionPlanStatus('Planning evidence-backed next steps…')
    setVerification(null)
    setVerificationStatus('')
    setView('memory')

    try {
      const response = await fetchSentinel('/api/action-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          environmentId: memory.environment.id,
          stateId,
          goal: options.goal,
          relatedConditionIds: options.relatedConditionIds,
          relatedIssueIds: options.relatedIssueIds,
          relatedObjectIds: options.relatedObjectIds,
        }),
      }, 'action-plan')
      const payload = await readSentinelApiResponse<ActionPlanningResponse>(response, 'action-plan')
      setActionPlan(payload)
      setActionPlanStatus('')
    } catch (planError) {
      setActionPlanStatus(planError instanceof Error ? planError.message : 'Unable to create a grounded action plan')
    }
  }

  async function runAskBuilding(questionText: string, requestedStateId?: string) {
    const trimmed = questionText.trim()
    if (!trimmed) return
    if (!memory) {
      setAskStatus(`Observe ${activeEnvironment.name} first so SENTINEL has grounded memory to reason over.`)
      return
    }

    const stateId = requestedStateId ?? resolvedAskStateId ?? memory.environment.currentStateId
    const reasoningState = stateId ? memory.states.find((item) => item.id === stateId) : undefined
    const reasoningCount = reasoningState ? memory.states.filter((item) => item.version <= reasoningState.version).length : memory.states.length

    setQuestion(trimmed)
    setAskStatus(`Reasoning across ${reasoningCount} remembered state${reasoningCount === 1 ? '' : 's'}…`)
    setAnswer(null)
    setActionPlan(null)
    setActionPlanStatus('')
    setVerification(null)
    setVerificationStatus('')
    setView('memory')
    try {
      const response = await fetchSentinel('/api/ask-building', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId: memory.environment.id, question: trimmed, stateId }),
      }, 'ask')
      const payload = await readSentinelApiResponse<AskBuildingResponse>(response, 'ask')
      setAnswer(payload)
      setAskStatus('')
      if (payload.grounding?.intent === 'action') {
        void runActionPlanner({ stateId: payload.stateId, goal: trimmed })
      }

      const currentRelated = payload.grounding?.objects.filter((item) => item.isCurrent) ?? []
      if (currentRelated.length === 1) {
        const groupId = spatialGroupForObject(spatialGroups, currentRelated[0].id)
        if (groupId) setSelectedSpatialAreaId(groupId)
      }
    } catch (askError) {
      setAskStatus(askError instanceof Error ? askError.message : 'Unable to ask SENTINEL')
    }
  }

  function askBuilding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAskBuilding(question)
  }

  const observation = selectedObservation === null ? null : result?.observations[selectedObservation]

  return (
    <main className={`app phase13-shell view-${view}${isWorking ? ' system-awake' : ''}${overlayOpen ? ' overlay-open' : ''}`}>
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
        <div className="hero-copy memory-hero-copy">
          <div className="eyebrow">PHYSICAL MEMORY / {activeEnvironment.name.toUpperCase()}</div>
          <h1>{memory ? 'Your space remembers.' : 'Give this place a memory.'}</h1>
          <p>{memory ? `SENTINEL holds ${memory.states.length} immutable environmental state${memory.states.length === 1 ? '' : 's'} for ${activeEnvironment.name}. The current scene, its grounded conditions and every supported change stay connected to evidence.` : `Walk through or photograph ${activeEnvironment.name} once. SENTINEL will remember what it sees and create a persistent physical-world memory.`}</p>
        </div>

        <section className={memory ? 'memory-cinematic-hero remembered' : 'memory-cinematic-hero empty'} aria-label={memory ? 'Current environmental memory' : 'Create first environmental memory'}>
          {currentMemoryImage && <img src={currentMemoryImage} alt={activeEnvironment.name + ' current remembered environment'} />}
          <div className="memory-cinematic-shade" />
          <div className="memory-cinematic-topline">
            <span>{memory ? 'CURRENT MEMORY' : 'FIRST OBSERVATION'}</span>
            <strong>{memory ? currentStateLabel : 'DORMANT'}</strong>
          </div>
          <div className="memory-cinematic-copy">
            <span className="eyebrow">{memory ? (currentAttentionCount > 0 ? 'ATTENTION PRESENT' : 'ENVIRONMENT REMEMBERED') : 'SENTINEL / DORMANT'}</span>
            <strong>{memory ? activeEnvironment.name : 'Nothing here has a memory yet.'}</strong>
            <p>{memory ? (currentAttentionCount > 0 ? `${currentAttentionCount} grounded condition${currentAttentionCount === 1 ? '' : 's'} or issue${currentAttentionCount === 1 ? '' : 's'} currently deserve attention.` : 'The current remembered state has no grounded operational condition requiring attention.') : 'Observe the environment once. Objects, conditions, relationships and future changes will attach to this place.'}</p>
          </div>
          {memory ? <div className="memory-cinematic-footer">
            <div><span>LAST REMEMBERED</span><strong>{currentMemoryState ? formatStateTimestamp(currentMemoryState.capturedAt) : 'Unknown'}</strong></div>
            <div><span>OBJECTS</span><strong>{currentSnapshot?.objects.length ?? memory.objects.length}</strong></div>
            <div><span>CONDITIONS</span><strong>{currentSnapshot?.conditions.filter((item) => item.kind !== 'normal').length ?? 0}</strong></div>
            <button type="button" onClick={() => setView('observe')}>Observe again <b>↗</b></button>
          </div> : <button className="memory-first-observe" type="button" onClick={() => setView('observe')}><span className="observe-orb"><i /></span><span><strong>Begin observation</strong><small>Create ${activeEnvironment.name} memory v1</small></span></button>}
        </section>

        {memory && <section className="ask-building-context" aria-label="Ask the Building">
          <div className="ask-building-heading">
            <div>
              <span className="eyebrow">ASK THE BUILDING / EVIDENCE-GROUNDED</span>
              <strong>Ask this place what it remembers.</strong>
              <small>The environment answers through remembered states, grounded relations, evidence and Reality Diff—not a detached chat transcript.</small>
            </div>
            <label className="ask-state-scope">
              <span>Reason from</span>
              <select value={askStateId} onChange={(event) => { setAskStateId(event.target.value); setAnswer(null); setActionPlan(null); setActionPlanStatus(''); setAskStatus('') }} aria-label="Ask reasoning state">
                <option value="current">Current state · v{memory.states.find((item) => item.id === memory.environment.currentStateId)?.version ?? memory.states.length}</option>
                {[...memory.states].filter((item) => item.id !== memory.environment.currentStateId).sort((a, b) => b.version - a.version).map((item) => <option key={item.id} value={item.id}>State v{item.version} · {formatStateTimestamp(item.capturedAt)}</option>)}
              </select>
              <small>{askHistoryCount} remembered state{askHistoryCount === 1 ? '' : 's'} available to reasoning</small>
            </label>
          </div>
          <div className="ask-prompt-rail" aria-label="Core Ask the Building questions">
            {ASK_BUILDING_PROMPTS.map((item) => <button type="button" key={item.question} onClick={() => void runAskBuilding(item.question)} disabled={Boolean(askStatus)}><span>{item.label}</span><strong>{item.question}</strong></button>)}
          </div>
        </section>}

        {answer && <section className="answer-panel phase10-answer" aria-live="polite">
          <div className="answer-heading-row">
            <div><span className="eyebrow">SENTINEL / CONCLUSION</span><small>{answer.grounding?.intent ? answer.grounding.intent.toUpperCase() + ' REASONING' : 'GROUNDED REASONING'}</small></div>
            <button type="button" onClick={() => { setAnswer(null); setQuestion('') }} aria-label="Clear Ask the Building answer">×</button>
          </div>
          <h2>{answer.answer}</h2>
          {answer.rationale && <div className="answer-rationale"><span>WHY THIS MATTERS</span><p>{answer.rationale}</p></div>}
          <div className="answer-meta">
            <span>Confidence {Math.round(answer.confidence * 100)}%</span>
            <span>{answer.evidenceIds.length} grounded evidence</span>
            <span>{answerState ? `State v${answerState.version}` : 'Remembered state'}</span>
            <span>{answer.grounding?.historyStateIds.length ?? 1} state{(answer.grounding?.historyStateIds.length ?? 1) === 1 ? '' : 's'} considered</span>
          </div>
          <div className="answer-grounding-grid">
            <div className="answer-grounding-block answer-comparison">
              <span className="answer-label">CURRENT VS PREVIOUS</span>
              <div><strong>{answerState ? `State v${answerState.version}` : stateLabel(memory, answer.stateId)}</strong><small>{answerState ? formatStateTimestamp(answerState.capturedAt) : shortStateId(answer.stateId)}</small></div>
              <b>←</b>
              <div><strong>{answerPreviousState ? `State v${answerPreviousState.version}` : 'No earlier state'}</strong><small>{answerDiff?.summary ?? (answerPreviousState ? formatStateTimestamp(answerPreviousState.capturedAt) : 'First remembered state')}</small></div>
            </div>
            <div className="answer-grounding-block">
              <span className="answer-label">RELATED PHYSICAL OBJECTS</span>
              <div className="answer-object-links">
                {(answer.grounding?.objects ?? []).length === 0 ? <small>No object reference was needed for this conclusion.</small> : answer.grounding!.objects.map((item) => <button type="button" key={item.id} onClick={() => {
                  if (item.isCurrent && currentSnapshot?.objects.some((object) => object.id === item.id)) { inspectSpatialObject(item.id); return }
                  const historicalStateId = item.stateIds.at(-1)
                  if (historicalStateId) void inspectHistoricalState({ stateId: historicalStateId })
                }}><strong>{item.name}</strong><small>{item.category}{item.position ? ' · ' + item.position : ''} · {item.isCurrent ? 'current' : 'historical'}</small></button>)}
              </div>
            </div>
            <div className="answer-grounding-block">
              <span className="answer-label">OPERATIONAL ISSUES</span>
              <div className="answer-issue-links">
                {(answer.grounding?.issues ?? []).length === 0 ? <small>No operational issue was cited.</small> : answer.grounding!.issues.map((item) => <span key={item.id}><strong>{item.title}</strong><small>{item.severity} · {item.status} · {Math.round(item.confidence * 100)}%</small></span>)}
              </div>
            </div>
            <details className="answer-grounding-block answer-evidence" open={answer.evidenceIds.length > 0 && answer.evidenceIds.length <= 4}>
              <summary><span className="answer-label">SHOW EVIDENCE</span><strong>{answer.grounding?.evidence.length ?? answer.evidenceIds.length} reference{(answer.grounding?.evidence.length ?? answer.evidenceIds.length) === 1 ? '' : 's'} ↘</strong></summary>
              <div className="answer-evidence-list">
                {(answer.grounding?.evidence ?? []).length === 0 ? <small>No evidence ID survived grounding validation. Confidence is automatically capped when that happens.</small> : answer.grounding!.evidence.map((item) => <div key={item.id}><span>{item.type} · {formatStateTimestamp(item.capturedAt)}</span><strong>{item.description}</strong><small>{item.frameIndex === undefined ? item.sourceId : `Frame ${item.frameIndex} · ${item.sourceId}`}</small></div>)}
              </div>
            </details>
          </div>
          {(answer.grounding?.intent === 'attention' || answer.grounding?.intent === 'priority' || answer.grounding?.intent === 'action') && <button className="answer-plan-action" type="button" disabled={Boolean(actionPlanStatus)} onClick={() => void runActionPlanner({ stateId: answer.stateId, goal: answer.answer })}>
            {actionPlanStatus ? 'Planning grounded next steps…' : actionPlan ? 'Rebuild action plan ↗' : 'Create grounded action plan ↗'}
          </button>}
        </section>}

        {actionPlanStatus && <div className="action-plan-status" role="status">{actionPlanStatus}</div>}

        {actionPlan && <section className="action-plan-panel" aria-label="Recommended action plan">
          <div className="action-plan-header">
            <div>
              <span className="eyebrow">ACTION PLAN / RECOMMENDED</span>
              <strong>{actionPlan.plan.goal}</strong>
              <small>State v{actionPlan.grounding.state.version} · {actionPlan.plan.evidenceIds.length} grounded evidence reference{actionPlan.plan.evidenceIds.length === 1 ? '' : 's'}</small>
            </div>
            <button type="button" onClick={() => { setActionPlan(null); setActionPlanStatus('') }} aria-label="Clear action plan">×</button>
          </div>
          {!actionPlan.grounding.state.isCurrent && <div className="action-plan-history-warning"><strong>Historical plan.</strong><span>This plan is grounded in an immutable past state. Reconfirm the current environment before acting.</span></div>}
          <p className="action-plan-rationale">{actionPlan.plan.rationale}</p>
          <div className="action-plan-steps">
            {actionPlan.plan.steps.map((step, index) => <article className="action-step" key={step.id}>
              <div className="action-step-number">{String(index + 1).padStart(2, '0')}</div>
              <div className="action-step-copy">
                <div className="action-step-meta"><span className={'action-priority ' + step.priority}>{step.priority}</span><span>{step.status}</span></div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <div className="action-step-grounding">
                  <span>{step.relatedConditionIds.length} condition{step.relatedConditionIds.length === 1 ? '' : 's'}</span>
                  <span>{step.relatedIssueIds.length} issue{step.relatedIssueIds.length === 1 ? '' : 's'}</span>
                  <span>{step.evidenceIds.length} evidence</span>
                  {step.requiredSpecialist && <span>Specialist: {step.requiredSpecialist}</span>}
                </div>
              </div>
            </article>)}
          </div>
          <div className="action-plan-footer">
            <div><span>HUMAN CHECKPOINT</span><strong>Nothing here is marked completed or verified.</strong><p>Follow only the appropriate recommended steps, then rescan. Phase 12 decides whether the physical condition actually changed.</p></div>
            <div className="action-plan-footer-actions">
              {canVerifyActionPlan && currentMemoryState && <button className="verify-current-button" type="button" disabled={Boolean(verificationStatus)} onClick={() => void runVerification({
                previousStateId: actionPlan.plan.stateId,
                currentStateId: currentMemoryState.id,
                actionPlanId: actionPlan.plan.id,
                conditionIds: actionPlan.grounding.conditions.map((item) => item.id),
              })}>{verificationStatus ? 'Verifying…' : 'Verify against current state ↗'}</button>}
              <button type="button" onClick={() => libraryInputRef.current?.click()}>Choose rescan photo ↗</button>
            </div>
          </div>
        </section>}

        {verificationStatus && <div className="verification-status" role="status">{verificationStatus}</div>}

        {verification && <section className={'verification-panel status-' + verification.status} aria-label="Verification result" aria-live="polite">
          <div className="verification-header">
            <div>
              <span className="eyebrow">VERIFICATION / PHYSICAL RESULT</span>
              <strong>{verification.status === 'passed' ? 'Verified.' : verification.status === 'partial' ? 'Partially resolved.' : verification.status === 'failed' ? 'Not resolved.' : 'Verification inconclusive.'}</strong>
              <small>State v{verification.grounding.previousState.version} → State v{verification.grounding.currentState.version}</small>
            </div>
            <button type="button" onClick={() => { setVerification(null); setVerificationStatus('') }} aria-label="Clear verification result">×</button>
          </div>
          <p className="verification-summary">{verification.summary}</p>
          <div className="verification-metrics">
            <span><strong>{verification.resolvedConditionIds.length}</strong> resolved</span>
            <span><strong>{verification.remainingConditionIds.length}</strong> remaining</span>
            <span><strong>{verification.inconclusiveConditionIds.length}</strong> inconclusive</span>
            <span><strong>{verification.newConditionIds.length}</strong> new</span>
            <span><strong>{verification.evidenceIds.length}</strong> evidence</span>
          </div>
          <div className="verification-verdicts">
            {verification.verdicts.map((verdict, index) => {
              const condition = verification.grounding.baselineConditions.find((item) => item.id === verdict.conditionId)
              return <article className={'verification-verdict ' + verdict.status} key={verdict.conditionId}>
                <div className="verification-verdict-index">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <div className="verification-verdict-meta"><span>{verdict.status}</span><span>{Math.round(verdict.confidence * 100)}%</span><span>{verdict.evidenceIds.length} current evidence</span></div>
                  <h3>{condition?.title ?? 'Grounded condition'}</h3>
                  <p>{verdict.reason}</p>
                </div>
              </article>
            })}
          </div>
          {verification.grounding.currentConditions.length > 0 && <details className="verification-current-conditions">
            <summary><span>Current non-normal conditions</span><strong>{verification.grounding.currentConditions.length} ↘</strong></summary>
            <div>{verification.grounding.currentConditions.map((item) => <article key={item.id}><strong>{item.title}</strong><small>{item.kind} · {item.basis} · {Math.round(item.confidence * 100)}%</small><p>{item.description}</p></article>)}</div>
          </details>}
          <div className="verification-footer">
            <div><span>TRUST RULE</span><strong>Not re-observed is not resolved.</strong><p>SENTINEL only returns Verified when positive current evidence supports the physical outcome. Otherwise it stays partial, failed, or inconclusive.</p></div>
            <button type="button" onClick={() => setView('changes')}>Inspect Reality Diff ↗</button>
          </div>
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
            {hasGroundedSpatialAreas ? <div className="spatial-area-navigation" aria-label="Spatial area navigation">
              <span>BUILDING</span>
              <div>
                <button className={normalizedSpatialAreaId === 'all' ? 'active' : ''} type="button" aria-current={normalizedSpatialAreaId === 'all' ? 'true' : undefined} onClick={() => setSelectedSpatialAreaId('all')}>
                  <strong>{activeEnvironment.name}</strong><small>{currentSnapshot.objects.length} objects</small>
                </button>
                {spatialGroups.map((group) => <button className={normalizedSpatialAreaId === group.id ? 'active' : ''} type="button" aria-current={normalizedSpatialAreaId === group.id ? 'true' : undefined} key={group.id} onClick={() => setSelectedSpatialAreaId(group.id)}>
                  <strong>{group.name}</strong><small>{group.kind === 'room' ? 'area' : 'unassigned'} · {group.objects.length}</small>
                </button>)}
              </div>
            </div> : <div className="spatial-area-fallback">
              <span>ENVIRONMENT-LEVEL MEMORY</span>
              <strong>No grounded room structure is being claimed.</strong>
              <small>SENTINEL is showing the observed space exactly as persisted.</small>
            </div>}
            <div className={'spatial-room-grid ' + (normalizedSpatialAreaId === 'all' ? 'building-view' : 'area-focused')}>
              {focusedSpatialGroups.map((group) => <section className={normalizedSpatialAreaId === group.id ? 'spatial-room focused' : 'spatial-room'} key={group.id}>
                <div className="spatial-room-heading">
                  <div><span>{group.name}</span><small>{group.kind === 'room' ? 'remembered area' : 'observed space'}</small></div>
                  <div className="spatial-room-actions">
                    <strong>{group.objects.length}</strong>
                    {hasGroundedSpatialAreas && normalizedSpatialAreaId !== group.id && <button type="button" onClick={() => setSelectedSpatialAreaId(group.id)}>Focus ↗</button>}
                  </div>
                </div>
                <div className="spatial-object-cloud">
                  {group.objects.length === 0 ? <span className="spatial-room-empty">No grounded objects assigned to this area yet.</span> : group.objects.map((item) => {
                    const tone = spatialObjectTone(item, currentSnapshot)
                    const displayName = spatialObjectDisplayNames.get(item.id) ?? item.name
                    const relationshipClass = selectedSpatialObjectId === item.id ? ' selected-spatial' : relatedSpatialObjectIds.has(item.id) ? ' related-spatial' : verificationObjectIds.has(item.id) ? ' verification-related-spatial' : actionPlanObjectIds.has(item.id) ? ' action-related-spatial' : answerRelatedObjectIds.has(item.id) ? ' answer-related-spatial' : ''
                    return <button className={'spatial-object ' + tone + relationshipClass} type="button" key={item.id} onClick={() => inspectSpatialObject(item.id)} aria-label={'Inspect ' + displayName}>
                      <i />
                      <span><strong>{displayName}</strong><small>{spatialObjectSubtitle(item)}</small></span>
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
        <div className={currentMemoryImage ? 'observe-camera has-memory-image' : 'observe-camera'} style={currentMemoryImage ? { backgroundImage: `linear-gradient(90deg, rgba(8,10,9,.94) 0%, rgba(8,10,9,.68) 44%, rgba(8,10,9,.3) 100%), url("${currentMemoryImage}")` } : undefined}><div className="camera-noise" /><div className="scan-line" /><div className="camera-topline"><SentinelMark active /><span>{isWorking ? status : `${activeEnvironment.name.toUpperCase()} / OBSERVATION MODE`}</span></div><div className="focus-frame focus-one"><span>Workspace</span></div><div className="focus-frame focus-two"><span>Evidence region</span></div><div className="observe-message"><span className="eyebrow">PHONE-FIRST OBSERVATION</span><h2>{isWorking ? status : memory ? `Photograph what changed in ${activeEnvironment.name}.` : `Create the first memory for ${activeEnvironment.name}.`}</h2><p>Take one clear photo or choose one from Photos. SENTINEL grounds visible evidence and updates only this location's persistent environmental state. Video remains optional for larger spaces.</p></div><div className="observe-capture-actions"><button className="capture-button" type="button" onClick={() => libraryInputRef.current?.click()} aria-label="Choose a photo from library"><span><i /></span><strong>{isWorking ? 'Observing' : memory ? 'Choose update photo' : 'Choose first photo'}</strong></button><div className="observe-secondary-actions"><button className="walkthrough-option" type="button" onClick={() => inputRef.current?.click()} disabled={isWorking}>Take photo</button><button className="walkthrough-option" type="button" onClick={() => videoInputRef.current?.click()} disabled={isWorking}>Choose video</button></div></div></div>
        {error && <div className="error" role="alert"><strong>Observation interrupted</strong><span>{error}</span></div>}
      </section>}

      {view === 'changes' && <section className="changes-view operations-diff">
        <div className="hero-copy compact operations-diff-hero">
          <div className="eyebrow">REALITY DIFF / {activeEnvironment.name.toUpperCase()}</div>
          <h1>{latestDiff ? 'What changed.' : 'What changed.'}</h1>
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
          <div><span className="eyebrow">NEXT OPERATION</span><strong>{latestDiff && attentionChanges.length > 0 ? 'Review what needs attention, then ask SENTINEL what should happen next.' : latestDiff && verificationChanges.length > 0 ? 'Verification is required before treating this as resolved. Re-observe the area and confirm the physical condition.' : priorConditionVerificationCandidate ? `A prior condition from State v${priorConditionVerificationCandidate.previousState.version} is ready to verify against the current clear state.` : latestDiff ? 'No urgent action is implied by the diff alone. Observe again when the physical state changes.' : 'Create a second state to unlock Reality Diff.'}</strong></div>
          {priorConditionVerificationCandidate ? <div className="operations-next-actions">
            <button className="verify-current-button" type="button" disabled={Boolean(verificationStatus)} onClick={() => void runVerification({
              previousStateId: priorConditionVerificationCandidate.previousState.id,
              currentStateId: priorConditionVerificationCandidate.currentState.id,
              conditionIds: priorConditionVerificationCandidate.conditions.map((item) => item.id),
            })}>{verificationStatus ? 'Verifying…' : `Verify ${priorConditionVerificationCandidate.conditions.length} prior condition${priorConditionVerificationCandidate.conditions.length === 1 ? '' : 's'} ↗`}</button>
            <button className="wide-observe compact" type="button" onClick={() => libraryInputRef.current?.click()}><span>Choose another photo</span><span>Only if the physical state changed again ↗</span></button>
          </div> : <button className="wide-observe" type="button" onClick={() => libraryInputRef.current?.click()}><span>Choose update photo</span><span>Select the next environmental state image ↗</span></button>}
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
              const changeQuestion = `What should I do about: ${selectedChange.title}?`
              setAskStateId(latestDiff.toStateId)
              setSelectedChangeId(null)
              void runAskBuilding(changeQuestion, latestDiff.toStateId)
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
          <button className="history-ask-action" type="button" onClick={() => {
            setAskStateId(historySelection.state.id)
            setQuestion('What did you see in this remembered state?')
            setHistorySelection(null)
            setView('memory')
          }}>Ask from State v{historySelection.state.version} ↗</button>

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

      {selectedSpatialObject && currentSnapshot && <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedSpatialObjectId(null)}>
        <aside className="evidence-drawer spatial-object-drawer" role="dialog" aria-modal="true" aria-label={selectedSpatialObjectDisplayName + ' spatial memory'} onClick={(event) => event.stopPropagation()}>
          <button className="drawer-close" type="button" onClick={() => setSelectedSpatialObjectId(null)}>×</button>
          <span className="eyebrow">SPATIAL MEMORY / CURRENT OBJECT</span>
          <h2>{selectedSpatialObjectDisplayName}</h2>
          <p>{selectedSpatialObject.description ?? 'No additional visual description was persisted for this object.'}</p>
          <Confidence value={selectedSpatialObject.confidence} />
          <div className="spatial-object-meta">
            <div><span>Category</span><strong>{selectedSpatialObject.category}</strong></div>
            <div><span>Visible state</span><strong>{selectedSpatialObject.state ?? 'Unknown'}</strong></div>
            <div><span>Location</span><strong>{selectedSpatialObject.position?.description ?? 'No grounded position yet'}</strong></div>
            <div><span>Last observed</span><strong>{formatStateTimestamp(selectedSpatialObject.lastSeenAt)}</strong></div>
            <div><span>Evidence</span><strong>{selectedSpatialObject.evidenceIds.length} record{selectedSpatialObject.evidenceIds.length === 1 ? '' : 's'}</strong></div>
            <div><span>History</span><strong>{selectedSpatialHistoryCount} state{selectedSpatialHistoryCount === 1 ? '' : 's'}</strong></div>
          </div>
          {selectedSpatialRelationEdges.length > 0 && <div className="spatial-drawer-section spatial-relation-visual-section">
            <span className="eyebrow">RELATIONSHIP MAP / CURRENT STATE</span>
            <div className="spatial-relation-map" aria-label={'Grounded relationships for ' + selectedSpatialObjectDisplayName}>
              <div className="spatial-relation-anchor"><small>SELECTED OBJECT</small><strong>{selectedSpatialObjectDisplayName}</strong><span>{selectedSpatialObject.category}</span></div>
              <div className="spatial-relation-branches">
                {selectedSpatialRelationEdges.map((edge) => <button className={'spatial-relation-branch ' + (edge.outgoing ? 'outgoing' : 'incoming')} type="button" key={edge.id} onClick={() => inspectSpatialObject(edge.otherId)}>
                  <span className="spatial-relation-path"><i /><b>{edge.outgoing ? edge.typeLabel + ' →' : '← ' + edge.typeLabel}</b><i /></span>
                  <span className="spatial-relation-target"><strong>{edge.otherName}</strong><small>{edge.otherCategory} · {Math.round(edge.confidence * 100)}% grounded</small></span>
                </button>)}
              </div>
            </div>
            <small className="spatial-relation-note">Only persisted current-state relations are drawn. Line direction follows the stored relation edge; no geometry is invented.</small>
          </div>}
          {selectedSpatialRelations.length > 0 && <div className="spatial-drawer-section">
            <span className="eyebrow">RELATIONSHIP RECORDS</span>
            {selectedSpatialRelations.map((item) => <div className="spatial-relation-row" key={item.id}><strong>{item.label}</strong><small>{Math.round(item.confidence * 100)}% grounded</small></div>)}
          </div>}
          {selectedSpatialConditions.length > 0 && <div className="spatial-drawer-section">
            <span className="eyebrow">CONDITIONS</span>
            {selectedSpatialConditions.map((item) => <div className="spatial-condition-row" key={item.id}><strong>{item.title}</strong><small>{item.basis} · {item.kind} · {Math.round(item.confidence * 100)}%</small><p>{item.description}</p></div>)}
          </div>}
          {selectedSpatialIssues.length > 0 && <div className="spatial-drawer-section">
            <span className="eyebrow">OPERATIONS</span>
            {selectedSpatialIssues.map((item) => <div className="spatial-condition-row issue" key={item.id}><strong>{item.title}</strong><small>{item.severity} · {item.status}</small><p>{item.description}</p></div>)}
          </div>}
          <div className="spatial-drawer-section">
            <span className="eyebrow">OBJECT MEMORY / HISTORY</span>
            {selectedSpatialTimeline.length === 0 ? <div className="spatial-history-empty">No immutable object history is available yet.</div> : <div className="spatial-object-timeline">
              {selectedSpatialTimeline.map((entry) => <div className="spatial-timeline-entry" key={entry.stateId}>
                {entry.imageUri ? <div className="spatial-timeline-image"><img src={entry.imageUri} alt={entry.stateLabel + ' evidence'} /></div> : <div className="spatial-timeline-image placeholder">◎</div>}
                <div className="spatial-timeline-copy">
                  <span>{entry.stateLabel} · {formatStateTimestamp(entry.capturedAt)}</span>
                  <strong>{entry.visibleState ?? 'State unknown'}</strong>
                  <small>{entry.position ?? 'No grounded position'} · {Math.round(entry.confidence * 100)}%</small>
                </div>
              </div>)}
            </div>}
          </div>
          {selectedSpatialChanges.length > 0 && <div className="spatial-drawer-section">
            <span className="eyebrow">REALITY DIFF / THIS OBJECT</span>
            <div className="spatial-object-changes">
              {selectedSpatialChanges.map((entry) => <button type="button" className="spatial-object-change" key={entry.change.id} onClick={() => {
                setSelectedChangeId(entry.change.id)
                setSelectedSpatialObjectId(null)
                setView('changes')
              }}>
                <span className={'change-mark ' + entry.change.type}>{changeMark(entry.change.type)}</span>
                <span><strong>{entry.change.title}</strong><small>{entry.fromLabel} → {entry.toLabel}</small><p>{entry.change.description}</p></span>
                <em>{Math.round(entry.change.confidence * 100)}%</em>
              </button>)}
            </div>
          </div>}
          {(selectedSpatialIssues.length > 0 || selectedSpatialConditions.some((item) => item.kind !== 'normal')) && <button className="spatial-plan-button" type="button" onClick={() => {
            const objectId = selectedSpatialObject.id
            const conditionIds = selectedSpatialConditions.filter((item) => item.kind !== 'normal').map((item) => item.id)
            const issueIds = selectedSpatialIssues.map((item) => item.id)
            setSelectedSpatialObjectId(null)
            void runActionPlanner({
              stateId: currentSnapshot.stateId,
              goal: 'Create a safe plan for ' + selectedSpatialObjectDisplayName,
              relatedConditionIds: conditionIds,
              relatedIssueIds: issueIds,
              relatedObjectIds: [objectId],
            })
          }}>Create action plan ↗</button>}
          <button className="spatial-ask-button" type="button" onClick={() => {
            const objectQuestion = 'What do you know about ' + selectedSpatialObjectDisplayName + ', where is it, how has it changed over time, and does it need attention?'
            setAskStateId(currentSnapshot.stateId)
            setSelectedSpatialObjectId(null)
            void runAskBuilding(objectQuestion, currentSnapshot.stateId)
          }}>Ask SENTINEL about this object ↗</button>
        </aside>
      </div>}

      {observation && <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedObservation(null)}><aside className="evidence-drawer" role="dialog" aria-modal="true" aria-label={`${observation.label} evidence`} onClick={(event) => event.stopPropagation()}><button className="drawer-close" type="button" onClick={() => setSelectedObservation(null)}>×</button><span className="eyebrow">OBSERVED / EVIDENCE-BACKED</span><h2>{observation.label}</h2><p>{observation.description}</p><Confidence value={observation.confidence} /><div className="evidence-rule" /><div className="evidence-note"><span>What this means</span><strong>SENTINEL stores this as an observation, not a professional diagnosis.</strong><p>Interpretation and recommended action remain separate from what the visual evidence directly supports.</p></div></aside></div>}

      {showEnvironmentDialog && <div className="drawer-backdrop location-backdrop" role="presentation" onClick={() => setShowEnvironmentDialog(false)}><form className="location-dialog" onSubmit={addEnvironment} onClick={(event) => event.stopPropagation()}><button className="drawer-close" type="button" onClick={() => setShowEnvironmentDialog(false)}>×</button><span className="eyebrow">NEW PHYSICAL MEMORY</span><h2>Add another location.</h2><p>Each location gets its own environment ID, scans, state history, Reality Diffs and questions. Scanning a new location will not overwrite {activeEnvironment.name}.</p><label><span>Location name</span><input autoFocus value={newEnvironmentName} onChange={(event) => setNewEnvironmentName(event.target.value)} placeholder="e.g. Head Office, Warehouse A" maxLength={80} /></label><label><span>Space type</span><select value={newEnvironmentType} onChange={(event) => setNewEnvironmentType(event.target.value as EnvironmentType)}>{ENVIRONMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div className="location-actions"><button type="button" onClick={() => setShowEnvironmentDialog(false)}>Cancel</button><button className="location-create" type="submit" disabled={!newEnvironmentName.trim()}>Create location</button></div></form></div>}

      <form className={`ask-bar ${answer ? 'has-answer' : ''}`} role="search" onSubmit={askBuilding}>
        <span className="ask-spark">✦</span>
        <input value={question} onChange={(event) => { setQuestion(event.target.value); if (askStatus) setAskStatus('') }} placeholder={memory ? `Ask ${askState ? `State v${askState.version}` : activeEnvironment.name}…` : `Observe ${activeEnvironment.name} first…`} aria-label="Ask this environment" />
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

interface SpatialObjectTimelineEntry {
  stateId: string
  stateLabel: string
  capturedAt: string
  visibleState?: string
  position?: string
  confidence: number
  imageUri?: string
}

interface SpatialObjectChangeEntry {
  change: Change
  fromLabel: string
  toLabel: string
}


function buildSpatialObjectTimeline(memory: EnvironmentalMemory, objectId: string): SpatialObjectTimelineEntry[] {
  const stateById = new Map(memory.states.map((state) => [state.id, state]))
  const sourceById = new Map(memory.sources.map((source) => [source.id, source]))

  return memory.snapshots
    .flatMap((snapshot): SpatialObjectTimelineEntry[] => {
      const object = snapshot.objects.find((item) => item.id === objectId)
      if (!object) return []
      const state = stateById.get(snapshot.stateId)
      if (!state) return []
      const imageSource = state.sourceIds
        .map((sourceId) => sourceById.get(sourceId))
        .find((source) => source?.modality === 'image')
      return [{
        stateId: snapshot.stateId,
        stateLabel: 'State v' + state.version,
        capturedAt: state.capturedAt,
        visibleState: object.state,
        position: object.position?.description,
        confidence: object.confidence,
        imageUri: imageSource?.uri,
      }]
    })
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
}

function buildSpatialObjectChanges(memory: EnvironmentalMemory, object: SpatialObject): SpatialObjectChangeEntry[] {
  const normalizedName = normalizeSpatialObjectName(object.name)
  const matches = memory.diffs.flatMap((diff) => diff.changes
    .filter((change) =>
      change.entityId === object.id ||
      (change.entityKind === 'object' && normalizeSpatialObjectName(change.title.replace(/^[^:]+:\s*/, '')) === normalizedName),
    )
    .map((change) => ({
      change,
      fromLabel: stateLabel(memory, diff.fromStateId),
      toLabel: stateLabel(memory, diff.toStateId),
    })))

  return matches.sort((a, b) => {
    const aState = memory.states.find((state) => state.id === memory.diffs.find((diff) => diff.changes.some((change) => change.id === a.change.id))?.toStateId)
    const bState = memory.states.find((state) => state.id === memory.diffs.find((diff) => diff.changes.some((change) => change.id === b.change.id))?.toStateId)
    return (bState?.version ?? 0) - (aState?.version ?? 0)
  })
}

function normalizeSpatialObjectName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
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

      const serverRetryExhausted = response.headers.get('x-sentinel-server-retry') === 'exhausted'
      if (attempt === 0 && [502, 503, 504].includes(response.status) && !serverRetryExhausted) {
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
