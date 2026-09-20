import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { EnvironmentalDiffEngine } = await vite.ssrLoadModule('/src/memory/diff-engine.ts')

  const environmentId = 'diff-position-test'
  const now = () => new Date('2026-09-16T10:30:00.000Z')
  const ids = ['change_1', 'change_2', 'change_3']
  const engine = new EnvironmentalDiffEngine({ now, id: () => ids.shift() ?? 'change_fallback' })

  const object = (positionDescription) => ({
    id: 'object_chair',
    environmentId,
    category: 'furniture',
    name: 'Chair',
    description: 'Black chair',
    position: { description: positionDescription },
    confidence: 0.95,
    firstSeenAt: '2026-09-16T09:00:00.000Z',
    lastSeenAt: '2026-09-16T10:00:00.000Z',
    evidenceIds: ['evidence_1'],
  })

  const snapshot = (stateId, item) => ({
    stateId,
    environmentId,
    objects: [item],
    conditions: [],
    issues: [],
  })

  const coordinateDrift = engine.compare(
    snapshot('state_a', object('0 200 700 800')),
    snapshot('state_b', object('0 400 500 1000')),
  )
  if (coordinateDrift.changes.some((change) => change.type === 'moved')) {
    throw new Error('coordinate-like provider position drift must not produce a moved change')
  }

  const specificityOnly = engine.compare(
    snapshot('state_specific_a', object('above the door')),
    snapshot('state_specific_b', object('above green door')),
  )
  if (specificityOnly.changes.some((change) => change.type === 'moved')) {
    throw new Error('generic-to-specific anchor wording must not produce false movement')
  }

  const wordingDrift = engine.compare(
    snapshot('state_word_a', object('right of door')),
    snapshot('state_word_b', object('right side of room')),
  )
  if (wordingDrift.changes.some((change) => change.type === 'moved')) {
    throw new Error('non-comparable provider wording drift must not produce movement')
  }

  const semanticMovement = engine.compare(
    snapshot('state_c', object('left of desk')),
    snapshot('state_d', object('right of desk')),
  )
  if (!semanticMovement.changes.some((change) => change.type === 'moved')) {
    throw new Error('grounded relative-position change should still produce a moved change')
  }

  console.log('PASS  coordinate-like position descriptions do not create false movement')
  console.log('PASS  generic-to-specific semantic anchor wording does not create false movement')
  console.log('PASS  non-comparable provider wording drift does not create false movement')
  console.log('PASS  grounded relative-position changes still create movement')
  console.log('SENTINEL REALITY DIFF POSITION GATE VERIFIED')
} finally {
  await vite.close()
}
