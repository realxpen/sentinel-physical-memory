import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const {
    buildSpatialGroups,
    buildSpatialRelationEdges,
    focusSpatialGroups,
    spatialGroupForObject,
  } = await vite.ssrLoadModule('/src/memory/spatial-memory.ts')

  const object = (id, category, name, position) => ({
    id,
    environmentId: 'env_phase9',
    category,
    name,
    position,
    confidence: 0.95,
    firstSeenAt: '2026-09-21T10:00:00.000Z',
    lastSeenAt: '2026-09-21T10:00:00.000Z',
    evidenceIds: ['e_' + id],
  })

  const roomDesk = object('room_desk', 'room', 'Desk area')
  const roomEntry = object('room_entry', 'room', 'Entry')
  const desk = object('desk', 'furniture', 'Desk', { description: 'center of desk area', roomId: 'room_desk' })
  const chair = object('chair', 'furniture', 'Office chair', { description: 'beside desk' })
  const door = object('door', 'door', 'White door', { description: 'back wall' })
  const plant = object('plant', 'other', 'Plant', { description: 'near shelf' })

  const relation = (id, fromId, toId, type, confidence = 0.9) => ({
    id,
    environmentId: 'env_phase9',
    fromId,
    toId,
    type,
    confidence,
    evidenceIds: ['e_' + id],
  })

  const snapshot = {
    stateId: 'state_2',
    environmentId: 'env_phase9',
    objects: [roomDesk, roomEntry, desk, chair, door, plant],
    conditions: [],
    issues: [],
    relations: [
      relation('rel_chair_room', 'chair', 'room_desk', 'located_in'),
      relation('rel_entry_door', 'room_entry', 'door', 'contains'),
      relation('rel_chair_desk', 'chair', 'desk', 'near', 0.93),
      relation('rel_door_wall', 'door', 'missing_wall_entity', 'attached_to', 0.88),
    ],
  }

  const groups = buildSpatialGroups(snapshot, 'Cozy office')
  const deskArea = groups.find((group) => group.id === 'room_desk')
  const entry = groups.find((group) => group.id === 'room_entry')
  const fallback = groups.find((group) => group.kind === 'environment')

  if (!deskArea || deskArea.objects.map((item) => item.id).sort().join(',') !== 'chair,desk') {
    throw new Error('room membership must combine position.roomId and located_in without fabricating extra members')
  }
  if (!entry || entry.objects.map((item) => item.id).join(',') !== 'door') {
    throw new Error('contains relation must ground room membership')
  }
  if (!fallback || fallback.objects.map((item) => item.id).join(',') !== 'plant') {
    throw new Error('unassigned grounded objects must remain visible in an honest environment-level group')
  }

  const focused = focusSpatialGroups(groups, 'room_desk')
  if (focused.length !== 1 || focused[0].id !== 'room_desk') throw new Error('area focus must show exactly the selected grounded area')
  const invalidFocus = focusSpatialGroups(groups, 'room_missing')
  if (invalidFocus.length !== groups.length) throw new Error('invalid area focus must fail safely to the full remembered environment')

  if (spatialGroupForObject(groups, 'chair') !== 'room_desk') throw new Error('object navigation must resolve the grounded containing area')
  if (spatialGroupForObject(groups, 'room_entry') !== 'room_entry') throw new Error('room object navigation must resolve its own area')

  const chairEdges = buildSpatialRelationEdges(chair, snapshot)
  if (chairEdges.length !== 2) throw new Error('selected object must project exactly its persisted physical-object relations')
  const nearDesk = chairEdges.find((edge) => edge.id === 'rel_chair_desk')
  if (!nearDesk || !nearDesk.outgoing || nearDesk.otherId !== 'desk' || nearDesk.typeLabel !== 'near') {
    throw new Error('outgoing relation direction must remain faithful to persisted topology')
  }
  const locatedIn = chairEdges.find((edge) => edge.id === 'rel_chair_room')
  if (!locatedIn || locatedIn.otherId !== 'room_desk' || locatedIn.otherCategory !== 'room') {
    throw new Error('room relation target must resolve to the current persisted room object')
  }

  const doorEdges = buildSpatialRelationEdges(door, snapshot)
  if (doorEdges.some((edge) => edge.id === 'rel_door_wall')) {
    throw new Error('visual relation map must not invent a node for an endpoint absent from the current immutable snapshot')
  }
  if (!doorEdges.some((edge) => edge.id === 'rel_entry_door' && edge.outgoing === false)) {
    throw new Error('incoming persisted relation direction must remain visible')
  }

  const flatSnapshot = {
    ...snapshot,
    objects: [desk, chair],
    relations: [relation('rel_flat', 'chair', 'desk', 'near')],
  }
  const flatGroups = buildSpatialGroups(flatSnapshot, 'Unmapped office')
  if (flatGroups.length !== 1 || flatGroups[0].kind !== 'environment' || flatGroups[0].name !== 'Unmapped office') {
    throw new Error('missing room structure must retain the honest environment-level fallback')
  }

  console.log('PASS  grounded room membership combines roomId, located_in and contains')
  console.log('PASS  area focus is navigable and fails safely when a target disappears')
  console.log('PASS  relationship visualization projects persisted current-state physical-object edges only')
  console.log('PASS  environment-level fallback remains honest when room structure is absent')
  console.log('SENTINEL PHASE 9 SPATIAL MEMORY VERIFIED')
} finally {
  await vite.close()
}
