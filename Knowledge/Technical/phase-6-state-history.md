# Phase 6 — Environmental State History

Date: 2026-09-18

Status: **COMPLETE**

## Goal

Make time a first-class SENTINEL feature while preserving historical truth.

Each accepted observation creates:

`State v1 → State v2 → State v3 → ...`

A later scan may update the canonical remembered object, but it must never mutate what an earlier state believed.

## Locked retrieval semantics

Phase 6 supports:

- **current state** — the environment's explicit `currentStateId`, falling back only to the newest state if an older aggregate lacks that pointer;
- **previous state** — the version immediately before current;
- **state by ID** — exact state identity;
- **state by date/time** — the newest state whose `capturedAt` is less than or equal to the requested timestamp.

A date before the first state returns no state. Invalid timestamps fail closed.

## Immutable snapshot model

`EnvironmentalStateSnapshot` now contains:

- objects;
- conditions;
- issues;
- relations.

The history selector never rebuilds historical values from `memory.objects`, `memory.conditions`, `memory.issues`, or `memory.relations`.

That rule matters because those canonical collections evolve as the physical space is re-observed.

Historical selection returns defensive clones so a caller cannot mutate the stored snapshot by editing a response object.

## Backward compatibility

Older persisted snapshots created before Phase 6 do not necessarily include `relations`.

They hydrate as:

`relations: []`

SENTINEL deliberately does not reconstruct those old relation values from today's mutable canonical relation record. Missing historical detail is safer than false history.

No database migration is required because the canonical aggregate and state snapshot are stored as JSONB.

## History service

`src/memory/history.ts`

Exports:

- `listEnvironmentalStateHistory(memory)`;
- `selectEnvironmentalState(memory, selector)`.

Timeline entries contain:

- state ID;
- version;
- capturedAt;
- summary;
- source IDs;
- object / condition / issue / relation counts;
- current-state flag.

A full selected history record contains:

- the state;
- immutable state snapshot;
- scan-specific observations;
- scan-specific evidence;
- scan source records;
- current-state flag;
- previous and next state IDs.

## API

`GET /api/states?environmentId=<id>`

returns the lightweight timeline.

Selection examples:

`GET /api/states?environmentId=<id>&selector=current`

`GET /api/states?environmentId=<id>&selector=previous`

`GET /api/states?environmentId=<id>&stateId=<state-id>`

`GET /api/states?environmentId=<id>&at=2026-09-18T12:07:00.000Z`

Only one selector may be supplied.

Responses use `Cache-Control: no-store`.

Missing environments/states return explicit errors. Historical snapshot absence returns `HISTORICAL_SNAPSHOT_UNAVAILABLE` rather than falling back to mutable current values.

## Experience

Phase 6 preserves the locked **Memory / Observe / Changes** navigation.

Memory now contains a **State history** section with:

- current / previous quick actions;
- date/time jump;
- state cards;
- immutable historical-state drawer;
- older/newer state navigation;
- exact object/condition/issue values from the selected snapshot.

The drawer explicitly says:

> This view reads the values captured in this state snapshot.

The experience remains editorial/Living Spatial Intelligence rather than becoming a generic audit table.

## Automated gate

`npm run check:phase6-history`

Verifies:

1. current selector;
2. previous selector;
3. state-by-ID;
4. state-by-date using at-or-before semantics;
5. exact timestamp selection;
6. before-first-state returns none;
7. v1 object values do not mutate when v2 updates the same durable object;
8. v1 relation confidence/evidence do not mutate when v2 updates the same durable relation;
9. returned records are defensive clones;
10. invalid dates fail closed.

Sentinel CI run `35349163148` passed the complete Phase 4/5/6 gate suite and the TypeScript/Vite build on commit `5df1b881e160ee8b0f12b858af41431eea673a08`.

## Real Neon proof

Environment:

`env_warehouse5_cbe5dde8`

State v1:

`state_c60cc223-9f0b-4519-beae-69a447b4c50e`

State v2:

`state_d8db8374-fd23-403b-ae05-c791fb96a97b`

The same durable object IDs exist in both states while the snapshots preserve their own values.

For `object_a749ebbc-d59b-4f3a-9356-27be7f3f56f6`:

- v1 `green emergency exit door`: **“A green door with a window and a silver handle.”**
- v2: **“Green emergency exit door with white text and a green exit sign above it.”**

For `object_56331574-d3d4-4f9d-b789-2bcf1b63e0a3`:

- v1 `green exit sign`: **“A green emergency exit sign above the green door.”**
- v2: **“Green exit sign with a white figure and arrow above the green emergency exit door.”**

This is the core Phase 6 proof: canonical object identity persists while historical state truth remains versioned and immutable.

## Exit condition — MET

The user/system can inspect two historical states independently and receive the values that belonged to each state.

Phase 6 is closed for the current AED build track.

Next:

**Phase 7 — Environmental Diff Engine v2**
