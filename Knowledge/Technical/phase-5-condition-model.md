# Phase 5 — Perception Quality & Condition Model

Date: 2026-09-17
Status: **ACTIVE — CORE TRUST MODEL IMPLEMENTED / CONTROLLED WAREHOUSE DERIVATION FIX VERIFIED IN CI / REAL-SCAN RE-RUN NEXT**

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

SENTINEL now owns a narrow deterministic derivation layer in `src/perception/condition-derivation.ts`.

It may derive an inferred `access` condition only when:

- an evidence-backed door is explicitly associated with emergency-exit signage;
- an evidence-backed physical obstacle is explicitly described in front of/across/blocking that same named door;
- the obstacle-to-door direction is explicit (reversed spatial wording does not qualify);
- both facts belong to the same grounded perception result;
- confidence remains above the inferred-condition threshold after SENTINEL applies a downward confidence bound;
- no equivalent access condition already exists.

The derivation may use grounded observations and objects, but it cannot reuse another inferred condition as if it were direct grounding. The derived claim remains **Inferred**, not Observed. SENTINEL does not increase source confidence or invent evidence.

For the warehouse case, two source facts at 1.00 confidence produce a bounded derived confidence of 0.90.

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

Severity policy:

- observed hazard → at most `high`;
- observed damage / maintenance / access / compliance → `medium`;
- observed attention / unknown → `low`;
- inferred conditions → at most `medium`;
- perception alone can never create a `critical` issue.

## Conservative semantic object identity

The same controlled warehouse test also exposed provider naming drift that inflated Reality Diff:

- `metal shelving` ↔ `shelves` / `orange metal shelves`
- `cardboard boxes` ↔ `boxes` / `brown boxes`
- `concrete floor` ↔ `warehouse floor`
- `white ceiling` ↔ `warehouse ceiling`
- `fire extinguisher` moving between `equipment` and `safety`
- generic exit signage descriptions ↔ `emergency exit sign`

`src/memory/object-identity.ts` now provides a deliberately small semantic identity whitelist for those durable families. It is used by both memory upsert and the deterministic diff engine.

This is **not** general fuzzy matching. Family classification is name-led so a nearby object mentioned only in a description cannot redefine identity. Alias matches must also be unique in both directions; repeated ambiguous objects remain separate instead of one candidate being reused for several instances. Chairs, desks, people, and generic doors remain excluded because richer repeated-instance identity belongs to Phase 7.

## Memory behavior

Conditions are durable physical memory:

- scan-local condition IDs become source-scoped IDs;
- evidence IDs map to durable source-scoped evidence IDs;
- condition object IDs map to canonical durable object IDs;
- `observedAt` uses trusted scan capture time;
- conditions are included in states and immutable snapshots;
- only policy-qualified conditions become operational issues.

Older Phase 3/4 memory remains backward-compatible. Historical snapshots and already-persisted noisy diffs are not rewritten.

## Ask the Building integration

Reasoning context contains `RELEVANT CONDITIONS` with explicit trust labels:

- `trust=Observed`
- `trust=Inferred`

Nemotron must treat inferred conditions as lower-authority interpretation rather than direct physical fact.

## Automated gates

`npm run check:phase5-conditions` verifies the core trust/promotion policy.

`npm run check:condition-derivation` verifies:

- grounded exit signage + grounded obstacle placement derives exactly one inferred access condition;
- derived evidence contains both supporting fact sources;
- confidence remains below source confidence;
- the strong derived condition promotes only through SENTINEL policy;
- safe placement does not create an access condition;
- reversed spatial wording does not invert the obstruction relation;
- inferred conditions are not reused as direct grounding facts.

`npm run check:object-identity` verifies:

- the conservative warehouse alias families match;
- ambiguous movable furniture and generic doors do not fuzzy-match;
- secondary description mentions do not redefine the primary object family;
- repeated ambiguous objects retain separate durable identities;
- unique aliases reuse a canonical durable object ID;
- a baseline/comparison alias-drift scenario collapses to one real added pallet jack instead of many false additions/removals.

`npm run check:diff-position` continues to verify that image-coordinate drift cannot create false physical movement.

Sentinel CI run `35234538554` passed all Phase 4 gates, perception retry, condition audit, Phase 5 trust, hardened condition derivation, Reality Diff position semantics, conservative one-to-one object identity, and the TypeScript/Vite build.

## Controlled warehouse checkpoint

Environment: `env_warehouse_6dba83ca`

State v1 persisted a clean warehouse baseline with visible shelving, boxes, concrete floor, emergency-exit door/signage, fire extinguisher, and normal conditions.

State v2 persisted the comparison scan and correctly detected a new `orange pallet jack` in front of the green door, but the pre-fix build produced no operational condition and an inflated 19-change diff because of provider naming drift.

That historical v1→v2 diff remains immutable. The code now contains deterministic fixes for both root causes.

## Next Phase 5 proof

Pull latest `main` and re-run the warehouse comparison through the updated build.

Expected new proof:

1. direct pallet-jack and exit-sign facts remain Observed;
2. SENTINEL emits one derived Inferred access condition with grounded evidence;
3. the condition promotes to a medium access issue only because it satisfies the policy threshold;
4. obvious provider naming aliases no longer dominate Reality Diff;
5. Ask Building preserves the Observed/Inferred distinction.

For a clean demo-quality A/B, create a fresh warehouse validation environment after pulling the fix, then scan the baseline and comparison videos once each. Existing historical states should not be rewritten.

## Phase 5 exit condition

**Real or controlled realistic scans consistently produce evidence-grounded observations and conditions with correct trust labels; weak inference does not become an operational issue; strong supported conditions persist across memory and are available to reasoning without collapsing observation, interpretation, and recommendation into one claim.**
