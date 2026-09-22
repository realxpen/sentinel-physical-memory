# Phase 13 — Living Spatial Intelligence UI Rebuild

Status: **ACTIVE / DEPLOYED / PRODUCTION VISUAL REVIEW PENDING**

## Goal

Replace the prototype-feeling collection of technical surfaces with the locked SENTINEL product identity:

**Quiet. Alive. Precise.**

The build-plan exit condition is qualitative but specific:

> the app feels like one premium product instead of a collection of backend demos.

This phase changes composition and product language without weakening any trust, memory, diff, planning or verification behavior.

## Locked visual model

### Live state

Dark near-black environment:

- `#080A09`
- `#0D100E`
- `#131714`

Used when SENTINEL is:

- observing;
- reasoning about the present;
- comparing changes;
- presenting active spatial intelligence.

### Memory state

Light editorial canvas:

- `#F4F4EF`
- `#EDEFE9`
- subtle `#EEE7FF` lilac atmosphere.

Used for:

- environmental memory;
- history;
- evidence;
- conclusions;
- verification records.

Product metaphor:

**Dark = SENTINEL is looking. Light = SENTINEL is remembering.**

## Shell

The product shell remains deliberately minimal:

- **Memory**
- **Observe**
- **Changes**
- persistent **Ask**.

Desktop navigation is now a narrow vertical spatial rail. Labels appear contextually instead of occupying permanent space.

Mobile keeps the three-tab navigation so the product remains usable one-handed.

There is no Dashboard route.

## Memory

The Memory home now follows the source direction:

**Your space remembers.**

The current immutable environmental image becomes a large cinematic product surface rather than a small evidence thumbnail.

It carries restrained overlays for:

- current state;
- last remembered time;
- object count;
- current non-normal condition count;
- attention state;
- Observe-again handoff.

First use becomes:

**Give this place a memory.**

with a direct **Begin observation** action.

## Observe

Observe remains the active dark state.

When memory already exists, the current remembered environmental capture becomes the visual substrate behind the observation layer. The system therefore feels like it is looking back into the same physical place rather than opening an unrelated upload utility.

Observation language remains:

- Observing
- Understanding
- Remembering

rather than generic loading percentages.

The luminous Observe control keeps a slow breathing motion, with reduced-motion support.

## Spatial Memory

Spatial Memory remains the centerpiece rather than a conventional 3D twin.

Phase 13 preserves:

- grounded areas only;
- environment-level fallback when no room identity is grounded;
- durable objects;
- grounded relations;
- evidence-linked object inspection;
- action / answer / verification highlights.

The visual treatment is quieter:

- lower grid contrast;
- translucent dark room surfaces;
- subtle green focus;
- fewer decorative borders;
- more negative space.

## Ask

Ask remains spatial and contextual.

There is no ChatGPT-style chat page.

The product retains:

- persistent floating Ask bar;
- state-scoped reasoning;
- source-defined core prompts;
- large editorial conclusion;
- Why this matters;
- current vs previous;
- related physical objects;
- operational issues;
- evidence.

The in-page Ask launcher is reduced into a quieter intelligence strip so it does not compete with the environment itself.

## Reality Diff

Reality Diff is the signature Changes screen.

Product language is simplified to:

**REALITY DIFF**

**What changed.**

The before/after environmental images remain the dominant surface, with restrained semantic change groups underneath.

## Time

State history becomes a vertical environmental-memory timeline on desktop rather than a grid of dashboard cards.

Current state receives a quiet green node; historical states stay neutral.

The underlying immutable-history behavior is unchanged.

## Action + Verification

Phase 11 Action Plan and Phase 12 Verification are not redesigned as separate apps.

They inherit the same:

- 24–30px architectural surfaces;
- near-black active state;
- pale editorial conclusion state;
- typography scale;
- restrained semantic accents;
- evidence-first language.

This preserves the continuous product journey:

`Ask → Action Plan → Rescan → Verification`.

## Motion

Motion language:

- UI interactions: fast and restrained;
- spatial transitions: slower;
- Observe indicator: breathing;
- environmental captures: subtle scale/parallax;
- no bounce, confetti, terminal typing or constant blinking.

`prefers-reduced-motion` disables non-essential Phase 13 motion.

## Deterministic UI gate

`npm run check:phase13-ui` verifies:

- one shared Phase 13 shell;
- Memory / Observe / Changes remain the primary navigation;
- Ask remains persistent;
- first-use and remembered editorial language;
- cinematic current environmental image;
- remembered image reuse inside Observe;
- Reality Diff language;
- Spatial Memory, Object Detail, Ask, Timeline, Action Plan and Verification remain present;
- vertical desktop rail;
- no Dashboard language;
- dark live state / light memory state;
- reduced-motion support.

## Phase boundary

Phase 13 does not close or bypass the deferred real-world Phase 12 proof.

The generated-image Test 4 remains a production software proof only.

The final Phase 12 real physical-camera test must still be performed later.

## Exit condition

Phase 13 may close after:

1. deterministic Phase 13 UI contract passes;
2. full Sentinel regression suite and build remain green;
3. the exact Phase 13 commit deploys successfully;
4. production visual inspection confirms the app reads as one coherent premium product.


## Production deployment proof

Phase 13 implementation is deployed on exact main commit:

`41136eeb3e0ccda42f86217c289ed7f654b6ef18`

PR:

- #17 — **Phase 13: rebuild SENTINEL as Living Spatial Intelligence**
- merged: **2026-09-22**

Production / regression status on the exact UI commit:

- Vercel — **SUCCESS**
- Sentinel CI run `35741974921` — **SUCCESS**
- Phase 9 Real History Validation run `35741975048` — **SUCCESS**
- Phase 10 Production Ask Smoke run `35741975004` — **SUCCESS**
- Phase 11 Production Action Planner run `35741974947` — **SUCCESS**
- Phase 12 Production Verification run `35741974945` — **SUCCESS**
- Phase 4 Observation Contract run `35741974822` — **SUCCESS**
- deterministic Phase 13 Living Spatial Intelligence UI gate — **SUCCESS**
- TypeScript + Vite build — **SUCCESS**.

The first Phase 8 Production Photo Smoke attempt on this deployment failed only because the baseline production scan hit a client-side 180-second network read timeout. No semantic assertion was reached. The failed workflow has been rerun; this is tracked separately and does not alter the Phase 13 UI contract.

## Visual-review boundary

The exact deployed shell still requires one direct human-visible production review before Phase 13 is marked COMPLETE.

The current execution environment could confirm the Vercel deployment and API/product regressions, but its direct browser connector is not connected and its fallback headless runtime has no working external DNS. Therefore the visual-review gate is intentionally left open rather than inferred from static CSS.

Visual review should confirm, at minimum:

- current Memory image is visually dominant;
- **Your space remembers.** reads as the primary remembered-state statement;
- first-use **Give this place a memory.** remains clear;
- desktop navigation feels like a subtle spatial rail, not a dashboard menu;
- Observe feels dark/cinematic;
- Reality Diff feels dark and image-led;
- Memory/history/answers feel pale/editorial;
- floating Ask does not obscure critical content;
- phone layout retains usable Memory / Observe / Changes navigation;
- Action Plan and Verification feel continuous with the same product identity.

Once those points are visually confirmed on production, Phase 13 can close without further backend work.
