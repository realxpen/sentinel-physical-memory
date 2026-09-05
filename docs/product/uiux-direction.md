# SENTINEL UI/UX Direction — Locked

## Design north star

**Living Spatial Intelligence**

SENTINEL should feel like an intelligence living alongside a physical environment: quiet when nothing needs attention, alive while observing and reasoning, and precise when presenting evidence.

The product loop remains:

`SCAN → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

The interface must make persistent environmental memory and change verification feel like the product itself, not secondary dashboard features.

## Design personality

**Quiet. Alive. Precise.**

- Quiet: large negative space, restrained chrome, no noisy admin-dashboard density.
- Alive: observation indicators, subtle spatial motion, environmental nodes and state transitions.
- Precise: evidence-first claims, confidence visibility, explicit separation of observation from interpretation and recommendation.

## Visual states

### Live / Observe state

Dark, cinematic, present-tense intelligence.

- `#080A09` primary near-black
- `#0D100E` secondary surface
- `#131714` raised surface
- `#5BFF8A` Sentinel green
- `#0BA861` deep emerald

Dark means SENTINEL is looking, observing, or reasoning about the present.

### Memory state

Light, editorial, historical intelligence.

- `#F4F4EF` primary memory canvas
- `#EDEFE9` secondary memory surface
- `#EEE7FF` optional cool-lilac contrast

Light means SENTINEL is remembering, reviewing evidence, or navigating historical environmental state.

## Semantic accents

Green is not a universal decoration. It means active intelligence, successful verification, recognized spatial relationships, or system presence.

- Critical anomaly: `#FF5A5F`
- Attention: `#FFA94D`
- Historical/change information: `#90D7FF`
- Neutral content: white, silver, charcoal

## Typography

Use a modern geometric/editorial grotesk. Default implementation may use Inter/system sans until a licensed project font is deliberately selected.

Avoid stereotypical sci-fi display fonts. SENTINEL should feel like serious near-future technology, not a spaceship HUD.

Typography should use strong scale contrast: very large declarative conclusions beside small metadata and evidence labels.

## Core product language

Prefer:

- **Observe environment** instead of "Upload video"
- **Conditions** instead of blanket "issues" where diagnosis is not visually certain
- **This space is now remembered** instead of "Scan successful"
- **What changed** for environmental comparison
- **Ask this environment** for contextual intelligence

Loading/status language should communicate the cognitive stage:

- Observing
- Understanding
- Remembering
- Reasoning across observations
- Reconstructing previous state
- Verifying

## Navigation

Primary product navigation is intentionally minimal:

1. **Memory** — remembered environments, evidence and current state
2. **Observe** — capture/scan workflow
3. **Changes** — Reality Diff and verification

**Ask this environment** is a persistent contextual control, not a standalone chatbot destination.

Settings/profile stay secondary.

## Signature experiences

### Observe

Full-screen or near-full-screen environmental imagery. Keep recognition overlays restrained. Avoid dense object-detection bounding boxes unless they are evidence-critical.

### Spatial Memory Canvas

A visual representation of remembered areas, observations and relationships. It is not required to claim metric 3D reconstruction. Spatial grounding may be approximate and semantic for the hackathon MVP.

### Reality Diff

The signature comparison experience: **Git diff for reality**.

Supported states may include:

- Added
- Removed
- Moved
- Changed
- Resolved

Detected events must be grounded in actual scan comparison data. Static UI examples must be explicitly labelled as demo/interaction previews.

### Evidence drawer

Selecting an observation should reveal an evidence-focused layer rather than a generic modal. It should show what was observed, confidence/evidence references when available, and keep interpretations/recommendations distinct.

## Evidence-first rule

Every safety- or maintenance-related experience must preserve three conceptual levels:

1. **Observed** — what the visual evidence directly supports
2. **Interpreted** — what the model infers from that evidence
3. **Recommended** — suggested next action

The UI must not present unsupported professional diagnosis as an observed fact.

## Motion

Avoid bouncy, gamified, Matrix-like, terminal-typing or constant blinking effects.

Use:

- subtle focus transitions
- breathing observation indicator
- slow environmental glow drift
- graph/node illumination
- spatial panel emergence
- crossfades between historical states

Recommended motion ranges:

- UI interaction: 180–260ms
- Spatial transition: 400–700ms
- Memory transition: 700–1200ms

Respect `prefers-reduced-motion`.

## Shape and material

- Primary cards: ~24px radius
- Smaller panels: ~16px radius
- Floating controls: pill/circular geometry
- Environmental imagery: ~18–30px radius depending on scale
- Glass is reserved mainly for information floating over environmental imagery; do not turn every surface into glass.

## Product phrases

Signature phrase:

> **Give this place a memory.**

Core positioning:

> **SENTINEL gives physical spaces a persistent AI memory — allowing them to be scanned, understood, queried, acted upon, and verified over time.**

Demo takeaway:

> **SENTINEL does not just see a room; it remembers the room and knows when it changes.**

## Implementation guardrails

- Do not regress the real `/api/scan` inference path for visual polish.
- Do not fabricate production observations or detected changes.
- Demo fixtures must be explicitly labelled as demo data or interaction previews.
- Preserve responsive behavior for phone-based scanning.
- The environment, not dashboard chrome, should remain the visual center of the product.
- Reality Diff and verification remain first-class MVP experiences.
