# Phase 5 — Perception Quality & Condition Model

Date: 2026-09-17
Status: **ACTIVE — CORE TRUST MODEL IMPLEMENTED / WAREHOUSE POLICY HARDENING VERIFIED IN CI / REAL-SCAN RE-RUN NEXT**

## Goal

Make SENTINEL distinguish direct physical observations from interpretations, persist those interpretations as explicit environmental conditions, and prevent weak model inference from silently becoming an operational issue.

Phase 5 sharpens the trust boundary established in Phase 1:

- **Observed** = directly supported by supplied evidence.
- **Inferred** = an interpretation of evidence, not a directly visible fact.
- **Recommended** remains outside perception and belongs to the later Action Planner.

## Domain model

The physical-memory domain includes:

- `ClaimBasis = observed | inferred`
- `ConditionKind = normal | attention | hazard | damage | maintenance | access | compliance | unknown`
- `ConditionStatus = present | uncertain`
- `EnvironmentalCondition`
- `EnvironmentalState.conditionIds`
- `EnvironmentalStateSnapshot.conditions`
- `EnvironmentalMemory.conditions`

Every `Observation` is explicitly `basis: observed`.

A condition carries environment identity, kind, title/description, status, basis, confidence, related object IDs, evidence IDs, and trusted observation time.

## Perception contract

The Nebius perception contract returns:

`sourceId + observations + objects + conditions + relations + evidence`

Prompt rules:

1. observations are direct visible facts only;
2. diagnosis, cause, risk prediction, and recommendations must not appear as observations;
3. conditions describe states of the environment;
4. `basis=observed` is used only when the condition itself is directly visible;
5. `basis=inferred` is used when interpreting what evidence may mean;
6. inferred conditions should normally be `uncertain` unless evidence is unusually direct;
7. every observation, object, and condition must reference existing evidence;
8. conditions may reference only objects emitted in the same perception result.

Trusted scan `capturedAt` overrides model-provided condition time at the adapter/memory boundary.

## Condition audit

A benign scene pass no longer suppresses a facility-condition review. When the scene contains no operational condition candidate, SENTINEL runs one targeted condition audit over the same trusted frames.

The audit explicitly checks access routes, doors/exits, walking surfaces, boxes/furniture, cables/electrical items, equipment placement, visible damage, and maintenance state. It is still instructed not to force a condition when evidence does not support one.

## Deterministic grounded condition derivation

Real controlled warehouse testing exposed an important model behavior: MiniCPM correctly described the relevant physical facts but failed to compose them into an operational condition.

The persisted comparison scan contained grounded observations equivalent to:

- `orange pallet jack` — “An orange pallet jack in front of the green door.”
- `emergency exit sign` — “An emergency exit sign above the green door.”

The model still returned only a benign `normal` condition.

SENTINEL owns a narrow deterministic derivation layer in `src/perception/condition-derivation.ts`.

It may derive an inferred `access` condition only when:

- an evidence-backed door is explicitly associated with **independent** emergency-exit signage or another separate grounded exit fact;
- an evidence-backed physical obstacle is explicitly described in front of/across/blocking that same named door;
- the obstacle-to-door direction is explicit (reversed spatial wording does not qualify);
- both facts belong to the same grounded perception result;
- confidence remains above the inferred-condition threshold after SENTINEL applies a downward confidence bound;
- no equivalent access condition already exists.

A door object's own name or description — for example `green emergency exit door` — cannot self-ground its emergency-exit role for this derivation. The separate exit-sign observation/object is required. A bounded color-anchored door alias may connect `green emergency exit door` to grounded text that says `green door`, but that alias does not replace the independent exit fact.

The derivation may use grounded observations and objects, but it cannot reuse another inferred condition as if it were direct grounding. The derived claim remains **Inferred**, not Observed. SENTINEL does not increase source confidence or invent evidence.

For the controlled warehouse evidence, source facts at 1.00 confidence produce a bounded derived confidence of 0.90. The inferred threshold remains 0.85; the warehouse fix does **not** weaken the trust threshold.

## Issue-promotion policy

The model does **not** decide whether a condition becomes an operational issue. `src/perception/condition-model.ts` owns that policy.

A condition cannot auto-promote when:

- kind is `normal`;
- status is `uncertain`;
- it has no evidence;
- confidence is below its trust threshold.

Thresholds:

- observed condition: **0.65** minimum confidence;
- inferred condition: **0.85** minimum confidence;
- explicitly grounded observed access cue: **0.60** minimum confidence.

The 0.60 exception is limited to directly observed, explicitly grounded access-route obstruction wording. It does not apply to SENTINEL-derived inferred conditions.

Severity policy:

- observed hazard → at most `high`;
- observed damage / maintenance / access / compliance → `medium`;
- observed attention / unknown → `low`;
- inferred conditions → at most `medium`;
- perception alone can never create a `critical` issue.

## Conservative semantic object identity

The same controlled warehouse test exposed provider naming drift that inflated Reality Diff:

- `metal shelving` ↔ `shelves` / `orange metal shelves`
- `cardboard boxes` ↔ `boxes` / `brown boxes`
- `green emergency exit door` ↔ `green door`
- `concrete floor` ↔ `warehouse floor`
- `white ceiling` ↔ `warehouse ceiling`
- `fire extinguisher` moving between `equipment` and `safety`
- generic exit signage descriptions ↔ `emergency exit sign`

`src/memory/object-identity.ts` provides a deliberately small semantic identity whitelist for those durable families. It is used by both memory upsert and the deterministic diff engine.

This is **not** general fuzzy matching. Family classification remains name-led so a nearby object mentioned only in a description cannot redefine identity. Cross-scan aliases must still be unique in both directions; repeated ambiguous objects remain separate instead of one candidate being reused for several instances.

Doors are not generically fuzzy-matched. Only a visible color anchor such as `green ... door` may form a door alias family, and the normal one-to-one uniqueness rule still applies. Thus `green emergency exit door` ↔ `green door` is supported while unanchored `emergency exit door` ↔ `service door` is not.

Provider scene/audit passes can also emit semantic duplicates inside the **same scan**. Memory now consolidates those aliases only when all of the following hold:

- they already satisfy the conservative semantic identity rule;
- they share at least one trusted frame evidence ID;
- their structured/semantic positions do not conflict;
- they are not merely identical name/category detections being collapsed because they coexist.

This lets obvious duplicate labels such as `shelves` + `orange metal shelves`, or `green emergency exit door` + `green door`, resolve to one durable object when grounded to the same physical evidence. Repeated objects without shared grounding or with conflicting positions remain distinct. Richer repeated-instance identity remains Phase 7 work.

## Memory behavior

Conditions are durable physical memory:

- scan-local condition IDs become source-scoped IDs;
- evidence IDs map to durable source-scoped evidence IDs;
- condition object IDs map to canonical durable object IDs;
- `observedAt` uses trusted scan capture time;
- conditions are included in states and immutable snapshots;
- only policy-qualified conditions become operational issues.

Object alias consolidation applies only while ingesting future scans. Older Phase 3/4/5 snapshots and already-persisted noisy diffs are not rewritten.

## Ask the Building integration

Reasoning context contains `RELEVANT CONDITIONS` with explicit trust labels:

- `trust=Observed`
- `trust=Inferred`

Nemotron must treat inferred conditions as lower-authority interpretation rather than direct physical fact.

## Automated gates

`npm run check:phase5-conditions` verifies the core trust/promotion policy.

`npm run check:condition-derivation` verifies:

- independently grounded exit signage + grounded obstacle placement derives exactly one inferred access condition;
- `green emergency exit door` can bind to grounded `green door` wording without lowering the inferred threshold;
- derived evidence contains both supporting fact sources;
- confidence remains below source confidence;
- the strong derived condition promotes only through SENTINEL policy;
- safe placement does not create an access condition;
- reversed spatial wording does not invert the obstruction relation;
- a door name cannot self-ground emergency-exit identity;
- inferred conditions are not reused as direct grounding facts.

`npm run check:object-identity` verifies:

- the conservative warehouse alias families match;
- color-anchored door aliases match while unanchored generic doors do not;
- secondary description mentions do not redefine the primary object family;
- same-scan aliases consolidate only with shared evidence and compatible position;
- repeated ambiguous objects retain separate durable identities;
- unique aliases reuse canonical durable shelf/door IDs;
- a baseline/comparison alias-drift scenario collapses to one real added pallet jack instead of many false additions/removals.

`npm run check:diff-position` continues to verify that image-coordinate drift cannot create false physical movement.

Sentinel CI run `35253466573` passed the full repository gate suite on commit `f1f24211e06132798a2681a88351b6a3f399e8a2`, including Phase 4 quality gates, provider grounding, perception retry, condition audit, Phase 5 trust, independent exit derivation, Reality Diff position semantics, conservative object identity, and the TypeScript/Vite production build.

## Controlled warehouse checkpoint

Environment: `env_warehouse_6dba83ca`

State v1 persisted a clean warehouse baseline with visible shelving, boxes, concrete floor, emergency-exit door/signage, fire extinguisher, and normal conditions. It also exposed provider duplication such as `green emergency exit door` and `green door` in the same historical snapshot.

State v2 persisted the comparison scan and correctly detected a new `orange pallet jack` in front of the green door plus a separate emergency-exit-sign observation, but the pre-fix build produced no operational condition and an inflated Reality Diff dominated by naming drift.

Those historical states/diffs remain immutable. Current `main` now contains deterministic fixes for the two root causes plus the same-scan duplicate alias pattern exposed by the persisted warehouse data.

## Next Phase 5 proof

Pull latest `main` and re-run the warehouse baseline/comparison through the updated build.

Expected new proof:

1. direct pallet-jack and exit-sign facts remain Observed;
2. SENTINEL emits one derived Inferred access condition only because the exit role is independently grounded;
3. the condition retains both grounded evidence sources and promotes to a medium access issue at the unchanged inferred threshold;
4. obvious provider aliases — including the green door, shelving, boxes, floor, ceiling, extinguisher and exit-sign families — no longer dominate Reality Diff;
5. the pallet jack remains the meaningful added object;
6. Ask Building preserves the Observed/Inferred distinction.

For a clean demo-quality A/B, create a fresh warehouse validation environment after pulling the fix, then scan the baseline and comparison videos once each. Existing historical states should not be rewritten.

## Phase 5 exit condition

**Real or controlled realistic scans consistently produce evidence-grounded observations and conditions with correct trust labels; weak inference does not become an operational issue; strong supported conditions persist across memory and are available to reasoning without collapsing observation, interpretation, and recommendation into one claim.**
