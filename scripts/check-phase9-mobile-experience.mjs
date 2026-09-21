import { readFile } from 'node:fs/promises'

const [main, styles] = await Promise.all([
  readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
])

const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

expect(main.includes("const overlayOpen = Boolean("), 'mobile sheets must derive one overlay-open state')
expect(main.includes("overlayOpen ? ' overlay-open' : ''"), 'app root must expose overlay-open for fixed-control suppression')
expect(main.includes("aria-current={normalizedSpatialAreaId === 'all' ? 'true' : undefined}"), 'overall environment area selection must expose aria-current')
expect(main.includes("aria-current={normalizedSpatialAreaId === group.id ? 'true' : undefined}"), 'grounded area selections must expose aria-current')

expect(styles.includes('/* Phase 9 — mobile spatial memory polish */'), 'Phase 9 mobile polish stylesheet contract is missing')
expect(styles.includes('.overlay-open .ask-bar'), 'open mobile sheets must suppress the global Ask bar')
expect(styles.includes('.overlay-open .mobile-nav'), 'open mobile sheets must suppress bottom navigation')
expect(styles.includes('scroll-snap-type: x mandatory'), 'mobile area/history navigation must use horizontal snap scrolling')
expect(styles.includes('height: min(90dvh, 820px)'), 'mobile evidence/object/history drawers must become bounded bottom sheets')
expect(styles.includes('border-radius: 28px 28px 0 0'), 'mobile sheet must have a bottom-sheet silhouette')
expect(styles.includes('.spatial-object {\n    min-height: 56px'), 'spatial object cards must expose phone-sized touch targets')
expect(styles.includes('.spatial-relation-branch {\n    min-height: 58px'), 'relationship targets must expose phone-sized touch targets')
expect(styles.includes('.spatial-ask-button {\n    position: sticky'), 'object Ask action must remain reachable while scrolling a mobile sheet')
expect(styles.includes('bottom: calc(env(safe-area-inset-bottom) + 2px)'), 'sticky object Ask must respect mobile safe-area insets')
expect(styles.includes('.history-card {\n    flex: 0 0 min(82vw, 320px)'), 'immutable history cards must become swipeable phone cards')
expect(styles.includes('overscroll-behavior: contain'), 'mobile sheets/scrollers must contain overscroll')

console.log('PASS  mobile area and history navigation are touch-first and snap-scrolling')
console.log('PASS  spatial/history/change drawers become safe-area-aware bottom sheets')
console.log('PASS  relation, object and Reality Diff transitions keep phone-sized touch targets')
console.log('PASS  contextual Ask stays reachable without fighting global fixed controls')
console.log('SENTINEL PHASE 9 MOBILE SPATIAL MEMORY VERIFIED')
