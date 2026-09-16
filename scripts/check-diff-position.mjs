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

  const semanticMovement = engine.compare(
    snapshot('state_c', object('Wall A')),
    snapshot('state_d', object('Wall B')),
  )
  if (!semanticMovement.changes.some((change) => change.type === 'moved')) {
    throw new Error('semantic physical anchor change should still produce a moved change')
  }

  console.log('PASS  coordinate-like position descriptions do not create false movement')
  console.log('PASS  semantic physical anchor changes still create movement')
  console.log('SENTINEL REALITY DIFF POSITION GATE VERIFIED')
} finally {
  await vite.close()
}
