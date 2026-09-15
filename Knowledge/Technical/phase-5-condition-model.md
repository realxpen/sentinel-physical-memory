# Phase 5 — Perception Quality & Condition Model

Date: 2026-09-15
Status: **ACTIVE — CORE TRUST MODEL IMPLEMENTED / REAL-PHONE VALIDATION NEXT**

## Goal

Make SENTINEL distinguish direct physical observations from interpretations, persist those interpretations as explicit environmental conditions, and prevent weak model inference from silently becoming an operational issue.

Phase 5 sharpens the trust boundary established in Phase 1:

- **Observed** = directly supported by supplied evidence.
- **Inferred** = an interpretation of evidence, not a directly visible fact.
- **Recommended** remains outside perception and belongs to the later Action Planner.

## Domain model

The physical-memory domain now includes:

- `ClaimBasis = observed | inferred`
- `ConditionKind = normal | attention | hazard | damage | maintenance | access | compliance | unknown`
- `ConditionStatus = present | uncertain`
- `EnvironmentalCondition`
- `EnvironmentalState.conditionIds`
- `EnvironmentalStateSnapshot.conditions`
- `EnvironmentalMemory.conditions`

Every `Observation` is explicitly `basis: observed`.

A condition carries:

- environment identity;
- condition kind;
- title + description;
- `present` or `uncertain` status;
- `observed` or `inferred` basis;
- confidence;
- related object IDs;
- evidence IDs;
- trusted observation time.

## Perception contract

The Nebius perception contract now returns six top-level collections:

`sourceId + observations + objects + conditions + relations + evidence`

Prompt rules:

1. observations are direct visible facts only;
2. diagnosis, cause, risk prediction, and recommendations must not appear as observations;
3. conditions describe states of the environment;
4. `basis=observed` is used only when the condition itself is directly visible;
5. `basis=inferred` is used when interpreting what evidence may mean;
6. inferred conditions should normally be `uncertain` unless the evidence is unusually direct;
7. every observation, object, and condition must reference existing evidence;
8. conditions may reference only objects emitted in the same perception result.

Trusted scan `capturedAt` overrides model-provided condition time at the adapter/memory boundary.

## Issue-promotion policy

The model does **not** decide whether a condition becomes an operational issue.

`src/perception/condition-model.ts` owns that policy.

A condition cannot auto-promote when:

- kind is `normal`;
- status is `uncertain`;
- it has no evidence;
- confidence is below its trust threshold.

Thresholds:

- observed condition: **0.65** minimum confidence;
- inferred condition: **0.85** minimum confidence.

Severity policy:

- observed hazard → at most `high`;
- observed damage / maintenance / access / compliance → `medium`;
- observed attention / unknown → `low`;
- inferred conditions → at most `medium`;
- perception alone can never create a `critical` issue.

This is intentionally conservative. Critical escalation belongs to later rule/reasoning layers with stronger evidence and human review.

## Memory behavior

Conditions are now durable physical memory:

- scan-local condition IDs are source-scoped before persistence;
- condition evidence IDs are remapped to durable source-scoped evidence IDs;
- condition object IDs are mapped to canonical durable object IDs;
- condition `observedAt` is the trusted scan capture time;
- conditions are included in environmental states and immutable state snapshots;
- operational issues are generated from policy-qualified conditions, not keyword matching over free-text observations.

The old regex path that treated words such as `hazard`, `broken`, or `leak` inside observation text as an issue has been removed for new scans.

Existing persisted Phase 3/4 memories remain backward-compatible:

- missing `conditions` hydrate as `[]`;
- old states hydrate `conditionIds: []`;
- old snapshots hydrate `conditions: []`;
- old observations hydrate with `basis: observed`.

The canonical JSON aggregate already persists the new condition data without a database migration. A dedicated normalized condition table is optional future database hardening rather than a runtime requirement for this phase.

## Ask the Building integration

Reasoning context now contains a `RELEVANT CONDITIONS` section with explicit trust labels:

- `trust=Observed`
- `trust=Inferred`

Nemotron is instructed to treat observed conditions as direct evidence and inferred conditions as lower-authority interpretation.

## Automated gate

`npm run check:phase5-conditions`

verifies:

- observed evidence-backed hazard promotes to an issue;
- observed hazard is capped at `high`, never `critical`;
- hazard maps to the safety issue type;
- strong inferred conditions require the higher threshold and are capped at `medium`;
- weak inference remains context-only;
- uncertain conditions never auto-promote;
- normal conditions remain memory context;
- valid conditions must reference existing evidence and objects;
- missing evidence fails closed;
- missing object references fail closed.

Sentinel CI runs this gate before the TypeScript/Vite build.

## Current checkpoint

Implemented:

- domain condition model;
- strict condition schema validation;
- perception prompt separation between observations and conditions;
- evidence-reference normalization extended to conditions;
- conservative issue-promotion policy;
- durable condition memory + snapshot integration;
- backward-compatible Neon hydration;
- Ask Building trust labels;
- Phase 5 automated trust gate;
- full TypeScript/Vite build passing in CI.

## Next Phase 5 proof

Use a real walkthrough containing a deliberately visible condition, for example a cable across a walkway or another safe staged visual state.

Verify:

1. direct visual facts appear under observations;
2. condition appears separately under `conditions`;
3. its `basis` is appropriate (`observed` or `inferred`);
4. evidence IDs resolve to supplied frames;
5. only policy-qualified conditions become issues;
6. weak/uncertain inference remains memory context;
7. Ask Building preserves the Observed/Inferred distinction.

## Phase 5 exit condition

**Real phone scans consistently produce evidence-grounded observations and conditions with correct trust labels; weak inference does not become an operational issue; strong supported conditions persist across memory and are available to reasoning without collapsing observation, interpretation, and recommendation into one claim.**
