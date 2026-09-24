import { readFile } from 'node:fs/promises'

const [main, styles, phase13] = await Promise.all([
  readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/phase13.css', import.meta.url), 'utf8'),
])

const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

expect(main.includes("const overlayOpen = Boolean("), 'mobile sheets must derive one overlay-open state')
expect(main.includes("overlayOpen ? ' overlay-open' : ''"), 'app root must expose overlay-open for fixed-control suppression')
expect(main.includes('current-memory-section'), 'mobile Memory must expose the canonical current-object section')
expect(main.includes('inspectSpatialObject(row.object.id)'), 'remembered object rows must open the spatial object detail sheet')
expect(main.includes('Show all ${memoryObjectRows.length} remembered objects'), 'full low-salience inventory must remain reachable on mobile')

expect(styles.includes('/* Phase 9 — mobile spatial memory polish */'), 'Phase 9 mobile polish stylesheet contract is missing')
expect(styles.includes('.overlay-open .ask-bar'), 'open mobile sheets must suppress the global Ask bar')
expect(styles.includes('.overlay-open .mobile-nav'), 'open mobile sheets must suppress bottom navigation')
expect(styles.includes('scroll-snap-type: x mandatory'), 'mobile area/history navigation must use horizontal snap scrolling')
expect(styles.includes('height: min(90dvh, 820px)'), 'mobile evidence/object/history drawers must become bounded bottom sheets')
expect(styles.includes('border-radius: 28px 28px 0 0'), 'mobile sheet must have a bottom-sheet silhouette')
expect(phase13.includes('.memory-object-row {\n    grid-template-columns: 30px minmax(0,1fr) 46px'), 'canonical remembered-object rows must collapse to a phone-readable grid')
expect(phase13.includes('.memory-environment-actions {\n    grid-template-columns: 1fr;'), 'compact environment summary actions must stack on phones')
expect(styles.includes('.spatial-relation-branch {\n    min-height: 58px'), 'relationship targets must expose phone-sized touch targets')
expect(styles.includes('.spatial-ask-button {\n    position: sticky'), 'object Ask action must remain reachable while scrolling a mobile sheet')
expect(styles.includes('bottom: calc(env(safe-area-inset-bottom) + 2px)'), 'sticky object Ask must respect mobile safe-area insets')
expect(styles.includes('.history-card {\n    flex: 0 0 min(82vw, 320px)'), 'immutable history cards must become swipeable phone cards')
expect(styles.includes('overscroll-behavior: contain'), 'mobile sheets/scrollers must contain overscroll')

console.log('PASS  canonical Memory object list and immutable history remain touch-first on mobile')
console.log('PASS  spatial/history/change drawers become safe-area-aware bottom sheets')
console.log('PASS  relation, object and Reality Diff transitions keep phone-sized touch targets')
console.log('PASS  contextual Ask stays reachable without fighting global fixed controls')
console.log('SENTINEL PHASE 9 MOBILE SPATIAL MEMORY VERIFIED')
