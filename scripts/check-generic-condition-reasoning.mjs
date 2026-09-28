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
      supportingObservationIds: ['obs_panel'],
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
      supportingObservationIds: ['obs_panel'],
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
      supportingObservationIds: ['obs_panel'],
      objectIds: ['ghost_object'],
      evidenceIds: [evidenceId],
    }],
  }, environmentId, capturedAt)
  expect(badObject.conditions.length === 0 && badObject.rejected[0]?.reason === 'unknown-object-reference', 'reasoner cannot invent object IDs')

  const salienceOnly = groundReasonedConditions({
    ...perception,
    observations: [{
      id: 'obs_salience',
      environmentId,
      sourceId,
      modality: 'image',
      capturedAt,
      label: 'red rectangle',
      description: 'A red rectangle is visible on the left side of the image.',
      confidence: 0.99,
      basis: 'observed',
      evidenceIds: [evidenceId],
    }],
  }, {
    conditions: [{
      kind: 'attention',
      title: 'Red rectangle visible on left side',
      description: 'A red rectangle is visible.',
      status: 'present',
      confidence: 0.99,
      supportingObservationIds: ['obs_salience'],
      objectIds: [],
      evidenceIds: [evidenceId],
    }],
  }, environmentId, capturedAt)
  expect(salienceOnly.conditions.length === 1 && salienceOnly.conditions[0].status === 'uncertain', 'catch-all attention reasoning must be downgraded to uncertain context instead of a present operational finding')
  expect(assessCondition(salienceOnly.conditions[0]).operational === false, 'salience-only attention interpretation must never auto-promote')

  const uncertain = groundReasonedConditions(perception, {
    conditions: [{
      kind: 'maintenance',
      title: 'Possible panel issue',
      description: 'The facts may indicate a panel issue.',
      status: 'uncertain',
      confidence: 0.99,
      supportingObservationIds: ['obs_panel'],
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
          supportingObservationIds: ['obs_unknown_fixture'],
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


  const auditEnvironmentId = 'provider-condition-boundary-test'
  const auditSourceId = 'source_provider_condition_boundary'
  const auditCapturedAt = '2026-09-28T13:30:00.000Z'
  const boundaryModel = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('expected current frame evidence for provider-boundary regression')

      const object = {
        id: 'fixture_panel',
        environmentId: auditEnvironmentId,
        category: 'equipment',
        name: 'mounted fixture panel',
        description: 'mounted panel visible in the current image',
        confidence: 0.97,
        firstSeenAt: auditCapturedAt,
        lastSeenAt: auditCapturedAt,
        evidenceIds: [frameId],
      }
      const providerCondition = {
        id: 'provider_condition_must_not_persist',
        environmentId: auditEnvironmentId,
        kind: 'damage',
        title: 'Provider condition must not persist',
        description: 'A provider-generated semantic condition that must not bypass the generic reasoner.',
        status: 'present',
        basis: 'observed',
        confidence: 0.99,
        objectIds: ['fixture_panel'],
        evidenceIds: [frameId],
        observedAt: auditCapturedAt,
      }

      if (request.prompt.includes('Condition audit for scan') || request.prompt.includes('Localized physical-detail audit for scan')) {
        return {
          sourceId: auditSourceId,
          observations: [{
            id: 'obs_fixture_state',
            environmentId: auditEnvironmentId,
            sourceId: auditSourceId,
            modality: 'image',
            capturedAt: auditCapturedAt,
            label: 'fixture panel state',
            description: 'A mounted fixture panel is visibly separated from its frame and hanging at an angle.',
            confidence: 0.97,
            basis: 'observed',
            evidenceIds: [frameId],
          }],
          objects: [object],
          conditions: [providerCondition],
          relations: [],
          evidence: [],
        }
      }

      return {
        sourceId: auditSourceId,
        observations: [],
        objects: [object],
        conditions: [providerCondition],
        relations: [],
        evidence: [],
      }
    },
    async reasonConditions(request) {
      expect(request.context.includes('fixture panel state'), 'condition audit direct observation must survive into generic reasoning context')
      expect(!request.context.includes('Provider condition must not persist'), 'provider-generated conditions must be stripped before generic reasoning')
      const observationId = request.context.match(/OBSERVATION_ID ([^ |]+)/)?.[1]
      const objectId = request.context.match(/OBJECT_ID ([^ |]+)/)?.[1]
      const evidenceId = request.context.match(/EVIDENCE_ID ([^ |]+)/)?.[1]
      if (!observationId || !objectId || !evidenceId) throw new Error('missing grounded IDs in provider-boundary reasoning context')
      return {
        conditions: [{
          kind: 'maintenance',
          title: 'Mounted fixture panel is physically insecure',
          description: 'The current direct observation shows the panel separated from its frame and hanging at an angle.',
          status: 'present',
          confidence: 0.96,
          supportingObservationIds: [observationId],
          objectIds: [objectId],
          evidenceIds: [evidenceId],
        }],
      }
    },
  }

  let boundarySequence = 0
  const boundaryPipeline = new ScanPipeline({
    model: boundaryModel,
    id(prefix) {
      boundarySequence += 1
      return `${prefix}_boundary_${boundarySequence}`
    },
  })
  const boundaryResult = await boundaryPipeline.run({
    environmentId: auditEnvironmentId,
    source: {
      id: auditSourceId,
      environmentId: auditEnvironmentId,
      modality: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      capturedAt: auditCapturedAt,
      metadata: { name: 'Boundary Scene', environmentType: 'other', captureMode: 'photo' },
    },
    media: {
      kind: 'image',
      uri: 'data:image/jpeg;base64,AAA',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
    },
  })

  expect(boundaryResult.observations.some((item) => item.description.includes('visibly separated from its frame')), 'condition-audit direct abnormal observation must be retained')
  expect(boundaryResult.conditions.some((item) => item.title === 'Mounted fixture panel is physically insecure'), 'generic reasoner must create the trusted semantic condition')
  expect(!boundaryResult.conditions.some((item) => item.title === 'Provider condition must not persist'), 'provider perception conditions must never bypass generic condition reasoning')
  expect(boundaryResult.state.issueIds.length === 1, 'only the generic observation-grounded condition should promote to an issue')

  const [derivationSource, conditionModelSource, plannerSource] = await Promise.all([
    readFile(new URL('../src/perception/condition-derivation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/perception/condition-model.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/action/planner.ts', import.meta.url), 'utf8'),
  ])
  expect(!derivationSource.includes('OPERATIONAL_CUE_RULES'), 'runtime must not use a fixed hazard regex table')
  expect(!derivationSource.includes('Slip hazard') && !derivationSource.includes('Electrical hazard') && !derivationSource.includes('Sharp object hazard'), 'deterministic derivation must not enumerate specific hazard semantics')
  expect(!conditionModelSource.includes('EXPLICIT_ACCESS_PATTERNS'), 'issue trust gate must not classify conditions by semantic keywords')
  expect(!plannerSource.includes('function remediationObjective'), 'action planning must not use a hardcoded hazard-to-remediation lookup')

  console.log('PASS  provider perception conditions cannot bypass the generic observation-grounded reasoning boundary')\n  console.log('PASS  condition-audit direct abnormal observations survive into condition reasoning')\n  console.log('PASS  grounded perception and semantic interpretation are separate layers')
  console.log('PASS  novel unseen abnormalities can become conditions without a predefined hazard vocabulary')
  console.log('PASS  condition reasoning cannot invent object/evidence references')
  console.log('PASS  confidence remains bounded by current grounded facts')
  console.log('PASS  uncertain interpretation stays memory context instead of auto-promoting')
  console.log('PASS  catch-all visual-salience attention cannot become a present operational issue')
  console.log('PASS  issue promotion is structural and semantic-keyword agnostic')
  console.log('PASS  action planning no longer depends on a hardcoded remediation table')
  console.log('SENTINEL GENERIC CONDITION REASONING VERIFIED')
} finally {
  await vite.close()
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
