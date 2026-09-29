const BASE_URL = (process.env.SENTINEL_BASE_URL || 'https://sentinel-physical-memory.vercel.app').replace(/\/$/, '')
const RUN_ID = process.env.GITHUB_RUN_ID || String(Date.now())
const EXPECTED_COMMIT = process.env.SENTINEL_EXPECTED_COMMIT || '14921f60286cdee893be04351a9bf4a7c3889bc9'

const cases = [
  {
    id: 'A',
    source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6a/Exposed_wiring_within_a_damaged_electrical_enclosure%2C_likely_for_internet_or_power_distribution.jpg/960px-Exposed_wiring_within_a_damaged_electrical_enclosure%2C_likely_for_internet_or_power_distribution.jpg',
    expectOperational: true,
  },
  {
    id: 'B',
    source: 'https://www.cavasecurity.co.uk/_webedit/cached-images/164.jpg',
    expectOperational: true,
  },
  {
    id: 'C',
    source: 'https://cdn3.bigcommerce.com/s-3yvzqa/product_images/uploaded_images/fridayfail.jpg',
    expectOperational: true,
  },
  {
    id: 'D',
    source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5d/Broken_window.jpg/960px-Broken_window.jpg',
    expectOperational: true,
  },
  {
    id: 'E',
    source: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Waiting_area_of_a_modern_office.jpg/960px-Waiting_area_of_a_modern_office.jpg',
    expectOperational: false,
  },
]

const activeStatuses = new Set(['open', 'acknowledged', 'in_progress'])
const failures = []

const health = await requestJson('/api/health')
assert(health.status === 200, 'Production health request failed', health)
assert(health.body?.deploymentCommit === EXPECTED_COMMIT, 'Production is not on the expected canonical commit', {
  expected: EXPECTED_COMMIT,
  actual: health.body?.deploymentCommit,
})
console.log('PRODUCTION_COMMIT', health.body.deploymentCommit)
console.log('PRODUCTION_MODELS', JSON.stringify(health.body.models || health.body.model || {}, null, 2))

for (const testCase of cases) {
  const environmentId = `condition-smoke-${RUN_ID}-${testCase.id.toLowerCase()}`
  const sourceId = `source-${RUN_ID}-${testCase.id.toLowerCase()}`
  console.log(`\n=== CASE ${testCase.id} ===`)
  console.log('environmentId:', environmentId)

  try {
    const image = await downloadImage(testCase.source)
    const capturedAt = new Date().toISOString()
    const scan = await requestJson('/api/scan', {
      environmentId,
      source: {
        id: sourceId,
        environmentId,
        capturedAt,
        metadata: {
          captureMode: 'photo',
          smokeCase: testCase.id,
        },
      },
      media: {
        kind: 'image',
        uri: image.dataUrl,
        mimeType: image.mimeType,
        sizeBytes: image.byteLength,
      },
    }, 180_000)

    if (scan.status !== 200) {
      throw new Error(`scan HTTP ${scan.status}: ${JSON.stringify(scan.body).slice(0, 2000)}`)
    }

    const persisted = await requestJson(`/api/memory?environmentId=${encodeURIComponent(environmentId)}`)
    if (persisted.status !== 200 || !persisted.body?.memory) {
      throw new Error(`memory HTTP ${persisted.status}: ${JSON.stringify(persisted.body).slice(0, 2000)}`)
    }

    const memory = persisted.body.memory
    const state = memory.states?.find((item) => item.id === scan.body?.state?.id)
      || memory.states?.find((item) => item.id === memory.environment?.currentStateId)
    if (!state) throw new Error('No current immutable state was persisted for the scan.')

    const snapshot = memory.snapshots?.find((item) => item.stateId === state.id)
    if (!snapshot) throw new Error('No immutable snapshot was persisted for the current state.')

    const sourceObservations = (memory.observations || []).filter((item) => item.sourceId === sourceId)
    const sourceEvidenceIds = new Set(
      (memory.evidence || []).filter((item) => item.sourceId === sourceId).map((item) => item.id),
    )
    const currentObjectIds = new Set((snapshot.objects || []).map((item) => item.id))
    const observationEvidenceIds = new Set(sourceObservations.flatMap((item) => item.evidenceIds || []))
    const presentConditions = (snapshot.conditions || []).filter((item) => item.status === 'present' && item.kind !== 'normal')
    const uncertainConditions = (snapshot.conditions || []).filter((item) => item.status === 'uncertain')
    const activeIssues = (snapshot.issues || []).filter((item) => activeStatuses.has(item.status))

    for (const condition of presentConditions) {
      assert((condition.evidenceIds || []).length > 0, 'Present condition has no evidence IDs', condition)
      assert(condition.evidenceIds.every((id) => sourceEvidenceIds.has(id)), 'Present condition references non-current evidence', condition)
      assert(condition.evidenceIds.some((id) => observationEvidenceIds.has(id)), 'Present condition is not aligned to any current grounded observation evidence', condition)
      assert((condition.objectIds || []).every((id) => currentObjectIds.has(id)), 'Present condition references an object outside the current grounded snapshot', condition)
    }

    for (const issue of activeIssues) {
      assert((issue.evidenceIds || []).length > 0, 'Active issue has no evidence IDs', issue)
      assert(issue.evidenceIds.every((id) => sourceEvidenceIds.has(id)), 'Active issue references non-current evidence', issue)
      assert((issue.objectIds || []).every((id) => currentObjectIds.has(id)), 'Active issue references an object outside the current grounded snapshot', issue)
    }

    let actionPlan = null
    if (testCase.expectOperational && presentConditions.length && activeIssues.length) {
      const action = await requestJson('/api/action-plan', {
        environmentId,
        stateId: state.id,
        relatedConditionIds: presentConditions.map((item) => item.id).slice(0, 12),
        relatedIssueIds: activeIssues.map((item) => item.id).slice(0, 12),
      }, 120_000)
      if (action.status !== 200) {
        throw new Error(`action-plan HTTP ${action.status}: ${JSON.stringify(action.body).slice(0, 2000)}`)
      }
      actionPlan = action.body
      const steps = actionPlan.plan?.steps || []
      assert(steps.length >= 2, 'Action plan did not include corrective work plus deterministic verification handoff', actionPlan)
      assert(steps.every((item) => item.status === 'recommended'), 'Action plan emitted a non-recommended status', actionPlan)
      assert(steps.at(-1)?.title === 'Rescan to verify', 'Action plan did not end with the deterministic verification handoff', actionPlan)
      assert(steps.slice(0, -1).some((item) => (item.evidenceIds || []).length > 0), 'Corrective action step has no grounded evidence', actionPlan)
    }

    const summary = {
      case: testCase.id,
      environmentId,
      stateId: state.id,
      observations: sourceObservations.map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        confidence: item.confidence,
        evidenceIds: item.evidenceIds,
      })),
      objects: (snapshot.objects || []).map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        state: item.state,
        position: item.position?.description,
        confidence: item.confidence,
      })),
      conditions: (snapshot.conditions || []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        kind: item.kind,
        basis: item.basis,
        status: item.status,
        confidence: item.confidence,
        objectIds: item.objectIds,
        evidenceIds: item.evidenceIds,
      })),
      issues: (snapshot.issues || []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        type: item.type,
        severity: item.severity,
        status: item.status,
        confidence: item.confidence,
        objectIds: item.objectIds,
        evidenceIds: item.evidenceIds,
      })),
      scanInference: (scan.body?.inference || []).map((item) => ({
        role: item.role,
        model: item.model,
        status: item.status,
        latencyMs: item.latencyMs,
      })),
      actionPlan: actionPlan ? {
        goal: actionPlan.plan?.goal,
        rationale: actionPlan.plan?.rationale,
        steps: (actionPlan.plan?.steps || []).map((item) => ({
          title: item.title,
          description: item.description,
          priority: item.priority,
          requiredSpecialist: item.requiredSpecialist,
          relatedConditionIds: item.relatedConditionIds,
          relatedIssueIds: item.relatedIssueIds,
          evidenceIds: item.evidenceIds,
        })),
        inference: (actionPlan.inference || []).map((item) => ({
          role: item.role,
          model: item.model,
          status: item.status,
          latencyMs: item.latencyMs,
        })),
      } : null,
    }

    console.log('RESULT', JSON.stringify(summary, null, 2))

    if (testCase.expectOperational) {
      assert(presentConditions.length > 0, 'Expected a trusted present abnormal condition but none survived the trust gate', summary)
      assert(activeIssues.length > 0, 'Expected Needs Attention / active issue promotion but none survived', summary)
      assert(actionPlan, 'Expected a grounded action plan but none was created', summary)
    } else {
      assert(presentConditions.length === 0, 'Normal control scene produced a trusted operational condition', summary)
      assert(activeIssues.length === 0, 'Normal control scene produced an active operational issue', summary)
      console.log('NORMAL_CONTROL_UNCERTAIN_CONDITIONS', uncertainConditions.length)
    }

    console.log(`CASE ${testCase.id}: PASS`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push({ case: testCase.id, environmentId, message })
    console.error(`CASE ${testCase.id}: FAIL`, message)
  }
}

if (failures.length) {
  console.error('\nPRODUCTION CONDITION SMOKE FAILED')
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
} else {
  console.log('\nPRODUCTION CONDITION SMOKE VERIFIED: A-D operational, E clean control')
}

async function downloadImage(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'sentinel-production-condition-smoke/1.0' },
  })
  if (!response.ok) throw new Error(`image download HTTP ${response.status} for ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new Error(`unsupported downloaded image MIME ${mimeType} for ${url}`)
  }
  if (bytes.byteLength > 2_600_000) {
    throw new Error(`downloaded image too large for smoke body: ${bytes.byteLength} bytes`)
  }
  return {
    byteLength: bytes.byteLength,
    mimeType,
    dataUrl: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
  }
}

async function requestJson(path, payload, timeoutMs = 30_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(BASE_URL + path, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        accept: 'application/json',
        'user-agent': 'sentinel-production-condition-smoke/1.0',
        origin: BASE_URL,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text } }
    return { status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

function assert(condition, message, detail) {
  if (condition) return
  throw new Error(detail === undefined ? message : `${message}: ${JSON.stringify(detail).slice(0, 4000)}`)
}
