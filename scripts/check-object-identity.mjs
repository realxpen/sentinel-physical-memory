import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { matchObjectsConservatively, objectsSemanticallyMatch } = await vite.ssrLoadModule('/src/memory/object-identity.ts')
  const { EnvironmentalDiffEngine } = await vite.ssrLoadModule('/src/memory/diff-engine.ts')
  const { EnvironmentalMemoryStore } = await vite.ssrLoadModule('/src/memory/store.ts')

  const environmentId = 'warehouse-identity-test'
  const at = '2026-09-17T13:15:54.989Z'
  const object = (id, category, name, description = name) => ({
    id, environmentId, category, name, description, confidence: 1,
    firstSeenAt: at, lastSeenAt: at, evidenceIds: [`e_${id}`],
  })

  const aliases = [
    [object('a1', 'furniture', 'metal shelving'), object('b1', 'furniture', 'orange metal shelves')],
    [object('a2', 'furniture', 'cardboard boxes'), object('b2', 'other', 'brown boxes')],
    [object('a3', 'other', 'concrete floor'), object('b3', 'other', 'warehouse floor')],
    [object('a4', 'other', 'white ceiling'), object('b4', 'other', 'warehouse ceiling')],
    [object('a5', 'equipment', 'fire extinguisher'), object('b5', 'safety', 'fire extinguisher')],
    [object('a6', 'signage', 'white sign', 'White sign with a green exit symbol above the door.'), object('b6', 'signage', 'emergency exit sign')],
  ]

  for (const [left, right] of aliases) {
    if (!objectsSemanticallyMatch(left, right)) throw new Error(`expected semantic alias match: ${left.name} -> ${right.name}`)
  }

  if (objectsSemanticallyMatch(object('chair1', 'furniture', 'chair'), object('chair2', 'furniture', 'desk'))) {
    throw new Error('ambiguous movable furniture must not fuzzy-match')
  }
  if (objectsSemanticallyMatch(object('door1', 'door', 'emergency exit door'), object('door2', 'door', 'service door'))) {
    throw new Error('generic doors must not fuzzy-match')
  }
  if (objectsSemanticallyMatch(
    object('jack-boxes', 'equipment', 'orange pallet jack', 'orange pallet jack parked beside cardboard boxes'),
    object('boxes', 'other', 'brown boxes'),
  )) {
    throw new Error('description mentions must not redefine the primary object family')
  }
  if (objectsSemanticallyMatch(
    object('door-sign', 'door', 'green door', 'green door below an emergency exit sign'),
    object('sign', 'signage', 'emergency exit sign'),
  )) {
    throw new Error('a door mentioning nearby signage must not become an exit-sign object')
  }

  const repeatedPrevious = [
    object('boxes-left', 'other', 'cardboard boxes'),
    object('boxes-right', 'other', 'brown boxes'),
  ]
  const repeatedCurrent = [object('boxes-now', 'other', 'warehouse boxes')]
  if (matchObjectsConservatively(repeatedPrevious, repeatedCurrent).size !== 0) {
    throw new Error('ambiguous repeated objects must not reuse one semantic family match')
  }

  const store = new EnvironmentalMemoryStore({ now: () => new Date(at) })
  store.createEnvironment({
    id: environmentId, name: 'Warehouse identity test', type: 'warehouse',
    createdAt: at, updatedAt: at, stateIds: [], roomIds: [], objectIds: [], issueIds: [],
  })
  const source = (id) => ({ id, environmentId, modality: 'image', uri: `${id}.jpg`, capturedAt: at })
  const perception = (sourceId, objects) => ({
    sourceId,
    observations: [],
    objects,
    conditions: [],
    relations: [],
    evidence: objects.map((item) => ({
      id: item.evidenceIds[0], type: 'frame', sourceId, capturedAt: at, description: item.name,
    })),
  })
  const baselineState = store.ingestScan(
    environmentId,
    source('baseline'),
    perception('baseline', [object('shelf-old', 'furniture', 'metal shelving')]),
  )
  const comparisonState = store.ingestScan(
    environmentId,
    source('comparison'),
    perception('comparison', [object('shelf-new', 'furniture', 'orange metal shelves')]),
  )
  if (baselineState.objectIds[0] !== comparisonState.objectIds[0]) {
    throw new Error('unique aliases must reuse the durable canonical object id')
  }

  const repeatedState = store.ingestScan(
    environmentId,
    source('repeated'),
    perception('repeated', [
      object('boxes-a', 'other', 'cardboard boxes'),
      object('boxes-b', 'other', 'brown boxes'),
    ]),
  )
  if (new Set(repeatedState.objectIds).size !== 2) {
    throw new Error('repeated objects in one scan must retain distinct durable ids')
  }

  const baseline = aliases.map(([left]) => left).concat([
    object('door', 'door', 'green door'),
  ])
  const comparison = aliases.map(([, right]) => right).concat([
    object('door', 'door', 'green door'),
    object('jack', 'equipment', 'orange pallet jack', 'orange pallet jack in front of the green door'),
  ])

  const engine = new EnvironmentalDiffEngine({
    now: () => new Date(at),
    id: (() => { let i = 0; return () => `change_${++i}` })(),
  })
  const diff = engine.compare(
    { stateId: 'state_1', environmentId, objects: baseline, conditions: [], issues: [] },
    { stateId: 'state_2', environmentId, objects: comparison, conditions: [], issues: [] },
  )

  const added = diff.changes.filter((change) => change.type === 'added')
  const uncertain = diff.changes.filter((change) => change.type === 'uncertain')
  if (added.length !== 1 || added[0].title !== 'New: orange pallet jack') {
    throw new Error(`expected only the pallet jack to be new, got ${added.map((change) => change.title).join(', ')}`)
  }
  if (uncertain.length !== 0) throw new Error(`semantic aliases must not create not-re-observed noise: ${uncertain.map((change) => change.title).join(', ')}`)

  console.log('PASS  provider naming aliases map to conservative durable object families')
  console.log('PASS  chairs/desks/doors remain outside fuzzy identity matching')
  console.log('PASS  secondary description mentions do not redefine object identity')
  console.log('PASS  repeated ambiguous objects are not collapsed into one match')
  console.log('PASS  memory reuses unique aliases and preserves repeated object instances')
  console.log('PASS  warehouse alias drift collapses to one real added pallet jack')
  console.log('SENTINEL OBJECT IDENTITY GATE VERIFIED')
} finally {
  await vite.close()
}
