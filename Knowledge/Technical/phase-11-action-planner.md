# Phase 11 — Action Planner

Status: **COMPLETE**

## Goal

Move SENTINEL from **knowing** to **doing** while keeping the action layer lightweight and evidence-first.

Source product flow:

`What should I do? → grounded condition / issue → ACTION PLAN → human action → rescan → Phase 12 verification`

The MVP contract remains deliberately narrow:

- generate one evidence-backed plan;
- order practical steps;
- keep every step visibly **Recommended**;
- tie actions to grounded conditions / issues / evidence;
- finish with **Rescan to verify**;
- do **not** build contractor marketplace, payments, procurement, or work-order commerce.

## Domain contract

Phase 11 uses the existing `ActionPlan` / `ActionStep` concepts and tightens them around the trust model.

Each accepted step carries:

- priority;
- description;
- `status: recommended`;
- related condition IDs;
- related issue IDs;
- related object IDs;
- optional specialist class;
- evidence IDs.

The plan itself is pinned to one immutable `stateId`.

This means a plan generated from a historical condition stays a historical recommendation. It cannot silently become a statement about the current environment.

## Grounding boundary

`ActionPlannerService` owns the trust boundary.

Planning can use only:

- non-normal conditions in the selected snapshot;
- active issues in the selected snapshot;
- objects connected to those conditions / issues or explicitly targeted by the caller;
- evidence already persisted for those grounded entities.

Explicit condition / issue / object IDs that do not belong to the selected immutable state fail closed with HTTP 422.

Nemotron returns only a draft. SENTINEL then:

1. filters every condition / issue / object / evidence ID to the server-owned scope;
2. drops steps that do not retain a grounded condition or issue;
3. fills grounded evidence from the accepted condition / issue;
4. caps priority against the condition / issue authority;
5. forces status to `recommended`;
6. appends the deterministic final step **Rescan to verify**.

No model output can mark a step `completed`, `resolved`, or `verified`.

## Priority policy

Planning priority cannot exceed the environmental trust layer:

- inferred condition → at most **medium**;
- observed hazard → at most **high**;
- observed damage / maintenance / access / compliance → at most **medium**;
- observed attention / unknown → at most **low**;
- issue-backed action → at most the issue severity.

This preserves the same evidence-first authority boundary used by condition / issue promotion.

## Safety / scope guardrails

The planning prompt forbids:

- invented diagnoses;
- invented measurements;
- costs or estimates;
- vendors / contractors / marketplace search;
- parts / procurement;
- payments;
- schedules;
- claims that work is complete;
- claims that a condition is resolved;
- claims that verification passed.

For electrical, fire-safety, structural, gas, pressurized, or similar specialist work, the plan may recommend safe isolation when directly supportable and escalation to an appropriate qualified professional. It must not generate unqualified repair instructions.

For uncertain conditions, the correct action is inspection / re-observation rather than asserting a repair.

## Product experience

Phase 11 stays inside the Living Spatial Intelligence interface.

Ask the Building now leads into planning:

`Conclusion → Why it matters → Create grounded action plan`

The Action Plan panel presents:

- **ACTION PLAN / RECOMMENDED**;
- plan goal;
- source state;
- grounded evidence count;
- ordered `01 / 02 / 03 ...` steps;
- priority;
- condition / issue / evidence grounding counts;
- optional specialist label;
- a visible **HUMAN CHECKPOINT**;
- **Choose rescan photo** as the handoff to the verification loop.

If a plan comes from an immutable historical state, the UI warns the user to reconfirm the current environment before acting.

Action-linked current physical objects use a separate amber Spatial Memory highlight.

## Deterministic gate

`npm run check:phase11-action-planner` verifies:

- explicit historical-state planning stays pinned to that immutable snapshot;
- later current-state conditions do not leak into historical planning context;
- hallucinated condition / issue / object / evidence IDs fail closed;
- a model attempt to escalate an inferred-access / medium issue to critical is capped at medium;
- a normal current state produces no fabricated plan and never calls the model;
- foreign requested IDs fail closed;
- every accepted action remains `recommended`;
- **Rescan to verify** is appended deterministically;
- no cost field is generated;
- product UI exposes Recommended action, Human Checkpoint, contextual planning, and action-object Spatial Memory highlighting.

## Production gate

`.github/workflows/phase11-action-planner.yml` waits for the exact Vercel deployment and then calls the production action API against:

- environment: `env_warehouse_73266674`;
- immutable state: `state_9eef338f-2f7c-49f8-ac54-c8901f678d04` (State v2).

State v2 is the real persisted warehouse state containing the grounded emergency-exit obstruction condition / medium access issue.

Current Warehouse State v3 is normal. The proof intentionally plans from State v2 and asserts:

- the plan remains historical;
- all steps are `recommended`;
- all IDs resolve inside the server-owned grounding envelope;
- corrective steps are evidence-backed;
- priority cannot exceed medium for this grounded case;
- the final step is **Rescan to verify**;
- no cost estimate is invented.

## Phase boundary

Phase 11 creates the plan. It does **not** decide whether the physical world changed.

That belongs to **Phase 12 — Verification Agent**.

## Production inference-budget hardening

The first exact-deployment production smoke on `fc25185dcc71f09f4ad5652becd526dc77a7c8e4` reached the correct fresh deployment and failed cleanly with `ACTION_PLAN_TIMEOUT` at the adapter's previous 60-second ceiling.

No trust or grounding rule was relaxed.

The follow-up hardening:

- removes redundant object-wide evidence IDs from the planning prompt when condition / issue evidence already exists;
- keeps object identity / position / confidence context without repeating large evidence lists;
- caps model-authored corrective steps at three before the deterministic rescan step;
- requests concise step descriptions;
- gives the dedicated action-planning inference a 90-second model timeout;
- gives `api/action-plan.ts` a bounded 120-second Vercel function ceiling;
- allows the production smoke one retry only for transient 502/503/504 provider failures.

The action IDs, priority caps, Recommended-only status, historical-state scope, and Phase 12 verification boundary remain unchanged.

## Production proof

Phase 11 closed on exact deployed commit:

`8c3193e0a87e0974fc414edb9da2e76222a5d810`

Production workflow:

- **Phase 11 Production Action Planner**
- run `35717004333`
- result: **SUCCESS**
- persistence: **Neon**
- action contract: **phase11-action-plan-v1**
- environment: `env_warehouse_73266674`
- immutable source state: `state_9eef338f-2f7c-49f8-ac54-c8901f678d04` / **State v2**
- selected state current: **false**
- generated steps: **4**
- grounded evidence references: **10**
- grounded conditions: **1**
- grounded issues: **1**
- grounded objects: **2**

The production gate verified:

- a real historical environmental condition can become a bounded Recommended action plan;
- every action condition / issue / object / evidence ID resolves inside the server-owned grounding envelope;
- the inferred access condition / medium issue cannot escalate action priority above medium;
- every step remains `recommended`;
- the final step is **Rescan to verify**;
- the plan does not claim physical resolution;
- the plan does not invent cost data.

The initial exact-deployment smoke on `fc25185dcc71f09f4ad5652becd526dc77a7c8e4` failed cleanly at the previous 60-second model timeout. That failure was not accepted as Phase 11 proof. Context/inference-budget hardening was applied without weakening any trust rule, and the exact deployed rerun passed.

## Exit status

**COMPLETE.**

SENTINEL can now move from a grounded environmental condition to a practical evidence-backed Recommended action sequence while preserving the human checkpoint and the separation between **Recommended** and **Verified**.

The next build phase is **Phase 12 — Verification Agent**.
