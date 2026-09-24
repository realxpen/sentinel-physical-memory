import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
const previousApiKey = process.env.NEBIUS_API_KEY

try {
  process.env.NEBIUS_API_KEY = 'phase15-test-key'

  const [
    askModule,
    actionModule,
    verificationModule,
    clientModule,
    scanApi,
    askApi,
    actionApi,
    verifyApi,
    memoryApi,
  ] = await Promise.all([
    vite.ssrLoadModule('/src/memory/ask-building.ts'),
    vite.ssrLoadModule('/src/action/planner.ts'),
    vite.ssrLoadModule('/src/verification/service.ts'),
    vite.ssrLoadModule('/src/reliability/api-client.ts'),
    vite.ssrLoadModule('/api/scan.ts'),
    vite.ssrLoadModule('/api/ask-building.ts'),
    vite.ssrLoadModule('/api/action-plan.ts'),
    vite.ssrLoadModule('/api/verify.ts'),
    vite.ssrLoadModule('/api/memory.ts'),
  ])

  await verifyMissingEnvironment(
    askModule.AskBuildingService,
    askModule.AskBuildingInputError,
    actionModule.ActionPlannerService,
    actionModule.ActionPlannerInputError,
    verificationModule.VerificationAgentService,
    verificationModule.VerificationInputError,
  )

  await verifyMissingSnapshots(
    askModule.AskBuildingService,
    askModule.AskBuildingInputError,
    actionModule.ActionPlannerService,
    actionModule.ActionPlannerInputError,
    verificationModule.VerificationAgentService,
    verificationModule.VerificationInputError,
  )

  await verifyClientFailures(clientModule)
  await verifyOversizedRoutes([
    ['scan', scanApi.default, { padding: 'x'.repeat(4 * 1024 * 1024 + 1000) }],
    ['ask', askApi.default, { padding: 'x'.repeat(70 * 1024) }],
    ['action-plan', actionApi.default, { padding: 'x'.repeat(70 * 1024) }],
    ['verification', verifyApi.default, { padding: 'x'.repeat(70 * 1024) }],
  ])

  const memoryRes = createResponseRecorder()
  await memoryApi.default({ method: 'GET', query: {} }, memoryRes.response)
  expect(memoryRes.statusCode === 400, `memory query without environmentId must be 400, got ${memoryRes.statusCode}`)
  expect(memoryRes.body?.error === 'INVALID_MEMORY_QUERY', 'memory query must expose a stable invalid-query code')

  console.log('PASS  Ask / Action Plan / Verification return typed 404 for unknown environment')
  console.log('PASS  reasoning services fail closed with 409 when immutable snapshots are missing')
  console.log('PASS  browser network failure has one readable no-result-confirmed fallback')
  console.log('PASS  malformed/HTML API failures do not leak opaque server pages into product UI')
  console.log('PASS  Scan / Ask / Action Plan / Verification enforce request-size budgets before inference')
  console.log('PASS  memory restoration distinguishes invalid query from persistence failure')
  console.log('SENTINEL PHASE 15 ROUTE + BROWSER RELIABILITY SLICE 2 VERIFIED')
} finally {
  if (previousApiKey === undefined) delete process.env.NEBIUS_API_KEY
  else process.env.NEBIUS_API_KEY = previousApiKey
  await vite.close()
}

async function verifyMissingEnvironment(AskService, AskError, ActionService, ActionError, VerifyService, VerifyError) {
  const emptyMemory = { get: async () => undefined }
  const neverModel = {
    provider: 'test',
    model: 'test',
    async reason() { throw new Error('model must not run') },
    async plan() { throw new Error('model must not run') },
    async verifyConditions() { throw new Error('model must not run') },
  }

  await expectReject(
    () => new AskService(emptyMemory, neverModel).ask({ environmentId: 'missing', question: 'What changed?' }),
    (error) => error instanceof AskError && error.status === 404 && error.code === 'ENVIRONMENT_NOT_FOUND',
    'Ask unknown environment must fail as ENVIRONMENT_NOT_FOUND',
  )
  await expectReject(
    () => new ActionService(emptyMemory, neverModel).create({ environmentId: 'missing' }),
    (error) => error instanceof ActionError && error.status === 404 && error.code === 'ENVIRONMENT_NOT_FOUND',
    'Action Planner unknown environment must fail as ENVIRONMENT_NOT_FOUND',
  )
  await expectReject(
    () => new VerifyService(emptyMemory, neverModel).verify({
      environmentId: 'missing',
      previousStateId: 'a',
      currentStateId: 'b',
    }),
    (error) => error instanceof VerifyError && error.status === 404 && error.code === 'ENVIRONMENT_NOT_FOUND',
    'Verification unknown environment must fail as ENVIRONMENT_NOT_FOUND',
  )
}

async function verifyMissingSnapshots(AskService, AskError, ActionService, ActionError, VerifyService, VerifyError) {
  const envId = 'incomplete-memory'
  const state1 = state('state_1', 1, envId)
  const state2 = state('state_2', 2, envId)
  const memory = {
    environment: {
      id: envId,
      name: 'Incomplete memory',
      type: 'office',
      createdAt: state1.capturedAt,
      updatedAt: state2.capturedAt,
      currentStateId: state2.id,
      stateIds: [state1.id, state2.id],
      roomIds: [],
      objectIds: [],
      issueIds: [],
    },
    states: [state1, state2],
    snapshots: [],
    objects: [],
    conditions: [],
    issues: [],
    observations: [],
    evidence: [],
    relations: [],
    sources: [],
    diffs: [],
  }
  const reader = { get: async () => memory }
  const neverModel = {
    provider: 'test',
    model: 'test',
    async reason() { throw new Error('model must not run') },
    async plan() { throw new Error('model must not run') },
    async verifyConditions() { throw new Error('model must not run') },
  }

  await expectReject(
    () => new AskService(reader, neverModel).ask({ environmentId: envId, question: 'What changed?', stateId: state2.id }),
    (error) => error instanceof AskError && error.status === 409 && error.code === 'HISTORICAL_SNAPSHOT_UNAVAILABLE',
    'Ask must not reconstruct a missing immutable snapshot',
  )
  await expectReject(
    () => new ActionService(reader, neverModel).create({ environmentId: envId, stateId: state2.id }),
    (error) => error instanceof ActionError && error.status === 409 && error.code === 'HISTORICAL_SNAPSHOT_UNAVAILABLE',
    'Action Planner must not reconstruct a missing immutable snapshot',
  )
  await expectReject(
    () => new VerifyService(reader, neverModel).verify({
      environmentId: envId,
      previousStateId: state1.id,
      currentStateId: state2.id,
    }),
    (error) => error instanceof VerifyError && error.status === 409 && error.code === 'HISTORICAL_SNAPSHOT_UNAVAILABLE',
    'Verification must reject missing immutable snapshots',
  )
}

async function verifyClientFailures(client) {
  const missingState = new Response(
    JSON.stringify({ error: 'STATE_NOT_FOUND', message: 'internal raw state text' }),
    { status: 404, headers: { 'content-type': 'application/json' } },
  )
  await expectReject(
    () => client.readSentinelApiResponse(missingState, 'history'),
    (error) => error instanceof client.SentinelRequestError
      && error.code === 'STATE_NOT_FOUND'
      && /remembered state is no longer available/i.test(error.message)
      && !/internal raw state text/i.test(error.message),
    'STATE_NOT_FOUND must become a stable product message',
  )

  const malformed = new Response('<html><body>upstream exploded with stack trace</body></html>', {
    status: 502,
    headers: { 'content-type': 'text/html' },
  })
  await expectReject(
    () => client.readSentinelApiResponse(malformed, 'verification'),
    (error) => error instanceof client.SentinelRequestError
      && /temporarily unavailable/i.test(error.message)
      && !/stack trace/i.test(error.message),
    'HTML provider failures must not leak raw server output',
  )

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch internal browser detail') }
  try {
    await expectReject(
      () => client.fetchSentinel('/api/verify', { method: 'POST' }, 'verification'),
      (error) => error instanceof client.SentinelRequestError
        && error.code === 'NETWORK_INTERRUPTED'
        && /No result was confirmed/i.test(error.message)
        && !/internal browser detail/i.test(error.message),
      'network failures must use the stable readable fallback',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function verifyOversizedRoutes(cases) {
  for (const [name, handler, body] of cases) {
    const recorder = createResponseRecorder()
    await handler({ method: 'POST', headers: {}, body }, recorder.response)
    expect(recorder.statusCode === 413, `${name} oversized request should return 413, got ${recorder.statusCode}`)
    expect(recorder.body?.error === 'PAYLOAD_TOO_LARGE', `${name} oversized request should return PAYLOAD_TOO_LARGE`)
  }
}

function state(id, version, environmentId) {
  return {
    id,
    environmentId,
    capturedAt: `2026-09-24T10:0${version}:00.000Z`,
    sourceIds: [],
    objectIds: [],
    conditionIds: [],
    issueIds: [],
    relationIds: [],
    summary: `State ${version}`,
    version,
  }
}

function createResponseRecorder() {
  const recorder = {
    statusCode: 200,
    body: undefined,
    headers: {},
    response: undefined,
  }
  recorder.response = {
    status(code) { recorder.statusCode = code; return this },
    json(value) { recorder.body = value },
    setHeader(name, value) { recorder.headers[name.toLowerCase()] = value },
  }
  return recorder
}

async function expectReject(run, predicate, message) {
  let error
  try {
    await run()
  } catch (caught) {
    error = caught
  }
  if (!error || !predicate(error)) throw new Error(message + (error ? `: ${error.message}` : ': no error thrown'))
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
