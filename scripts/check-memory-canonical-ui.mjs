import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })

try {
  const { buildMemoryObjectRows, primaryMemoryObjectRows } = await vite.ssrLoadModule('/src/memory/memory-presentation.ts')

  const object = (id, category, name, description, confidence = 0.95) => ({
    id,
    environmentId: 'env_memory_ui',
    category,
    name,
    description,
    confidence,
    firstSeenAt: '2026-09-24T10:00:00.000Z',
    lastSeenAt: '2026-09-24T11:00:00.000Z',
    evidenceIds: ['e_' + id],
  })

  const rows = buildMemoryObjectRows([
    object('exit', 'signage', 'EXIT sign', 'Green emergency exit sign above the hallway door.'),
    object('ext', 'safety', 'fire extinguisher', 'Red extinguisher mounted beside the route.'),
    object('chair', 'furniture', 'black chair', 'Black chair near the hallway entrance.'),
    object('plant', 'other', 'plant', 'Large potted plant near the wall.'),
    object('door', 'door', 'doorway', 'Doorway at the end of the hallway.'),
    object('floor', 'structure', 'floor', 'Polished concrete floor.'),
    object('ceiling', 'structure', 'ceiling', 'Exposed white ceiling.'),
    object('knob_a', 'door', 'door knob', 'Metal knob.', 0.91),
    object('knob_b', 'door', 'door knob', 'Metal knob duplicate from another pass.', 0.97),
    object('person_false', 'person', 'person', 'False-positive distant silhouette.', 1),
  ])

  const primary = primaryMemoryObjectRows(rows, 10)
  const names = primary.map((row) => row.object.name.toLowerCase())

  expect(names.includes('exit sign'), 'EXIT sign must stay prominent')
  expect(names.includes('fire extinguisher'), 'fire extinguisher must stay prominent')
  expect(names.includes('black chair'), 'chair must stay prominent')
  expect(names.includes('plant'), 'plant must stay prominent')
  expect(names.includes('doorway'), 'doorway must stay prominent')
  expect(!names.includes('floor'), 'floor must not dominate the default Memory list')
  expect(!names.includes('ceiling'), 'ceiling must not dominate the default Memory list')
  expect(!names.includes('door knob'), 'door hardware must not dominate the default Memory list')
  expect(!rows.some((row) => row.object.category === 'person'), 'transient people must not appear even in the expanded remembered-object list')

  const knob = rows.find((row) => row.object.name.toLowerCase() === 'door knob')
  expect(knob?.count === 2, 'duplicate same-name/category records must collapse into one display row')
  expect(knob?.object.id === 'knob_b', 'duplicate display group must keep the strongest grounded representative')

  const [main, phase13] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/phase13.css', import.meta.url), 'utf8'),
  ])

  expect(!main.includes('environment-stage spatial-memory-stage'), 'retired dark inventory must not render in Memory')
  expect(!main.includes('spatial-object-cloud'), 'accordion/cloud object repetition must not render in Memory')
  expect(main.includes('memory-environment-summary'), 'Memory must retain a compact environment summary')
  expect(main.includes('id="state-history"'), 'State History must remain the primary temporal surface')
  expect(main.includes('current-memory-section'), 'current remembered objects must have one canonical surface')
  expect(main.indexOf('id="state-history"') < main.indexOf('current-memory-section'), 'State History must appear before current remembered objects')
  expect(main.includes('Show all ${memoryObjectRows.length} remembered objects'), 'low-salience inventory must remain available on demand')
  expect(main.includes('inspectSpatialObject(row.object.id)'), 'canonical remembered rows must still open rich object detail')
  expect(phase13.includes('.memory-environment-summary'), 'compact Memory summary styling is missing')
  expect(phase13.includes('.memory-object-row.low-salience'), 'expanded low-salience objects must be visually de-emphasized')

  console.log('PASS  duplicate object records collapse for presentation without rewriting memory')
  console.log('PASS  safety and meaningful objects stay prominent while structural inventory is hidden by default')
  console.log('PASS  transient people never appear as remembered environmental objects')
  console.log('PASS  retired dark spatial inventory is removed from the Memory render tree')
  console.log('PASS  State History precedes one canonical current-object surface')
  console.log('PASS  full inventory remains available through Show all and object detail remains interactive')
  console.log('SENTINEL CANONICAL MEMORY UI VERIFIED')
} finally {
  await vite.close()
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
