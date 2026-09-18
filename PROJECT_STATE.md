# SENTINEL Project State

Last updated: 2026-09-18

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 5 — Perception Quality & Condition Model: ACTIVE / SECOND FRESH PROOF REDUCED DIFF NOISE / TARGETED IDENTITY AUDIT CI PASS / THIRD FRESH PROOF NEXT**

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

## Phase 4 — COMPLETE

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

### Production observation contract — PASS

The previously deferred latest-main Vercel contract is now closed.

Phase 4 Observation Contract run `35331268053` detected the exact deployed commit `c55177642a1b7988a7144d1f228925aed9eb9e14` and verified:

- fresh production deployment matched `/api/health.deploymentCommit`;
- unsupported video MIME → 415 `UNSUPPORTED_MEDIA_TYPE`;
- too-short walkthrough → 422 `VIDEO_TOO_SHORT`;
- too-few evidence frames → 422 `TOO_FEW_FRAMES`;
- valid 8-frame walkthrough → HTTP 200;
- `persistence: neon`;
- State v1 created successfully.

Production contract environment: `phase4-contract-35331268053`.

Phase 4 is therefore fully complete; there is no remaining deployment-freshness debt for this gate.

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
- explicitly grounded observed access cue threshold = **0.60** confidence;
- observed hazard → at most `high`;
- observed damage / maintenance / access / compliance → `medium`;
- observed attention / unknown → `low`;
- inferred conditions → at most `medium`;
- perception alone can never create a `critical` issue.

The 0.60 access exception is limited to directly observed explicit access-route obstruction wording. It does not lower the 0.85 threshold for deterministic inferred conditions.

The old keyword-regex path that promoted words such as `hazard`, `broken`, or `leak` from free-text observations has been removed for new scans.

### Grounded structured access reasoning — IMPLEMENTED / HARDENED

The warehouse comparison exposed a composition failure rather than a basic perception failure: MiniCPM directly observed both the pallet jack placement and the exit signage but returned no operational condition.

SENTINEL now deterministically derives an Inferred `access` condition only when:

- a separate evidence-backed observation/object independently grounds the door as an emergency exit;
- an evidence-backed obstacle is explicitly in front of/across/blocking that same door;
- the spatial direction is obstacle → door, not reversed;
- confidence remains above the unchanged inferred threshold after a downward bound;
- no equivalent access condition already exists.

A door named `green emergency exit door` cannot self-ground its own exit role. A bounded color-anchored alias may connect that object to grounded wording such as `green door`, but independent exit signage is still required.

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

### Conservative object identity — IMPLEMENTED / HARDENED

Future scans now resolve a small whitelist of obvious provider aliases without general fuzzy matching.

Supported warehouse families include:

- shelving/racking naming drift;
- plural box/carton aggregate naming drift;
- floor and ceiling naming drift;
- fire-extinguisher category drift;
- exit-sign naming drift;
- color-anchored door drift such as `green emergency exit door` ↔ `green door`.

Cross-scan matching remains unique one-to-one. Unanchored generic door names remain excluded.

Within a single scan, scene/audit aliases consolidate only when they share trusted frame evidence and do not contradict position. Exact same-name/category duplicates may collapse only across SENTINEL's controlled scene→audit boundary (`audit_` provenance); exact same-pass detections remain separate to protect repeated physical instances. Repeated objects without shared grounding remain separate.

This applies only to future ingestion. Historical snapshots and persisted diffs are immutable and are not rewritten.

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

The hardened warehouse regression suite additionally verifies:

- independent emergency-exit grounding is required;
- `green emergency exit door` can bind to grounded `green door` wording without weakening the inferred threshold;
- the door object cannot self-ground its own emergency role;
- safe/reversed placement does not create obstruction;
- inference chaining is rejected;
- color-anchored door aliases are allowed while unanchored generic doors remain excluded;
- same-scan aliases require shared evidence + compatible position;
- repeated ambiguous objects remain separate;
- warehouse alias drift collapses to the real pallet-jack addition rather than fake add/not-reobserved noise.

Sentinel CI run `35331412827` passed the full repository suite on commit `dcda069cf0005c34685a6a8f1bde0ddde00c92b5`, including Phase 4 quality gates, provider grounding, perception retry, the sharpened condition audit, Phase 5 trust, condition derivation, Reality Diff position semantics, cross-pass object identity, and the TypeScript/Vite production build.

Canonical Phase 5 record: `Knowledge/Technical/phase-5-condition-model.md`.

## Phase 5 controlled warehouse checkpoint

Environment: `env_warehouse_6dba83ca`.

Neon inspection confirms the persisted comparison source directly observed:

- `orange pallet jack` — **“An orange pallet jack in front of the green door.”** — confidence 1.00;
- `emergency exit sign` — **“An emergency exit sign above the green door.”** — confidence 1.00.

The historical baseline also exposed same-scan provider duplication such as both `green emergency exit door` and `green door`, while the comparison emitted several semantic aliases for shelves/boxes/floor/ceiling.

The pre-hardening state still produced zero operational issues and an inflated Reality Diff. Those historical states/diffs remain immutable.

Current `main` now owns the missing behaviors deterministically:

- compose independently grounded exit identity + obstacle placement into one bounded Inferred access condition;
- connect the verbose/short green-door wording without allowing the door to self-ground its emergency role;
- consolidate obvious same-scan aliases only when shared trusted evidence and compatible position support one physical identity;
- use the same conservative identity families across durable memory and Reality Diff.

## Fresh warehouse proof attempt — FAILED / DIAGNOSED

Environment: `env_warehouse1_1bd4a50c`.

A fresh local baseline/comparison run on 2026-09-18 exposed two remaining Phase 5 quality failures:

- State v2 persisted **2 normal conditions and 0 issues**; no derived access condition survived into durable memory.
- MiniCPM observed the emergency-exit sign, but misclassified the intended orange pallet jack as **`green door ramp`**, so SENTINEL correctly refused to manufacture an obstruction from uncertain taxonomy.
- The baseline also mislabeled the portable extinguisher as **`fire hydrant`**.
- Scene + condition-audit exact duplicate objects were persisted separately, and the v1→v2 Reality Diff expanded to **20 changes** dominated by pass duplication and naming drift.

This result is important: SENTINEL did **not** weaken policy to force a desired issue. The inferred threshold remains 0.85, and a generic ramp is not treated as an obstruction.

Post-failure hardening on `main` now:

- collapses exact scene/audit duplicates only across the controlled `audit_` boundary when trusted evidence and position agree;
- keeps exact same-pass duplicates separate;
- recognizes `boxed items` / `boxed goods` as the conservative box family;
- supplies prior durable object names to perception as **naming context only, never evidence**;
- explicitly asks MiniCPM to distinguish pallet jack/cart/trolley from ramps and portable extinguishers from hydrants/standpipes;
- asks the audit pass to independently re-check taxonomy rather than blindly repeat the scene label;
- requires visible exit signage to be emitted as a durable signage object when supported;
- logs provider audit count separately from the final post-derivation policy result through `SENTINEL_CONDITION_DERIVATION_COMPLETED` and `SENTINEL_SCAN_POLICY_RESULT`.

Historical states and the 20-change diff for this failed proof remain immutable.

## Second fresh warehouse proof — PARTIAL PASS / TAXONOMY MISS REMAINS

Environment: `env_warehouse2_6a1cb840`.

This run demonstrated that the previous cross-pass identity hardening worked:

- State v1: `state_e4564d64-e765-4164-90a8-bd4af56ee766`;
- State v2: `state_0ac8254e-7d17-454e-847e-ab2e404ab63f`;
- both states persisted through Neon;
- the extinguisher remained correctly identified as `fire extinguisher`;
- the emergency-exit sign persisted as a durable signage object;
- the v1→v2 Reality Diff shrank from the prior failed proof's **20 changes** to just **2 changes**.

The remaining diff was:

- `added` — **New: orange ramp** — confidence 1.00;
- `uncertain` — **Not re-observed: cardboard boxes** — confidence 0.50.

The terminal correctly reported:

- `derivedConditions: 0`;
- `operationalConditionsAfterDerivation: 0`;
- `conditionsPersisted: 1`;
- `issuesPromoted: 0`.

Neon confirms why. The comparison source visually grounded an emergency-exit sign, but both broad scene/audit reasoning still labeled the access-adjacent orange object as **`orange ramp`** / **“orange ramp in front of the green door”** instead of pallet jack/trolley/cart. SENTINEL therefore correctly refused to manufacture an obstruction issue from the wrong taxonomy.

The remaining `cardboard boxes` noise came from singular/plural provider drift (`cardboard boxes` ↔ `cardboard box`), not a real environmental change.

Post-run hardening on `main` now adds:

- singular `box` / `carton` forms to the conservative durable box family;
- a **targeted identity audit** that runs only when exit context exists, no operational condition was found, and an access-adjacent object has ambiguous ramp/equipment/cart/trolley/pallet taxonomy;
- the targeted pass must classify from visible morphology only and explicitly rejects filenames/metadata as evidence;
- it distinguishes movable pallet jack/trolley/cart features from a true sloped/bridging ramp;
- if still uncertain, it must stay generic rather than forcing a pallet-jack label or access condition.

Sentinel CI run `35333800689` passed the full repository suite and production build on commit `f835b64f4957c2053e48787a812eb7067d2724e6`, including the new ambiguous-ramp → targeted-identity-audit regression.

## Phase 5 next proof

Pull latest `main` and use a **third fresh warehouse validation environment**; do not reuse `env_warehouse1_1bd4a50c` or `env_warehouse2_6a1cb840`. Scan the clean baseline once and the obstructed comparison once.

Expected proof:

1. the movable obstruction is stably identified as a pallet jack/cart/trolley rather than a ramp, and the wall-mounted safety device is not confused with a hydrant;
2. direct pallet-jack and exit-sign facts remain Observed, with the exit sign represented in durable object memory;
3. one derived access condition appears as Inferred and Present;
4. the condition retains both grounded evidence sources;
5. policy promotes it to a medium access issue, never critical;
6. cross-pass duplicates and green-door/shelving/boxes/floor/ceiling/extinguisher/sign aliases do not dominate Reality Diff;
7. the pallet jack remains the meaningful added object;
8. `SENTINEL_CONDITION_DERIVATION_COMPLETED` reports the post-derivation count and `SENTINEL_SCAN_POLICY_RESULT` reports the persisted issue count;
9. Ask Building preserves the Observed/Inferred distinction.

Inspect durable memory using the fresh validation environment ID via:

`/api/memory?environmentId=<fresh-warehouse-environment-id>`

Expected fields include top-level `conditions`, latest-state `conditionIds`, the derived access condition, and a medium access issue when the grounded facts satisfy policy.

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

1. **Phase 5 third fresh controlled warehouse baseline/comparison re-scan on the targeted identity-audit build.**
2. Condition quality tuning based on real model output.
3. Environmental state history UX/query hardening — Phase 6.
4. Diff Engine v2 — richer repeated-instance matching + first-class condition transitions — Phase 7.
5. Action + verification closed loop — Phases 11/12.
6. Reliability, automated tests, security, and least-privilege database-role hardening.

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
- Derived access reasoning requires independent grounded exit identity plus explicit obstacle placement.
- Inferred condition threshold remains 0.85; the 0.60 access exception is observed-only.
- Object aliases remain whitelist-based, evidence-conscious, and conservative; exact duplicate collapse is allowed only across the controlled scene/audit boundary; historical memory is never rewritten.
- Prior environmental memory may guide stable naming but is never perception evidence and never proves current presence.
- Provider/audit `operationalConditions` counts are not the final policy result; post-derivation and post-persistence telemetry are authoritative for this Phase 5 proof.
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
- [x] Phase 4 — Observation pipeline hardening (**COMPLETE — local/real-phone + exact latest-main production contract passed**)
- [ ] Phase 5 — Perception quality and condition model (**ACTIVE — second fresh proof reduced Reality Diff to 2 changes; targeted identity-audit hardening passed CI; third fresh proof next**)
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

Phase 4 observation pipeline + latest-main Vercel valid-video proof: **COMPLETE / PASS (`35331268053`)**.

Phase 5 core domain + trust policy: **MET**.

Phase 5 strict condition/evidence validation: **MET**.

Phase 5 durable condition memory + Ask context: **MET**.

Phase 5 hardened trust/independent-derivation/taxonomy/identity gates + build: **CI PASS (`35331412827`, commit `dcda069c`)**.

Phase 5 first fresh warehouse proof (`env_warehouse1_1bd4a50c`): **FAILED / ROOT CAUSES DIAGNOSED**.

Phase 5 second fresh warehouse proof (`env_warehouse2_6a1cb840`): **PARTIAL PASS — DIFF NOISE FIXED, TAXONOMY STILL BLOCKED DERIVATION**.

Phase 5 targeted identity-audit hardening: **CI PASS (`35333800689`, commit `f835b64f`)**.

Phase 5 third fresh post-hardening warehouse condition-quality proof: **PENDING**.

**Next gate: pull latest `main`, run the Phase 5 gates/build locally, then perform a third fresh warehouse baseline/comparison re-scan and verify the targeted identity audit resolves or safely preserves the ambiguous object before evaluating derivation, issue promotion, and Reality Diff.**
