import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { changesForPresentation, presentedChangeSummary } = await vite.ssrLoadModule('/src/memory/change-presentation.ts')
  const change = (id, title, entityId, evidenceIds = [`e_${id}`]) => ({
    id,
    environmentId: 'office',
    fromStateId: 'state_1',
    toStateId: 'state_2',
    type: 'uncertain',
    entityKind: 'object',
    entityId,
    title,
    description: `${title} was not re-observed.`,
    confidence: 0.5,
    evidenceIds,
  })

  const presented = changesForPresentation([
    { ...change('wall_1', 'Not re-observed: white wall', 'wall_a', ['e_wall_frame', 'e_wall_a']) },
    { ...change('wall_2', 'Not re-observed: white wall', 'wall_b', ['e_wall_frame', 'e_wall_b']) },
    { ...change('door_1', 'Not re-observed: closet door', 'door_a') },
    {
      id: 'bag', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'bag_a', title: 'New: green bag',
      description: 'green bag was not present in the previous state.', confidence: 0.9, evidenceIds: ['e_bag'],
    },
  ])

  if (presented.length !== 2) throw new Error(`expected 2 material presented changes, got ${presented.length}`)
  if (presented.some((item) => /white wall/i.test(item.title))) throw new Error('raw structural-surface churn must be hidden from Reality Diff presentation')
  if (!presented.some((item) => item.title === 'Not re-observed: closet door')) throw new Error('distinct closet-door uncertainty must remain visible')
  if (!presented.some((item) => item.title === 'New: green bag')) throw new Error('real green-bag addition must remain visible')
  const summary = presentedChangeSummary(presented)
  if (summary !== '2 environmental change(s): 1 added, 1 uncertain.') throw new Error(`unexpected presented summary: ${summary}`)


  const historicalNoise = changesForPresentation([
    {
      id: 'knob', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'knob_1', title: 'New: door knob',
      description: 'door knob was not present in the previous state.', confidence: 0.95, evidenceIds: ['e_knob'],
    },
    {
      id: 'light', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'light_1', title: 'New: ceiling light',
      description: 'ceiling light was not present in the previous state.', confidence: 0.95, evidenceIds: ['e_light'],
    },
    {
      id: 'room-sign', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'sign_1', title: 'New: conference room sign',
      description: 'conference room sign was not present in the previous state.', confidence: 0.95, evidenceIds: ['e_sign'],
    },
    {
      id: 'poster', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'poster_1', title: 'New: framed poster',
      description: 'framed poster was not present in the previous state.', confidence: 0.95, evidenceIds: ['e_poster'],
    },
    {
      id: 'boxes', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'boxes_1', title: 'New: cardboard boxes',
      description: 'cardboard boxes were not present in the previous state.', confidence: 0.99, evidenceIds: ['e_boxes'],
    },
    {
      id: 'extinguisher', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'moved', entityKind: 'object', entityId: 'ext_1', title: 'Moved: fire extinguisher',
      description: 'fire extinguisher changed its grounded relationship context.', confidence: 0.97, evidenceIds: ['e_ext'],
    },
  ])

  if (historicalNoise.length !== 2) {
    throw new Error(`historical presentation filter must keep only material changes, got ${historicalNoise.map((item) => item.title).join(' | ')}`)
  }
  if (!historicalNoise.some((item) => item.title === 'New: cardboard boxes')) throw new Error('historical filter must preserve new obstruction card')
  if (!historicalNoise.some((item) => item.title === 'Moved: fire extinguisher')) throw new Error('historical filter must preserve moved extinguisher card')

  const hallwayArchitecturalNoise = changesForPresentation([
    {
      id: 'conference-door', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'door_conference', title: 'New: Conference Room door',
      description: 'Conference Room door was not present in the previous state.', confidence: 0.94, evidenceIds: ['e_current'],
    },
    {
      id: 'exit-door', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'door_exit', title: 'New: exit door',
      description: 'exit door was not present in the previous state.', confidence: 0.95, evidenceIds: ['e_current'],
    },
    {
      id: 'room-old', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'uncertain', entityKind: 'object', entityId: 'room_conference', title: 'Not re-observed: Conference Room',
      description: 'Conference Room was present previously but was not re-observed.', confidence: 0.5, evidenceIds: ['e_previous'],
    },
    {
      id: 'glass-door-old', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'uncertain', entityKind: 'object', entityId: 'glass_door', title: 'Not re-observed: glass door',
      description: 'glass door was present previously but was not re-observed.', confidence: 0.5, evidenceIds: ['e_previous'],
    },
    {
      id: 'window-old', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'uncertain', entityKind: 'object', entityId: 'window', title: 'Not re-observed: window',
      description: 'window was present previously but was not re-observed.', confidence: 0.5, evidenceIds: ['e_previous'],
    },
    {
      id: 'frame-old', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'uncertain', entityKind: 'object', entityId: 'frame', title: 'Not re-observed: door frame',
      description: 'door frame was present previously but was not re-observed.', confidence: 0.5, evidenceIds: ['e_previous'],
    },
    {
      id: 'boxes-live', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'boxes_live', title: 'New: stacked cardboard boxes',
      description: 'stacked cardboard boxes were not present in the previous state.', confidence: 0.99, evidenceIds: ['e_boxes'],
    },
    {
      id: 'ext-live', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'moved', entityKind: 'object', entityId: 'ext_live', title: 'Moved: fire extinguisher',
      description: 'fire extinguisher changed its grounded relationship context.', confidence: 0.97, evidenceIds: ['e_ext'],
    },
    {
      id: 'condition-live', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'condition', entityId: 'condition_exit', title: 'New condition: Emergency exit access obstructed',
      description: 'Stacked cardboard boxes obstruct the emergency exit access route.', confidence: 0.98, evidenceIds: ['e_boxes'],
    },
  ])

  const hallwayTitles = hallwayArchitecturalNoise.map((item) => item.title)
  if (hallwayTitles.some((title) => /Conference Room door|New: exit door|Not re-observed: Conference Room|glass door|window|door frame/i.test(title))) {
    throw new Error(`persisted architectural segmentation noise must be hidden immediately: ${hallwayTitles.join(' | ')}`)
  }
  if (!hallwayTitles.includes('New: stacked cardboard boxes')) throw new Error('presentation filter must preserve stacked boxes')
  if (!hallwayTitles.includes('Moved: fire extinguisher')) throw new Error('presentation filter must preserve extinguisher movement')
  if (!hallwayTitles.includes('New condition: Emergency exit access obstructed')) throw new Error('presentation filter must preserve access condition')
  if (hallwayArchitecturalNoise.length !== 3) {
    throw new Error(`expected only operational hallway changes, got ${hallwayTitles.join(' | ')}`)
  }

  const closetDoorUncertainty = changesForPresentation([
    change('closet_door', 'Not re-observed: closet door', 'closet_door_a'),
  ])
  if (closetDoorUncertainty.length !== 1) throw new Error('furniture/closet door uncertainty must remain distinct from architectural re-segmentation')

  const transientPersonPresentation = changesForPresentation([
    change('person-old', 'Not re-observed: person', 'person_old'),
    {
      id: 'boxes-still-visible', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'boxes_still_visible', title: 'New: stacked cardboard boxes',
      description: 'Stacked cardboard boxes were added.', confidence: 0.98, evidenceIds: ['e_boxes'],
    },
  ])
  if (transientPersonPresentation.some((item) => /person/i.test(item.title))) {
    throw new Error('persisted transient person churn must be hidden at presentation time')
  }
  if (!transientPersonPresentation.some((item) => item.title === 'New: stacked cardboard boxes')) {
    throw new Error('person filtering must not hide real operational object changes')
  }

  const genericStickerNoise = changesForPresentation([
    change('sticker-old', 'Not re-observed: sticker', 'sticker_a'),
    {
      id: 'warning-sign', environmentId: 'office', fromStateId: 'state_1', toStateId: 'state_2',
      type: 'added', entityKind: 'object', entityId: 'warning_sign', title: 'New: warning sign',
      description: 'Warning sign was not present in the previous state.', confidence: 0.95, evidenceIds: ['e_warning'],
    },
  ])
  if (genericStickerNoise.some((item) => /sticker/i.test(item.title))) {
    throw new Error('generic sticker churn must stay out of Reality Diff presentation')
  }
  if (!genericStickerNoise.some((item) => item.title === 'New: warning sign')) {
    throw new Error('safety signage must remain visible when generic sticker churn is filtered')
  }

  const distinctWalls = changesForPresentation([
    change('left_wall', 'Not re-observed: white wall', 'wall_left', ['e_left']),
    change('right_wall', 'Not re-observed: white wall', 'wall_right', ['e_right']),
  ])
  if (distinctWalls.length !== 0) throw new Error('historical raw structural-surface churn must be hidden even when independently grounded')

  console.log('PASS  persisted raw structural-surface churn is hidden from Reality Diff presentation')
  console.log('PASS  distinct operational object changes remain visible')
  console.log('PASS  independently grounded structural surfaces remain in immutable history but not headline diff cards')
  console.log('PASS  historical micro-inventory, architectural re-segmentation, and transient-person churn are filtered without hiding operational changes')
  console.log('SENTINEL PHASE 8 CHANGE PRESENTATION VERIFIED')
} finally {
  await vite.close()
}
