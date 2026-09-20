# Phase 9 — Spatial Memory Experience

Status: **ACTIVE**

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
- prepares a contextual Ask question from the selected object.

The canvas stays evidence-first: missing room or position knowledge is shown as missing rather than fabricated.

## Trust constraints

- Spatial layout labels must come from persisted environmental memory.
- No decorative room name may be presented as remembered truth.
- A relation is shown only when it exists in the current immutable snapshot.
- Historical snapshots are never rewritten by Phase 9 presentation logic.
- Conditions preserve Observed / Inferred basis.
- The UI does not promote a visual relationship into an operational issue.

## Exit condition

Phase 9 closes when a real remembered environment can be navigated from area → object → state / condition / evidence / history / Ask, and the interface still behaves honestly when room relationships are sparse or absent.

## Next slices

1. Spatial relationship visualization between selected objects.
2. Area-focused filtering / zoom.
3. Current-vs-historical object memory from the object inspector.
4. Better object identity labels for repeated instances when grounded spatial context exists.
5. Mobile interaction polish.
