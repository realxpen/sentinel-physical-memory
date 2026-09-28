import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const { buildConditionReasoningContext, groundReasonedConditions } = await vite.ssrLoadModule('/src/perception/condition-reasoning.ts')
  const { assessCondition } = await vite.ssrLoadModule('/src/perception/condition-model.ts')

  const environmentId = 'generic-condition-reasoning-test'
  const sourceId = 'source_generic_condition_reasoning'
  const capturedAt = '2026-09-28T12:00:00.000Z'
  const evidenceId = 'evidence_current'
  const perception = {
    sourceId,
    observations: [{
      id: 'obs_panel',
      environmentId,
      sourceId,
      modality: 'image',
      capturedAt,
      label: 'ceiling panel state',
      description: 'A ceiling panel is visibly sagging and partially detached above the work area.',
      confidence: 0.96,
      basis: 'observed',
      evidenceIds: [evidenceId],
    }],
    objects: [{
      id: 'panel_object',
      environmentId,
      category: 'other',
      name: 'ceiling panel',
      description: 'panel visibly sagging from the ceiling',
      confidence: 0.96,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      evidenceIds: [evidenceId],
    }],
    conditions: [],
    relations: [],
    evidence: [{
      id: evidenceId,
      type: 'frame',
      sourceId,
      capturedAt,
      frameIndex: 0,
      description: 'Current frame evidence.',
    }],
  }

  const context = buildConditionReasoningContext(perception)
  expect(context.includes('OBSERVATION_ID obs_panel'), 'reasoning context must expose grounded observation identity')
  expect(context.includes('OBJECT_ID panel_object'), 'reasoning context must expose grounded object identity')
  expect(context.includes('EVIDENCE_ID evidence_current'), 'reasoning context must expose trusted current evidence identity')

  const grounded = groundReasonedConditions(perception, {
    conditions: [{
      kind: 'maintenance',
      title: 'Detached overhead panel needs attention',
      description: 'The grounded current facts show a ceiling panel visibly sagging and partially detached above the work area.',
      status: 'present',
      confidence: 0.94,
      objectIds: ['panel_object'],
      evidenceIds: [evidenceId],
    }],
  }, environmentId, capturedAt)

  expect(grounded.conditions.length === 1, 'novel abnormality must survive generic evidence grounding without a hazard-name lookup')
  expect(grounded.conditions[0].basis === 'inferred', 'reasoned conditions must remain explicitly inferred')
  expect(grounded.conditions[0].confidence === 0.912, `reasoned confidence must be bounded by current support, got ${grounded.conditions[0].confidence}`)
  expect(assessCondition(grounded.conditions[0]).operational === true, 'strong grounded novel condition must pass the existing structural trust gate')

  const badEvidence = groundReasonedConditions(perception, {
    conditions: [{
      kind: 'hazard',
      title: 'Invented problem',
      description: 'Unsupported claim.',
      status: 'present',
      confidence: 1,
      objectIds: ['panel_object'],
      evidenceIds: ['not_current_evidence'],
    }],
  }, environmentId, capturedAt)
  expect(badEvidence.conditions.length === 0 && badEvidence.rejected[0]?.reason === 'unknown-or-missing-evidence-reference', 'reasoner cannot invent evidence IDs')

  const badObject = groundReasonedConditions(perception, {
    conditions: [{
      kind: 'damage',
      title: 'Invented object problem',
      description: 'Unsupported object link.',
      status: 'present',
      confidence: 1,
      objectIds: ['ghost_object'],
      evidenceIds: [evidenceId],
    }],
  }, environmentId, capturedAt)
  expect(badObject.conditions.length === 0 && badObject.rejected[0]?.reason === 'unknown-object-reference', 'reasoner cannot invent object IDs')

  const uncertain = groundReasonedConditions(perception, {
    conditions: [{
      kind: 'maintenance',
      title: 'Possible panel issue',
      description: 'The facts may indicate a panel issue.',
      status: 'uncertain',
      confidence: 0.99,
      objectIds: ['panel_object'],
      evidenceIds: [evidenceId],
    }],
  }, environmentId, capturedAt)
  expect(uncertain.conditions.length === 1, 'uncertain grounded interpretations remain available as memory context')
  expect(assessCondition(uncertain.conditions[0]).operational === false, 'uncertain reasoning must never auto-promote to an issue')

  const inferenceCalls = []
  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      inferenceCalls.push(request.prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('expected current frame evidence')
      if (request.prompt.includes('Condition audit for scan') || request.prompt.includes('Localized physical-detail audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }
      return {
        sourceId,
        observations: [{
          id: 'obs_unknown_fixture',
          environmentId,
          sourceId,
          modality: 'image',
          capturedAt,
          label: 'unusual fixture state',
          description: 'A mounted fixture is visibly separating from its support and hanging at an angle.',
          confidence: 0.97,
          basis: 'observed',
          evidenceIds: [frameId],
        }],
        objects: [{
          id: 'unknown_fixture',
          environmentId,
          category: 'other',
          name: 'mounted fixture',
          description: 'fixture visibly separating from its support',
          confidence: 0.97,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [frameId],
        }],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
    async reasonConditions(request) {
      if (!request.context.includes('mounted fixture') || !request.context.includes('separating from its support')) {
        throw new Error('condition reasoner did not receive grounded current-scene facts')
      }
      const evidenceMatch = request.context.match(/evidence=([^ |]+)/)
      if (!evidenceMatch) throw new Error('missing grounded evidence in reasoning context')
      return {
        conditions: [{
          kind: 'maintenance',
          title: 'Mounted fixture is physically insecure',
          description: 'The current grounded observation shows the fixture separating from its support and hanging at an angle.',
          status: 'present',
          confidence: 0.96,
          objectIds: ['unknown_fixture'],
          evidenceIds: [evidenceMatch[1]],
        }],
      }
    },
  }

  let sequence = 0
  const pipeline = new ScanPipeline({
    model,
    id(prefix) {
      sequence += 1
      return `${prefix}_${sequence}`
    },
  })
  const result = await pipeline.run({
    environmentId,
    source: {
      id: sourceId,
      environmentId,
      modality: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      capturedAt,
      metadata: { name: 'Unseen Scene', environmentType: 'other', captureMode: 'photo' },
    },
    media: {
      kind: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
    },
  })

  expect(result.conditions.some((item) => item.title === 'Mounted fixture is physically insecure'), 'pipeline must persist generic reasoned condition')
  expect(result.state.issueIds.length === 1, 'generic reasoned present condition must promote through the structural trust policy')

  const [derivationSource, conditionModelSource, plannerSource] = await Promise.all([
    readFile(new URL('../src/perception/condition-derivation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/perception/condition-model.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/action/planner.ts', import.meta.url), 'utf8'),
  ])
  expect(!derivationSource.includes('OPERATIONAL_CUE_RULES'), 'runtime must not use a fixed hazard regex table')
  expect(!derivationSource.includes('Slip hazard') && !derivationSource.includes('Electrical hazard') && !derivationSource.includes('Sharp object hazard'), 'deterministic derivation must not enumerate specific hazard semantics')
  expect(!conditionModelSource.includes('EXPLICIT_ACCESS_PATTERNS'), 'issue trust gate must not classify conditions by semantic keywords')
  expect(!plannerSource.includes('function remediationObjective'), 'action planning must not use a hardcoded hazard-to-remediation lookup')

  console.log('PASS  grounded perception and semantic interpretation are separate layers')
  console.log('PASS  novel unseen abnormalities can become conditions without a predefined hazard vocabulary')
  console.log('PASS  condition reasoning cannot invent object/evidence references')
  console.log('PASS  confidence remains bounded by current grounded facts')
  console.log('PASS  uncertain interpretation stays memory context instead of auto-promoting')
  console.log('PASS  issue promotion is structural and semantic-keyword agnostic')
  console.log('PASS  action planning no longer depends on a hardcoded remediation table')
  console.log('SENTINEL GENERIC CONDITION REASONING VERIFIED')
} finally {
  await vite.close()
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
