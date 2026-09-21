# Phase 9 — Real Multi-State Spatial Memory Proof

Status: **VERIFIED**

Date: **2026-09-21**

## Purpose

Close the final Phase 9 gate without creating a new Office Proof environment and without rewriting any historical state.

The validation target is the already-persisted real environment:

- Environment: `env_warehouse_73266674`
- Display name: `Warehouse`
- Persistence authority: Neon Postgres
- Validation mode: read-only

## Direct Neon baseline

Read-only SQL against the dedicated `sentinel-physical-memory` Neon project confirmed:

- 3 immutable states: v1 → v2 → v3;
- 3 persisted snapshots;
- 36 evidence records;
- 3 sources;
- 2 Reality Diffs;
- 9 distinct durable object IDs across 19 snapshot-object appearances.

Snapshot structure:

| State | Objects | Relations | Conditions | Issues |
| --- | ---: | ---: | ---: | ---: |
| v1 | 6 | 4 | 1 | 0 |
| v2 | 7 | 5 | 3 | 1 |
| v3 | 6 | 0 | 1 | 0 |

Five durable objects are present in all three immutable states:

- cardboard boxes;
- fire extinguisher;
- green door;
- orange cart;
- orange shelving.

State v2 contains the grounded medium-severity access issue involving the orange cart and green door, with persisted relation edges and evidence. State v3 retains the durable objects but has no persisted relation graph.

That pair is useful for Phase 9 because it proves both sides of the trust contract:

1. SENTINEL can reopen a historical object with its persisted relationships, conditions, issue and evidence.
2. When the current state has no grounded room/relation topology, Spatial Memory falls back to an honest environment-level group rather than manufacturing room structure.

## Immutable snapshot fingerprint

Before the validation implementation, direct read-only Neon SQL produced:

```text
v1  63664f8ab4e27bb66b3d5ace42dd6848
v2  0a99f24a4d58d239eb673d2f60d19410
v3  33cbe27d7c4fda5815d7fb84632c70a9
```

The automated gate also computes a canonical SHA-256 fingerprint from every selected immutable snapshot before and after traversal. The two fingerprints must match.

No insert, update, delete, save, scan, or state-creation operation is used by the validation.

## Automated production gate

`scripts/check-phase9-real-history.mjs` validates the real environment through production `GET /api/states`, which restores memory through the runtime Neon repository.

It proves:

- persistence reports `neon`;
- at least three real immutable states remain available;
- current and previous selectors resolve correctly;
- state-by-ID and state-by-time reopen the exact historical snapshot;
- the current sparse topology produces one honest environment-level Spatial Memory group;
- a durable object survives from the historical operational state into the current state;
- that historical object exposes persisted relation edges, condition, operational issue and state-scoped evidence;
- relation-map targets resolve only to objects that actually exist in that immutable snapshot;
- the same durable object remains navigable across multiple states;
- a second read produces the same canonical snapshot fingerprint.

The GitHub workflow `.github/workflows/phase9-real-history.yml` runs this read-only gate on relevant pull requests and main pushes. On a main push it waits for production `/api/health` to report the exact deployed commit before reading history.

## Phase 9 exit

The Phase 9 exit condition is satisfied:

`AREA / ENVIRONMENT → OBJECT → CURRENT OR HISTORICAL STATE → RELATIONSHIPS → CONDITIONS / ISSUES → EVIDENCE → HISTORY → ASK ENTRY`

The proof remains evidence-first. A missing room graph stays missing; no spatial geometry or room identity is fabricated.

**Phase 9 is complete.**
