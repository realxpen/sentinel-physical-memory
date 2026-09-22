import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ActionPlannerService, ActionPlannerInputError } = await vite.ssrLoadModule('/src/action/planner.ts')

  const environmentId = 'phase11-test'
  const state1 = state('state_v1', 1, '2026-09-20T10:00:00.000Z', ['source_v1'])
  const state2 = state('state_v2', 2, '2026-09-20T11:00:00.000Z', ['source_v2'])
  const state3 = state('state_v3', 3, '2026-09-20T12:00:00.000Z', ['source_v3'])

  const evidence = [
    evidenceItem('e1', 'source_v1', state1.capturedAt, 'Baseline exit route.'),
    evidenceItem('e2', 'source_v2', state2.capturedAt, 'Orange cart observed in front of grounded emergency exit.'),
    evidenceItem('e3', 'source_v3', state3.capturedAt, 'Later normal warehouse observation.'),
  ]

  const door = { id: 'door', environmentId, category: 'door', name: 'green door', position: { description: 'rear wall' }, confidence: 1, firstSeenAt: state1.capturedAt, lastSeenAt: state3.capturedAt, evidenceIds: ['e1','e2','e3'] }
  const cart = { id: 'cart', environmentId, category: 'equipment', name: 'orange cart', position: { description: 'in front of green door' }, confidence: 1, firstSeenAt: state1.capturedAt, lastSeenAt: state3.capturedAt, evidenceIds: ['e1','e2','e3'] }
  const accessCondition = {
    id: 'condition_access', environmentId, kind: 'access', title: 'Emergency exit access obstructed',
    description: 'Orange cart is grounded in front of the emergency exit.', status: 'present', basis: 'inferred',
    confidence: 0.9, objectIds: ['cart','door'], evidenceIds: ['e2'], observedAt: state2.capturedAt,
  }
  const accessIssue = {
    id: 'issue_access', environmentId, type: 'access', title: 'Emergency exit access obstructed',
    description: 'Clear exit access is obstructed by the orange cart.', severity: 'medium', status: 'open',
    confidence: 0.9, objectIds: ['cart','door'], evidenceIds: ['e2'],
    firstDetectedAt: state2.capturedAt, lastObservedAt: state2.capturedAt,
  }
  const normalCondition = {
    id: 'condition_normal', environmentId, kind: 'normal', title: 'Normal warehouse conditions',
    description: 'No active operational condition in this state.', status: 'present', basis: 'observed',
    confidence: 1, objectIds: [], evidenceIds: ['e3'], observedAt: state3.capturedAt,
  }

  const memory = {
    environment: {
      id: environmentId, name: 'Warehouse', type: 'warehouse',
      createdAt: state1.capturedAt, updatedAt: state3.capturedAt,
      currentStateId: state3.id, stateIds: [state1.id,state2.id,state3.id],
      roomIds: [], objectIds: ['door','cart'], issueIds: [],
    },
    states: [state1,state2,state3],
    snapshots: [
      { stateId: state1.id, environmentId, objects: [door,cart], conditions: [], issues: [], relations: [] },
      { stateId: state2.id, environmentId, objects: [door,cart], conditions: [accessCondition], issues: [accessIssue], relations: [{ id: 'rel', environmentId, fromId: 'cart', toId: 'door', type: 'in_front_of', confidence: 1, evidenceIds: ['e2'] }] },
      { stateId: state3.id, environmentId, objects: [door,cart], conditions: [normalCondition], issues: [], relations: [] },
    ],
    objects: [door,cart],
    conditions: [normalCondition],
    issues: [],
    observations: [],
    evidence,
    relations: [],
    sources: [
      { id:'source_v1', environmentId, modality:'image', uri:'https://local/v1.jpg', capturedAt:state1.capturedAt },
      { id:'source_v2', environmentId, modality:'image', uri:'https://local/v2.jpg', capturedAt:state2.capturedAt },
      { id:'source_v3', environmentId, modality:'image', uri:'https://local/v3.jpg', capturedAt:state3.capturedAt },
    ],
    diffs: [],
  }

  const captured = []
  const model = {
    provider: 'test',
    model: 'test',
    async plan(request) {
      captured.push(request)
      return {
        goal: 'Restore clear emergency exit access.',
        rationale: 'The selected immutable state contains a grounded access condition and issue.',
        steps: [
          {
            title: 'Clear the exit obstruction',
            description: 'Move the grounded orange cart out of the emergency exit access path.',
            priority: 'critical',
            relatedConditionIds: ['condition_access','hallucinated_condition'],
            relatedIssueIds: ['issue_access','hallucinated_issue'],
            relatedObjectIds: ['cart','door','ghost'],
            evidenceIds: ['e2','invented_evidence'],
          },
          {
            title: 'Invented ungrounded work',
            description: 'This step has no real condition or issue.',
            priority: 'high',
            relatedConditionIds: ['fake'],
            relatedIssueIds: ['fake'],
            relatedObjectIds: ['ghost'],
            evidenceIds: ['invented'],
          },
        ],
      }
    },
  }

  const service = new ActionPlannerService({ get: async () => memory }, model)
  const result = await service.create({
    environmentId,
    stateId: state2.id,
    goal: 'Create a safe plan for the grounded exit obstruction.',
    relatedConditionIds: ['condition_access'],
    relatedIssueIds: ['issue_access'],
    relatedObjectIds: ['cart','door'],
  })

  expect(captured.length === 1, 'historical actionable state should invoke the planner exactly once')
  expect(captured[0].request.stateId === state2.id, 'planner must reason from the explicitly selected immutable state')
  expect(captured[0].context.includes('STATE_ID state_v2 VERSION 2'), 'planner context must name the selected immutable state')
  expect(!captured[0].context.includes('condition_normal'), 'planner context must not leak future current-state conditions into historical planning')
  expect(result.plan.stateId === state2.id, 'plan must remain pinned to the selected immutable state')
  expect(result.grounding.state.isCurrent === false, 'historical action plan must be visibly historical')
  expect(result.plan.steps.length === 2, 'one grounded corrective step plus deterministic rescan step should survive')
  const corrective = result.plan.steps[0]
  expect(corrective.status === 'recommended', 'corrective step must remain recommended')
  expect(corrective.priority === 'medium', 'inferred access/medium issue must cap an attempted critical priority at medium')
  expect(corrective.relatedConditionIds.join(',') === 'condition_access', 'hallucinated condition IDs must fail closed')
  expect(corrective.relatedIssueIds.join(',') === 'issue_access', 'hallucinated issue IDs must fail closed')
  expect(corrective.relatedObjectIds.includes('cart') && corrective.relatedObjectIds.includes('door') && !corrective.relatedObjectIds.includes('ghost'), 'hallucinated object IDs must fail closed')
  expect(corrective.evidenceIds.includes('e2') && !corrective.evidenceIds.includes('invented_evidence'), 'hallucinated evidence must fail closed')
  const verify = result.plan.steps.at(-1)
  expect(verify.title === 'Rescan to verify', 'planner must append deterministic verification handoff')
  expect(verify.status === 'recommended', 'verification handoff must not claim verified work')
  expect(!('estimatedCost' in corrective), 'Phase 11 must not manufacture cost estimates')

  let rejectedCurrent = false
  try {
    await service.create({ environmentId })
  } catch (error) {
    rejectedCurrent = error instanceof ActionPlannerInputError && /no grounded actionable condition/i.test(error.message)
  }
  expect(rejectedCurrent, 'normal current state must not produce a fabricated action plan')
  expect(captured.length === 1, 'normal current state must fail before calling the model')

  let rejectedForeign = false
  try {
    await service.create({ environmentId, stateId: state2.id, relatedIssueIds: ['missing_issue'] })
  } catch (error) {
    rejectedForeign = error instanceof ActionPlannerInputError
  }
  expect(rejectedForeign, 'requested IDs outside the selected immutable state must fail closed')

  const [main, css, api] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/integration.css', import.meta.url), 'utf8'),
    readFile(new URL('../api/action-plan.ts', import.meta.url), 'utf8'),
  ])
  expect(main.includes('ACTION PLAN / RECOMMENDED'), 'Phase 11 action plan panel must be present')
  expect(main.includes('HUMAN CHECKPOINT'), 'Phase 11 UI must separate recommendation from completion/verification')
  expect(main.includes("title: 'Rescan to verify'") === false, 'deterministic verification step belongs to planner service, not fake UI data')
  expect(main.includes('actionPlanObjectIds.has(item.id)'), 'action-related physical objects must illuminate Spatial Memory')
  expect(main.includes('Create action plan ↗'), 'object inspector must expose contextual planning for actionable objects')
  expect(css.includes('.spatial-object.action-related-spatial'), 'Phase 11 Spatial Memory action highlighting is missing')
  expect(api.includes("ACTION_PLAN_CONTRACT = 'phase11-action-plan-v1'"), 'production API contract marker is missing')
  expect(api.includes("from '../src/action/planner.ts'"), 'production action API must explicitly bundle the Phase 11 service')
  expect(api.includes("step.status !== 'recommended'"), 'production API must fail if model/service claims non-recommended execution state')

  console.log('PASS  historical state planning stays pinned to immutable state evidence')
  console.log('PASS  hallucinated condition/issue/object/evidence IDs fail closed')
  console.log('PASS  action priority is capped by trusted condition/issue authority')
  console.log('PASS  normal current state does not manufacture work')
  console.log('PASS  final rescan/verification handoff is deterministic and still recommended')
  console.log('PASS  product UI separates recommended action from Phase 12 verification')
  console.log('SENTINEL PHASE 11 ACTION PLANNER VERIFIED')
} finally {
  await vite.close()
}

function state(id, version, capturedAt, sourceIds) {
  return { id, environmentId:'phase11-test', capturedAt, sourceIds, objectIds:['door','cart'], conditionIds:[], issueIds:[], relationIds:[], summary:'State '+version, version }
}
function evidenceItem(id, sourceId, capturedAt, description) {
  return { id, type:'frame', sourceId, capturedAt, frameIndex:0, description }
}
function expect(condition, message) { if (!condition) throw new Error(message) }
