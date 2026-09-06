# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 3 — Persistent Environmental Memory: NEON MIGRATION IMPLEMENTED / REMOTE VERIFICATION PENDING**

Phase 3 now provides:

- server-authoritative `EnvironmentalMemoryRepository` persistence;
- `NeonEnvironmentalMemoryRepository` as the active durable implementation;
- `InMemoryEnvironmentalMemoryRepository` only as a volatile fallback;
- server-only runtime configuration through `DATABASE_URL`;
- `GET /api/memory` reload restoration;
- immutable `EnvironmentalStateSnapshot` records;
- snapshot-aware historical Ask/Diff hydration;
- a private Neon/Postgres schema with canonical aggregate + normalized records;
- least-privilege `sentinel_app` function-only runtime access.

A dedicated Neon project named `sentinel-physical-memory` now exists in `aws-us-east-2`. MONIFlow and Hustle remain untouched in Supabase.

## Phase 3 activation gate

Before Phase 3 can be marked complete:

1. apply `infrastructure/neon/phase-3-environmental-memory.sql`;
2. configure Vercel `DATABASE_URL` using the `sentinel_app` role;
3. confirm the deployed API reports `neon` persistence;
4. persist State v1 and restore it after a fresh invocation;
5. persist State v2 and verify State v1's snapshot is unchanged after database round-trip;
6. confirm Reality Diff uses the persisted immutable snapshots;
7. verify `sentinel_app` cannot directly query private tables.

**Do not advance the formal project gate to Phase 4 until these checks pass.**

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite.
- Primary views: Memory / Observe / Changes.
- Browser-side video frame extraction.
- Contextual Ask and Reality Diff presentation exist.
- Frontend requests authoritative memory from `/api/memory` on mount.
- Scan/Ask requests do not send full environmental memory back to the server.

### Scan / observation

- `src/scan/video-ingestion.ts` extracts selected frames.
- `src/scan/pipeline.ts` loads and saves memory through `EnvironmentalMemoryRepository`.
- `/api/scan` is repository-backed and reports persistence mode.

### AI / Nebius

- Real Nebius Token Factory adapter remains in `src/ai/nebius.ts`.
- Default perception model remains `nvidia/nemotron-3-nano-omni` unless configured otherwise.
- Structured perception validation remains in place.

### Environmental memory

- `EnvironmentalMemoryStore` remains the domain/state engine.
- `EnvironmentalMemoryRepository` remains the persistence contract.
- `NeonEnvironmentalMemoryRepository` is the active Phase 3 durable implementation.
- `EnvironmentalMemory` contains immutable per-state snapshots.
- Hydration prefers persisted snapshots, preventing later normalized object changes from rewriting old state meaning.

### Neon / Postgres

- Active SQL definition: `infrastructure/neon/phase-3-environmental-memory.sql`.
- Tables live in `sentinel_private`.
- Canonical memory JSONB plus normalized environment/state/object/observation/issue/evidence/relation/diff/source records are written atomically.
- State rows persist immutable snapshot JSONB.
- Runtime access is limited to the `sentinel_app` role and locked security-definer functions.
- Supabase Phase 3 artifacts are superseded and retained only for history.

### Diff / Ask

- `EnvironmentalDiffEngine` implements `DiffEngine`.
- `ChangeType` includes `uncertain`.
- Missing prior observations do not automatically prove removal/resolution.
- `AskBuildingService` reads through the async memory repository.
- Historical Ask uses the selected state's immutable snapshot.

### Action / verification

- Domain types for action plans and verification exist.
- `VerificationService` interface exists.
- Full action and verification implementations remain Phase 11/12 work.

## Highest-priority gaps

1. **Finish Phase 3 live Neon verification** — current gate blocker.
2. Observation pipeline hardening — real phone video reliability.
3. Condition model quality — observation vs interpretation semantics.
4. Environmental state history UX/query hardening.
5. Diff v2 — stable matching and evidence-qualified absence/removal.
6. Action + verification — complete the closed loop.
7. Automated tests/reliability — schema, persistence, diff and failure paths.

## Locked decisions

- SENTINEL = persistent environmental memory + change verification.
- Primary user = facility / operations manager.
- Demo environment = one controlled office.
- Track = Best Apps and Agents.
- No full metric 3D/BIM requirement for MVP.
- Evidence-first safety language.
- UI direction = Living Spatial Intelligence.
- All durable memory access goes through `EnvironmentalMemoryRepository`.
- Neon / Lakebase Postgres is the active Phase 3 durable store (DEC-005).
- Browser-carried memory is not an authoritative persistence mechanism.
- Historical states retain immutable snapshots.

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [x] Phase 1 — Freeze the MVP contract
- [x] Phase 2 — Core architecture cleanup
- [ ] Phase 3 — Persistent Environmental Memory (**Neon migration implemented; remote verification pending**)
- [ ] Phase 4 — Observation pipeline hardening
- [ ] Phase 5 — Perception quality and condition model
- [ ] Phase 6 — Environmental state history
- [ ] Phase 7 — Environmental Diff Engine v2
- [ ] Phase 8 — Reality Diff UI
- [ ] Phase 9 — Spatial Memory experience
- [ ] Phase 10 — Ask the Building product layer
- [ ] Phase 11 — Action Planner
- [ ] Phase 12 — Verification Agent
- [ ] Phase 13 — Living Spatial Intelligence UI rebuild/polish
- [ ] Phase 14 — Demo scenario engineering
- [ ] Phase 15 — Reliability and guardrails
- [ ] Phase 16 — Nebius/NVIDIA architecture hardening
- [ ] Phase 17 — Submission readiness
- [ ] Phase 18 — Final demo polish

## Current exit check

The codebase is ready to use Neon/Postgres as the authoritative environmental-memory repository without the browser carrying memory between requests. Immutable state snapshots remain part of the persistent contract.

The Phase 3 engineering exit condition is met; the **runtime durability exit condition remains pending** until the live database and deployed cold-start checks pass.
