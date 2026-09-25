import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { collapseGroundedStructuralSurfaceDuplicates, matchObjectsConservatively, objectsSemanticallyMatch, sameFrameStillObjectsCanConsolidate, sameScanObjectsCanConsolidate } = await vite.ssrLoadModule('/src/memory/object-identity.ts')
  const { EnvironmentalDiffEngine } = await vite.ssrLoadModule('/src/memory/diff-engine.ts')
  const { EnvironmentalMemoryStore } = await vite.ssrLoadModule('/src/memory/store.ts')

  const environmentId = 'warehouse-identity-test'
  const at = '2026-09-17T13:15:54.989Z'
  const object = (id, category, name, description = name, overrides = {}) => ({
    id, environmentId, category, name, description, confidence: 1,
    firstSeenAt: at, lastSeenAt: at, evidenceIds: [`e_${id}`],
    ...overrides,
  })

  const aliases = [
    [object('a1', 'furniture', 'metal shelving'), object('b1', 'furniture', 'orange metal shelves')],
    [object('a2', 'furniture', 'cardboard boxes'), object('b2', 'furniture', 'boxed items')],
    [object('a3', 'other', 'concrete floor'), object('b3', 'other', 'warehouse floor')],
    [object('a4', 'other', 'white ceiling'), object('b4', 'other', 'warehouse ceiling')],
    [object('a5', 'equipment', 'fire extinguisher'), object('b5', 'safety', 'fire extinguisher')],
    [object('a6', 'signage', 'white sign', 'White sign with a green exit symbol above the door.'), object('b6', 'signage', 'emergency exit sign')],
    [object('a7', 'door', 'green emergency exit door'), object('b7', 'door', 'green door')],
    [object('a8', 'other', 'area rug'), object('b8', 'furniture', 'carpet')],
    [object('a9', 'signage', 'wall art'), object('b9', 'signage', 'picture')],
    [object('a10', 'other', 'wicker basket'), object('b10', 'furniture', 'basket')],
    [object('a11', 'electrical', 'table lamp'), object('b11', 'furniture', 'desk lamp')],
  ]

  for (const [left, right] of aliases) {
    if (!objectsSemanticallyMatch(left, right)) throw new Error(`expected semantic alias match: ${left.name} -> ${right.name}`)
  }

  if (!objectsSemanticallyMatch(
    object('box-cardboard', 'furniture', 'cardboard boxes'),
    object('box-brown', 'other', 'brown boxes'),
  )) {
    throw new Error('cardboard boxes -> brown boxes should remain a supported isolated alias')
  }
  if (!objectsSemanticallyMatch(
    object('box-plural', 'furniture', 'cardboard boxes'),
    object('box-singular', 'equipment', 'cardboard box'),
  )) {
    throw new Error('cardboard boxes -> cardboard box should preserve the durable box family')
  }


  if (!objectsSemanticallyMatch(
    object('doorway-old', 'door', 'doorway', 'doorway at the end of the hallway'),
    object('door-generic-new', 'door', 'door', 'door at the end of the hallway'),
  )) {
    throw new Error('doorway -> generic door should preserve durable architectural identity')
  }
  if (!objectsSemanticallyMatch(
    object('exit-door-old', 'door', 'emergency exit doorway', 'emergency exit doorway'),
    object('exit-door-new', 'door', 'exit door', 'exit door'),
  )) {
    throw new Error('exit doorway -> exit door should preserve exit-door identity')
  }
  if (!objectsSemanticallyMatch(
    object('glass-door-old', 'door', 'glass doorway', 'glass doorway'),
    object('glass-door-new', 'door', 'glass door', 'glass door'),
  )) {
    throw new Error('glass doorway -> glass door should preserve glass-door identity')
  }
  if (!objectsSemanticallyMatch(
    object('window-old', 'other', 'window', 'hallway window'),
    object('window-new', 'other', 'glass window', 'hallway glass window'),
  )) {
    throw new Error('window naming drift should preserve durable window identity')
  }

  if (!objectsSemanticallyMatch(
    object('books-old', 'other', 'books'),
    object('books-new', 'furniture', 'books'),
  )) {
    throw new Error('exact object name should survive provider category drift')
  }

  if (objectsSemanticallyMatch(object('chair1', 'furniture', 'chair'), object('chair2', 'furniture', 'desk'))) {
    throw new Error('ambiguous movable furniture must not fuzzy-match')
  }
  if (objectsSemanticallyMatch(object('door1', 'door', 'emergency exit door'), object('door2', 'door', 'service door'))) {
    throw new Error('generic doors without a shared visible anchor must not fuzzy-match')
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

  const sameDoorEvidence = ['e_green_door_shared']
  const verboseDoor = object('door-verbose', 'door', 'green emergency exit door', 'green door with exit sign above', { evidenceIds: sameDoorEvidence, position: { description: 'center' } })
  const shortDoor = object('door-short', 'door', 'green door', 'green double door', { evidenceIds: sameDoorEvidence })
  if (!sameScanObjectsCanConsolidate(verboseDoor, shortDoor)) {
    throw new Error('grounded same-scan green-door aliases should consolidate')
  }
  const conflictingDoor = object('door-conflict', 'door', 'green door', 'green service door', { evidenceIds: sameDoorEvidence, position: { description: 'left' } })
  if (sameScanObjectsCanConsolidate(verboseDoor, conflictingDoor)) {
    throw new Error('same-scan aliases with conflicting semantic positions must remain separate')
  }

  const exactSceneDoor = object('door-scene', 'door', 'green double door', 'green double door', { evidenceIds: sameDoorEvidence })
  const exactAuditDoor = object('audit_door-audit', 'door', 'green double door', 'green double door', { evidenceIds: sameDoorEvidence })
  if (!sameScanObjectsCanConsolidate(exactSceneDoor, exactAuditDoor)) {
    throw new Error('exact scene/audit duplicates with shared grounding should consolidate')
  }
  const exactIdentityDoor = object('identity_door-identity', 'door', 'green double door', 'green double door', { evidenceIds: sameDoorEvidence })
  if (!sameScanObjectsCanConsolidate(exactSceneDoor, exactIdentityDoor)) {
    throw new Error('exact scene/identity duplicates with shared grounding should consolidate')
  }
  const exactGeometryDoor = object('geometry_door-geometry', 'door', 'green double door', 'green double door', { evidenceIds: sameDoorEvidence })
  if (!sameScanObjectsCanConsolidate(exactIdentityDoor, exactGeometryDoor)) {
    throw new Error('exact identity/geometry duplicates with shared grounding should consolidate')
  }
  const exactScenePeer = object('door-peer', 'door', 'green double door', 'green double door', { evidenceIds: sameDoorEvidence })
  if (sameScanObjectsCanConsolidate(exactSceneDoor, exactScenePeer)) {
    throw new Error('same-pass exact duplicates must remain separate to protect repeated physical instances')
  }

  const photoPlantA = object('plant-photo-a', 'furniture', 'potted plant', 'potted plant', { evidenceIds: ['photo_frame'], position: { description: 'on shelf' } })
  const photoPlantB = object('plant-photo-b', 'furniture', 'potted plant', 'potted plant', { evidenceIds: ['photo_frame'], position: { description: 'on shelf' } })
  const photoPlantAlias = object('plant-photo-alias', 'furniture', 'plant pot', 'plant pot', { evidenceIds: ['photo_frame'], position: { description: 'on shelf' } })
  const photoPlantDesk = object('plant-photo-desk', 'furniture', 'potted plant', 'potted plant', { evidenceIds: ['photo_frame'], position: { description: 'on desk' } })
  if (!sameFrameStillObjectsCanConsolidate(photoPlantA, photoPlantB)) {
    throw new Error('still-photo exact duplicate objects with identical grounding should consolidate')
  }
  if (!sameFrameStillObjectsCanConsolidate(photoPlantA, photoPlantAlias)) throw new Error('plant pot / potted plant aliases at the same grounded location should consolidate')
  const bagA = object('bag-a', 'other', 'duffel bag', 'green duffel bag', { evidenceIds: ['photo_frame'], position: { description: 'on floor near desk' } })
  const bagB = object('bag-b', 'other', 'duffle bag', 'green bag', { evidenceIds: ['photo_frame'], position: { description: 'near desk on floor' } })
  if (!sameFrameStillObjectsCanConsolidate(bagA, bagB)) throw new Error('same grounded duffel bag aliases should consolidate')

  const cabinetWhole = object('cabinet-a', 'furniture', 'cabinet door', 'cabinet door', { evidenceIds: ['photo_frame'], position: { description: 'back wall' } })
  const cabinetLeft = object('cabinet-b', 'furniture', 'left cabinet door', 'left cabinet door', { evidenceIds: ['photo_frame'], position: { description: 'back wall' } })
  if (!sameFrameStillObjectsCanConsolidate(cabinetWhole, cabinetLeft)) throw new Error('same grounded cabinet-door aliases should consolidate')

  if (sameFrameStillObjectsCanConsolidate(photoPlantA, photoPlantDesk)) {
    throw new Error('still-photo objects with distinct grounded locations must remain separate')
  }

  const photoWallLeftBox = object('wall-photo-a', 'other', 'white wall', 'white wall', { evidenceIds: ['photo_frame'], boundingBox: { x: 0, y: 0, width: 0.45, height: 1 } })
  const photoWallRightBox = object('wall-photo-b', 'other', 'white wall', 'white wall', { evidenceIds: ['photo_frame'], boundingBox: { x: 0.55, y: 0, width: 0.45, height: 1 } })
  if (!sameFrameStillObjectsCanConsolidate(photoWallLeftBox, photoWallRightBox)) {
    throw new Error('one unanchored wall split into non-overlapping image boxes should consolidate')
  }
  const leftWall = object('wall-left', 'other', 'white wall', 'left wall', { evidenceIds: ['photo_frame'], position: { description: 'left wall' } })
  const rightWall = object('wall-right', 'other', 'white wall', 'right wall', { evidenceIds: ['photo_frame'], position: { description: 'right wall' } })
  if (sameFrameStillObjectsCanConsolidate(leftWall, rightWall)) {
    throw new Error('distinct grounded wall directions must remain separate')
  }
  const collapsedWalls = collapseGroundedStructuralSurfaceDuplicates([photoWallLeftBox, photoWallRightBox])
  if (collapsedWalls.length !== 1) throw new Error(`expected one comparison-time wall surface, got ${collapsedWalls.length}`)

  const previousPlants = [
    object('plant-old-desk', 'other', 'potted plant', 'desk plant', { position: { description: 'on desk' } }),
    object('plant-old-shelf', 'other', 'plant pots', 'shelf plant', { position: { description: 'on shelf' } }),
  ]
  const currentPlants = [
    object('plant-new-shelf', 'furniture', 'plant', 'shelf plant', { position: { description: 'on shelf' } }),
    object('plant-new-desk', 'other', 'potted plant', 'desk plant', { position: { description: 'on the desk' } }),
  ]
  const plantMatches = matchObjectsConservatively(previousPlants, currentPlants)
  if (plantMatches.size !== 2) throw new Error(`grounded repeated plants should match by location, got ${plantMatches.size}`)

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
  const perception = (sourceId, objects) => {
    const evidenceIds = [...new Set(objects.flatMap((item) => item.evidenceIds))]
    return {
      sourceId,
      observations: [],
      objects,
      conditions: [],
      relations: [],
      evidence: evidenceIds.map((id) => ({
        id, type: 'frame', sourceId, capturedAt: at, description: id,
      })),
    }
  }

  const baselineObjects = [
    object('shelf-old', 'furniture', 'metal shelving', 'metal shelving', { evidenceIds: ['e_baseline_shelf'] }),
    object('audit_shelf-old', 'furniture', 'metal shelving', 'metal shelving', { evidenceIds: ['e_baseline_shelf'] }),
    object('door-old-verbose', 'door', 'green emergency exit door', 'green door with exit sign above', { evidenceIds: ['e_baseline_door'], position: { description: 'center' } }),
    object('audit_door-old-verbose', 'door', 'green emergency exit door', 'green door with exit sign above', { evidenceIds: ['e_baseline_door'], position: { description: 'center' } }),
    object('door-old-short', 'door', 'green door', 'green double door', { evidenceIds: ['e_baseline_door'] }),
  ]
  const baselineState = store.ingestScan(environmentId, source('baseline'), perception('baseline', baselineObjects))
  if (new Set(baselineState.objectIds).size !== 2) {
    throw new Error(`same-scan grounded door aliases should collapse to one durable door, got ${baselineState.objectIds.length} state objects`)
  }

  const comparisonObjects = [
    object('shelf-new-short', 'furniture', 'shelves', 'shelves on both sides', { evidenceIds: ['e_comparison_shelf'] }),
    object('audit_shelf-new-short', 'furniture', 'shelves', 'shelves on both sides', { evidenceIds: ['e_comparison_shelf'] }),
    object('shelf-new-specific', 'furniture', 'orange metal shelves', 'orange metal shelves on both sides', { evidenceIds: ['e_comparison_shelf'] }),
    object('door-new', 'door', 'green door', 'green double door', { evidenceIds: ['e_comparison_door'] }),
    object('audit_door-new', 'door', 'green door', 'green double door', { evidenceIds: ['e_comparison_door'] }),
    object('jack-new', 'equipment', 'orange pallet jack', 'orange pallet jack in front of the green door'),
  ]
  const comparisonState = store.ingestScan(environmentId, source('comparison'), perception('comparison', comparisonObjects))
  if (new Set(comparisonState.objectIds).size !== 3) {
    throw new Error(`comparison aliases should resolve to shelf + door + pallet jack, got ${comparisonState.objectIds.length} state objects`)
  }

  const baselineMemory = store.get(environmentId)
  const baselineSnapshot = baselineMemory?.snapshots.find((item) => item.stateId === baselineState.id)
  const comparisonSnapshot = baselineMemory?.snapshots.find((item) => item.stateId === comparisonState.id)
  if (!baselineSnapshot || !comparisonSnapshot) throw new Error('expected immutable snapshots for identity regression')

  const baselineDoorId = baselineSnapshot.objects.find((item) => item.category === 'door')?.id
  const comparisonDoorId = comparisonSnapshot.objects.find((item) => item.category === 'door')?.id
  if (!baselineDoorId || baselineDoorId !== comparisonDoorId) {
    throw new Error('green emergency exit door -> green door must reuse one durable door id')
  }

  const baselineShelfId = baselineSnapshot.objects.find((item) => /shel/.test(item.name))?.id
  const comparisonShelfId = comparisonSnapshot.objects.find((item) => /shel/.test(item.name))?.id
  if (!baselineShelfId || baselineShelfId !== comparisonShelfId) {
    throw new Error('same-scan shelf aliases must still reuse the baseline durable shelf id')
  }

  const photoNoiseState = store.ingestScan(
    environmentId,
    source('photo-noise'),
    perception('photo-noise', [
      ...Array.from({ length: 20 }, (_, index) => object(`plant-shelf-${index}`, 'furniture', 'potted plant', 'potted plant', { evidenceIds: ['e_photo_noise'], position: { description: 'on shelf' } })),
      object('plant-shelf-alias', 'furniture', 'plant pot', 'plant pot', { evidenceIds: ['e_photo_noise'], position: { description: 'on shelf' } }),
      object('plant-desk', 'furniture', 'potted plant', 'potted plant', { evidenceIds: ['e_photo_noise'], position: { description: 'on desk' } }),
      object('wall-segment-a', 'other', 'white wall', 'white wall', { evidenceIds: ['e_photo_noise'], boundingBox: { x: 0, y: 0, width: 0.45, height: 1 } }),
      object('wall-segment-b', 'other', 'white wall', 'white wall', { evidenceIds: ['e_photo_noise'], boundingBox: { x: 0.55, y: 0, width: 0.45, height: 1 } }),
    ]),
  )
  if (new Set(photoNoiseState.objectIds).size !== 3) {
    throw new Error(`still-photo duplicate burst should collapse to shelf plant + desk plant + one wall, got ${photoNoiseState.objectIds.length}`)
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
    throw new Error('repeated objects without shared grounding must retain distinct durable ids')
  }

  const baseline = aliases.map(([left]) => left)
  const comparison = aliases.map(([, right]) => right).concat([
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

  const multiplicityDiff = engine.compare(
    {
      stateId: 'state_multi_1',
      environmentId,
      objects: [
        object('door-old-1', 'door', 'green door', 'green door with window'),
        object('door-old-2', 'door', 'green door', 'green door with window'),
        object('ext-old-1', 'equipment', 'fire extinguisher', 'red fire extinguisher'),
        object('ext-old-2', 'equipment', 'fire extinguisher', 'red fire extinguisher'),
        object('shelf-old-left', 'furniture', 'shelf', 'metal shelf on the left'),
        object('shelf-old-right', 'furniture', 'shelf', 'metal shelf on the right'),
      ],
      conditions: [],
      issues: [],
    },
    {
      stateId: 'state_multi_2',
      environmentId,
      objects: [
        object('door-new-1', 'door', 'green door', 'green door with window'),
        object('ext-new-1', 'equipment', 'fire extinguisher', 'red fire extinguisher'),
        object('shelf-new', 'furniture', 'metal shelving', 'metal shelves on both sides'),
        object('jack-multi-new', 'equipment', 'orange pallet jack', 'orange pallet jack in front of green door'),
      ],
      conditions: [],
      issues: [],
    },
  )
  const multiplicityObjectNoise = multiplicityDiff.changes.filter((change) =>
    /green door|fire extinguisher|shelf/i.test(change.title),
  )
  if (multiplicityObjectNoise.length !== 0) {
    throw new Error(`unresolved same-family multiplicity must not create fake diff changes: ${multiplicityObjectNoise.map((change) => change.title).join(', ')}`)
  }
  if (!multiplicityDiff.changes.some((change) => change.title === 'New: orange pallet jack')) {
    throw new Error('multiplicity suppression must not hide a genuinely new pallet jack')
  }

  console.log('PASS  provider naming aliases map to conservative durable object families')
  console.log('PASS  door, doorway, exit/glass door and window naming drift preserve durable architectural identity')
  console.log('PASS  secondary description mentions do not redefine object identity')
  console.log('PASS  grounded cross-pass exact duplicates across audit/identity/geometry and semantic aliases consolidate conservatively')
  console.log('PASS  still-photo exact duplicate bursts collapse conservatively while distinct positions remain separate')
  console.log('PASS  office aliases and category drift preserve durable identity')
  console.log('PASS  repeated plant instances match by grounded location')
  console.log('PASS  same-frame structural surface segments collapse while directional walls remain separate')
  console.log('PASS  repeated ambiguous objects are not collapsed into one match')
  console.log('PASS  memory reuses durable shelf/door identities across provider naming drift')
  console.log('PASS  warehouse alias drift collapses to one real added pallet jack')
  console.log('PASS  unresolved whitelisted-family multiplicity suppresses fake add/not-reobserved noise without hiding new objects')
  console.log('SENTINEL OBJECT IDENTITY GATE VERIFIED')
} finally {
  await vite.close()
}
