# SENTINEL Project State

Last updated: 2026-09-15

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 5 — Perception Quality & Condition Model: ACTIVE / CORE TRUST MODEL IMPLEMENTED / REAL-PHONE VALIDATION NEXT**

## Phase 3 — COMPLETE

Persistent Environmental Memory passed its engineering, database, deployment, and real production scan gates.

Verified:

- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- `DATABASE_URL` is server-only and persistence reports `neon`.
- Dedicated Neon project `sentinel-physical-memory` is active in `aws-us-east-2`.
- Canonical aggregate + normalized persistence is active.
- Immutable historical snapshots survive database round-trips.
- Postgres rejects rewrites of already persisted historical snapshots.
- Production `/api/health`, `/api/memory`, `/api/scan`, and `/api/ask-building` loaded correctly on Node 22 during Phase 3 verification.
- Real production Scan A and Scan B executed through Nebius Token Factory and persisted through Neon.
- Fresh memory reads restored server-authoritative state without client resubmission.
- State A remained immutable after Scan B.
- The persisted A→B Reality Diff contained two changes.
- MONIFlow and Hustle remain untouched in Supabase.

Canonical Phase 3 proof: `Knowledge/Technical/phase-3-production-proof.md`.

## Phase 4 — COMPLETE FOR CURRENT AED BUILD TRACK

Observation Pipeline Hardening completed its local/engineering and real-phone gates.

Verified:

- browser candidate-frame sampling with temporal spread;
- duplicate and low-light rejection;
- MP4, MOV/M4V, and WebM handling with filename MIME fallback;
- resize + adaptive JPEG compression under the request budget;
- 5–90 second hard duration guard with 30–60 seconds preferred;
- metadata/seek timeouts and recoverable ingestion errors;
- `/api/scan` body/media/frame/timestamp/data-URL guards with explicit 413/415/422 responses;
- MiniCPM-V maximum 10 perception images with temporal coverage preserved;
- trusted nested scan identity/provenance normalization;
- optional empty spatial metadata normalization;
- canonical object-category normalization;
- deterministic malformed-JSON syntax repair followed by strict semantic validation;
- deterministic evidence-reference reconciliation only when an existing evidence item can be matched unambiguously;
- source-owned capture time and durable IDs;
- canonical scan entity deduplication;
- local Neon WebSocket/HTTP transport diagnostics, retries, and failover;
- deterministic CI quality gates for dark, duplicate-heavy, too-few, mixed-quality, and healthy walkthrough evidence;
- deterministic CI regression gate for model evidence-reference mismatch behavior.

### Real-phone proof

`office-demo` reached:

- **3** persisted states;
- **2** persisted diffs;
- current State v3: `state_efde5f1d-4e36-4baf-b8b2-17f311a1c2ef`;
- rendered `What changed.` Reality Diff.

Latest demonstrated Reality Diff:

- `added` — **New: desk** — confidence 0.95;
- `added` — **New: cable** — confidence 0.90;
- `added` — **New: person** — confidence 0.80;
- `uncertain` — **Not re-observed: HGC logo** — confidence 0.50;
- `uncertain` — **Not re-observed: sofa** — confidence 0.50.

The two non-observations remain `uncertain`; absence alone is not treated as proof of removal.

### Phase 4 automated gates

`npm run check:phase4-poor-inputs` verifies:

- dark walkthrough → `LOW_LIGHT_VIDEO`;
- duplicate-heavy walkthrough → `INSUFFICIENT_VISUAL_VARIETY`;
- too-few candidates → `INSUFFICIENT_VIDEO_EVIDENCE`;
- mixed-quality input excludes dark evidence and keeps a useful compact set;
- healthy input keeps 8–12 evidence frames.

`npm run check:phase4-evidence-refs` verifies:

- deterministic model placeholders map only to existing evidence;
- exact IDs remain unchanged;
- unknown references fail closed;
- ambiguous frame-index references fail closed.

### Deferred production debt

The latest-main Vercel valid-video contract was **not** passed before Phase 4 transition.

Vercel was rejecting new deployments because of the project build-rate limit. The user explicitly chose not to block the AED build cycle on that infrastructure limit and will pull/test GitHub locally.

This is a deferred production re-verification item, not a passed gate. When deployment capacity is available, rerun `.github/workflows/phase4-observation-contract.yml` against the matching `deploymentCommit` and record the result.

Canonical Phase 4 record: `Knowledge/Technical/phase-4-observation-pipeline.md`.
Archive transition record: `Archive/phase-4-transition-note.md`.

## Phase 5 checkpoint — ACTIVE

### Objective

Separate **what SENTINEL directly observed** from **what SENTINEL inferred**, represent environmental conditions explicitly, and prevent weak perception inference from silently becoming an operational issue.

Trust hierarchy:

- **Observed** — directly supported by supplied evidence;
- **Inferred** — interpretation of evidence with lower epistemic authority;
- **Recommended** — reserved for later Action Planner work, not perception.

### Core condition model — IMPLEMENTED

The domain now includes:

- `ClaimBasis = observed | inferred`;
- `ConditionKind = normal | attention | hazard | damage | maintenance | access | compliance | unknown`;
- `ConditionStatus = present | uncertain`;
- `EnvironmentalCondition`;
- `EnvironmentalState.conditionIds`;
- `EnvironmentalStateSnapshot.conditions`;
- `EnvironmentalMemory.conditions`.

Every direct perception `Observation` is explicitly `basis: observed`.

### Perception trust boundary — IMPLEMENTED

The Nebius perception response now has six top-level collections:

`sourceId + observations + objects + conditions + relations + evidence`

Rules enforced:

- observations are direct visible facts only;
- diagnosis, cause, risk prediction, and recommendation must not be encoded as observations;
- conditions carry `basis: observed | inferred` and `status: present | uncertain`;
- inferred conditions default conservatively toward `uncertain`;
- every condition must reference existing evidence;
- referenced condition object IDs must exist in the same perception result;
- trusted scan `capturedAt` replaces model-provided condition time;
- condition evidence placeholders are normalized only when an existing evidence item can be resolved deterministically;
- unknown or ambiguous references still fail closed.

### Issue-promotion policy — IMPLEMENTED

The model no longer decides whether a condition becomes an operational issue.

`src/perception/condition-model.ts` owns the policy:

- `normal` → never an issue;
- `uncertain` → never auto-promoted;
- no evidence → never auto-promoted;
- observed threshold = **0.65** confidence;
- inferred threshold = **0.85** confidence;
- observed hazard → at most `high`;
- observed damage / maintenance / access / compliance → `medium`;
- observed attention / unknown → `low`;
- inferred conditions → at most `medium`;
- perception alone can never create a `critical` issue.

The old keyword-regex path that promoted words such as `hazard`, `broken`, or `leak` from free-text observations has been removed for new scans.

### Durable memory — IMPLEMENTED

For new scans:

- condition IDs become source-scoped durable IDs;
- condition evidence IDs map to durable source-scoped evidence IDs;
- condition object IDs map to canonical durable object IDs;
- condition `observedAt` is trusted scan capture time;
- conditions are included in state membership and immutable snapshots;
- only policy-qualified conditions become operational issues.

Older Phase 3/4 memory remains backward-compatible:

- missing `conditions` hydrate as `[]`;
- old states hydrate with `conditionIds: []`;
- old snapshots hydrate with `conditions: []`;
- old observations hydrate with `basis: observed`.

The canonical Neon JSON aggregate already stores the new condition data without requiring a runtime database migration.

### Ask the Building — IMPLEMENTED

Reasoning context now includes `RELEVANT CONDITIONS` and explicit trust labels:

- `trust=Observed`
- `trust=Inferred`

Nemotron is instructed to treat inferred conditions as lower-authority interpretation rather than direct physical fact.

### Phase 5 CI gate — PASS

`npm run check:phase5-conditions` verifies:

- observed evidence-backed hazard can become operational;
- observed hazard is capped at `high`, never `critical`;
- hazard maps to safety issue type;
- strong inferred conditions use the higher threshold and are capped at `medium`;
- weak inference remains context-only;
- uncertain conditions never auto-promote;
- normal conditions remain memory context;
- conditions must reference existing evidence and objects;
- missing evidence fails closed;
- missing object references fail closed.

Sentinel CI run `34952118344` passed:

- Phase 4 poor-input gate;
- Phase 4 evidence-reference gate;
- Phase 5 condition trust gate;
- TypeScript/Vite production build.

Canonical Phase 5 record: `Knowledge/Technical/phase-5-condition-model.md`.

## Phase 5 next proof

Pull latest `main` and validate with a real phone walkthrough containing one deliberately safe and obvious visual condition, for example:

- a loose cable laid across a walkway;
- a chair deliberately blocking a passage;
- another harmless staged state with a clear visual signal.

Expected proof:

1. direct visible facts appear under `observations`;
2. interpretation appears separately under `conditions`;
3. each condition has the appropriate `basis` and `status`;
4. condition evidence IDs resolve to supplied frames;
5. weak/uncertain inference does not become an issue;
6. a sufficiently supported present condition may be promoted by SENTINEL policy;
7. Ask Building preserves the Observed/Inferred distinction.

Inspect durable memory at:

`/api/memory?environmentId=office-demo`

Expected new fields include top-level `conditions` and latest-state `conditionIds`.

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite.
- Primary views: Memory / Observe / Changes.
- Browser-side video evidence extraction.
- UI uses `Observing → Understanding → Remembering`.
- Contextual Ask and Reality Diff presentation exist.
- Frontend restores authoritative environmental memory from `/api/memory`.
- Browser-carried memory is not the persistence authority.
- Phase 5 condition trust labels are available in API/memory/reasoning context; dedicated visual treatment in the main UI is not yet a Phase 5 exit requirement and can be refined later.

### AI / Nebius

- Perception: `openbmb/MiniCPM-V-4_5`.
- Reasoning / Ask: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
- Active Token Factory base: `https://api.tokenfactory.us-central1.nebius.com/v1`.
- DEC-006 records model routing.

### Environmental memory

- `EnvironmentalMemoryStore` remains the state engine.
- `EnvironmentalMemoryRepository` remains the persistence contract.
- `NeonEnvironmentalMemoryRepository` is the active durable implementation.
- Historical snapshots remain immutable.
- Conditions now participate in state snapshots while Phase 7 remains responsible for full condition-aware diff semantics.

### Diff / Ask

- `EnvironmentalDiffEngine` remains deterministic.
- Missing prior evidence does not automatically prove removal/resolution.
- Phase 5 carries conditions through snapshots but does not yet compare condition transitions as first-class diff changes; that belongs to Phase 7.
- Ask Building now receives condition trust labels.

## Highest-priority gaps

1. **Phase 5 real-phone Observed vs Inferred condition proof.**
2. Condition quality tuning based on real model output.
3. Environmental state history UX/query hardening — Phase 6.
4. Diff Engine v2 — semantic matching + first-class condition transitions — Phase 7.
5. Action + verification closed loop — Phases 11/12.
6. Deferred latest-main Vercel production re-verification.
7. Reliability, automated tests, security, and least-privilege database-role hardening.

## Locked decisions

- SENTINEL = persistent environmental memory + change verification.
- Primary user = facility / operations manager.
- Demo environment = one controlled office.
- Track = Best Apps and Agents.
- No full metric 3D/BIM requirement for MVP.
- Evidence-first safety language.
- UI direction = Living Spatial Intelligence.
- Observed, Inferred, and Recommended are distinct trust layers.
- Perception cannot independently create a critical operational issue.
- All durable memory access goes through `EnvironmentalMemoryRepository`.
- Neon Postgres is the active durable store (DEC-005).
- Browser-carried memory is not authoritative.
- Historical states retain immutable snapshots.
- Production model routing uses MiniCPM-V for perception and NVIDIA Nemotron 3 Nano 30B-A3B for reasoning (DEC-006).

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [x] Phase 1 — Freeze the MVP contract
- [x] Phase 2 — Core architecture cleanup
- [x] Phase 3 — Persistent Environmental Memory
- [x] Phase 4 — Observation pipeline hardening (**local/engineering track complete; latest-main Vercel re-verification deferred and tracked**)
- [ ] Phase 5 — Perception quality and condition model (**ACTIVE — core model + CI passed; real-phone validation next**)
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

Phase 4 current AED build track: **COMPLETE**.

Phase 4 latest-main Vercel valid-video proof: **DEFERRED / NOT PASSED**.

Phase 5 core domain + trust policy: **MET**.

Phase 5 strict condition/evidence validation: **MET**.

Phase 5 durable condition memory + Ask context: **MET**.

Phase 5 automated trust gate + build: **CI PASS**.

Phase 5 real-phone condition-quality proof: **PENDING**.

**Next gate: pull latest `main`, run the Phase 5 condition test/build locally, then perform one representative real-phone condition walkthrough.**
