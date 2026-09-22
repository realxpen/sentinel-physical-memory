import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { VerificationAgentService, VerificationInputError } = await vite.ssrLoadModule('/src/verification/service.ts')

  const passed = await runPassedCase(VerificationAgentService)
  expect(passed.result.status === 'passed', 'positive same-object current evidence should allow passed verification')
  expect(passed.result.resolvedConditionIds.join(',') === 'condition_access', 'passed verification should resolve the baseline condition ID')
  expect(passed.result.remainingConditionIds.length === 0, 'passed verification must have no remaining target condition')
  expect(passed.modelCalls === 1, 'resolved case should call the model once for the missing prior condition')
  expect(passed.artifactIds.join(',') === 'verification_source_current', 'verification must send only the current-state image artifact to the model')
  expect(passed.result.verdicts[0].evidenceIds.includes('e_current'), 'resolved verdict must retain current-state evidence')

  const failed = await runFailedAccessCase(VerificationAgentService)
  expect(failed.result.status === 'failed', 'continued obstruction geometry must fail verification')
  expect(failed.result.remainingConditionIds.join(',') === 'condition_access', 'continued obstruction must remain tied to the baseline condition')
  expect(failed.modelCalls === 0, 'deterministic continued access support must override before model optimism')
  expect(/not treated as resolution/i.test(failed.result.verdicts[0].reason), 'failed verdict must explain the false-resolution defense')

  const partial = await runPartialCase(VerificationAgentService)
  expect(partial.result.status === 'partial', 'one resolved plus one remaining condition must be partial')
  expect(partial.result.resolvedConditionIds.includes('condition_access'), 'partial case should preserve resolved condition')
  expect(partial.result.remainingConditionIds.includes('condition_maintenance'), 'partial case should preserve remaining condition')

  const inconclusive = await runInconclusiveCase(VerificationAgentService)
  expect(inconclusive.result.status === 'inconclusive', 'missing same-object current evidence must stay inconclusive')
  expect(inconclusive.result.inconclusiveConditionIds.join(',') === 'condition_damage', 'inconclusive result should identify the unresolved baseline condition')
  expect(inconclusive.result.resolvedConditionIds.length === 0, 'model optimism without same-object evidence must not resolve a condition')

  let rejectedForeign = false
  try {
    const fixture = baseFixture()
    const service = new VerificationAgentService({ get: async () => fixture.memory }, fixture.model)
    await service.verify({
      environmentId: fixture.memory.environment.id,
      previousStateId: fixture.previous.id,
      currentStateId: fixture.current.id,
      conditionIds: ['condition_not_in_previous_state'],
    })
  } catch (error) {
    rejectedForeign = error instanceof VerificationInputError
  }
  expect(rejectedForeign, 'condition IDs outside the previous immutable state must fail closed')

  let rejectedReverse = false
  try {
    const fixture = baseFixture()
    const service = new VerificationAgentService({ get: async () => fixture.memory }, fixture.model)
    await service.verify({
      environmentId: fixture.memory.environment.id,
      previousStateId: fixture.current.id,
      currentStateId: fixture.previous.id,
    })
  } catch (error) {
    rejectedReverse = error instanceof VerificationInputError
  }
  expect(rejectedReverse, 'verification must reject same/reversed temporal state order')

  const [main, css, api, source] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/integration.css', import.meta.url), 'utf8'),
    readFile(new URL('../api/verify.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/verification/service.ts', import.meta.url), 'utf8'),
  ])

  expect(main.includes('VERIFICATION / PHYSICAL RESULT'), 'Phase 12 result surface is missing')
  expect(main.includes('Not re-observed is not resolved.'), 'Phase 12 UI must state the core verification trust rule')
  expect(main.includes('Verify against current state ↗'), 'Action Plan must expose manual verification when a later state exists')
  expect(main.includes('void runVerification({'), 'post-plan rescan must wire into verification')
  expect(main.includes('verificationObjectIds.has(item.id)'), 'verified physical context must illuminate Spatial Memory')
  expect(css.includes('.verification-panel.status-passed'), 'verification status styling is missing')
  expect(css.includes('.spatial-object.verification-related-spatial'), 'verification-related Spatial Memory styling is missing')
  expect(api.includes("VERIFICATION_CONTRACT = 'phase12-visual-verification-v2'"), 'production visual verification contract marker is missing')
  expect(api.includes("from '../src/verification/service.ts'"), 'production API must explicitly bundle the Phase 12 service')
  expect(source.includes('Missing from the current condition list is NOT evidence of resolution.'), 'model context must reject absence-as-resolution')
  expect(source.includes('deterministicContinuedSupport'), 'server-owned continued-support override is missing')
  expect(source.includes('verificationArtifactsForState'), 'verification must attach current-state visual artifacts')

  console.log('PASS  positive current same-object evidence can verify a resolved condition')
  console.log('PASS  continued obstruction geometry overrides condition/issue disappearance')
  console.log('PASS  mixed resolved + remaining conditions become partial')
  console.log('PASS  missing same-object evidence remains inconclusive')
  console.log('PASS  foreign condition IDs and reversed state order fail closed')
  console.log('PASS  product loop wires Action Plan → rescan/current state → Verification')
  console.log('SENTINEL PHASE 12 VERIFICATION AGENT VERIFIED')
} finally {
  await vite.close()
}

async function runPassedCase(Service) {
  const fixture = baseFixture({ currentCartPosition: 'beside orange shelving' })
  let modelCalls = 0
  let artifactIds = []
  const model = {
    provider: 'test',
    model: 'test',
    async verifyConditions(request) {
      modelCalls += 1
      artifactIds = request.artifacts.map((item) => item.artifactId)
      return {
        verdicts: [{
          conditionId: 'condition_access',
          status: 'resolved',
          confidence: 0.93,
          reason: 'The same cart and exit area are re-observed, and the cart is no longer in the exit path.',
          evidenceIds: ['e_current', 'invented'],
          relatedObjectIds: ['cart', 'door', 'ghost'],
        }],
      }
    },
  }
  const result = await new Service({ get: async () => fixture.memory }, model).verify({
    environmentId: fixture.memory.environment.id,
    previousStateId: fixture.previous.id,
    currentStateId: fixture.current.id,
    actionPlanId: 'plan_test',
    conditionIds: ['condition_access'],
  })
  return { result, modelCalls, artifactIds }
}

async function runFailedAccessCase(Service) {
  const fixture = baseFixture({ currentCartPosition: 'in front of the green door' })
  let modelCalls = 0
  const model = {
    provider: 'test',
    model: 'test',
    async verifyConditions() {
      modelCalls += 1
      return { verdicts: [] }
    },
  }
  const result = await new Service({ get: async () => fixture.memory }, model).verify({
    environmentId: fixture.memory.environment.id,
    previousStateId: fixture.previous.id,
    currentStateId: fixture.current.id,
    conditionIds: ['condition_access'],
  })
  return { result, modelCalls }
}

async function runPartialCase(Service) {
  const fixture = baseFixture({ currentCartPosition: 'beside orange shelving', includeMaintenance: true })
  const model = {
    provider: 'test',
    model: 'test',
    async verifyConditions() {
      return {
        verdicts: [{
          conditionId: 'condition_access',
          status: 'resolved',
          confidence: 0.91,
          reason: 'The same exit area is re-observed and the cart is no longer in front of the door.',
          evidenceIds: ['e_current'],
          relatedObjectIds: ['cart', 'door'],
        }],
      }
    },
  }
  const result = await new Service({ get: async () => fixture.memory }, model).verify({
    environmentId: fixture.memory.environment.id,
    previousStateId: fixture.previous.id,
    currentStateId: fixture.current.id,
    conditionIds: ['condition_access', 'condition_maintenance'],
  })
  return { result }
}

async function runInconclusiveCase(Service) {
  const fixture = damageFixture()
  const model = {
    provider: 'test',
    model: 'test',
    async verifyConditions() {
      return {
        verdicts: [{
          conditionId: 'condition_damage',
          status: 'resolved',
          confidence: 0.98,
          reason: 'Looks fixed.',
          evidenceIds: ['e_current'],
          relatedObjectIds: [],
        }],
      }
    },
  }
  const result = await new Service({ get: async () => fixture.memory }, model).verify({
    environmentId: fixture.memory.environment.id,
    previousStateId: fixture.previous.id,
    currentStateId: fixture.current.id,
    conditionIds: ['condition_damage'],
  })
  return { result }
}

function baseFixture(options = {}) {
  const environmentId = 'phase12-test'
  const previous = state('state_v1', 1, '2026-09-22T09:00:00.000Z', ['source_prev'])
  const current = state('state_v2', 2, '2026-09-22T09:10:00.000Z', ['source_current'])

  const doorPrev = object('door', 'door', 'green door', 'rear wall', 'e_prev', previous.capturedAt)
  const cartPrev = object('cart', 'equipment', 'orange cart', 'in front of the green door', 'e_prev', previous.capturedAt)
  const doorCurrent = object('door', 'door', 'green door', 'rear wall', 'e_current', current.capturedAt)
  const cartCurrent = object('cart', 'equipment', 'orange cart', options.currentCartPosition || 'beside orange shelving', 'e_current', current.capturedAt)

  const access = {
    id: 'condition_access',
    environmentId,
    kind: 'access',
    title: 'Emergency exit access obstructed',
    description: 'Orange cart is observed in front of the green emergency exit.',
    status: 'present',
    basis: 'inferred',
    confidence: 0.9,
    objectIds: ['cart', 'door'],
    evidenceIds: ['e_prev'],
    observedAt: previous.capturedAt,
  }

  const previousConditions = [access]
  const currentConditions = []
  if (options.includeMaintenance) {
    previousConditions.push({
      id: 'condition_maintenance',
      environmentId,
      kind: 'maintenance',
      title: 'Loose cable requires attention',
      description: 'A loose cable remains visible beside the rack.',
      status: 'present',
      basis: 'observed',
      confidence: 0.88,
      objectIds: ['cart'],
      evidenceIds: ['e_prev'],
      observedAt: previous.capturedAt,
    })
    currentConditions.push({
      id: 'condition_maintenance_current',
      environmentId,
      kind: 'maintenance',
      title: 'Loose cable requires attention',
      description: 'The loose cable remains visible beside the rack.',
      status: 'present',
      basis: 'observed',
      confidence: 0.9,
      objectIds: ['cart'],
      evidenceIds: ['e_current'],
      observedAt: current.capturedAt,
    })
  }

  const memory = {
    environment: {
      id: environmentId,
      name: 'Test warehouse',
      type: 'warehouse',
      createdAt: previous.capturedAt,
      updatedAt: current.capturedAt,
      currentStateId: current.id,
      stateIds: [previous.id, current.id],
      roomIds: [],
      objectIds: ['door', 'cart'],
      issueIds: [],
    },
    states: [previous, current],
    snapshots: [
      { stateId: previous.id, environmentId, objects: [doorPrev, cartPrev], conditions: previousConditions, issues: [], relations: [] },
      { stateId: current.id, environmentId, objects: [doorCurrent, cartCurrent], conditions: currentConditions, issues: [], relations: [] },
    ],
    objects: [doorCurrent, cartCurrent],
    conditions: currentConditions,
    issues: [],
    observations: [{
      id: 'obs_current',
      environmentId,
      sourceId: 'source_current',
      modality: 'image',
      capturedAt: current.capturedAt,
      label: 'Current exit area',
      description: 'The exit area is visible in the current scan.',
      confidence: 0.95,
      basis: 'observed',
      evidenceIds: ['e_current'],
    }],
    evidence: [
      evidence('e_prev', 'source_prev', previous.capturedAt, 'Previous exit-area evidence.'),
      evidence('e_current', 'source_current', current.capturedAt, 'Current exit-area evidence.'),
    ],
    relations: [],
    sources: [
      { id: 'source_prev', environmentId, modality: 'image', uri: 'data:image/jpeg;base64,prev', capturedAt: previous.capturedAt },
      { id: 'source_current', environmentId, modality: 'image', uri: 'data:image/jpeg;base64,current', capturedAt: current.capturedAt },
    ],
    diffs: [],
  }

  return {
    previous,
    current,
    memory,
    model: { provider: 'test', model: 'test', async verifyConditions() { return { verdicts: [] } } },
  }
}

function damageFixture() {
  const environmentId = 'phase12-damage'
  const previous = state('damage_v1', 1, '2026-09-22T10:00:00.000Z', ['damage_prev'])
  const current = state('damage_v2', 2, '2026-09-22T10:10:00.000Z', ['damage_current'])
  const panel = object('panel', 'electrical', 'electrical panel', 'east wall', 'damage_prev_e', previous.capturedAt)
  const condition = {
    id: 'condition_damage',
    environmentId,
    kind: 'damage',
    title: 'Electrical panel cover damaged',
    description: 'Visible damage is present on the panel cover.',
    status: 'present',
    basis: 'observed',
    confidence: 0.92,
    objectIds: ['panel'],
    evidenceIds: ['damage_prev_e'],
    observedAt: previous.capturedAt,
  }
  return {
    previous,
    current,
    memory: {
      environment: {
        id: environmentId, name: 'Damage test', type: 'office',
        createdAt: previous.capturedAt, updatedAt: current.capturedAt,
        currentStateId: current.id, stateIds: [previous.id, current.id],
        roomIds: [], objectIds: ['panel'], issueIds: [],
      },
      states: [previous, current],
      snapshots: [
        { stateId: previous.id, environmentId, objects: [panel], conditions: [condition], issues: [], relations: [] },
        { stateId: current.id, environmentId, objects: [], conditions: [], issues: [], relations: [] },
      ],
      objects: [panel],
      conditions: [],
      issues: [],
      observations: [{
        id: 'damage_obs_current', environmentId, sourceId: 'damage_current', modality: 'image',
        capturedAt: current.capturedAt, label: 'Current room', description: 'A different view of the room.', confidence: 0.9,
        basis: 'observed', evidenceIds: ['e_current'],
      }],
      evidence: [
        evidence('damage_prev_e', 'damage_prev', previous.capturedAt, 'Previous damaged panel evidence.'),
        evidence('e_current', 'damage_current', current.capturedAt, 'Current scan evidence does not re-observe the panel.'),
      ],
      relations: [],
      sources: [
        { id: 'damage_prev', environmentId, modality: 'image', uri: 'data:image/jpeg;base64,a', capturedAt: previous.capturedAt },
        { id: 'damage_current', environmentId, modality: 'image', uri: 'data:image/jpeg;base64,b', capturedAt: current.capturedAt },
      ],
      diffs: [],
    },
  }
}

function state(id, version, capturedAt, sourceIds) {
  return { id, environmentId: id.startsWith('damage') ? 'phase12-damage' : 'phase12-test', capturedAt, sourceIds, objectIds: [], conditionIds: [], issueIds: [], relationIds: [], summary: 'State ' + version, version }
}
function object(id, category, name, position, evidenceId, capturedAt) {
  return {
    id,
    environmentId: id === 'panel' ? 'phase12-damage' : 'phase12-test',
    category,
    name,
    position: { description: position },
    confidence: 1,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    evidenceIds: [evidenceId],
  }
}
function evidence(id, sourceId, capturedAt, description) {
  return { id, type: 'frame', sourceId, capturedAt, frameIndex: 0, description }
}
function expect(condition, message) {
  if (!condition) throw new Error(message)
}
