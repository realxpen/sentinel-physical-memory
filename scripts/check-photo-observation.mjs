import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { ScanPipeline } = await vite.ssrLoadModule('/src/scan/pipeline.ts')
  const environmentId = 'photo-observation-test'
  const capturedAt = '2026-09-20T00:00:00.000Z'
  const sourceId = 'photo-source'
  let calls = 0
  const prompts = []
  const model = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      calls += 1
      prompts.push(request.prompt)
      const frameId = request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId
      if (!frameId) throw new Error('image scan should produce one trusted frame artifact')

      if (request.prompt.includes('Targeted openable-object state verification')) {
        return {
          sourceId,
          observations: [],
          objects: [
            { id: 'door-audit', environmentId, category: 'door', name: 'white door', position: { description: 'back wall' }, state: 'open', confidence: 0.99, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
            { id: 'door-hinge-leak', environmentId, category: 'other', name: 'door hinge (door hardware)', position: { description: 'on white door' }, state: 'closed', confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
            { id: 'desk-leak', environmentId, category: 'furniture', name: 'desk (furniture)', position: { description: 'left side' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          ],
          conditions: [], relations: [], evidence: [],
        }
      }

      if (request.prompt.includes('Condition audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      if (request.prompt.includes('Localized physical-detail audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      if (request.prompt.includes('Person confirmation audit for scan')) {
        return { sourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      return {
        sourceId,
        observations: [
          { id: `obs_${calls}`, environmentId, sourceId, modality: 'image', capturedAt, label: 'chair', description: 'A chair is visible beside the desk.', confidence: 0.95, basis: 'observed', evidenceIds: [frameId] },
          { id: `person_obs_${calls}`, environmentId, sourceId, modality: 'image', capturedAt, label: 'person visible', description: 'A distant shape was incorrectly interpreted as a person.', confidence: 1, basis: 'observed', evidenceIds: [frameId] },
        ],
        objects: [
          { id: `chair_${calls}`, environmentId, category: 'furniture', name: 'chair', description: 'chair beside desk', position: { description: 'beside desk' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          ...Array.from({ length: 12 }, (_, index) => ({ id: `plant_${calls}_${index}`, environmentId, category: 'furniture', name: 'potted plant', position: { description: 'on shelf' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] })),
          { id: `plant_alias_${calls}`, environmentId, category: 'furniture', name: 'plant pot', position: { description: 'on shelf' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          { id: `plant_desk_${calls}`, environmentId, category: 'furniture', name: 'potted plant', position: { description: 'on desk' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          { id: `door_${calls}`, environmentId, category: 'door', name: 'white door', description: 'white door below a green "EXIT" sign', position: { description: 'back wall' }, confidence: 0.95, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
          { id: `person_${calls}`, environmentId, category: 'person', name: 'person', description: 'false-positive distant person candidate', boundingBox: { x: 0.72, y: 0.18, width: 0.08, height: 0.2 }, confidence: 1, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: [frameId] },
        ],
        conditions: [], relations: [], evidence: [],
      }
    },
  }
  const pipeline = new ScanPipeline({ model })
  const result = await pipeline.run({
    environmentId,
    source: { id: sourceId, environmentId, modality: 'image', uri: 'data:image/jpeg;base64,AAA', capturedAt, metadata: { name: 'Photo Test', environmentType: 'office', captureMode: 'photo' } },
    media: { kind: 'image', uri: 'data:image/jpeg;base64,AAA', mimeType: 'image/jpeg', sizeBytes: 3 },
  })
  if (result.frames.length !== 1) throw new Error(`expected one image frame, got ${result.frames.length}`)
  if (result.state.version !== 1) throw new Error(`expected photo to create State v1, got v${result.state.version}`)
  if (result.observations.length === 0) throw new Error('expected grounded image observation')
  const memory = await pipeline.getMemory(environmentId)
  const snapshot = memory?.snapshots.find((item) => item.stateId === result.state.id)
  const plants = snapshot?.objects.filter((item) => item.name === 'potted plant') ?? []
  if (plants.length !== 2) throw new Error(`expected duplicate/alias still-photo plants to collapse to 2 grounded locations, got ${plants.length}`)
  const door = snapshot?.objects.find((item) => item.name === 'white door')
  if (door?.state !== 'open') throw new Error(`expected confirmed visible door state to persist, got ${door?.state ?? 'missing'}`)
  if (!snapshot?.objects.some((item) => /exit sign/i.test(item.name))) {
    throw new Error('punctuated grounded "EXIT" sign mention must materialize a durable exit-sign object')
  }
  if (snapshot?.objects.some((item) => /door handle|door hinge|desk \(furniture\)/i.test(item.name))) {
    throw new Error('state-audit inventory leakage must never enter durable memory')
  }
  if (snapshot?.objects.some((item) => item.category === 'person')) {
    throw new Error('transient/possibly hallucinated people must not enter durable environmental memory')
  }
  if (result.observations.some((item) => /^person(?: visible)?$/i.test(item.label))) {
    throw new Error('person-only transient observations must not persist in the scan result')
  }
  console.log('PASS  still photo becomes one trusted perception frame')
  console.log('PASS  repeated same-frame duplicate and plant aliases collapse by grounded location')
  console.log('PASS  explicit visible door state survives canonicalization')
  console.log('PASS  punctuated grounded "EXIT" sign wording materializes stable signage')
  console.log('PASS  one targeted state audit can update an existing openable object')
  console.log('PASS  state-audit hardware/inventory leakage is rejected before memory')
  console.log('PASS  independently rejected person candidates are excluded before persistent memory')
  console.log('PASS  still photo creates durable environmental State v1')
  console.log('PASS  image observation remains grounded through the normal perception pipeline')

  const detailEnvironmentId = 'photo-detail-audit-test'
  const detailSourceId = 'photo-detail-source'
  const detailRequests = []
  let detailReasoningContext = ''
  const detailModel = {
    provider: 'test-provider',
    model: 'test-model',
    async infer(request) {
      detailRequests.push({
        prompt: request.prompt,
        frameIds: request.artifacts.filter((artifact) => artifact.kind === 'frame').map((artifact) => artifact.frameId),
      })
      const detailFrameId = request.artifacts
        .filter((artifact) => artifact.kind === 'frame')
        .map((artifact) => artifact.frameId)
        .find((frameId) => frameId?.startsWith('detail_'))

      if (request.prompt.includes('Localized physical-detail audit for scan')) {
        if (!detailFrameId) throw new Error('localized detail audit must receive still-photo crop evidence')
        return {
          sourceId: detailSourceId,
          observations: [{
            id: 'detail-electrical-observation',
            environmentId: detailEnvironmentId,
            sourceId: detailSourceId,
            modality: 'image',
            capturedAt,
            label: 'damaged wall outlet',
            description: 'A wall electrical outlet has an open or missing cover with exposed wiring visible.',
            confidence: 0.99,
            basis: 'observed',
            evidenceIds: [detailFrameId],
          }],
          objects: [{
            id: 'detail-electrical-object',
            environmentId: detailEnvironmentId,
            category: 'electrical',
            name: 'damaged wall outlet',
            description: 'wall outlet with exposed wiring visible at the opening',
            position: { description: 'wall beside work surface' },
            confidence: 0.99,
            firstSeenAt: capturedAt,
            lastSeenAt: capturedAt,
            evidenceIds: [detailFrameId],
          }],
          conditions: [],
          relations: [],
          evidence: [],
        }
      }

      if (request.prompt.includes('Condition audit for scan')) {
        return { sourceId: detailSourceId, observations: [], objects: [], conditions: [], relations: [], evidence: [] }
      }

      return {
        sourceId: detailSourceId,
        observations: [],
        objects: [{
          id: 'scene-counter',
          environmentId: detailEnvironmentId,
          category: 'furniture',
          name: 'counter',
          description: 'work counter',
          confidence: 0.95,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId],
        }, {
          id: 'scene-table',
          environmentId: detailEnvironmentId,
          category: 'furniture',
          name: 'table',
          description: 'small work table',
          confidence: 0.95,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [request.artifacts.find((artifact) => artifact.kind === 'frame')?.frameId],
        }],
        conditions: [],
        relations: [],
        evidence: [],
      }
    },
    async reasonConditions(request) {
      detailReasoningContext = request.context
      const objectLine = request.context.split('\n').find((line) =>
        line.includes('OBJECT_ID') && line.includes('damaged wall outlet'),
      )
      const observationLine = request.context.split('\n').find((line) =>
        line.includes('OBSERVATION_ID') && line.includes('damaged wall outlet'),
      )
      const objectId = objectLine?.match(/OBJECT_ID ([^ |]+)/)?.[1]
      const observationId = observationLine?.match(/OBSERVATION_ID ([^ |]+)/)?.[1]
      const evidenceId = observationLine?.match(/evidence=([^ |,]+)/)?.[1]
        ?? objectLine?.match(/evidence=([^ |,]+)/)?.[1]
      if (!objectId || !observationId || !evidenceId) return { conditions: [] }

      return {
        conditions: [{
          kind: 'hazard',
          title: 'Visible electrical fixture condition',
          description: 'The grounded current facts show a wall electrical fixture with internal wiring visibly exposed at an open or missing cover.',
          status: 'present',
          confidence: 0.97,
          supportingObservationIds: [observationId],
          objectIds: [objectId],
          evidenceIds: [evidenceId],
        }],
      }
    },
  }

  const detailPipeline = new ScanPipeline({ model: detailModel })
  const detailResult = await detailPipeline.run({
    environmentId: detailEnvironmentId,
    source: {
      id: detailSourceId,
      environmentId: detailEnvironmentId,
      modality: 'image',
      uri: 'data:image/jpeg;base64,FULL',
      capturedAt,
      metadata: { name: 'Generic Detail Test', environmentType: 'other', captureMode: 'photo' },
    },
    media: {
      kind: 'image',
      uri: 'data:image/jpeg;base64,FULL',
      mimeType: 'image/jpeg',
      sizeBytes: 4,
      extractedFrames: [
        { frameId: 'detail_top_left', timestampMs: 0, uri: 'data:image/jpeg;base64,TL' },
        { frameId: 'detail_top_right', timestampMs: 0, uri: 'data:image/jpeg;base64,TR' },
        { frameId: 'detail_bottom_left', timestampMs: 0, uri: 'data:image/jpeg;base64,BL' },
        { frameId: 'detail_bottom_right', timestampMs: 0, uri: 'data:image/jpeg;base64,BR' },
      ],
    },
  })

  if (detailResult.frames.length !== 5) throw new Error(`expected full photo + 4 detail frames, got ${detailResult.frames.length}`)
  const sceneRequest = detailRequests.find((item) => !item.prompt.includes('Condition audit for scan') && !item.prompt.includes('Localized physical-detail audit for scan'))
  const conditionRequest = detailRequests.find((item) => item.prompt.includes('Condition audit for scan'))
  const detailRequest = detailRequests.find((item) => item.prompt.includes('Localized physical-detail audit for scan'))
  if (!sceneRequest || sceneRequest.frameIds.length !== 1) throw new Error('broad scene perception must use only the canonical full photo')
  if (!conditionRequest || conditionRequest.frameIds.length !== 5) throw new Error('generic condition inspection must inspect the full photo plus all bounded crops')
  if (!conditionRequest.prompt.includes('SAME capture')) throw new Error('condition audit must explicitly treat detail crops as one physical capture')
  if (!detailRequest || detailRequest.frameIds.length !== 5) throw new Error('localized detail audit must inspect the full photo plus all bounded crops')
  if (!detailRequest.prompt.includes('SAME capture')) throw new Error('detail audit must explicitly treat crops as one physical capture')
  if (!detailReasoningContext.includes('damaged wall outlet') || !detailReasoningContext.includes('exposed wiring')) {
    throw new Error('generic condition reasoner must receive the localized grounded physical facts')
  }
  const electricalCondition = detailResult.conditions.find((item) => item.title === 'Visible electrical fixture condition')
  if (!electricalCondition) throw new Error('generic condition reasoning did not interpret the localized grounded physical defect')
  if (electricalCondition.basis !== 'inferred') throw new Error('semantic condition interpretation must remain explicitly inferred')
  if (!electricalCondition.evidenceIds.some((id) => id.includes('detail_'))) throw new Error('reasoned condition must retain crop evidence from the current photo')
  if (detailResult.state.issueIds.length !== 1) throw new Error('supported reasoned condition must promote through the structural trust gate')

  console.log('PASS  still-photo detail crops are reserved for localized inspection rather than treated as separate scans')
  console.log('PASS  a broad scene miss can recover a small grounded physical defect from the same current capture')
  console.log('PASS  localized current evidence feeds generic semantic reasoning and structural issue promotion')
  console.log('SENTINEL PHOTO OBSERVATION VERIFIED')
} finally {
  await vite.close()
}
