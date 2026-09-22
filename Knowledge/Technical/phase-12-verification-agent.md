# Phase 12 — Verification Agent

Status: **ACTIVE / IMPLEMENTED / PRODUCTION FALSE-RESOLUTION VERIFIED / POSITIVE PHYSICAL EXIT GATE PENDING**

## Source goal

The locked build plan defines Phase 12 as the phase that finishes the closed loop:

`Existing condition → Action plan → User changes environment → New scan → New state → Diff → Verification`

Required result states:

- `passed`
- `partial`
- `failed`
- `inconclusive`

Required condition outputs:

- `resolvedConditionIds`
- `remainingConditionIds`
- `newConditionIds`
- `evidenceIds`
- `summary`

SENTINEL additionally exposes `inconclusiveConditionIds` so uncertainty is explicit rather than buried in prose.

The locked exit condition remains:

`detected → action → changed → verified works end-to-end`.

## Trust rule

**Missing is not resolved.**

A condition disappearing from the current condition/issue arrays is not sufficient evidence that the physical problem was fixed.

Resolution requires **positive current-state evidence from the same physical object or area**.

This rule is intentionally stricter than ordinary diff semantics:

- Reality Diff may say a prior issue was not re-observed;
- Verification Agent must decide whether there is enough current evidence to call the physical outcome resolved;
- if not, it returns `remaining` or `inconclusive`.

## Verification request

`POST /api/verify`

Input:

- `environmentId`
- `previousStateId`
- `currentStateId`
- optional `actionPlanId`
- optional `conditionIds`

The previous and current states must both belong to the same durable environment, and the current state must have a strictly later version.

Explicit `conditionIds` must belong to the previous immutable snapshot and must be non-normal conditions.

## Verification Agent

`VerificationAgentService` compares:

- immutable previous snapshot;
- immutable current snapshot;
- previous target conditions;
- current non-normal conditions;
- state-local current evidence only;
- state-local current observations;
- stable object identity;
- current relations;
- persisted Reality Diff (or a read-only deterministic derived diff when one is unavailable).

### Deterministic first pass

If a grounded equivalent condition is still present:

- `present` → `remaining`;
- `uncertain` → `inconclusive`.

### Access-obstruction override

For an earlier access/exit obstruction, SENTINEL checks the same durable object context in the new state.

If the current object/relation evidence still grounds:

- blocking;
- obstructing;
- across;
- in front of;

the baseline condition remains **remaining**.

This override exists because the real Warehouse State v3 currently demonstrates why condition disappearance cannot be trusted by itself: its operational access issue is gone, but the remembered orange cart remains positioned **in front of the door**.

A model cannot override this server-owned physical contradiction.

### Nemotron verification pass

Only conditions not already decided deterministically are sent to Nemotron.

Nemotron receives a compact verification context containing:

- target baseline conditions;
- current non-normal conditions;
- same-object current context;
- current observations;
- current evidence;
- Reality Diff.

It must return per-condition:

- `resolved | remaining | inconclusive`;
- confidence;
- reason;
- evidence IDs;
- related object IDs.

Server validation then filters all IDs to the current grounding scope.

A model `resolved` verdict is accepted only when:

- confidence ≥ 0.75;
- at least one **current-state** evidence ID survives;
- the same physical object/area is re-observed when the baseline condition had object IDs;
- no deterministic continued-support rule contradicts resolution.

A model `remaining` verdict is accepted only when:

- confidence ≥ 0.60;
- current-state evidence survives;
- same-object/area grounding survives when required.

Otherwise the result becomes `inconclusive`.

## Overall status

SENTINEL derives the aggregate status server-side:

- **passed** — all target baseline conditions positively resolved, no remaining/inconclusive target and no new non-normal condition;
- **partial** — some target conditions resolved but something remains, is inconclusive, or a new condition appeared;
- **failed** — at least one target condition definitely remains and none resolved;
- **inconclusive** — resolution cannot be established from the new evidence.

The model does not choose the aggregate status.

## Product experience

Phase 12 stays inside the Living Spatial Intelligence product.

After an Action Plan:

1. the user chooses a rescan photo/video;
2. SENTINEL creates the new immutable state and Reality Diff;
3. if an Action Plan is still active, the product automatically calls Verification Agent using:
   - the plan's source state;
   - the new state;
   - the plan's grounded condition IDs;
4. the Memory view shows one of:
   - **Verified.**
   - **Partially resolved.**
   - **Not resolved.**
   - **Verification inconclusive.**

The panel includes:

- previous → current state versions;
- resolved / remaining / inconclusive / new counts;
- evidence count;
- per-condition verdict / confidence / reason;
- current non-normal conditions;
- Reality Diff link;
- visible trust rule: **Not re-observed is not resolved.**

If a plan was created from a historical state and a later current state already exists, the Action Plan exposes **Verify against current state** without requiring a new scan.

Current physical objects referenced by Verification use a separate cyan Spatial Memory treatment.

## Deterministic gate

`npm run check:phase12-verification` verifies:

- positive current same-object evidence can produce `passed`;
- continued obstruction geometry produces `failed` without calling the model;
- one resolved + one remaining condition produces `partial`;
- model optimism without same-object current evidence becomes `inconclusive`;
- foreign baseline condition IDs fail closed;
- reverse-time verification fails closed;
- the UI contains the verification surface and trust rule;
- Action Plan → current/rescan verification wiring exists;
- verification-related Spatial Memory highlighting exists;
- the production API exposes `phase12-verification-v1`.

## Production gate

`.github/workflows/phase12-verification.yml` waits for the exact Vercel deployment and reads the real Neon-backed environment:

`env_warehouse_73266674`

It compares:

- State v2 — grounded emergency-exit obstruction;
- State v3 — later state where the condition/issue record disappeared, but the durable orange cart is still remembered **in front of the door**.

Expected result:

**failed**, not passed.

This is a deliberately important negative production proof: it demonstrates that SENTINEL does not confuse perception omission with physical resolution.

## Production proof — false-resolution defense PASS

Phase 12's first real production verification gate passed on exact deployed commit:

`65fc72e0df14c1822dbf5c9206c0b27c922d13ec`

Production workflow:

- **Phase 12 Production Verification**
- run `35718994390`
- result: **SUCCESS**
- persistence: **Neon**
- verification contract: **phase12-verification-v1**
- environment: `env_warehouse_73266674`
- previous immutable state: `state_9eef338f-2f7c-49f8-ac54-c8901f678d04` / State v2
- current immutable state: `state_1dcd5d3e-735c-45fc-a6e6-4fcfacdb04d4` / State v3
- aggregate result: **failed**
- resolved baseline conditions: **0**
- remaining baseline conditions: **1**
- inconclusive baseline conditions: **0**
- new non-normal conditions: **0**
- verification grounding evidence: **20**
- current evidence attached to the remaining verdict: **10**

The baseline condition remained the durable State v2 inferred access condition **Emergency exit access obstructed**.

State v3 no longer carried the old operational condition / issue record, but its current immutable snapshot still grounded the orange cart **in front of the door**. SENTINEL therefore returned `remaining` with confidence 1.0 instead of falsely declaring the condition resolved.

This production result proves:

- issue / condition disappearance is not treated as physical resolution;
- the baseline condition identity remains stable across verification;
- current-state evidence, not historical evidence alone, supports the definitive verdict;
- server-owned obstruction geometry can override model optimism;
- `failed` is a legitimate successful verification outcome when the physical problem remains.

This closes the **negative trust-boundary production gate**. It does **not** close Phase 12 itself.

## Remaining Phase 12 exit gate

The production false-resolution proof is complete, but the source exit condition still requires one positive physical closed-loop result.

To close Phase 12 completely, perform one controlled real rescan where:

1. a grounded condition exists;
2. SENTINEL creates an Action Plan;
3. the physical environment is actually changed;
4. a new scan clearly re-observes the same object/area;
5. Verification Agent returns **passed** from positive current evidence.

No historical snapshot may be rewritten to manufacture that result.

## Ordinary doorway obstruction hardening — 2026-09-22

The first controlled Phase 12 positive-pass attempt exposed a real product gap.

MiniCPM grounded an ordinary office scene with:

- an open office/conference-room door;
- a gray chair;
- the chair positioned directly in front of that door.

Ask the Building could describe that geometry, but no non-normal access condition had been created, so Action Planner correctly returned **Insufficient information to recommend an action**.

The root cause was deterministic composition scope: `deriveOperationalConditions` only composed obstacle→door geometry when the door was independently proven to be an emergency exit.

Current hardening adds a separate ordinary-doorway path:

- the object must be a grounded physical door;
- the obstacle must be on the conservative obstruction whitelist;
- placement must still be explicit and evidence-backed (`in_front_of`, blocking, obstructing, or across);
- explicit evidence-backed object `position.description` now participates in the same semantic geometry test;
- inference confidence remains bounded below its source facts;
- the unchanged **0.85 inferred threshold** still applies;
- severity remains capped at **medium**;
- safe/beside placement produces no condition;
- emergency-labelled doors without independent exit grounding cannot fall back to this generic rule;
- the stricter emergency-exit derivation remains unchanged and still requires independent grounded exit identity.

A qualifying ordinary scene now produces **Doorway access obstructed** — Inferred / Present / medium maximum operational issue.

Historical test states are not rewritten. A fresh scan is required to exercise the fix.
