import { createHash } from 'node:crypto'
import { createServer } from 'vite'

const origin = (process.env.SENTINEL_PRODUCTION_ORIGIN || 'https://sentinel-physical-memory.vercel.app').replace(/\/+$/, '')
const environmentId = process.env.SENTINEL_PHASE9_VALIDATION_ENVIRONMENT_ID || 'env_warehouse_73266674'
const expectedDeploymentCommit = process.env.SENTINEL_EXPECTED_DEPLOYMENT_COMMIT?.trim() || ''

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  if (expectedDeploymentCommit) {
    await waitForDeployment(expectedDeploymentCommit)
  }

  const {
    listEnvironmentalStateHistory,
    selectEnvironmentalState,
  } = await vite.ssrLoadModule('/src/memory/history.ts')
  const {
    buildSpatialGroups,
    buildSpatialRelationEdges,
    spatialGroupForObject,
  } = await vite.ssrLoadModule('/src/memory/spatial-memory.ts')

  const firstBundle = await fetchHistoryBundle()
  const { list, selections } = firstBundle

  expect(list.persistence === 'neon', 'Phase 9 real-history gate must read from Neon persistence')
  expect(Array.isArray(list.states) && list.states.length >= 3, 'validation fixture must expose at least three persisted states')
  expect(list.currentStateId, 'validation fixture must expose a current state')
  expect(list.previousStateId, 'validation fixture must expose a previous state')

  const orderedSelections = [...selections].sort((a, b) => a.selection.state.version - b.selection.state.version)
  const versions = orderedSelections.map((entry) => entry.selection.state.version)
  expect(versions.every((version, index) => index === 0 || version > versions[index - 1]), 'state versions must remain strictly ordered')

  const currentApi = await fetchState({ selector: 'current' })
  const previousApi = await fetchState({ selector: 'previous' })
  expect(currentApi.selection?.state?.id === list.currentStateId, 'current API selector must resolve the listed current state')
  expect(previousApi.selection?.state?.id === list.previousStateId, 'previous API selector must resolve the listed previous state')

  const memory = reconstructMemory(list, orderedSelections)
  const history = listEnvironmentalStateHistory(memory)
  expect(history.length === orderedSelections.length, 'local history projection must preserve every real persisted state')
  expect(history[0]?.stateId === list.currentStateId && history[0]?.isCurrent, 'local history projection must put the real current state first')

  const current = selectEnvironmentalState(memory, { selector: 'current' })
  const previous = selectEnvironmentalState(memory, { selector: 'previous' })
  expect(current?.state.id === list.currentStateId, 'local current selector must resolve the production current state')
  expect(previous?.state.id === list.previousStateId, 'local previous selector must resolve the production previous state')

  const previousById = selectEnvironmentalState(memory, { stateId: previous.state.id })
  const previousByTime = selectEnvironmentalState(memory, { at: previous.state.capturedAt })
  expect(previousById?.state.id === previous.state.id, 'state-by-ID must reopen the exact immutable production snapshot')
  expect(previousByTime?.state.id === previous.state.id, 'state-by-time must reopen the exact immutable production snapshot')

  const currentGroups = buildSpatialGroups(current.snapshot, 'Warehouse')
  expect(currentGroups.length === 1, 'current warehouse fixture should remain one honest environment-level spatial group')
  expect(currentGroups[0]?.kind === 'environment', 'missing grounded room objects must not become fabricated areas')
  expect(currentGroups[0]?.objects.length === current.snapshot.objects.length, 'environment-level group must retain every current physical object')

  const currentIds = new Set(current.snapshot.objects.map((item) => item.id))
  const persistentObjectIds = orderedSelections
    .flatMap((entry) => entry.selection.snapshot.objects.map((item) => item.id))
    .filter((id, index, all) => all.indexOf(id) === index)
    .filter((id) => orderedSelections.filter((entry) => entry.selection.snapshot.objects.some((item) => item.id === id)).length >= 2)
  expect(persistentObjectIds.length >= 1, 'real fixture must contain at least one durable object across immutable states')

  const operationalObject = previous.snapshot.objects.find((item) =>
    currentIds.has(item.id) &&
    previous.snapshot.issues.some((issue) => issue.objectIds.includes(item.id)) &&
    buildSpatialRelationEdges(item, previous.snapshot).length > 0,
  )
  expect(operationalObject, 'previous real state must expose a durable object with grounded relations and an operational issue')

  const previousEdges = buildSpatialRelationEdges(operationalObject, previous.snapshot)
  const previousConditions = previous.snapshot.conditions.filter((condition) => condition.objectIds.includes(operationalObject.id))
  const previousIssues = previous.snapshot.issues.filter((issue) => issue.objectIds.includes(operationalObject.id))
  expect(previousEdges.length > 0, 'real object inspector must have persisted relationship edges in historical state')
  expect(previousEdges.every((edge) => previous.snapshot.objects.some((item) => item.id === edge.otherId)), 'relation map must resolve only real snapshot endpoints')
  expect(previousConditions.length > 0, 'real object inspector must expose a persisted condition for the selected historical object')
  expect(previousIssues.length > 0, 'real object inspector must expose a persisted operational issue for the selected historical object')

  const currentObject = current.snapshot.objects.find((item) => item.id === operationalObject.id)
  expect(currentObject, 'selected durable object must continue into the current real state')
  expect(spatialGroupForObject(currentGroups, currentObject.id) === currentGroups[0].id, 'current durable object must remain navigable in honest environment-level spatial memory')

  const previousEvidence = new Set(previous.evidence.map((item) => item.id))
  const currentEvidence = new Set(current.evidence.map((item) => item.id))
  expect(operationalObject.evidenceIds.some((id) => previousEvidence.has(id)), 'historical object must retain evidence from its immutable historical state')
  expect(currentObject.evidenceIds.some((id) => currentEvidence.has(id)), 'current durable object must retain evidence from the current state')

  const timelineAppearances = orderedSelections.filter((entry) =>
    entry.selection.snapshot.objects.some((item) => item.id === operationalObject.id),
  )
  expect(timelineAppearances.length >= 2, 'selected real object must be traversable across at least two immutable states')

  const secondBundle = await fetchHistoryBundle()
  const beforeFingerprint = historyFingerprint(firstBundle.selections)
  const afterFingerprint = historyFingerprint(secondBundle.selections)
  expect(beforeFingerprint === afterFingerprint, 'read-only validation must leave every persisted snapshot unchanged')

  console.log('PASS  production /api/states reports Neon persistence with ' + list.states.length + ' immutable states')
  console.log('PASS  current / previous / state-by-ID / state-by-time navigation works on real persisted history')
  console.log('PASS  current sparse topology falls back to one honest environment-level Spatial Memory group')
  console.log('PASS  historical object "' + operationalObject.name + '" preserves relations, conditions, issues and evidence')
  console.log('PASS  durable object "' + operationalObject.name + '" remains navigable across ' + timelineAppearances.length + ' immutable states')
  console.log('PASS  before/after snapshot fingerprint unchanged: ' + beforeFingerprint)
  console.log('SENTINEL PHASE 9 REAL MULTI-STATE HISTORY VERIFIED')
} finally {
  await vite.close()
}

async function fetchHistoryBundle() {
  const list = await fetchJson('/api/states?environmentId=' + encodeURIComponent(environmentId))
  const stateIds = [...list.states]
    .sort((a, b) => a.version - b.version)
    .map((entry) => entry.stateId)

  const selections = []
  for (const stateId of stateIds) {
    const record = await fetchState({ stateId })
    expect(record.selection?.snapshot?.stateId === stateId, 'state selection must return its exact immutable snapshot')
    expect(record.selection?.sources?.length > 0, 'each real state must retain at least one source')
    expect(record.selection?.evidence?.length > 0, 'each real state must retain evidence')
    selections.push(record)
  }

  return { list, selections }
}

async function fetchState(query) {
  const params = new URLSearchParams({ environmentId })
  if (query.stateId) params.set('stateId', query.stateId)
  if (query.selector) params.set('selector', query.selector)
  return fetchJson('/api/states?' + params.toString())
}

async function fetchJson(path) {
  const response = await fetch(origin + path, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'sentinel-phase9-read-only-history-validator',
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error('GET ' + path + ' failed with ' + response.status + ': ' + text.slice(0, 500))
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('GET ' + path + ' returned malformed JSON')
  }
}

async function waitForDeployment(expectedCommit) {
  const maxAttempts = 48
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const health = await fetchJson('/api/health')
      if (health.deploymentCommit === expectedCommit) {
        console.log('Fresh production deployment detected for ' + expectedCommit)
        return
      }
      console.log('Waiting for production commit ' + expectedCommit + '; currently ' + (health.deploymentCommit || 'unknown'))
    } catch (error) {
      console.log('Production health not ready yet: ' + (error instanceof Error ? error.message : String(error)))
    }
    await delay(5000)
  }
  throw new Error('Timed out waiting for production deployment ' + expectedCommit)
}

function reconstructMemory(list, orderedSelections) {
  const states = orderedSelections.map((entry) => entry.selection.state)
  const snapshots = orderedSelections.map((entry) => entry.selection.snapshot)
  const observations = uniqueById(orderedSelections.flatMap((entry) => entry.selection.observations || []))
  const evidence = uniqueById(orderedSelections.flatMap((entry) => entry.selection.evidence || []))
  const sources = uniqueById(orderedSelections.flatMap((entry) => entry.selection.sources || []))
  const current = snapshots.find((snapshot) => snapshot.stateId === list.currentStateId) || snapshots.at(-1)

  return {
    environment: {
      id: environmentId,
      name: 'Warehouse',
      type: 'warehouse',
      createdAt: states[0]?.capturedAt || new Date(0).toISOString(),
      updatedAt: states.at(-1)?.capturedAt || new Date(0).toISOString(),
      currentStateId: list.currentStateId,
      stateIds: states.map((state) => state.id),
      roomIds: [],
      objectIds: current?.objects?.map((item) => item.id) || [],
      issueIds: current?.issues?.map((item) => item.id) || [],
    },
    states,
    snapshots,
    observations,
    evidence,
    sources,
    objects: current?.objects || [],
    conditions: current?.conditions || [],
    issues: current?.issues || [],
    relations: current?.relations || [],
    diffs: [],
  }
}

function uniqueById(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function historyFingerprint(selections) {
  const value = selections
    .map((entry) => ({
      id: entry.selection.state.id,
      version: entry.selection.state.version,
      capturedAt: entry.selection.state.capturedAt,
      snapshot: entry.selection.snapshot,
    }))
    .sort((a, b) => a.version - b.version)
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
