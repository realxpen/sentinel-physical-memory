# SENTINEL Project State

Last updated: 2026-09-20

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 8 — Reality Diff UI: IMPLEMENTED / PHONE PROOF PARTIAL / DUPLICATE-SURFACE HARDENING CI PASS; PHASE 7 REAL THREE-CHANGE PROOF STILL PENDING**

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

## Phase 5 — COMPLETE

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
- an evidence-backed obstacle is explicitly in front of/across/blocking that same door, either through direct grounded wording or an explicit grounded `in_front_of` obstacle→door relation;
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

- shelf/shelves/shelving/rack/racking naming drift;
- plural box/carton aggregate naming drift;
- floor and ceiling naming drift;
- fire-extinguisher category drift;
- exit-sign naming drift;
- color-anchored door drift such as `green emergency exit door` ↔ `green door`.

Cross-scan matching remains unique one-to-one. Unanchored generic door names remain excluded.

Within a single scan, cross-pass aliases consolidate only when they share trusted frame evidence and do not contradict position. Exact same-name/category duplicates may collapse across distinct SENTINEL-controlled scene / condition-audit / identity / geometry passes; exact same-pass detections remain separate to protect repeated physical instances. Repeated objects without shared grounding remain separate.

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

## Third fresh warehouse proof — CLEAN DIFF + TAXONOMY PASS / GEOMETRY FACT MISSING

Environment: `env_warehouse3_64751084`.

This run passed the two previously failing perception-quality sub-gates:

- State v1: `state_ed889a7d-c833-4133-96f1-dfff466aedad`;
- State v2: `state_0d594930-99d2-4f96-b839-b31d015e54ce`;
- the comparison correctly persisted **`orange pallet jack`** at confidence 1.00;
- the emergency-exit door/sign and extinguisher remained stable durable identities;
- the v1→v2 Reality Diff contained exactly **1 change**: **New: orange pallet jack**;
- the earlier false `cardboard boxes` non-observation disappeared.

The remaining failure was narrower:

- `derivedConditions: 0`;
- `operationalConditionsAfterDerivation: 0`;
- `conditionsPersisted: 1`;
- `issuesPromoted: 0`.

Neon shows the pallet jack was correctly identified, but its grounded description was only **“orange and green pallet jack with wheels”**. The exit door and exit sign were independently grounded, but no current-scan fact explicitly stated the pallet jack's obstacle→door placement, and no grounded `in_front_of` relation was emitted. SENTINEL correctly refused to infer obstruction from shared image-center positioning or generic proximity.

Post-run hardening on `main` now adds a bounded **access-geometry audit**:

- it runs only when independent exit context and a visible pallet-jack/trolley/cart/obstruction candidate exist but explicit placement is still missing;
- it asks MiniCPM only to verify obstacle↔door geometry from the current trusted frames;
- a structured `in_front_of` relation is accepted only in the direction obstacle → door and only with grounded evidence;
- `near`, beside, left/right, or merely occupying the same image center are explicitly insufficient;
- filenames, metadata, prior memory, and prior model wording are explicitly excluded as evidence;
- if geometry remains unclear, the pass must emit no relation/condition;
- deterministic condition derivation now accepts the explicit grounded `in_front_of` relation as placement evidence while preserving the independent exit-sign requirement and unchanged 0.85 inferred threshold.

Exact duplicates emitted by the new identity/geometry passes may consolidate across distinct SENTINEL-controlled passes when shared evidence and compatible position establish one physical object; exact duplicates from the same pass remain protected.

Sentinel CI run `35335200200` passed the full repository suite and production build on commit `3e1046c88d7a2156aff666d412412e5c60f37d67`, including:

- targeted condition audit;
- identity-audit regression;
- access-geometry-audit regression;
- grounded text and structured-relation derivation;
- reversed-direction rejection;
- conservative cross-pass identity;
- Reality Diff position semantics;
- production TypeScript/Vite build.

Historical `warehouse3` states and its zero-issue result remain immutable.

## Fourth fresh warehouse proof — ACCESS REASONING PASS / MEMORY MULTIPLICITY CLEANUP NEEDED

Environment: `env_warehouse4_4a96a4d1`.

This run passed the core Phase 5 condition-trust scenario end-to-end for the first time.

Persisted comparison State v2:

- `state_c4e506db-4628-4a4c-94b6-18d228fa752b`;
- `pallet jack` — equipment — confidence 1.00 — **“Orange pallet jack in front of the door.”**;
- `emergency exit sign` — signage — confidence 1.00;
- `green door` — door — confidence 1.00;
- one promoted issue:
  - **Emergency exit access obstructed**
  - type: `access`
  - severity: `medium`
  - confidence: **0.90**.

Terminal telemetry confirmed:

- derived access condition present at **0.90** confidence;
- `issuesPromoted: 1`.

So the trust path itself is now proven against a fresh realistic scan:

`Observed pallet jack + Observed exit context + grounded placement → Inferred access condition → medium issue`

without lowering the 0.85 inferred threshold and without allowing perception to create a critical issue.

However, Neon inspection exposed two cleanup defects that prevent Phase 5 from closing yet:

1. the same semantic inferred access condition persisted **three times** because scene/identity/geometry pass-local door aliases mapped to one durable door only after derivation;
2. the baseline provider emitted several repeated same-family object mentions across frames, causing an inflated Reality Diff even though the physical scene was stable.

The historical warehouse4 state/diff remain immutable.

Current `main` now hardens both boundaries:

- equivalent conditions are consolidated **after scan-local object IDs are mapped to canonical durable IDs**, keyed by kind + basis + status + normalized title + canonical object set; evidence is unioned and confidence is preserved conservatively;
- Reality Diff keeps conservative one-to-one identity, but when multiplicity inside a whitelisted semantic family is unresolved on one/both sides, SENTINEL suppresses fake add/not-reobserved claims instead of pretending instance counts are known;
- this suppression applies only when the same conservative family exists on both sides; genuinely new non-family objects such as the pallet jack still appear;
- singular `shelf` / `rack` now belong to the existing shelving family;
- perception is explicitly told to treat all frames as one walkthrough, avoid one-object-per-frame repetition, and not emit the overall environment itself (for example `warehouse`) as a SpatialObject unless a distinct bounded room/area identity is supported.

Sentinel CI run `35339258094` passed the full repository suite and production build on commit `9f5fbb2f2e2aa55ce0c5f173acb8f56a8715bf9c`, including:

- exactly one persisted semantic access condition after canonical object remapping;
- targeted access-geometry regression;
- conservative object identity;
- unresolved family-multiplicity diff suppression;
- genuine new-object preservation;
- Phase 5 trust and derivation gates;
- TypeScript/Vite production build.

## Fifth fresh warehouse proof — CONDITION DEDUPE PASS / ONE SIGNAGE COMPLETENESS MISS

Environment: `env_warehouse5_a9589829`.

This run verified the canonical-condition and issue-promotion fixes against a fresh scan:

- State v1: `state_3857ef1c-10d0-4dcd-a051-b09055d4ed00`;
- State v2: `state_78aa6297-ce49-4a63-8191-a4388985d136`;
- `conditionsPersisted: 2`;
- `issuesPromoted: 1`;
- one persisted semantic `Emergency exit access obstructed` condition;
- condition basis: `inferred`;
- condition status: `present`;
- confidence: **0.855**, still above the unchanged 0.85 inferred threshold;
- exactly one promoted issue:
  - type: `access`
  - severity: `medium`
  - confidence: **0.855**.

So the Phase 5 trust path, semantic-condition dedupe, and issue-promotion policy all passed together on a fresh realistic run.

Reality Diff was reduced to three changes:

- **New: orange pallet jack** — real;
- **New issue: Emergency exit access obstructed** — real;
- **New: green emergency exit sign** — false physical change.

Neon inspection showed why the sign change is false: the baseline door was grounded as **“green door with exit sign above”**, but MiniCPM failed to emit a separate signage object in State v1. State v2 did emit `green emergency exit sign`, so the deterministic diff correctly compared the persisted object sets but surfaced a perception-completeness miss as an apparent addition.

Historical Warehouse 5 states and diff remain immutable.

Current `main` now adds one bounded grounded-object completion rule:

- when direct grounded observation/object text explicitly contains `exit sign` or `emergency exit sign`;
- and no durable exit-sign/signage object exists in that scan;
- SENTINEL materializes one signage object using only the same trusted evidence IDs and a non-increasing confidence;
- generic `exit`, door naming alone, prior memory, filenames, and metadata do **not** trigger materialization.

This is not a new inference path. It only preserves an already-explicit visual fact as a durable object so Reality Diff does not later call an already-present sign “new.”

Sentinel CI run `35342332725` passed the full repository suite and build on commit `c47867594230633beade63389e59e9e7e642f5d1`, including a regression where the provider explicitly says **“green door with exit sign above”** but omits a signage object; SENTINEL now persists exactly one grounded exit-sign object.

## Sixth fresh warehouse proof — PHASE 5 EXIT GATE PASSED

Environment: `env_warehouse5_cbe5dde8`.

This fresh baseline/comparison run closes Phase 5.

Persisted states:

- State v1: `state_c60cc223-9f0b-4519-beae-69a447b4c50e`;
- State v2: `state_d8db8374-fd23-403b-ae05-c791fb96a97b`.

State v1 durably remembered the stable warehouse context, including:

- `green emergency exit door`;
- `green exit sign`;
- `red fire extinguisher`;
- `metal shelving units`;
- `cardboard boxes`.

State v2 persisted:

- `orange pallet cart` — confidence 1.00 — **“Orange pallet cart positioned in front of the green emergency exit door.”**;
- one semantic `Emergency exit access obstructed` condition;
- basis: `inferred`;
- status: `present`;
- confidence: **0.90**;
- exactly one promoted issue;
- issue type: `access`;
- severity: `medium`;
- issue confidence: **0.90**.

Terminal policy telemetry confirmed:

- `conditionsPersisted: 2`;
- `issuesPromoted: 1`.

The persisted Reality Diff contains exactly two meaningful changes:

1. **New: orange pallet cart** — confidence 1.00;
2. **New issue: Emergency exit access obstructed** — confidence 0.90.

No false exit-sign addition remained. No stable door, shelving, box, or extinguisher add/not-reobserved noise survived the diff.

This proves the Phase 5 trust loop on a fresh realistic scan:

`Observed physical facts → deterministic Inferred condition → SENTINEL-owned issue promotion → durable memory → clean Reality Diff`.

The inferred threshold remained **0.85**, the derived condition stayed below/at the bounded source confidence, and perception still did not create a critical issue.

Historical Warehouse 1–5 proof states/diffs remain immutable and are retained as evidence of the hardening progression.

## Phase 5 exit condition — MET

Phase 5 is complete for the current AED build track.

Exit condition satisfied:

- real/controlled realistic scans produce evidence-grounded observations and conditions;
- Observed and Inferred remain distinct;
- weak/uncertain inference does not auto-promote;
- strong supported conditions persist durably;
- issue promotion remains deterministic SENTINEL policy;
- conservative identity + diff handling avoids provider naming/multiplicity noise in the demonstrated warehouse case;
- the resulting condition/issue are available to the existing reasoning/memory layer without collapsing observation, interpretation, and recommendation.

Canonical technical record:

`Knowledge/Technical/phase-5-condition-model.md`

Transition record:

`Archive/phase-5-transition-note.md`

## Phase 6 — COMPLETE

### Objective

Make time a first-class product feature without sacrificing historical truth.

Phase 6 implements reliable retrieval of:

- current state;
- previous state;
- state by ID;
- state by date/time.

The date/time selector uses **latest state captured at or before the requested timestamp**.

### Immutable historical snapshot contract — IMPLEMENTED

`EnvironmentalStateSnapshot` now preserves:

- objects;
- conditions;
- issues;
- relations.

Historical retrieval never reconstructs a past state from today's mutable canonical objects/relations.

Older pre-Phase-6 snapshots that do not contain relation snapshots hydrate with `relations: []` rather than leaking today's mutated relation values backward into history.

`src/memory/history.ts` owns deterministic history selection and returns defensive clones.

### State History API — IMPLEMENTED

`GET /api/states?environmentId=<id>`

returns the lightweight timeline.

Supported selectors:

- `selector=current`;
- `selector=previous`;
- `stateId=<state-id>`;
- `at=<ISO-date-time>`.

Only one selector may be supplied per request. Missing environments/states fail explicitly rather than silently falling back to current memory.

### Memory timeline UI — IMPLEMENTED

The existing **Memory** destination now includes **State history** without adding another primary navigation item.

Users can:

- inspect the current immutable state;
- inspect the previous state;
- open any state by timeline card / state ID;
- jump to the latest state at or before a chosen date/time;
- move older/newer inside the historical-state drawer;
- inspect the exact objects, conditions, issues and relation count captured in that state.

The UI explicitly labels historical inspection as immutable truth and does not replace the current-memory canvas with a generic dashboard.

### Automated gate — PASS

`npm run check:phase6-history` verifies:

- current selector;
- previous selector;
- state-by-ID selector;
- state-by-date selector;
- exact timestamp inclusion;
- no state before first capture;
- immutable object values after later canonical updates;
- immutable relation confidence/evidence after later scans;
- defensive-clone behavior;
- invalid date rejection.

Sentinel CI run `35349163148` passed the complete repository suite and production build on commit `5df1b881e160ee8b0f12b858af41431eea673a08`.

### Real persisted-history proof — Neon

The final Phase 5 warehouse environment also proves the Phase 6 historical invariant against durable Neon snapshots:

Environment: `env_warehouse5_cbe5dde8`.

- State v1: `state_c60cc223-9f0b-4519-beae-69a447b4c50e`;
- State v2: `state_d8db8374-fd23-403b-ae05-c791fb96a97b`.

The same durable object IDs retain different values in each immutable snapshot.

Example — `green emergency exit door`:

- v1 description: **“A green door with a window and a silver handle.”**
- v2 description: **“Green emergency exit door with white text and a green exit sign above it.”**

Example — `green exit sign`:

- v1: **“A green emergency exit sign above the green door.”**
- v2: **“Green exit sign with a white figure and arrow above the green emergency exit door.”**

The durable object IDs are the same across the two states, while each snapshot keeps the value that belonged to that moment. This is the required Phase 6 proof that today's canonical update does not rewrite yesterday's state.

### Phase 6 exit condition — MET

Two historical states can be inspected independently and return their correct past values. Current/previous/by-ID/by-date retrieval is deterministic, state snapshots are immutable, and the Memory experience exposes time directly.

Canonical technical record:

`Knowledge/Technical/phase-6-state-history.md`

Transition record:

`Archive/phase-6-transition-note.md`

## Phase 7 — IMPLEMENTED / REAL THREE-CHANGE PROOF PENDING

### Objective

Make **What changed?** reliable enough to serve as SENTINEL's **Git diff for reality**.

Phase 7 now supports deterministic change semantics for:

- `added`;
- `removed` when explicit current evidence says the object is absent/removed;
- `moved`;
- `changed`;
- `resolved` when issue state explicitly becomes resolved;
- `uncertain` when something is simply not re-observed.

Non-observation alone still does **not** become removal or resolution.

### Diff Engine v2 — IMPLEMENTED

`src/memory/diff-engine.ts` now compares immutable Phase 6 snapshots and uses:

- stable durable IDs first;
- conservative semantic identity families;
- normalized name/category identity;
- semantic position;
- grounded relation context;
- confidence only as a weak tie-breaker.

Repeated objects are still not fuzzy-merged. Relationship context may disambiguate repeated instances only when one match is mutually distinctive.

### Relationship-aware movement — IMPLEMENTED

Object movement can now be supported by:

- structured room / relative anchors;
- semantic position changes;
- high-confidence grounded spatial-relation anchor changes.

Provider image-coordinate tuples remain excluded from physical movement semantics.

### First-class condition transitions — IMPLEMENTED

The diff engine now compares conditions directly.

It can distinguish:

- new grounded condition;
- condition trust/kind/status change;
- condition not re-observed → `uncertain`.

Promoted issues remain the user-facing operational event. The engine avoids duplicating one semantic change as both a new condition card and a new issue card.

### Explicit entity kind — IMPLEMENTED

New changes include:

`entityKind = object | condition | issue`

so later Reality Diff UI and verification logic can reason about the changed entity without parsing titles.

### Diff retention — VERIFIED

Every generated state-pair diff remains stored in environmental memory.

### Provider support for Diff v2 — IMPLEMENTED

The MiniCPM perception contract now explicitly prefers:

- semantic physical position such as `left of green door` / `beside shelving`;
- grounded stable spatial relations;
- separate repeated-object instances with distinguishing context;
- direct visible object state such as open/closed only.

It explicitly rejects image-coordinate tuples as semantic `position.description` and does not force object state or relationships when visually unsupported.

This improves the evidence supplied to Diff v2 without changing Phase 5 condition thresholds or promotion policy.

### Automated gate — PASS

`npm run check:phase7-diff` verifies:

- Added;
- explicit Removed;
- Moved;
- Changed;
- Resolved;
- repeated-object matching through distinctive relation context;
- movement through changed grounded relationship anchor;
- simple non-observation remains uncertain;
- first-class condition transitions;
- no duplicate condition/issue noise;
- unresolved repeated-object multiplicity remains conservative;
- generated diffs remain stored.

Sentinel CI run `35435198030` passed the complete Phase 4/5/6/7 suite and production build on commit `238183d62a0c9a085269ff5725d0674e5e91298d`.

The follow-up provider-context commit `2006cd7dab63bb964436c11957553fd959f32654` also passed Sentinel CI run `35435260985`.

### Production deployment — PASS

Phase 4 Observation Contract run `35435260980` waited for and detected the exact production deployment:

`2006cd7dab63bb964436c11957553fd959f32654`

at:

`https://sentinel-physical-memory.vercel.app`

The contract verified:

- latest production commit matched;
- production scan route accepted the valid 8-frame walkthrough;
- `persistence: neon`;
- new state persisted successfully.

Therefore Phase 7 can be tested entirely from the deployed phone experience; no local laptop is required.

### Remaining Phase 7 exit gate

The locked build-plan exit condition still requires one controlled real environment where three intentional, visually obvious changes produce three understandable supported changes.

Phone-only proof:

1. baseline scan;
2. intentionally add one obvious object;
3. move one clearly identifiable stable object;
4. visibly change one directly observable object state **or** later explicitly resolve a staged condition;
5. comparison scan;
6. inspect the resulting persisted Reality Diff.

Unsupported disappearance must remain `uncertain`.

Historical Phase 5/6 warehouse states/diffs remain immutable.

Canonical Phase 7 technical record:

`Knowledge/Technical/phase-7-diff-engine-v2.md`

## Phase 8 — IMPLEMENTED / PHONE PROOF PARTIAL

A real office phone comparison confirmed that the facility-operations Changes view:

- rendered a real **New: green bag** event under Physical changes;
- kept a non-reobserved closet door and wall under Needs verification;
- did not mislabel absence as removal or resolution;
- remained usable on the mobile viewport.

The run also exposed one bounded defect: two provider segments of the same grounded white wall survived as two historical objects, so the persisted diff rendered the same **Not re-observed: white wall** card twice.

Current hardening preserves historical immutability while:

- consolidating compatible same-frame wall/floor/ceiling segments for future memory and comparisons;
- preserving structural surfaces with conflicting room or directional anchors;
- collapsing already-persisted duplicate structural verification cards only when title and trusted evidence agree;
- unioning evidence and preserving the conservative uncertainty status;
- keeping independently grounded same-named surfaces separate.

The corrected presentation for that result is three changes: one green-bag addition plus two verification items (closet door and white wall). A fresh deployed phone run must still verify the correction before Phase 8 closes.

Sentinel CI run `35509707873` passed the complete repository suite and production build on hardening commit `ec91d73a9438048188b644f854951bc3ed9c36e7`.

Canonical Phase 8 record:

`Knowledge/UX/phase-8-reality-diff-ui.md`

### Latest office photo hardening — CI PASS / fresh proof pending

Fresh environment `env_cozy-office1_1b6ae62a` produced a usable visual before/after dashboard but exposed provider identity drift and audit noise: `area rug → carpet`, `wall art → picture`, `wicker basket → basket`, `table lamp → desk lamp`, exact-name category drift, repeated plant instances, small desk-item false additions, and generic negative audit observations.

Historical v1/v2 and its persisted 18-change diff remain immutable.

Current main hardening now:
- expands conservative semantic identity for office aliases while retaining one-to-one ambiguity protection;
- matches repeated semantic families by mutually grounded location anchors;
- allows exact-name identity to survive non-person/non-room provider category drift;
- keeps structural wall/floor/ceiling consolidation intact;
- prunes generic negative/no-finding condition-audit observations before memory;
- limits the openable-state audit to state/object evidence rather than extra conditions/observations;
- suppresses low-salience single-photo change noise for cup/mug/pen-holder/switch-plate style items;
- caps the default evidence list in the UI with an explicit Show all control;
- renders persisted before/after image evidence directly in the dark facility-operations dashboard.

Sentinel CI run `35514901462` passed the complete repository suite and production build on commit `eeb3f173af7b0474810b193add3e7dcd0420c672`.

Phase 7 and Phase 8 remain open until one brand-new two-photo environment proves the post-hardening diff on deployed production.

### Fresh office proof — identity/diff noise PASS, door-state proof pending

Fresh environment `env_cozy-office2_182a74e3` produced a clean persisted Reality Diff with exactly two supported changes:

- `Moved: office chair` at 0.95 confidence;
- `New: duffle bag` at 1.0 confidence;
- 0 uncertain changes;
- 0 operational issues.

The previous false additions / not-reobserved noise did not recur. This validates the office identity/diff hardening and the redesigned before/after Operations view.

The intended white-door closed→open transition was still absent because both v1 and v2 persisted `white door.state = null`. Current main therefore adds one bounded final openable-state confirmation pass after the first targeted state audit. The retry is evidence-only and still fails closed: if visible geometry cannot defend `open` or `closed`, SENTINEL persists unknown rather than guessing.

Regression `npm run check:photo-observation` now explicitly simulates a first missed door-state audit and verifies that the bounded confirmation recovers and persists the directly visible state.

Sentinel CI run `35517279472` passed the full repository suite on commit `dbcefa2c11e9b732945ca0351976626cb53f896a`.

One final brand-new two-photo production proof remains for the door-state transition. Historical office states/diffs remain immutable.

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
- Historical snapshots remain immutable and now snapshot relations as well as objects, conditions and issues.
- `src/memory/history.ts` provides current / previous / by-ID / at-or-before-time retrieval over immutable snapshots.
- `/api/states` exposes the Phase 6 history contract.
- Conditions remain available in snapshots while Phase 7 is responsible for first-class condition transition diff semantics.

### Diff / Ask

- `EnvironmentalDiffEngine` remains deterministic.
- Missing prior evidence does not automatically prove removal/resolution.
- Phase 5 carries conditions through snapshots but does not yet compare condition transitions as first-class diff changes; that belongs to Phase 7.
- Ask Building now receives condition trust labels.

## Highest-priority gaps

1. **Phase 7 real phone proof — intentionally create three supported changes and verify Diff v2 in production.**
2. **Phase 8 phone visual validation — verify the duplicate-surface correction on a fresh deployed comparison and complete the remaining drawer/action checks.**
3. Phase 9 — Spatial Memory experience through the facility-operations lens.
4. Action + verification closed loop — Phases 11/12.
5. Reliability, automated tests, security, and least-privilege database-role hardening.

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
- [x] Phase 5 — Perception quality and condition model (**COMPLETE — sixth fresh warehouse proof passed clean condition/issue/diff gate**)
- [x] Phase 6 — Environmental state history (**COMPLETE — immutable current/previous/by-ID/by-date retrieval + Memory timeline**)
- [ ] Phase 7 — Environmental Diff Engine v2 (**IMPLEMENTED — CI + production deploy pass; real three-change phone proof pending**)
- [ ] Phase 8 — Reality Diff UI (**IMPLEMENTED — phone proof partial; duplicate-surface hardening CI pass; deployed confirmation pending**)
- [ ] Phase 9 — Spatial Memory experience (**NEXT AFTER PHASE 7/8 PHONE GATES**)
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

Phase 5 third fresh warehouse proof (`env_warehouse3_64751084`): **PARTIAL PASS — TAXONOMY + REALITY DIFF PASSED, EXPLICIT ACCESS GEOMETRY MISSING**.

Phase 5 access-geometry hardening: **CI PASS (`35335200200`, commit `3e1046c8`)**.

Phase 5 fourth fresh warehouse proof (`env_warehouse4_4a96a4d1`): **CORE CONDITION GATE PASS — CORRECT INFERRED ACCESS CONDITION + ONE MEDIUM ISSUE; DUPLICATE CONDITION/DIFF MULTIPLICITY CLEANUP REQUIRED**.

Phase 5 canonical-condition + multiplicity-safe diff hardening: **CI PASS (`35339258094`, commit `9f5fbb2f`)**.

Phase 5 fifth fresh warehouse proof (`env_warehouse5_a9589829`): **PARTIAL PASS — CONDITION DEDUPE + ISSUE PROMOTION PASSED; BASELINE EXIT-SIGN OBJECT COMPLETENESS CAUSED ONE FALSE DIFF ADDITION**.

Phase 5 grounded exit-sign completion hardening: **CI PASS (`35342332725`, commit `c4786759`)**.

Phase 5 sixth fresh warehouse proof (`env_warehouse5_cbe5dde8`): **PASS — 2 CONDITIONS, 1 MEDIUM ACCESS ISSUE, CLEAN 2-CHANGE REALITY DIFF**.

Phase 5: **COMPLETE**.

Phase 6 immutable state-history gate: **PASS (`npm run check:phase6-history`)**.

Phase 6 full repository build: **CI PASS (`35349163148`, commit `5df1b881`)**.

Phase 6 real Neon immutable-history proof (`env_warehouse5_cbe5dde8`): **PASS — same durable object IDs retain distinct v1/v2 snapshot values**.

Phase 6: **COMPLETE**.

Phase 7 Diff Engine v2 implementation: **CI PASS (`35435198030`, commit `238183d6`)**.

Phase 7 provider diff-context hardening: **CI PASS (`35435260985`, commit `2006cd7d`)**.

Phase 7 exact production deployment contract: **PASS (`35435260980`)**.

Phase 7 real three-change phone proof: **PENDING**.

Phase 8 facility-operations Reality Diff UI: **CI PASS (`35454475031`, commit `937ce9c0`)**.

Phase 8 duplicate-surface hardening: **CI PASS (`35509707873`, commit `ec91d73a`)**.

Phase 8 phone visual validation: **PARTIAL — mobile grouping and uncertainty semantics passed; duplicate white-wall card diagnosed and hardened; fresh deployed confirmation pending**.

**Next gate: deploy the duplicate-surface hardening, confirm the corrected three-card office result on phone, then run the controlled Phase 7 three-change proof before closing Phases 7 and 8.**
