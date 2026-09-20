import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { EnvironmentalDiffEngine } = await vite.ssrLoadModule('/src/memory/diff-engine.ts')
  const { EnvironmentalMemoryStore } = await vite.ssrLoadModule('/src/memory/store.ts')

  const environmentId = 'phase7-diff-v2-test'
  const at1 = '2026-09-19T08:00:00.000Z'
  const at2 = '2026-09-19T09:00:00.000Z'
  const at3 = '2026-09-19T10:00:00.000Z'

  const object = (id, name, category = 'equipment', overrides = {}) => ({
    id,
    environmentId,
    category,
    name,
    description: name,
    confidence: 0.95,
    firstSeenAt: at1,
    lastSeenAt: at2,
    evidenceIds: [`e_${id}`],
    ...overrides,
  })

  const condition = (id, title, objectIds, overrides = {}) => ({
    id,
    environmentId,
    kind: 'maintenance',
    title,
    description: title,
    status: 'present',
    basis: 'observed',
    confidence: 0.9,
    objectIds,
    evidenceIds: [`e_${id}`],
    observedAt: at2,
    ...overrides,
  })

  const issue = (id, title, objectIds, overrides = {}) => ({
    id,
    environmentId,
    type: 'maintenance',
    title,
    description: title,
    severity: 'medium',
    status: 'open',
    confidence: 0.9,
    objectIds,
    evidenceIds: [`e_${id}`],
    firstDetectedAt: at1,
    lastObservedAt: at2,
    ...overrides,
  })

  const relation = (id, fromId, toId, type = 'near', confidence = 0.95) => ({
    id,
    environmentId,
    fromId,
    toId,
    type,
    confidence,
    evidenceIds: [`e_${id}`],
  })

  const engine = new EnvironmentalDiffEngine({
    now: () => new Date(at3),
    id: (() => { let i = 0; return () => `change_${++i}` })(),
  })

  // Repeated-object regression: IDs churn, names are identical, but grounded
  // relationship context distinguishes the two physical extinguishers.
  const previousObjects = [
    object('door_green_old', 'green door', 'door'),
    object('door_blue_old', 'blue door', 'door'),
    object('ext_left_old', 'fire extinguisher', 'equipment'),
    object('ext_right_old', 'fire extinguisher', 'equipment'),
    object('panel_old', 'electrical panel', 'electrical', { state: 'closed' }),
    object('crate_old', 'storage crate', 'other'),
  ]
  const currentObjects = [
    object('door_green_new', 'green door', 'door'),
    object('door_blue_new', 'blue door', 'door'),
    object('ext_a_new', 'fire extinguisher', 'safety'),
    object('ext_b_new', 'fire extinguisher', 'safety'),
    object('panel_new', 'electrical panel', 'electrical', { state: 'open' }),
    object('crate_removed', 'storage crate', 'other', { state: 'removed' }),
    object('cart_new', 'utility cart', 'equipment'),
  ]

  const from = {
    stateId: 'state_v1',
    environmentId,
    objects: previousObjects,
    conditions: [
      condition('condition_leak_old', 'Small maintenance leak', ['panel_old']),
      condition('condition_noise_old', 'Intermittent equipment noise', ['ext_left_old']),
    ],
    issues: [
      issue('issue_leak', 'Small maintenance leak', ['panel_old']),
    ],
    relations: [
      relation('r_ext_left_green', 'ext_left_old', 'door_green_old'),
      relation('r_ext_right_blue', 'ext_right_old', 'door_blue_old'),
      relation('r_panel_green', 'panel_old', 'door_green_old', 'adjacent_to'),
    ],
  }

  const to = {
    stateId: 'state_v2',
    environmentId,
    objects: currentObjects,
    conditions: [
      condition('condition_leak_now', 'Small maintenance leak', ['panel_new'], { status: 'uncertain' }),
      condition('condition_access_new', 'Access route narrowed', ['cart_new'], { kind: 'access' }),
    ],
    issues: [
      issue('issue_leak', 'Small maintenance leak', ['panel_new'], { status: 'resolved', lastObservedAt: at2 }),
      issue('issue_access', 'Access route narrowed', ['cart_new'], { type: 'access' }),
    ],
    relations: [
      relation('r_ext_a_green', 'ext_a_new', 'door_green_new'),
      relation('r_ext_b_blue', 'ext_b_new', 'door_blue_new'),
      relation('r_panel_blue', 'panel_new', 'door_blue_new', 'adjacent_to'),
    ],
  }

  const diff = engine.compare(from, to)

  const titles = diff.changes.map((change) => `${change.type}:${change.title}`)
  const assertChange = (type, title) => {
    if (!diff.changes.some((change) => change.type === type && change.title === title)) {
      throw new Error(`missing ${type} change ${title}; got ${titles.join(' | ')}`)
    }
  }

  assertChange('added', 'New: utility cart')
  assertChange('removed', 'Removed: storage crate')
  assertChange('changed', 'Changed: electrical panel')
  assertChange('moved', 'Moved: electrical panel')
  assertChange('resolved', 'Resolved issue: Small maintenance leak')
  assertChange('added', 'New issue: Access route narrowed')
  assertChange('uncertain', 'Condition not re-observed: Intermittent equipment noise')

  const extinguisherNoise = diff.changes.filter((change) => /fire extinguisher/i.test(change.title))
  if (extinguisherNoise.length !== 0) {
    throw new Error(`relationship context should match repeated extinguisher instances without noise: ${extinguisherNoise.map((item) => item.title).join(', ')}`)
  }

  const leakConditionTransition = diff.changes.find((change) => change.title === 'Changed condition: Small maintenance leak')
  if (!leakConditionTransition || !/present → uncertain/.test(leakConditionTransition.description)) {
    throw new Error('condition present→uncertain transition must be first-class')
  }

  if (diff.changes.some((change) => change.title === 'Not re-observed: Small maintenance leak')) {
    throw new Error('explicit condition transition/resolved issue must not also emit missing-issue noise')
  }

  if (!/added/.test(diff.summary) || !/removed/.test(diff.summary) || !/moved/.test(diff.summary) || !/resolved/.test(diff.summary)) {
    throw new Error(`diff summary should expose typed counts, got: ${diff.summary}`)
  }

  if (!diff.changes.every((change) => change.entityKind)) {
    throw new Error('Phase 7 changes must identify object / condition / issue entity kind')
  }

  // Non-observation is never enough to claim removal or resolution.
  const uncertainOnly = engine.compare(
    {
      stateId: 'state_missing_1',
      environmentId,
      objects: [object('chair_old', 'chair', 'furniture')],
      conditions: [condition('condition_old', 'Loose cable', ['chair_old'])],
      issues: [],
      relations: [],
    },
    {
      stateId: 'state_missing_2',
      environmentId,
      objects: [],
      conditions: [],
      issues: [],
      relations: [],
    },
  )
  if (uncertainOnly.changes.some((change) => change.type === 'removed' || change.type === 'resolved')) {
    throw new Error('simple non-observation must not become removed/resolved')
  }
  if (!uncertainOnly.changes.every((change) => change.type === 'uncertain')) {
    throw new Error('unsupported disappearance should remain uncertain')
  }

  const officePhotoNoise = engine.compare(
    {
      stateId: 'state_office_1',
      environmentId,
      objects: [
        object('rug_old', 'area rug', 'other'),
        object('art_old', 'wall art', 'signage'),
        object('basket_old', 'wicker basket', 'other'),
        object('lamp_old', 'table lamp', 'electrical'),
        object('books_old', 'books', 'other'),
      ],
      conditions: [],
      issues: [],
      relations: [],
    },
    {
      stateId: 'state_office_2',
      environmentId,
      objects: [
        object('rug_new', 'carpet', 'furniture'),
        object('art_new', 'picture', 'signage'),
        object('basket_new', 'basket', 'furniture'),
        object('lamp_new', 'desk lamp', 'furniture'),
        object('books_new', 'books', 'furniture'),
        object('cup_new', 'cup', 'furniture'),
        object('switch_new', 'light switch', 'electrical'),
        object('bag_new', 'green duffel bag', 'other'),
      ],
      conditions: [],
      issues: [],
      relations: [],
    },
  )
  if (officePhotoNoise.changes.some((change) => /rug|carpet|wall art|picture|basket|lamp|books|cup|light switch/i.test(change.title))) {
    throw new Error(`office alias/micro-inventory noise should be suppressed: ${officePhotoNoise.changes.map((item) => item.title).join(', ')}`)
  }
  if (!officePhotoNoise.changes.some((change) => change.title === 'New: green duffel bag')) {
    throw new Error('real salient bag addition must remain visible')
  }

  const learnedStateOnly = engine.compare(
    {
      stateId: 'state_learned_1',
      environmentId,
      objects: [object('closet_old', 'white closet', 'furniture', { state: undefined, description: 'white closet with silver handles' })],
      conditions: [],
      issues: [],
      relations: [],
    },
    {
      stateId: 'state_learned_2',
      environmentId,
      objects: [object('closet_new', 'white closet', 'furniture', { state: 'closed', description: 'white closet with two doors that are closed' })],
      conditions: [],
      issues: [],
      relations: [],
    },
  )
  if (learnedStateOnly.changes.some((change) => change.title === 'Changed: white closet')) {
    throw new Error('unknown→known state refinement must not be presented as a physical change')
  }

  const textuallyReobserved = engine.compare(
    {
      stateId: 'state_basket_1',
      environmentId,
      objects: [object('basket_old_text', 'wicker basket', 'furniture')],
      conditions: [],
      issues: [],
      relations: [],
    },
    {
      stateId: 'state_basket_2',
      environmentId,
      objects: [object('shelf_with_basket', 'metal shelf', 'furniture', { description: 'metal shelf with potted plants, books, a globe, and a wicker basket on it' })],
      conditions: [],
      issues: [],
      relations: [],
    },
  )
  if (textuallyReobserved.changes.some((change) => /wicker basket/i.test(change.title))) {
    throw new Error('explicit current description re-observation must suppress false missing-object uncertainty')
  }

  // Relationship context must not manufacture identity when two repeated
  // instances remain indistinguishable.
  const ambiguous = engine.compare(
    {
      stateId: 'state_amb_1',
      environmentId,
      objects: [
        object('box_old_a', 'cardboard box', 'other'),
        object('box_old_b', 'cardboard box', 'other'),
      ],
      conditions: [],
      issues: [],
      relations: [],
    },
    {
      stateId: 'state_amb_2',
      environmentId,
      objects: [object('box_new_a', 'brown boxes', 'other')],
      conditions: [],
      issues: [],
      relations: [],
    },
  )
  if (ambiguous.changes.some((change) => /box/i.test(change.title))) {
    throw new Error('unresolved repeated-family multiplicity should remain suppressed rather than guessed')
  }

  // Generated diffs remain part of durable memory.
  let stateSeq = 0
  let objectSeq = 0
  let relationSeq = 0
  let diffSeq = 0
  const store = new EnvironmentalMemoryStore({
    now: () => new Date(at3),
    ids: {
      state: () => `stored_state_${++stateSeq}`,
      object: () => `stored_object_${++objectSeq}`,
      relation: () => `stored_relation_${++relationSeq}`,
      diff: () => `stored_diff_${++diffSeq}`,
    },
  })

  store.createEnvironment({
    id: 'phase7-store-test',
    name: 'Phase 7 store test',
    type: 'office',
    createdAt: at1,
    updatedAt: at1,
    stateIds: [],
    roomIds: [],
    objectIds: [],
    issueIds: [],
  })

  const ingest = (sourceId, capturedAt, stateValue) => store.ingestScan(
    'phase7-store-test',
    { id: sourceId, environmentId: 'phase7-store-test', modality: 'image', uri: `https://local/${sourceId}.jpg`, capturedAt },
    {
      sourceId,
      observations: [],
      objects: [{
        id: 'panel',
        environmentId: 'phase7-store-test',
        category: 'electrical',
        name: 'electrical panel',
        state: stateValue,
        confidence: 0.95,
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
        evidenceIds: [`e_${sourceId}`],
      }],
      conditions: [],
      relations: [],
      evidence: [{
        id: `e_${sourceId}`,
        type: 'frame',
        sourceId,
        capturedAt,
        description: sourceId,
      }],
    },
  )

  const stateTextStore = new EnvironmentalMemoryStore({ now: () => new Date(at3) })
  stateTextStore.createEnvironment({
    id: 'photo-state-text-test',
    name: 'Photo state text test',
    type: 'office',
    createdAt: at1,
    updatedAt: at1,
    stateIds: [],
    roomIds: [],
    objectIds: [],
    issueIds: [],
  })
  const ingestPhotoText = (sourceId, capturedAt, doorDescription, closetDescription) => stateTextStore.ingestScan(
    'photo-state-text-test',
    { id: sourceId, environmentId: 'photo-state-text-test', modality: 'image', uri: `https://local/${sourceId}.jpg`, capturedAt },
    {
      sourceId,
      observations: [],
      objects: [
        {
          id: `door_${sourceId}`,
          environmentId: 'photo-state-text-test',
          category: 'door',
          name: 'white door',
          description: doorDescription,
          confidence: 0.95,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [`e_${sourceId}`],
        },
        {
          id: `closet_${sourceId}`,
          environmentId: 'photo-state-text-test',
          category: 'furniture',
          name: 'white closet',
          description: closetDescription,
          confidence: 0.95,
          firstSeenAt: capturedAt,
          lastSeenAt: capturedAt,
          evidenceIds: [`e_${sourceId}`],
        },
      ],
      conditions: [],
      relations: [],
      evidence: [{
        id: `e_${sourceId}`,
        type: 'frame',
        sourceId,
        capturedAt,
        description: sourceId,
      }],
    },
  )
  const textState1 = ingestPhotoText('text_state_1', at1, 'closed white door with silver handle', 'white closet with silver handles')
  const textState2 = ingestPhotoText('text_state_2', at2, 'a white door that is slightly ajar', 'white closet with two doors that are closed')
  const textMemory = stateTextStore.get('photo-state-text-test')
  const textSnapshot1 = textMemory?.snapshots.find((item) => item.stateId === textState1.id)
  const textSnapshot2 = textMemory?.snapshots.find((item) => item.stateId === textState2.id)
  const firstDoorState = textSnapshot1?.objects.find((item) => item.name === 'white door')?.state
  const secondDoorState = textSnapshot2?.objects.find((item) => item.name === 'white door')?.state
  if (firstDoorState !== 'closed' || secondDoorState !== 'open') {
    throw new Error(`explicit still-photo wording must recover closed→open door state, got ${firstDoorState ?? 'unknown'}→${secondDoorState ?? 'unknown'}`)
  }
  const textDiff = stateTextStore.compare('photo-state-text-test', textState1.id, textState2.id)
  if (!textDiff.changes.some((change) => change.title === 'Changed: white door' && /closed to open/.test(change.description))) {
    throw new Error('recovered explicit door state must produce a closed→open physical change')
  }
  if (textDiff.changes.some((change) => change.title === 'Changed: white closet')) {
    throw new Error('closet unknown→closed must remain knowledge refinement, not physical change')
  }

  const s1 = ingest('source_1', at1, 'closed')
  const s2 = ingest('source_2', at2, 'open')
  const s3 = ingest('source_3', at3, 'closed')
  store.compare('phase7-store-test', s1.id, s2.id)
  store.compare('phase7-store-test', s2.id, s3.id)
  const storedMemory = store.get('phase7-store-test')
  if (storedMemory?.diffs.length !== 2) {
    throw new Error(`every generated state-pair diff must be retained, got ${storedMemory?.diffs.length ?? 0}`)
  }

  console.log('PASS  Added / Removed / Moved / Changed / Resolved change vocabulary')
  console.log('PASS  repeated object identity uses distinctive relationship context without fuzzy guessing')
  console.log('PASS  object movement can use grounded relationship-anchor changes')
  console.log('PASS  non-observation remains uncertain rather than removed/resolved')
  console.log('PASS  first-class condition transition semantics avoid duplicate issue noise')
  console.log('PASS  generated state-pair diffs remain stored in environmental memory')
  console.log('SENTINEL PHASE 7 DIFF ENGINE V2 VERIFIED')
} finally {
  await vite.close()
}
