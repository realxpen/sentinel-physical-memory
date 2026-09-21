# Phase 9 — Spatial Memory Experience

Status: **COMPLETE**

## Objective

Make SENTINEL feel like it remembers a **place**, not like it stores a flat detection list.

Phase 9 deliberately does **not** attempt full metric 3D/BIM reconstruction. The product surface is a grounded Spatial Memory Canvas built from the current immutable environmental state.

## Product contract

The Memory experience must be driven by persisted state, never by decorative placeholder rooms.

For the current state, the canvas should expose:

- remembered areas / room objects when grounded;
- remembered physical objects;
- current visible state when available;
- grounded position text;
- grounded relationships;
- operational conditions / issues;
- last observed time;
- evidence count;
- object history across immutable states;
- contextual **Ask about this object** entry.

When room membership is not yet grounded, SENTINEL should show an honest environment-level group rather than inventing Reception, Workspace, Server Room, or other fictional spaces.

## First implementation slice

Current main now:

- removes the hard-coded Reception / Workspace / Server Room canvas;
- resolves the authoritative current snapshot from persistent environmental memory;
- groups objects by grounded room membership using:
  - `position.roomId`;
  - `located_in` relations;
  - `contains` relations;
- falls back to one environment-level observed-space group when no room graph exists;
- sorts operationally relevant objects ahead of ordinary inventory;
- marks objects with current issue / condition state;
- opens an object inspector showing:
  - category;
  - visible state;
  - grounded location;
  - last observed time;
  - evidence count;
  - number of immutable states in which the durable object appears;
  - grounded relationships;
  - associated conditions;
  - associated operational issues;
- prepares a contextual Ask question from the selected object;
- shows immutable per-object history across remembered state versions, including state, grounded position, confidence and source image when available;
- shows Reality Diff events tied to that physical object and lets the user jump directly to the relevant Changes entry;
- executes Ask SENTINEL directly from the selected object instead of requiring a second submit step.

The canvas stays evidence-first: missing room or position knowledge is shown as missing rather than fabricated.

## Area focus + relationship visualization slice

Current main now also:

- adds a **Building → grounded area → objects** navigation layer when persisted room objects exist;
- lets the operator focus the canvas on one grounded room/area without altering memory;
- keeps an explicit environment-level fallback when no room structure is grounded;
- draws a selected object's current-state relationships as a semantic relation map;
- highlights selected and directly related object cards on the canvas;
- lets a relationship target become the next inspected object while preserving its grounded area focus;
- draws only persisted relation edges whose opposite endpoint resolves to a physical object in the current immutable snapshot;
- treats the relation map as semantic topology, **not** metric geometry or a reconstructed floor plan.

The deterministic Phase 9 regression gate verifies room assignment through `position.roomId`, `located_in`, and `contains`; honest environment fallback; area focus; and relation-edge projection without fabricated endpoints.

## Repeated-object identity presentation slice

Current main now also distinguishes repeated human-readable object names **only when the current persisted snapshot contains unique grounding context**.

Presentation rules:

- durable object IDs and persisted `object.name` values are never rewritten;
- a unique relation to a uniquely named remembered object is preferred, for example `Plant · near Desk` or `Plant · on Bookshelf`;
- grounded room membership can distinguish repeated names across areas, for example `Lamp · Desk area` and `Lamp · Entry`;
- a unique persisted position description may be used when stronger relational/room context is absent;
- ambiguous instances remain honestly identical in presentation;
- SENTINEL does **not** manufacture `Plant 1`, `Plant 2`, ordinal suffixes, or unsupported identity claims;
- the same display context is reused in object cards, the inspector, contextual Ask, and relationship targets.

The Phase 9 deterministic gate now covers both positive contextual distinctions and the fail-closed ambiguous case.

## Mobile Spatial Memory polish slice

The phone experience now treats Spatial Memory as a native interaction surface rather than a compressed desktop canvas.

Current main now:

- turns grounded area navigation into a horizontal snap-scrolling touch rail with explicit selected-area semantics;
- increases physical-object and relationship touch targets while allowing grounded context labels to wrap rather than truncate;
- makes immutable state history swipeable as snap-aligned cards;
- turns evidence, history, object, and Reality Diff drawers into safe-area-aware mobile bottom sheets;
- contains overscroll inside sheets/scrollers so the background memory surface does not fight the interaction;
- keeps the selected object's **Ask SENTINEL** action sticky and reachable while the object sheet is scrolled;
- suppresses the global Ask bar and mobile nav while a modal sheet is open, preventing stacked fixed controls;
- stacks state-transition content vertically in the mobile Reality Diff drawer;
- preserves desktop behavior outside the phone breakpoint.

A dedicated deterministic mobile experience gate verifies the required interaction and responsive contracts at source level; the normal TypeScript/Vite build remains the executable compile gate.

## Real multi-state production validation

Phase 9 closes against the existing real Neon environment `env_warehouse_73266674`; no new Office Proof environment is created.

The read-only production gate proves:

- three immutable persisted states can be listed and reopened through `GET /api/states`;
- current / previous / state-by-ID / state-by-time navigation resolves the real stored snapshots;
- durable objects remain navigable across multiple immutable states;
- historical object inspection restores state-scoped relations, conditions, issues and evidence;
- the current state, which has no grounded room graph, remains an honest environment-level Spatial Memory group;
- relation visualization resolves only endpoints present in the selected immutable snapshot;
- a canonical before/after snapshot fingerprint is unchanged by validation.

Canonical proof: `Knowledge/Technical/phase-9-real-history-proof.md`.

The integration is continuously checked by `.github/workflows/phase9-real-history.yml`. The workflow uses GET-only production history reads; it does not scan, save, create a state, or mutate Neon.

## Trust constraints

- Spatial layout labels must come from persisted environmental memory.
- No decorative room name may be presented as remembered truth.
- A relation is shown only when it exists in the current immutable snapshot.
- Historical snapshots are never rewritten by Phase 9 presentation logic.
- Conditions preserve Observed / Inferred basis.
- The UI does not promote a visual relationship into an operational issue.

## Exit condition

Phase 9 closes when a real remembered environment can be navigated from area → object → state / condition / evidence / history / Ask, and the interface still behaves honestly when room relationships are sparse or absent.

## Exit status

**COMPLETE.** The next product phase is Phase 10 — Ask the Building.
