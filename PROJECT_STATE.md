# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 4 — Observation Pipeline Hardening: IMPLEMENTATION ACTIVE / PRODUCTION RE-VERIFICATION PENDING**

## Phase 3 — COMPLETE

Persistent Environmental Memory passed its engineering, database, deployment and real production scan gates.

Verified:

- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- `DATABASE_URL` is server-only and production persistence reports `neon`.
- Dedicated Neon project `sentinel-physical-memory` is active in `aws-us-east-2`.
- Canonical aggregate + normalized persistence is active.
- Immutable historical snapshots survive database round-trips.
- Postgres rejects rewrites of already persisted historical snapshots.
- Production `/api/health`, `/api/memory`, `/api/scan` and `/api/ask-building` load correctly on Node 22.
- Real production Scan A and Scan B executed through Nebius Token Factory and persisted through Neon.
- Fresh memory reads restored server-authoritative state without client resubmission.
- State A remained immutable after Scan B.
- The persisted A→B Reality Diff contained two changes.
- MONIFlow and Hustle remain untouched in Supabase.

Canonical Phase 3 proof: `Knowledge/Technical/phase-3-production-proof.md`.

## Phase 4 checkpoint

The locked target is:

`30–60 second phone walkthrough → 8–12 useful evidence frames → Nebius perception`

Implemented now:

- browser candidate-frame sampling rather than blindly sending every/even frame;
- scene/novelty selection with temporal spread;
- duplicate-frame filtering;
- low-light rejection;
- MP4, MOV/M4V and WebM handling;
- MIME fallback from extension when `File.type` is absent;
- resize + adaptive JPEG compression;
- ~3.2 MB browser evidence budget;
- hard 5–90 second video guard, with 30–60 seconds as the preferred capture window;
- 300 MB source-video browser ceiling;
- metadata/seek timeouts and recoverable ingestion errors;
- diagnostics for frame quality/selection and request size;
- `/api/scan` request body safety budget reduced to 4 MB;
- server-side MIME, duration, frame-count, frame-order, data-URL and per-frame size validation;
- explicit 413 / 415 / 422 errors for malformed observation requests;
- trusted nested scan identity normalization at the Nebius adapter boundary.

### Phase 4 verification so far

Commit `7f795c4` (`feat: harden phase 4 observation ingestion`):

- GitHub CI: **PASS**
- Vercel: **PASS**

Production observation-contract workflow verified:

- unsupported video MIME → 415 `UNSUPPORTED_MEDIA_TYPE` — **PASS**
- too-short walkthrough → 422 `VIDEO_TOO_SHORT` — **PASS**
- too-few evidence frames → 422 `TOO_FEW_FRAMES` — **PASS**

A valid 30-second, 8-frame request reached real Nebius and exposed one provider-format issue: the vision response returned a wrong nested `evidence.sourceId`.

Commit `7afc36d` (`fix: normalize trusted scan identity for multi-frame perception`) fixes that at the trusted metadata boundary and passes GitHub CI.

Current blocker:

- Vercel rejected deployment of `7afc36d` because the project hit its build-rate limit.
- Therefore the valid 8-frame production contract has **not yet been rerun against the identity fix**.

Canonical Phase 4 record: `Knowledge/Technical/phase-4-observation-pipeline.md`.

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite.
- Primary views: Memory / Observe / Changes.
- Browser-side video evidence extraction.
- UI uses the locked states `Observing → Understanding → Remembering`.
- Contextual Ask and Reality Diff presentation exist.
- Frontend restores authoritative environmental memory from `/api/memory`.
- Browser-carried memory is not the persistence authority.

### Scan / observation

- `src/scan/video-ingestion.ts` performs Phase 4 browser hardening.
- `src/scan/pipeline.ts` loads/saves memory through `EnvironmentalMemoryRepository`.
- `/api/scan` is repository-backed and reports persistence mode.
- Trusted scan identity comes from SENTINEL request metadata, not model invention.
- Provider-format normalization is bounded; required semantic/evidence validation remains strict.

### AI / Nebius

- Real Nebius Token Factory adapter lives in `src/ai/nebius.ts`.
- Active Token Factory base: `https://api.tokenfactory.us-central1.nebius.com/v1`.
- Perception default: `openbmb/MiniCPM-V-4_5`.
- Reasoning / Ask default: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
- DEC-006 records the production model-routing decision.

### Environmental memory

- `EnvironmentalMemoryStore` remains the domain/state engine.
- `EnvironmentalMemoryRepository` remains the persistence contract.
- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- Historical state snapshots are immutable.
- Database persistence rejects historical snapshot mutation.

### Diff / Ask

- `EnvironmentalDiffEngine` implements `DiffEngine`.
- `ChangeType` includes `uncertain`.
- Missing prior evidence does not automatically prove removal/resolution.
- `AskBuildingService` reads through the async repository.
- Historical Ask uses selected immutable snapshots.

### Action / verification

- Domain types for action plans and verification exist.
- `VerificationService` interface exists.
- Full implementations remain Phase 11/12 work.

## Phase 4 remaining gate

Before Phase 4 can be marked complete:

1. get the latest `main` containing `7afc36d` deployed successfully to production;
2. rerun `.github/workflows/phase4-observation-contract.yml` and pass the valid 8-frame request with HTTP 200 + `persistence: neon`;
3. run multiple normal 30–60 second phone walkthroughs through the actual browser path;
4. verify those videos consistently produce roughly 8–12 useful frames under the payload budget;
5. verify dark/duplicate-heavy/unsupported inputs fail with actionable guidance and never fabricate memory.

## Highest-priority gaps

1. **Finish Phase 4 production re-verification + real phone walkthrough tests.**
2. Perception quality / condition model — sharpen observation vs interpretation semantics.
3. Environmental state history UX/query hardening.
4. Diff Engine v2 — stable matching and evidence-qualified absence/removal.
5. Action + verification — complete the closed loop.
6. Reliability, automated tests, security and least-privilege database-role hardening.

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
- [ ] Phase 4 — Observation pipeline hardening (**implementation active; production + real-phone exit gate pending**)
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

Phase 3: **COMPLETE**.

Phase 4 engineering implementation: **SUBSTANTIALLY MET**.

Phase 4 production rejection guards: **MET**.

Phase 4 valid 8-frame production path after identity fix: **PENDING DEPLOYMENT**.

Phase 4 multiple real-phone walkthrough proof: **PENDING**.

**Do not formally advance to Phase 5 until both remaining Phase 4 gates pass.**
