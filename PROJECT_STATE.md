# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 3 — Persistent Environmental Memory: ENGINEERING IMPLEMENTED / REMOTE VERIFICATION PENDING**

Phase 3 code now provides:

- `SupabaseEnvironmentalMemoryRepository`
- server-only repository configuration in `api/_memory-repository.ts`
- persistent/volatile runtime mode reporting
- server-authoritative scan and Ask paths
- `GET /api/memory` reload restoration
- removal of client-carried memory as persistence input
- immutable `EnvironmentalStateSnapshot` records
- snapshot-aware historical Ask/Diff hydration
- Supabase/Postgres schema + atomic save/read RPC design
- server-only Supabase environment-variable contract

## Phase 3 activation gate

A dedicated SENTINEL Supabase project does not yet exist in the connected account. Existing Personal OS and MONIFlow projects must not be reused for SENTINEL data.

Before Phase 3 can be marked complete:

1. provision/select a dedicated SENTINEL Supabase project;
2. apply `infrastructure/supabase/phase-3-environmental-memory.sql`;
3. configure Vercel `SUPABASE_URL` + `SUPABASE_SECRET_KEY`;
4. perform Scan A and confirm persistent database memory;
5. reload/fresh invocation and confirm `/api/memory` restores exact state/evidence/snapshot data;
6. perform Scan B and verify State v1 remains immutable after database round-trip;
7. verify Reality Diff uses the persisted state snapshots;
8. run Supabase security/performance advisors and resolve actionable findings.

**Do not advance the formal project gate to Phase 4 until these checks pass.**

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite.
- Primary views: Memory / Observe / Changes.
- Browser-side video frame extraction.
- Contextual Ask and Reality Diff presentation exist.
- Frontend now requests authoritative memory from `/api/memory` on mount.
- Scan/Ask requests no longer send full environmental memory back to the server.

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
- `SupabaseEnvironmentalMemoryRepository` is the Phase 3 durable implementation.
- `InMemoryEnvironmentalMemoryRepository` remains only a local/volatile fallback.
- `EnvironmentalMemory` now contains immutable per-state snapshots.
- Hydration prefers persisted snapshots, preventing later normalized object changes from rewriting old state meaning.

### Supabase/Postgres

- SQL definition: `infrastructure/supabase/phase-3-environmental-memory.sql`.
- Tables live in `sentinel_private`.
- Canonical memory JSONB plus normalized environments/states/objects/observations/issues/evidence/relations/diffs/sources are written atomically.
- State rows persist immutable snapshot JSONB.
- Public Data API surface is limited to locked service-role RPC functions.
- Remote database deployment has **not yet been performed** because no dedicated SENTINEL Supabase project is connected.

### Diff / Ask

- `EnvironmentalDiffEngine` implements `DiffEngine`.
- `ChangeType` includes `uncertain`.
- Missing prior observations do not automatically prove removal/resolution.
- `AskBuildingService` reads through the async memory repository.
- Historical Ask now uses the selected state's immutable snapshot.

### Action / verification

- Domain types for action plans and verification exist.
- `VerificationService` interface exists.
- Full action and verification implementations remain Phase 11/12 work.

## Highest-priority gaps

1. **Activate and verify Phase 3 database persistence** — current gate blocker.
2. **Observation pipeline hardening** — real phone video reliability.
3. **Condition model quality** — observation vs interpretation semantics.
4. **Environmental state history UX/query hardening**.
5. **Diff v2** — stable matching and evidence-qualified absence/removal.
6. **Action + verification** — complete the closed loop.
7. **Automated tests/reliability** — schema, persistence, diff and failure paths.

## Locked decisions

- SENTINEL = persistent environmental memory + change verification.
- Primary user = facility / operations manager.
- Demo environment = one controlled office.
- Track = Best Apps and Agents.
- No full metric 3D/BIM requirement for MVP.
- Evidence-first safety language.
- UI direction = Living Spatial Intelligence.
- All durable memory access goes through `EnvironmentalMemoryRepository`.
- Supabase/Postgres is the first durable store.
- Browser-carried memory is not an authoritative persistence mechanism.
- Historical states retain immutable snapshots.

See `Knowledge/Decisions/`.

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [x] Phase 1 — Freeze the MVP contract
- [x] Phase 2 — Core architecture cleanup
- [ ] Phase 3 — Persistent Environmental Memory (**engineering implemented; remote verification pending**)
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

The codebase can now use Supabase/Postgres as the authoritative environmental-memory repository without the browser carrying memory between requests. Immutable state snapshots are part of the persisted contract.

The Phase 3 engineering exit condition is met; the **runtime durability exit condition remains pending** until a dedicated database is provisioned and verified.
