# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 4 — Observation Pipeline Hardening: NEXT / NOT STARTED**

## Phase 3 — COMPLETE

Persistent Environmental Memory has passed its engineering, database, deployment, and real production scan gates.

Verified:

- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- `DATABASE_URL` is server-only and production persistence reports `neon`.
- Dedicated Neon project `sentinel-physical-memory` is active in `aws-us-east-2`.
- Canonical aggregate + normalized persistence is active.
- Immutable historical snapshots survive database round-trips.
- Postgres rejects rewrites of already persisted historical snapshots.
- Production `/api/health`, `/api/memory`, `/api/scan`, and `/api/ask-building` load correctly on Node 22.
- Real production Scan A and Scan B both executed through Nebius Token Factory and persisted through Neon.
- A fresh memory read after each scan restored server-authoritative memory without client resubmission.
- State A remained immutable after Scan B.
- The persisted A→B Reality Diff existed and contained two changes.
- MONIFlow and Hustle remain untouched in Supabase.

### Production Phase 3 proof

Verification environment: `phase3-runtime-34027093828`

- Scan A: `scan_f0a2e99a-c850-4f71-97ae-820b1aa2e98a`
- State A: `state_81c0c92d-9354-4fde-aeb8-656c514615ac`
- Scan B: `scan_774fa2d3-def2-4f39-ab7e-9993dba56948`
- State B: `state_6ec21382-b657-48b4-876b-1f3d2e5a349b`
- states: `2`
- immutable snapshots: `2`
- diff: `diff_ddb287af-709e-4c67-a514-d252dc828d4c`
- diff changes: `2`
- State A immutable after Scan B: `true`

The production verification emitted:

`PHASE 3 PRODUCTION SCAN PERSISTENCE VERIFIED`

Canonical proof: `Knowledge/Technical/phase-3-production-proof.md`.

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
- Trusted scan identity comes from the request boundary, not model invention.
- Provider-format normalization is limited to optional representation differences before strict SENTINEL validation.

### AI / Nebius

- Real Nebius Token Factory adapter remains in `src/ai/nebius.ts`.
- Active Token Factory base: `https://api.tokenfactory.us-central1.nebius.com/v1`.
- Perception default: `openbmb/MiniCPM-V-4_5`.
- Reasoning / Ask default: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
- DEC-006 records why the production route differs from the earlier Nano Omni design-time assumption.
- Structured perception validation remains evidence-first and strict for required semantic fields.

### Environmental memory

- `EnvironmentalMemoryStore` remains the domain/state engine.
- `EnvironmentalMemoryRepository` remains the persistence contract.
- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- `EnvironmentalMemory` contains immutable per-state snapshots.
- Hydration prefers persisted snapshots.
- Database persistence rejects historical snapshot mutation.

### Neon / Postgres

- Active SQL: `infrastructure/neon/phase-3-environmental-memory.sql`.
- Tables live in `sentinel_private`.
- Canonical memory JSONB plus normalized records are written atomically.
- State rows persist immutable snapshot JSONB.
- Database-level verification is recorded in `Knowledge/Technical/phase-3-neon-verification.md`.

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

1. **Phase 4 — Observation pipeline hardening:** make real phone video capture, frame sampling, retries, payload handling, and scan progress reliable.
2. Perception quality / condition model — sharpen observation vs interpretation semantics.
3. Environmental state history UX/query hardening.
4. Diff Engine v2 — stable matching and evidence-qualified absence/removal.
5. Action + verification — complete the closed loop.
6. Reliability, automated tests, security, and least-privilege database-role hardening.

## Locked decisions

- SENTINEL = persistent environmental memory + change verification.
- Primary user = facility / operations manager.
- Demo environment = one controlled office.
- Track = Best Apps and Agents.
- No full metric 3D/BIM requirement for MVP.
- Evidence-first safety language.
- UI direction = Living Spatial Intelligence.
- All durable memory access goes through `EnvironmentalMemoryRepository`.
- Neon / Lakebase Postgres is the active durable store (DEC-005).
- Browser-carried memory is not an authoritative persistence mechanism.
- Historical states retain immutable snapshots.
- Production Nebius model routing uses MiniCPM-V for perception and NVIDIA Nemotron 3 Nano 30B-A3B for reasoning (DEC-006).

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [x] Phase 1 — Freeze the MVP contract
- [x] Phase 2 — Core architecture cleanup
- [x] Phase 3 — Persistent Environmental Memory
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

Phase 3 engineering implementation: **MET**.

Neon durability + historical-integrity proof: **MET**.

Current-source Vercel runtime activation: **MET**.

Real production Scan A → fresh reload → Scan B → immutable history + Reality Diff: **MET**.

**Phase 3: COMPLETE. Phase 4 is the next activation gate.**
