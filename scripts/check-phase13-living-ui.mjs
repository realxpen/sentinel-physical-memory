import { readFile } from 'node:fs/promises'

const [main, phase13, styles] = await Promise.all([
  readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/phase13.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
])

expect(main.includes("import './phase13.css'"), 'Phase 13 visual system must load after the existing product styles')
expect(main.includes("className={`app phase13-shell view-${view}"), 'the product must use one Phase 13 shell across all views')
expect(main.includes("memory ? 'Your space remembers.' : 'Give this place a memory.'"), 'Memory must use the locked editorial brand language')
expect(main.includes('memory-cinematic-hero'), 'Memory must promote the environmental capture into a cinematic hero')
expect(main.includes('currentMemoryImage'), 'Memory/Observe must derive imagery from the current immutable state')
expect(main.includes("observe-camera has-memory-image"), 'Observe must visually inherit the remembered environment when available')
expect(main.includes('REALITY DIFF /'), 'Changes must be positioned as Reality Diff, not facility dashboard statistics')
expect(main.includes("<form className={`ask-bar"), 'Ask must remain a persistent contextual intelligence bar')
expect(main.includes('<em>Memory</em>') && main.includes('<em>Observe</em>') && main.includes('<em>Changes</em>'), 'desktop shell must preserve Memory / Observe / Changes')
expect(main.includes('<small>Memory</small>') && main.includes('<small>Observe</small>') && main.includes('<small>Changes</small>'), 'mobile shell must preserve Memory / Observe / Changes')

for (const surface of [
  'spatial-memory-stage',
  'evidence-drawer',
  'phase10-answer',
  'reality-compare',
  'history-section',
  'action-plan-panel',
  'verification-panel',
]) {
  expect(main.includes(surface), `Phase 13 must preserve the existing ${surface} product surface`)
}

expect(!/\bDashboard\b/.test(main), 'Phase 13 must not reintroduce generic dashboard language')
expect(phase13.includes('Quiet. Alive. Precise.'), 'Phase 13 CSS must document the locked design personality')
expect(phase13.includes('.phase13-shell.view-memory::before'), 'Memory state must have its own light-state atmosphere')
expect(phase13.includes('.phase13-shell.view-observe'), 'Observe must retain a dark live-state treatment')
expect(phase13.includes('.phase13-shell.view-changes'), 'Reality Diff must retain a dark live/change-state treatment')
expect(phase13.includes('.memory-cinematic-hero'), 'cinematic environmental memory hero styling is missing')
expect(phase13.includes('position: fixed;') && phase13.includes('.phase13-shell .desktop-rail'), 'desktop navigation must become a subtle spatial rail')
expect(phase13.includes('.phase13-shell .history-track::before'), 'State history must read as a physical-time timeline')
expect(phase13.includes('.phase13-shell .ask-bar'), 'persistent Ask styling is missing')
expect(phase13.includes('@media (prefers-reduced-motion: reduce)'), 'Phase 13 motion must respect reduced-motion preferences')
expect(styles.includes('--green: #5bff8a') && styles.includes('--paper: #f4f4ef'), 'locked SENTINEL color system must remain intact')

console.log('PASS  one premium shell preserves Memory / Observe / Changes + persistent Ask')
console.log('PASS  Memory promotes the real environmental capture into the hero')
console.log('PASS  dark live state and light memory state remain distinct')
console.log('PASS  Spatial Memory, object detail, Ask, Reality Diff, timeline, Action Plan and Verification remain first-class')
console.log('PASS  desktop navigation becomes a minimal spatial rail while mobile stays three-tab')
console.log('PASS  Phase 13 avoids generic dashboard language and respects reduced motion')
console.log('SENTINEL PHASE 13 LIVING SPATIAL INTELLIGENCE UI VERIFIED')

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
