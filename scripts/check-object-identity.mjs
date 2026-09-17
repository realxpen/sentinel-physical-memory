import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { objectsSemanticallyMatch } = await vite.ssrLoadModule('/src/memory/object-identity.ts')
  const { EnvironmentalDiffEngine } = await vite.ssrLoadModule('/src/memory/diff-engine.ts')

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
  console.log('PASS  warehouse alias drift collapses to one real added pallet jack')
  console.log('SENTINEL OBJECT IDENTITY GATE VERIFIED')
} finally {
  await vite.close()
}
