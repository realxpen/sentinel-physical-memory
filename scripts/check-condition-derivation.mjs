import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { deriveOperationalConditions } = await vite.ssrLoadModule('/src/perception/condition-derivation.ts')
  const { assessCondition } = await vite.ssrLoadModule('/src/perception/condition-model.ts')

  const environmentId = 'warehouse-test'
  const sourceId = 'source-test'
  const capturedAt = '2026-09-17T13:15:54.989Z'
  const evidence = (id) => ({ id, type: 'frame', sourceId, capturedAt, description: id })

  const base = {
    sourceId,
    evidence: [evidence('frame_door'), evidence('frame_jack')],
    relations: [],
    conditions: [{
      id: 'normal_1', environmentId, kind: 'normal', title: 'warehouse environment',
      description: 'The warehouse is in a normal state.', status: 'present', basis: 'observed',
      confidence: 1, objectIds: [], evidenceIds: ['frame_door'], observedAt: capturedAt,
    }],
    objects: [
      {
        id: 'door_1', environmentId, category: 'door', name: 'green emergency exit door',
        description: 'green double door with orange frame', confidence: 1,
        firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: ['frame_door'],
      },
      {
        id: 'jack_1', environmentId, category: 'equipment', name: 'orange pallet jack',
        description: 'orange pallet jack in front of the green door', confidence: 1,
        firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: ['frame_jack'],
      },
    ],
    observations: [
      {
        id: 'obs_exit', environmentId, sourceId, modality: 'image', capturedAt,
        label: 'emergency exit sign', description: 'An emergency exit sign above the green door.',
        confidence: 1, basis: 'observed', evidenceIds: ['frame_door'],
      },
      {
        id: 'obs_jack', environmentId, sourceId, modality: 'image', capturedAt,
        label: 'orange pallet jack', description: 'An orange pallet jack in front of the green door.',
        confidence: 1, basis: 'observed', evidenceIds: ['frame_jack'],
      },
    ],
  }

  const positive = deriveOperationalConditions(base, capturedAt)
  if (positive.derivedConditions.length !== 1) throw new Error('expected one derived access condition')
  const derived = positive.derivedConditions[0]
  if (derived.kind !== 'access' || derived.basis !== 'inferred' || derived.status !== 'present') {
    throw new Error('derived condition must be a present inferred access condition')
  }
  if (!derived.objectIds.includes('door_1') || !derived.objectIds.includes('jack_1')) {
    throw new Error('derived access condition must bind the obstacle and exit door')
  }
  if (!derived.evidenceIds.includes('frame_door') || !derived.evidenceIds.includes('frame_jack')) {
    throw new Error('derived access condition must preserve both grounded evidence sources')
  }
  if (derived.confidence !== 0.9) throw new Error(`expected bounded 0.9 confidence, got ${derived.confidence}`)

  const assessment = assessCondition(derived)
  if (!assessment.operational || assessment.issueType !== 'access' || assessment.severity !== 'medium') {
    throw new Error('strong grounded inferred exit obstruction should become a medium access issue')
  }

  const uniquelyAnchoredSign = structuredClone(base)
  uniquelyAnchoredSign.objects[0].name = 'green door'
  uniquelyAnchoredSign.objects[0].description = 'green door with white text and handle'
  uniquelyAnchoredSign.observations = uniquelyAnchoredSign.observations.filter((item) => item.id !== 'obs_exit')
  uniquelyAnchoredSign.objects.push({
    id: 'sign_1', environmentId, category: 'signage', name: 'emergency exit sign',
    description: 'green and white emergency exit sign', position: { description: 'above door' },
    confidence: 1, firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: ['frame_door'],
  })
  const uniqueDoorDerived = deriveOperationalConditions(uniquelyAnchoredSign, capturedAt)
  if (uniqueDoorDerived.derivedConditions.length !== 1) {
    throw new Error('grounded exit sign explicitly above the only visible door must independently ground that door')
  }

  const ambiguousDoorSign = structuredClone(uniquelyAnchoredSign)
  ambiguousDoorSign.objects.push({
    id: 'door_2', environmentId, category: 'door', name: 'blue door',
    description: 'blue door', confidence: 1,
    firstSeenAt: capturedAt, lastSeenAt: capturedAt, evidenceIds: ['frame_door'],
  })
  const ambiguousDoorDerived = deriveOperationalConditions(ambiguousDoorSign, capturedAt)
  if (ambiguousDoorDerived.derivedConditions.length !== 1 || ambiguousDoorDerived.derivedConditions[0].title !== 'Doorway access obstructed') {
    throw new Error('ambiguous exit signage may not identify an emergency exit, but explicit green-door obstruction may remain an ordinary doorway access condition')
  }
  if (ambiguousDoorDerived.derivedConditions.some((item) => item.title === 'Emergency exit access obstructed')) {
    throw new Error('ambiguous exit signage must never promote the ordinary obstruction into an emergency-exit claim')
  }

  const ordinaryDoorway = structuredClone(base)
  ordinaryDoorway.observations = ordinaryDoorway.observations.filter((item) => item.id !== 'obs_exit')
  ordinaryDoorway.objects[0].name = 'open office door'
  ordinaryDoorway.objects[0].description = 'open wooden door to a conference room'
  ordinaryDoorway.objects[1].name = 'gray chair'
  ordinaryDoorway.objects[1].category = 'furniture'
  ordinaryDoorway.objects[1].description = 'gray chair'
  ordinaryDoorway.objects[1].position = { description: 'directly in front of the open office door' }
  ordinaryDoorway.observations[0].label = 'gray chair'
  ordinaryDoorway.observations[0].description = 'A gray chair is positioned directly in front of the open office door.'

  const ordinaryDerived = deriveOperationalConditions(ordinaryDoorway, capturedAt)
  if (ordinaryDerived.derivedConditions.length !== 1) {
    throw new Error('explicit grounded chair-in-front-of-door geometry should derive one ordinary doorway access condition')
  }
  const ordinaryCondition = ordinaryDerived.derivedConditions[0]
  if (ordinaryCondition.title !== 'Doorway access obstructed' || ordinaryCondition.kind !== 'access' || ordinaryCondition.basis !== 'inferred') {
    throw new Error('ordinary doorway obstruction must remain a distinct inferred access condition')
  }
  const ordinaryAssessment = assessCondition(ordinaryCondition)
  if (!ordinaryAssessment.operational || ordinaryAssessment.issueType !== 'access' || ordinaryAssessment.severity !== 'medium') {
    throw new Error('strong grounded ordinary doorway obstruction should become a medium access issue')
  }

  const ordinarySafe = structuredClone(ordinaryDoorway)
  ordinarySafe.objects[1].position = { description: 'beside the wall away from the doorway' }
  ordinarySafe.observations[0].description = 'A gray chair is positioned beside the wall away from the doorway.'
  const ordinarySafeDerived = deriveOperationalConditions(ordinarySafe, capturedAt)
  if (ordinarySafeDerived.derivedConditions.length !== 0) {
    throw new Error('ordinary chair beside the doorway must not create an access condition')
  }
  const safePlacement = structuredClone(base)
  safePlacement.observations[1].description = 'An orange pallet jack is parked beside the shelving.'
  safePlacement.objects[1].description = 'orange pallet jack beside the shelving'
  const negative = deriveOperationalConditions(safePlacement, capturedAt)
  if (negative.derivedConditions.length !== 0) throw new Error('safe placement must not derive an access obstruction')

  const relationPlacement = structuredClone(base)
  relationPlacement.observations[1].description = 'An orange pallet jack with visible wheels and handle.'
  relationPlacement.objects[1].description = 'orange pallet jack with visible wheels and handle'
  relationPlacement.relations = [{
    id: 'rel_jack_front_door',
    environmentId,
    fromId: 'jack_1',
    toId: 'door_1',
    type: 'in_front_of',
    confidence: 1,
    evidenceIds: ['frame_jack'],
  }]
  const relationDerived = deriveOperationalConditions(relationPlacement, capturedAt)
  if (relationDerived.derivedConditions.length !== 1) {
    throw new Error('grounded obstacle -> door in_front_of relation must support access derivation')
  }

  const reversedPlacement = structuredClone(relationPlacement)
  reversedPlacement.relations[0].fromId = 'door_1'
  reversedPlacement.relations[0].toId = 'jack_1'
  const reversed = deriveOperationalConditions(reversedPlacement, capturedAt)
  if (reversed.derivedConditions.length !== 0) throw new Error('reversed spatial direction must not derive an access obstruction')

  const doorNameOnly = structuredClone(base)
  doorNameOnly.observations = doorNameOnly.observations.filter((item) => item.id !== 'obs_exit')
  const selfGrounded = deriveOperationalConditions(doorNameOnly, capturedAt)
  if (selfGrounded.derivedConditions.length !== 0) {
    throw new Error('an emergency-exit phrase in the door object itself must not replace independent exit grounding')
  }

  const inferredExitOnly = structuredClone(doorNameOnly)
  inferredExitOnly.conditions.push({
    id: 'inferred_exit', environmentId, kind: 'compliance', title: 'Possible emergency exit',
    description: 'The green door may be an emergency exit.', status: 'uncertain', basis: 'inferred',
    confidence: 1, objectIds: ['door_1'], evidenceIds: ['frame_door'], observedAt: capturedAt,
  })
  const inferredOnly = deriveOperationalConditions(inferredExitOnly, capturedAt)
  if (inferredOnly.derivedConditions.length !== 0) throw new Error('an inferred condition must not be reused as direct exit grounding')

  console.log('PASS  independently grounded exit signage + obstacle placement derives one inferred access condition')
  console.log('PASS  green emergency exit door aliases to grounded green-door wording without lowering confidence policy')
  console.log('PASS  derived condition preserves evidence and stays below source confidence')
  console.log('PASS  grounded exit sign above the only visible door preserves independent exit grounding')
  console.log('PASS  ambiguous exit signage cannot create an emergency-exit claim; explicit ordinary doorway obstruction remains allowed')
  console.log('PASS  ordinary evidence-backed chair-in-front-of-door geometry derives a medium doorway access issue')
  console.log('PASS  ordinary chair beside the doorway does not create an access issue')
  console.log('PASS  safe obstacle placement does not create an access condition')
  console.log('PASS  grounded obstacle -> door in_front_of relation supports derivation when text omits placement')
  console.log('PASS  reversed spatial direction does not derive an access obstruction')
  console.log('PASS  door naming alone cannot self-ground emergency-exit identity')
  console.log('PASS  inferred conditions are not reused as direct grounding facts')
  console.log('SENTINEL CONDITION DERIVATION GATE VERIFIED')
} finally {
  await vite.close()
}
