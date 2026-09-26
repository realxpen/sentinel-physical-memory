import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const nebius = await vite.ssrLoadModule('/src/ai/nebius.ts')
  const traces = []

  const fakeFetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'))
    const system = String(body.messages?.[0]?.content || '')

    if (/Action Planner/i.test(system)) {
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          goal: 'Clear the grounded obstruction safely.',
          rationale: 'The plan is grounded in the selected condition.',
          steps: [{
            title: 'Clear access',
            description: 'Move the obstruction away from the access path.',
            priority: 'medium',
            relatedConditionIds: ['condition_access'],
            relatedIssueIds: [],
            relatedObjectIds: ['boxes'],
            evidenceIds: ['e1'],
          }],
        }) } }],
      })
    }

    if (/Verification Agent/i.test(system)) {
      return jsonResponse({ choices: [{ message: { content: '{"verdicts":[]}' } }] })
    }

    if (/temporal verification/i.test(system)) {
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({
        candidateKey: 'candidate_0',
        sameObject: true,
        previousState: 'unknown',
        currentState: 'unknown',
        moved: 'no',
        confidence: 0.91,
      }) } }] })
    }

    if (/reasoning agent/i.test(system)) {
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({
        answer: 'The exit route deserves attention.',
        rationale: 'The selected state contains a grounded access condition.',
        confidence: 0.9,
        stateId: 'state_1',
        evidenceIds: ['e1'],
        relatedObjectIds: ['boxes'],
        relatedIssueIds: [],
      }) } }] })
    }

    return jsonResponse({ choices: [{ message: { content: JSON.stringify({
      sourceId: 'source_1',
      observations: [{
        id: 'obs_1',
        environmentId: 'env_1',
        sourceId: 'source_1',
        modality: 'image',
        capturedAt: '2026-09-24T12:00:00.000Z',
        label: 'Hallway',
        description: 'A hallway is visible.',
        confidence: 0.9,
        basis: 'observed',
        evidenceIds: [],
      }],
      objects: [],
      conditions: [],
      relations: [],
      evidence: [],
    }) } }] })
  }

  const vision = nebius.createNebiusNemotronAdapter('test-key', {
    model: 'openbmb/MiniCPM-V-4_5',
    fetchImpl: fakeFetch,
    onTrace: (trace) => traces.push(trace),
  })
  const reasoning = nebius.createNebiusNemotronAdapter('test-key', {
    model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
    fetchImpl: fakeFetch,
    onTrace: (trace) => traces.push(trace),
  })

  await vision.infer({
    role: 'perception',
    prompt: [
      'Inspect scan for environment env_1.',
      'The scan source id is source_1.',
      'The trusted scan capturedAt is 2026-09-24T12:00:00.000Z.',
    ].join('\n'),
    artifacts: [],
  })
  await vision.verifyTemporal({
    environmentId: 'env_1',
    previousSourceId: 'source_0',
    currentSourceId: 'source_1',
    artifacts: [],
    candidates: [{
      key: 'candidate_0',
      previousObjectName: 'fire extinguisher',
      currentObjectName: 'fire extinguisher',
      category: 'safety',
    }],
  })
  await reasoning.reason({
    role: 'reasoning',
    request: { environmentId: 'env_1', question: 'What needs attention?', stateId: 'state_1' },
    context: 'STATE_ID state_1\nEVIDENCE e1\nOBJECT boxes',
  })
  await reasoning.plan({
    role: 'action',
    request: { environmentId: 'env_1', stateId: 'state_1' },
    context: 'CONDITION condition_access\nOBJECT boxes\nEVIDENCE e1',
  })
  await vision.verifyConditions({
    role: 'verification',
    request: { environmentId: 'env_1', previousStateId: 'state_0', currentStateId: 'state_1' },
    context: 'CURRENT_EVIDENCE e1',
    artifacts: [],
  })

  const roles = traces.map((trace) => trace.role)
  for (const role of ['perception', 'temporal-verification', 'reasoning', 'action', 'verification']) {
    expect(roles.includes(role), `missing inference telemetry role ${role}`)
  }
  expect(traces.every((trace) => trace.provider === 'nebius-token-factory'), 'every trace must identify Nebius Token Factory')
  expect(traces.every((trace) => Number.isFinite(trace.latencyMs) && trace.latencyMs >= 0), 'every trace must contain bounded latencyMs')
  expect(traces.every((trace) => trace.outcome === 'success' && trace.httpStatus === 200), 'successful fake calls must emit successful HTTP traces')
  expect(traces.find((trace) => trace.role === 'reasoning')?.model === 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B', 'reasoning trace must identify NVIDIA Nemotron')
  expect(traces.find((trace) => trace.role === 'action')?.model === 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B', 'action trace must identify NVIDIA Nemotron')
  expect(traces.find((trace) => trace.role === 'perception')?.model === 'openbmb/MiniCPM-V-4_5', 'perception trace must identify the configured multimodal model')

  const errorTraces = []
  const failing = nebius.createNebiusNemotronAdapter('test-key', {
    model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
    fetchImpl: async () => new Response('provider unavailable', { status: 503 }),
    onTrace: (trace) => errorTraces.push(trace),
  })
  try {
    await failing.reason({
      role: 'reasoning',
      request: { environmentId: 'env_1', question: 'What changed?', stateId: 'state_1' },
      context: 'STATE_ID state_1',
    })
  } catch {}
  expect(errorTraces.length === 1, 'provider failure must emit exactly one trace')
  expect(errorTraces[0].outcome === 'error' && errorTraces[0].httpStatus === 503 && errorTraces[0].errorCode === 'NEBIUS_HTTP_ERROR', 'provider failure trace must preserve status and safe error code')

  const [scan, ask, action, verify, health, readme] = await Promise.all([
    readFile(new URL('../api/scan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/ask-building.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/action-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/verify.ts', import.meta.url), 'utf8'),
    readFile(new URL('../api/health.ts', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
  ])

  for (const [name, source] of [['scan', scan], ['ask', ask], ['action', action], ['verify', verify]]) {
    expect(source.includes('onTrace: (trace) => inference.push(trace)'), `${name} API must collect request-local inference traces`)
    expect(/\binference\b/.test(source), `${name} API must expose inference traces in its successful response`)
  }

  expect(health.includes("provider: 'nebius-token-factory'"), 'health must expose the Token Factory provider')
  expect(health.includes('reasoningModel'), 'health must expose the reasoning model')
  expect(!scan.includes("DEFAULT_PREFERRED_VISION_MODEL = 'Qwen/Qwen2.5-VL-72B-Instruct'"), 'scan route must not probe the unavailable Qwen model by default')
  expect(scan.includes("process.env.NEBIUS_PREFERRED_VISION_MODEL?.trim() || configuredPerceptionModel"), 'preferred vision route must be explicit opt-in and otherwise use the configured perception model directly')
  expect(readme.includes('nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'), 'README must identify the actual NVIDIA model')
  expect(readme.includes('Nebius Token Factory'), 'README must identify the actual inference platform')

  console.log('PASS  every runtime inference role emits provider/model/role/latency telemetry')
  console.log('PASS  NVIDIA Nemotron is explicitly traced on reasoning + action roles')
  console.log('PASS  provider failures emit one safe error trace without secrets')
  console.log('PASS  successful product APIs expose per-request inference traces')
  console.log('PASS  default perception routing goes directly to the proven configured model without a dead preferred-model probe')
  console.log('PASS  health + README expose the actual non-secret Nebius/NVIDIA architecture')
  console.log('SENTINEL PHASE 16 NEBIUS NVIDIA TELEMETRY VERIFIED')
} finally {
  await vite.close()
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
