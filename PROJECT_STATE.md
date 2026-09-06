# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 3 — Persistent Environmental Memory: NEON DATABASE VERIFIED / CURRENT-SOURCE VERCEL RUNTIME ACTIVATION PENDING**

## Phase 3 verified now

- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- `DATABASE_URL` is the server-only persistence configuration contract.
- Dedicated Neon project `sentinel-physical-memory` exists in `aws-us-east-2`.
- Active schema is deployed to Neon.
- Canonical aggregate + normalized persistence works.
- Immutable State A / State B snapshots survive database round-trips.
- The database rejects an attempted rewrite of an already persisted historical snapshot.
- The Neon migration/runtime-hardening source passes GitHub CI.
- MONIFlow and Hustle remain untouched in Supabase.

## Production verification record

A production diagnostic was rerun after the manual Vercel redeploy on 2026-09-06.

Observed production behavior:

- `/` returns HTTP 200;
- `/api/health` returns HTTP 404 even though `api/health.ts` exists on current `main`;
- `/api/memory` returns Vercel `FUNCTION_INVOCATION_FAILED` before the SENTINEL handler can return application JSON;
- therefore the successful manual redeploy promoted/rebuilt an older successful deployment snapshot rather than the current runtime-hardening source tree.

The current source tree already contains:

- lazy Neon loading inside the server persistence path;
- Node 22 runtime pinning;
- `/api/health` runtime probe;
- repaired GitHub CI configuration.

A new commit is intentionally being used to force Vercel to build the current source tree instead of redeploying the stale deployment snapshot.

## Phase 3 remaining gate

Before Phase 3 can be marked complete:

1. deploy the current `main` source tree to Production;
2. confirm `/api/health` returns HTTP 200 with `status: "ok"` and `persistenceConfigured: true`;
3. confirm `/api/memory?environmentId=phase3-verification` reports `persistence: "neon"` and restores the persisted two-state verification memory;
4. run the real Observe path for Scan A and confirm persistent database memory;
5. reload/fresh invocation and confirm the same state/evidence/snapshots restore without client resubmission;
6. run Scan B and verify Reality Diff uses the persisted immutable snapshots.

**Do not formally advance to Phase 4 until this deployed end-to-end gate passes.**

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite.
- Primary views: Memory / Observe / Changes.
- Browser-side video frame extraction.
- Contextual Ask and Reality Diff presentation exist.
- Frontend requests authoritative memory from `/api/memory` on mount.
- Scan/Ask requests do not send full environmental memory back to the server.
- UI recognizes `neon` vs `volatile` persistence restoration.

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
- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- `EnvironmentalMemory` contains immutable per-state snapshots.
- Hydration prefers persisted snapshots.
- Database persistence now rejects historical snapshot mutation.

### Neon / Postgres

- Active SQL: `infrastructure/neon/phase-3-environmental-memory.sql`.
- Tables live in `sentinel_private`.
- Canonical memory JSONB plus normalized records are written atomically.
- State rows persist immutable snapshot JSONB.
- Database-level Phase 3 verification is recorded in `Knowledge/Technical/phase-3-neon-verification.md`.

Security note: the API-created `sentinel_app` login inherits Neon's platform role in this project, so strict least-privilege login hardening remains a pre-production task. Credentials remain server-only and are never exposed to browser code.

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

1. **Finish Phase 3 current-source Vercel runtime activation and real Scan A/B proof** — current gate blocker.
2. Observation pipeline hardening — real phone video reliability.
3. Condition model quality — observation vs interpretation semantics.
4. Environmental state history UX/query hardening.
5. Diff v2 — stable matching and evidence-qualified absence/removal.
6. Action + verification — complete the closed loop.
7. Automated tests/reliability and least-privilege database role hardening.

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
- [ ] Phase 3 — Persistent Environmental Memory (**database verified; current-source Vercel runtime activation pending**)
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

Engineering implementation: **MET**.

Neon database durability + historical-integrity proof: **MET**.

Current-source Vercel runtime / real Scan A → reload → Scan B proof: **PENDING**.
