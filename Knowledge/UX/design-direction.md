# UI/UX Design Direction

Status: **LOCKED**

## North star

**Living Spatial Intelligence**

SENTINEL should feel like an intelligence living alongside a physical environment: quiet while nothing needs attention, alive while observing/reasoning, precise when presenting evidence.

Personality: **Quiet. Alive. Precise.**

## Two product states

### Live / present

Dark, cinematic, present-tense intelligence.

- Near black: `#080A09`
- Secondary: `#0D100E`
- Raised: `#131714`
- Sentinel green: `#5BFF8A`
- Deep emerald: `#0BA861`

Dark means SENTINEL is looking, observing or reasoning.

### Memory / history

Light, editorial, reflective state.

- Memory canvas: `#F4F4EF`
- Secondary: `#EDEFE9`
- Cool lilac: `#EEE7FF`

Light means SENTINEL is remembering, comparing or reviewing history.

## Semantic color

Green is intelligence/recognition/verification, not decoration everywhere.

- Critical: `#FF5A5F`
- Attention: `#FFA94D`
- Historical/change: `#90D7FF`
- Neutral: white/silver/charcoal

## Typography

Use a modern editorial/geometric grotesk. Prefer large declarative conclusions with small precise metadata. Avoid stereotypical sci-fi fonts and noisy HUD styling.

## Product language

Prefer:

- Observe environment
- Observing
- Understanding
- Remembering
- Ask this environment
- Conditions
- What changed
- Reasoning across observations
- Verifying
- Verified

## Signature experiences

- **Observe** — environmental media fills the experience; overlays remain restrained.
- **Spatial Memory Canvas** — semantic spatial relationships without claiming professional metric 3D reconstruction.
- **Reality Diff** — Git diff for the physical world.
- **Evidence drawer** — observed evidence, confidence, interpretation and recommendation remain distinct.
- **Contextual Ask** — answers appear as conclusions attached to environmental context, not a separate chat transcript.

## Motion

Use deliberate focus, crossfade, subtle node illumination and breathing observation states. Avoid bouncy/gamified/terminal/Matrix effects.

Suggested ranges:

- UI interactions: 180–260ms
- spatial transitions: 400–700ms
- memory transitions: 700–1200ms

Respect `prefers-reduced-motion`.

## Guardrails

- Environment before chrome.
- No generic admin-dashboard regression.
- No decorative fabricated detections.
- Evidence-first wording for safety/maintenance conditions.
- Mobile observation remains a first-class path.
