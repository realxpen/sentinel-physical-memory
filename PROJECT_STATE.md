# SENTINEL Project State

Last updated: 2026-09-14

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 4 — Observation Pipeline Hardening: ACTIVE / ALL LOCAL EXIT GATES PASSED / LATEST-MAIN PRODUCTION VALID-SCAN GATE PENDING**

## Phase 3 — COMPLETE

Persistent Environmental Memory passed its engineering, database, deployment and real production scan gates.

Verified:

- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- `DATABASE_URL` is server-only and persistence reports `neon`.
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

Current observation path:

`30–60 second phone walkthrough → 8–12 useful browser evidence frames → max 10 Nebius perception images → Neon memory`

Implemented:

- browser candidate-frame sampling with temporal spread;
- duplicate and low-light rejection;
- MP4, MOV/M4V and WebM handling with filename MIME fallback;
- resize + adaptive JPEG compression under the request budget;
- hard 5–90 second duration guard with 30–60 seconds preferred;
- metadata/seek timeouts and recoverable ingestion errors;
- `/api/scan` body/media/frame/timestamp/data-URL guards with explicit 413/415/422 responses;
- structured scan diagnostics;
- trusted nested scan identity normalization at the Nebius adapter boundary;
- MiniCPM-V provider cap enforced at max 10 prompt images with temporal coverage preserved;
- harmless empty optional spatial positions normalized away while required perception schema stays strict;
- model-specific object categories normalized into SENTINEL's canonical taxonomy;
- deterministic malformed-JSON repair before strict perception schema validation;
- deterministic model evidence-reference reconciliation when an existing evidence item can be uniquely matched by exact ID, `frameIndex`, or unambiguous array index; unknown/ambiguous references still fail strict validation;
- `.env.local` authoritative in local runtime only;
- Node 22 pinned and `npm run dev:local` added;
- IPv4-first local DNS handling;
- local Neon transport diagnostics plus automatic WebSocket/HTTP failover;
- bounded transient Neon retries with fresh client recreation;
- safe runtime health diagnostics including deployed Git commit identity;
- `npm run check:nebius` for non-secret Token Factory auth verification;
- trusted persistence provenance: source capture time overrides model-invented timestamps and scan-local model IDs are not used as durable global primary keys;
- canonical scan entities deduplicated before state/diff construction;
- deterministic CI quality gates for dark, duplicate-heavy, too-few, mixed-quality and healthy walkthrough evidence;
- deterministic CI regression gate for model evidence-reference mismatch behavior.

### First real-phone baseline — PASS

On 2026-09-11, the real browser Observe flow completed with `New Office Walkthrough.mp4`:

- duration: **55,901 ms**;
- evidence sent to perception: **10 frames**;
- Nebius authentication: **PASS**;
- MiniCPM-V multimodal inference: **PASS**;
- objects: **8**;
- relations: **7**;
- issues: **0**;
- persisted state version: **1**;
- state ID: `state_a6f0b67a-6905-45e1-9fd1-4143385ef11a`;
- Neon write/read: **PASS**;
- `/api/memory?environmentId=office-demo`: populated memory + `persistence: neon` — **PASS**;
- `diffs: []` — expected for baseline State v1;
- frontend rendered `What SENTINEL observed.` with the persisted objects.

This proves:

`browser video → evidence extraction → Nebius perception → schema validation → environmental state → Neon persistence → memory restore`

### Provenance hardening after baseline

The first successful response exposed model-invented timestamps and reusable scan-local IDs. Commit `c750f3a` hardened future scans so:

- evidence + observation `capturedAt` use trusted `source.capturedAt`;
- new object `firstSeenAt` / `lastSeenAt` use trusted scan capture time;
- evidence and observation IDs are source-scoped;
- new canonical object and relation IDs are SENTINEL-generated;
- model object IDs are translated to canonical persisted IDs before relations are saved;
- evidence references are remapped consistently through observations, objects, issues and relations.

State v1 was deliberately not rewritten; immutable historical snapshots remain authoritative.

### Real-phone repeat scan + Reality Diff — PASS

On 2026-09-14, the hardened local Observe path completed repeat real walkthroughs of `office-demo` and persisted **State v3**:

- state count in Neon: **3**;
- diff count in Neon: **2**;
- current/latest state: `state_efde5f1d-4e36-4baf-b8b2-17f311a1c2ef`;
- latest state version: **3**;
- comparison source state: `state_730e488f-211d-48f1-9f94-406e2e43caab`;
- latest Reality Diff changes: **5**;
- frontend rendered `What changed.` with the before/after comparison — **PASS**.

Latest diff semantics:

- `added` — **New: desk** — confidence 0.95;
- `added` — **New: cable** — confidence 0.90;
- `added` — **New: person** — confidence 0.80;
- `uncertain` — **Not re-observed: HGC logo** — confidence 0.50;
- `uncertain` — **Not re-observed: sofa** — confidence 0.50.

The two non-observations intentionally remain `uncertain`; SENTINEL does not claim removal from absence alone.

This proves:

`persistent prior state → new real-phone observation → validated/persisted new state → evidence-qualified Reality Diff → rendered Changes UI`

### Poor-input / evidence-quality gate — PASS

Phase 4 now has a pure browser-independent evidence-quality gate and CI regression script.

`npm run check:phase4-poor-inputs` verifies:

- dark walkthrough candidates fail closed with `LOW_LIGHT_VIDEO`;
- duplicate-heavy walkthrough candidates fail closed with `INSUFFICIENT_VISUAL_VARIETY`;
- too-few candidates fail closed with `INSUFFICIENT_VIDEO_EVIDENCE`;
- mixed-quality input excludes dark evidence but retains 8–12 useful frames;
- healthy input retains a compact 8–12 frame evidence set.

`npm run check:phase4-evidence-refs` verifies:

- model placeholders such as `evidence_0` map only to already-existing, deterministic evidence IDs;
- exact IDs remain unchanged;
- unknown references remain unchanged for strict validation to reject;
- ambiguous frame-index matches remain unchanged and fail closed.

Latest Sentinel CI includes both gates and the TypeScript/Vite production build. Commit `eb41ae3` CI: **PASS**.

### Resolved blockers during real-phone gate

- local Neon `ETIMEDOUT` / intermittent WebSocket `ErrorEvent` → transport diagnostics, fresh-client retries and automatic WebSocket/HTTP failover;
- stale Nebius Token Factory credential → fresh key verified;
- provider `At most 10 image(s)` error → max-10 perception sampling (`9f7576d`);
- empty `position.description` → optional empty spatial metadata normalization (`a3843e6`);
- model-specific unsupported object category → canonical category normalization (`09136d3`);
- malformed vision-model JSON → deterministic syntax repair followed by the same strict schema validation (`18e5cdb`);
- duplicate canonical objects inside repeat scans → canonical entity deduplication;
- production model response referencing `evidence_0` while emitting a differently named existing evidence item → bounded deterministic evidence-reference reconciliation (`c198276`).

### Production status

Production rejection guards are proven:

- unsupported video MIME → 415 `UNSUPPORTED_MEDIA_TYPE` — **PASS**;
- too-short walkthrough → 422 `VIDEO_TOO_SHORT` — **PASS**;
- too-few evidence frames → 422 `TOO_FEW_FRAMES` — **PASS**.

The previous valid production contract reached Nebius but failed on an evidence-ID mismatch: `object object_0 references missing evidence evidence_0`. Latest `main` now contains a bounded regression-tested fix.

The production contract workflow now waits until `/api/health.deploymentCommit` exactly matches the GitHub commit under test before running the valid scan, preventing stale-deployment false failures.

Current deployment blocker: GitHub's Vercel status for latest `main` is **failure due to Vercel build-rate limit**. The production contract cannot be marked passed until Vercel deploys latest `main`; do not claim the latest adapter hardening is live before then.

Canonical Phase 4 record: `Knowledge/Technical/phase-4-observation-pipeline.md`.

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite.
- Primary views: Memory / Observe / Changes.
- Browser-side video evidence extraction.
- UI uses `Observing → Understanding → Remembering`.
- Contextual Ask and Reality Diff presentation exist.
- Frontend restores authoritative environmental memory from `/api/memory`.
- Browser-carried memory is not the persistence authority.

### Scan / observation

- `src/scan/video-ingestion.ts` performs Phase 4 browser hardening.
- `src/scan/pipeline.ts` loads/saves memory through `EnvironmentalMemoryRepository`.
- `/api/scan` is repository-backed and reports persistence mode.
- Perception receives no more than 10 image frames per provider call.
- Trusted scan identity/provenance comes from SENTINEL request metadata, not model invention.
- Provider-format normalization is bounded; required semantic/evidence validation remains strict.
- Poor-input evidence selection is deterministic and continuously verified in CI.

### AI / Nebius

- Real Nebius Token Factory adapter lives in `src/ai/nebius.ts`.
- Active base: `https://api.tokenfactory.us-central1.nebius.com/v1`.
- Perception default: `openbmb/MiniCPM-V-4_5`.
- Reasoning / Ask default: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
- Malformed syntax and provider-local evidence-reference formatting are normalized only at bounded deterministic trust boundaries; semantic/evidence schema validation remains strict afterward.
- DEC-006 records the production model-routing decision.

### Environmental memory

- `EnvironmentalMemoryStore` remains the domain/state engine.
- `EnvironmentalMemoryRepository` remains the persistence contract.
- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- Historical state snapshots are immutable.
- Database persistence rejects historical snapshot mutation.
- Durable scan provenance does not trust model-generated time or globally reusable model IDs for new scans.
- Local persistence can fail over between WebSocket and SQL-over-HTTP without changing the durable memory contract.

### Diff / Ask

- `EnvironmentalDiffEngine` implements `DiffEngine`.
- `ChangeType` includes `uncertain`.
- Missing prior evidence does not automatically prove removal/resolution.
- Real-phone repeat scans have produced a non-empty rendered Reality Diff.
- `AskBuildingService` reads through the async repository.
- Historical Ask uses selected immutable snapshots.

### Action / verification

- Domain types for action plans and verification exist.
- `VerificationService` interface exists.
- Full implementations remain Phase 11/12 work.

## Phase 4 remaining gate

All local engineering, repeated real-phone, Reality Diff, and poor-input gates are now **MET**.

Before Phase 4 can be marked complete:

1. Vercel must deploy latest `main` after the current build-rate limit clears;
2. `.github/workflows/phase4-observation-contract.yml` must observe the matching `deploymentCommit` and pass the valid request with HTTP 200 + `persistence: neon`.

## Highest-priority gaps

1. **Latest-main production deployment + valid-video contract.**
2. Perception quality / condition model — Phase 5 after Phase 4 production closure.
3. Environmental state history UX/query hardening.
4. Diff Engine v2 — stable semantic matching and evidence-qualified absence/removal.
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
- Browser-carried memory is not authoritative.
- Historical states retain immutable snapshots.
- Production Nebius model routing uses MiniCPM-V for perception and NVIDIA Nemotron 3 Nano 30B-A3B for reasoning (DEC-006).

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [x] Phase 1 — Freeze the MVP contract
- [x] Phase 2 — Core architecture cleanup
- [x] Phase 3 — Persistent Environmental Memory
- [ ] Phase 4 — Observation pipeline hardening (**all local gates passed; latest-main production valid-scan gate pending**)
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

Phase 4 engineering implementation: **MET**.

Phase 4 production rejection guards: **MET**.

Phase 4 local runtime + Neon persistence: **MET**.

Phase 4 first real-phone baseline: **MET**.

Phase 4 trusted provenance hardening: **MET**.

Phase 4 repeat-scan + Reality Diff real-phone proof: **MET**.

Phase 4 repeated walkthrough / poor-input / adapter regression proof: **MET / CI PASS**.

Phase 4 latest-main production valid-video proof: **PENDING DEPLOYMENT — VERCEL BUILD-RATE LIMIT**.

**Do not formally advance to Phase 5 until the single remaining production gate passes.**
