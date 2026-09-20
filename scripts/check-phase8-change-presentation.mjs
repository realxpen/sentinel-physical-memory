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

  if (presented.length !== 3) throw new Error(`expected 3 presented changes, got ${presented.length}`)
  const wall = presented.find((item) => /white wall/i.test(item.title))
  if (!wall || wall.evidenceIds.length !== 3) throw new Error('duplicate wall card must retain the union of evidence references')
  if (!presented.some((item) => item.title === 'Not re-observed: closet door')) throw new Error('distinct closet-door uncertainty must remain visible')
  if (!presented.some((item) => item.title === 'New: green bag')) throw new Error('real green-bag addition must remain visible')
  const summary = presentedChangeSummary(presented)
  if (summary !== '3 environmental change(s): 1 added, 2 uncertain.') throw new Error(`unexpected presented summary: ${summary}`)

  const distinctWalls = changesForPresentation([
    change('left_wall', 'Not re-observed: white wall', 'wall_left', ['e_left']),
    change('right_wall', 'Not re-observed: white wall', 'wall_right', ['e_right']),
  ])
  if (distinctWalls.length !== 2) throw new Error('same-named surfaces with independent evidence must remain separate')

  console.log('PASS  persisted duplicate structural verification cards render once')
  console.log('PASS  evidence is unioned while distinct and real changes remain visible')
  console.log('PASS  independently grounded same-named surfaces remain separate')
  console.log('SENTINEL PHASE 8 CHANGE PRESENTATION VERIFIED')
} finally {
  await vite.close()
}
