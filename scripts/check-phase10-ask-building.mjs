import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { AskBuildingService, classifyAskBuildingIntent } = await vite.ssrLoadModule('/src/memory/ask-building.ts')

  const environmentId = 'phase10-ask-test'
  const evidence = [
    evidenceItem('e1', 'source_v1', '2026-09-21T10:00:00.000Z', 'Baseline frame with green exit door.'),
    evidenceItem('e2', 'source_v2', '2026-09-21T11:00:00.000Z', 'Orange cart visible in front of green exit door.'),
    evidenceItem('e3', 'source_v3', '2026-09-21T12:00:00.000Z', 'Green exit door visible with cart no longer in front of it.'),
  ]
  const door = (seenAt, evidenceIds) => ({
    id: 'door', environmentId, category: 'door', name: 'green door', description: 'green exit door',
    position: { description: 'warehouse rear wall' }, confidence: 0.97,
    firstSeenAt: '2026-09-21T10:00:00.000Z', lastSeenAt: seenAt, evidenceIds,
  })
  const cart = (seenAt, evidenceIds, position) => ({
    id: 'cart', environmentId, category: 'equipment', name: 'orange cart',
    position: { description: position }, confidence: 0.96,
    firstSeenAt: '2026-09-21T10:00:00.000Z', lastSeenAt: seenAt, evidenceIds,
  })
  const state1 = state('state_v1', 1, '2026-09-21T10:00:00.000Z', ['source_v1'], 'Baseline state.')
  const state2 = state('state_v2', 2, '2026-09-21T11:00:00.000Z', ['source_v2'], 'Cart obstructs exit.')
  const state3 = state('state_v3', 3, '2026-09-21T12:00:00.000Z', ['source_v3'], 'Exit access re-observed clear.')

  const obstructionCondition = {
    id: 'condition_access', environmentId, kind: 'access', title: 'Emergency exit access obstructed',
    description: 'orange cart is observed in front of green door', status: 'present', basis: 'inferred',
    confidence: 0.9, objectIds: ['cart', 'door'], evidenceIds: ['e2'], observedAt: state2.capturedAt,
  }
  const obstructionIssue = {
    id: 'issue_access', environmentId, type: 'access', title: 'Emergency exit access obstructed',
    description: 'orange cart blocks clear access to grounded exit door', severity: 'medium', status: 'open',
    confidence: 0.9, objectIds: ['cart', 'door'], evidenceIds: ['e2'],
    firstDetectedAt: state2.capturedAt, lastObservedAt: state2.capturedAt,
  }
  const snapshots = [
    { stateId: state1.id, environmentId, objects: [door(state1.capturedAt, ['e1']), cart(state1.capturedAt, ['e1'], 'beside shelving')], conditions: [], issues: [], relations: [] },
    { stateId: state2.id, environmentId, objects: [door(state2.capturedAt, ['e1','e2']), cart(state2.capturedAt, ['e1','e2'], 'in front of green door')], conditions: [obstructionCondition], issues: [obstructionIssue], relations: [{ id: 'rel_front', environmentId, fromId: 'cart', toId: 'door', type: 'in_front_of', confidence: 1, evidenceIds: ['e2'] }] },
    { stateId: state3.id, environmentId, objects: [door(state3.capturedAt, ['e1','e2','e3']), cart(state3.capturedAt, ['e1','e2','e3'], 'beside shelving')], conditions: [], issues: [], relations: [] },
  ]

  const memory = {
    environment: {
      id: environmentId, name: 'Warehouse', type: 'warehouse',
      createdAt: state1.capturedAt, updatedAt: state3.capturedAt,
      currentStateId: state3.id, stateIds: [state1.id,state2.id,state3.id],
      roomIds: [], objectIds: ['door','cart'], issueIds: [],
    },
    states: [state2, state1, state3],
    snapshots,
    objects: snapshots[2].objects,
    conditions: [],
    issues: [],
    observations: [],
    evidence,
    relations: [],
    sources: [
      { id: 'source_v1', environmentId, modality: 'image', uri: 'https://local/v1.jpg', capturedAt: state1.capturedAt },
      { id: 'source_v2', environmentId, modality: 'image', uri: 'https://local/v2.jpg', capturedAt: state2.capturedAt },
      { id: 'source_v3', environmentId, modality: 'image', uri: 'https://local/v3.jpg', capturedAt: state3.capturedAt },
    ],
    diffs: [
      { id: 'diff_12', environmentId, fromStateId: state1.id, toStateId: state2.id, createdAt: state2.capturedAt, summary: 'Exit obstruction appeared.', changes: [{ id: 'change_12', environmentId, fromStateId: state1.id, toStateId: state2.id, type: 'changed', entityId: 'cart', entityKind: 'object', title: 'Cart moved in front of exit', description: 'orange cart is now in front of green door', confidence: 0.94, evidenceIds: ['e2'] }] },
      { id: 'diff_23', environmentId, fromStateId: state2.id, toStateId: state3.id, createdAt: state3.capturedAt, summary: 'Exit obstruction no longer re-observed.', changes: [{ id: 'change_23', environmentId, fromStateId: state2.id, toStateId: state3.id, type: 'uncertain', entityId: 'cart', entityKind: 'object', title: 'Obstruction not re-observed', description: 'cart is no longer visible in front of the exit in this view', confidence: 0.7, evidenceIds: ['e3'] }] },
    ],
  }

  const captured = []
  const model = {
    provider: 'test',
    model: 'test',
    async reason(request) {
      captured.push(request)
      return {
        answer: 'The exit obstruction is the priority.',
        rationale: 'State v2 contains the grounded access issue and relation.',
        confidence: 0.92,
        stateId: request.request.stateId,
        evidenceIds: ['e2', 'not-in-context'],
        relatedObjectIds: ['door', 'cart', 'ghost'],
        relatedIssueIds: ['issue_access', 'ghost_issue'],
      }
    },
  }
  const service = new AskBuildingService({ get: async () => memory }, model)

  const currentAnswer = await service.ask({ environmentId, question: 'What changed since the last scan?' })
  expect(captured[0].request.stateId === state3.id, 'Ask must use environment.currentStateId rather than array ordering')
  expect(captured[0].context.includes('ASK_INTENT: change'), 'change intent must be explicit in reasoning context')
  expect(captured[0].context.includes('STATE HISTORY:'), 'reasoning context must contain bounded immutable state history')
  expect(captured[0].context.includes('OBJECT HISTORY UP TO SELECTED STATE:'), 'reasoning context must contain durable object continuity')
  expect(captured[0].context.includes('DIFF HISTORY UP TO SELECTED STATE:'), 'reasoning context must contain Reality Diff history')
  expect(currentAnswer.evidenceIds.length === 1 && currentAnswer.evidenceIds[0] === 'e2', 'model evidence must be filtered to evidence actually supplied in context')
  expect(!currentAnswer.relatedObjectIds.includes('ghost'), 'invented object IDs must fail closed')
  expect(!currentAnswer.relatedIssueIds.includes('ghost_issue'), 'invented issue IDs must fail closed')
  expect(currentAnswer.grounding?.evidence[0]?.stateIds.includes(state2.id), 'grounding must map evidence back to its immutable state')
  expect(currentAnswer.grounding?.objects.some((item) => item.id === 'door' && item.stateIds.length === 3), 'grounding must expose durable object history')
  expect(currentAnswer.grounding?.historyStateIds.length === 3, 'current Ask must reason over all prior states up to current')

  await service.ask({ environmentId, question: 'What needs my attention?', stateId: state2.id })
  const historicalContext = captured.at(-1).context
  expect(historicalContext.includes('SELECTED_STATE_ID state_v2 VERSION 2'), 'explicit historical state must be selected')
  expect(!historicalContext.includes('STATE v3 state_v3'), 'historical Ask must never leak future state into reasoning context')
  expect(!historicalContext.includes('diff_23'), 'historical Ask must never leak future Reality Diff into reasoning context')

  const noEvidenceModel = {
    provider: 'test',
    model: 'test',
    async reason(request) {
      return { answer: 'Memory is insufficient to support that claim.', confidence: 0.88, stateId: request.request.stateId, evidenceIds: ['invented'], relatedObjectIds: [], relatedIssueIds: [] }
    },
  }
  const lowConfidence = await new AskBuildingService({ get: async () => memory }, noEvidenceModel).ask({ environmentId, question: 'Where is the electrical panel?' })
  expect(lowConfidence.evidenceIds.length === 0, 'invented evidence IDs must be removed')
  expect(lowConfidence.confidence <= 0.35, 'answers with no surviving grounded evidence must have bounded confidence')

  const intents = [
    ['What needs my attention?', 'attention'],
    ['Where is the electrical panel?', 'location'],
    ['What did you see near the server room?', 'nearby'],
    ['What changed since the last scan?', 'change'],
    ['Which change matters most?', 'priority'],
    ['What should I do?', 'action'],
    ['Has it been resolved?', 'resolution'],
  ]
  for (const [question, expected] of intents) expect(classifyAskBuildingIntent(question) === expected, `Expected "${question}" to classify as ${expected}`)

  const [main, css] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/integration.css', import.meta.url), 'utf8'),
  ])
  const apiSource = await readFile(new URL('../api/ask-building.ts', import.meta.url), 'utf8')
  for (const [question] of intents) expect(main.includes(question), `Product UI must expose core demo question: ${question}`)
  expect(main.includes('ASK THE BUILDING / EVIDENCE-GROUNDED'), 'Ask the Building must be a first-class environment surface')
  expect(main.includes('WHY THIS MATTERS'), 'answer surface must expose rationale')
  expect(main.includes('CURRENT VS PREVIOUS'), 'answer surface must expose current-vs-previous context')
  expect(main.includes('SHOW EVIDENCE'), 'answer surface must expose grounded evidence')
  expect(main.includes('inspectSpatialObject(item.id); return'), 'current related physical objects must open the canonical object detail surface')
  expect(css.includes('.answer-object-links'), 'Phase 10 related-object navigation style is missing')
  expect(css.includes('.ask-prompt-rail'), 'Phase 10 contextual question rail is missing')
  expect(apiSource.includes("from '../src/memory/ask-building.ts'"), 'production API must explicitly bundle the Phase 10 TypeScript Ask service')
  expect(apiSource.includes("reasoningContract: ASK_BUILDING_CONTRACT"), 'production API must expose the Phase 10 reasoning contract marker')
  expect(apiSource.includes("if (!answer.grounding)"), 'production API must refuse a 200 response without the server-owned grounding envelope')

  console.log('PASS  seven MVP questions map to deterministic Ask intents')
  console.log('PASS  current Ask uses authoritative currentStateId and bounded immutable history')
  console.log('PASS  historical Ask excludes future states and future diffs')
  console.log('PASS  evidence/object/issue IDs fail closed to supplied reasoning context')
  console.log('PASS  ungrounded answers receive a conservative confidence cap')
  console.log('PASS  first-class Ask UI exposes rationale, evidence, comparison and related-object navigation')
  console.log('SENTINEL PHASE 10 ASK THE BUILDING VERIFIED')
} finally {
  await vite.close()
}

function state(id, version, capturedAt, sourceIds, summary) {
  return { id, environmentId: 'phase10-ask-test', capturedAt, sourceIds, objectIds: ['door','cart'], conditionIds: [], issueIds: [], relationIds: [], summary, version }
}
function evidenceItem(id, sourceId, capturedAt, description) { return { id, type: 'frame', sourceId, capturedAt, frameIndex: 0, description } }
function expect(condition, message) { if (!condition) throw new Error(message) }
