# SENTINEL Canonical Demo Scenario

## Goal

Demonstrate the complete physical-memory loop in under three minutes:

```text
observe → remember → detect → ask → plan → change → rescan → verify
```

The final hackathon story is deliberately narrow: **one office lounge, one obvious physical obstruction, one verified correction.**

Do not add extra movement or secondary issues just to make the demo look busier.

## Proven reference environment

The production generalization proof is:

**Office Lounge Test 4**

It already completed the full loop on a scene different from the original hallway:

- State v1 — clean office lounge / exit clear;
- State v2 — cardboard boxes physically obstruct the exit;
- Reality Diff — one needs-attention exit obstruction + one real physical addition: Cardboard Boxes;
- Ask — the exit obstruction is the change that matters most;
- Action Plan — clear obstruction + deterministic rescan-to-verify handoff;
- State v3 — boxes removed, same exit area visible;
- Verification — **1 resolved / 0 remaining / 0 inconclusive / 0 new** from positive current evidence.

This environment is the safest source for final presentation footage because it is already persisted and proven. Do **not** mutate it during recording.

## Scan A — baseline

Physical state:

- exit route visibly clear;
- no cardboard boxes in the path;
- stable office anchors remain visible: exit door/signage, furniture, plants, kitchen area and safety equipment.

Product story:

1. Open State v1 / Memory.
2. Show that the place has an immutable remembered state.
3. Briefly expose the remembered objects/evidence without turning the video into an inventory tour.

Narration:

> Physical places usually have no persistent machine memory. SENTINEL gives them one.

## Scan B — one meaningful change

Physical state:

- same office context;
- stacked cardboard boxes now occupy the exit access area.

Target product story:

- **Needs attention:** Emergency exit access obstructed;
- **Physical change:** New: Cardboard Boxes;
- no person hallucination;
- no furniture-as-obstruction noise;
- no fake architectural churn;
- no false resolution.

Show **What changed. / Reality Diff** with State v1 and State v2 side by side.

Then Ask:

> **Which change matters most?**

Target reasoning:

- prioritize the exit obstruction;
- connect it to Cardboard Boxes + Exit Door;
- cite grounded evidence from State v2.

## Action Plan

Create the grounded action plan from State v2.

Target plan:

1. **Clear obstruction** — remove the cardboard boxes from in front of the exit.
2. **Rescan to verify** — capture the same area after the physical change.

Trust gate:

- all steps remain **Recommended**;
- nothing is marked completed;
- there is only one verification handoff.

## Scan C — physical correction

Physical state:

- boxes removed;
- same exit door / EXIT-area context clearly visible;
- access path visibly clear.

The important verification rule is not “boxes disappeared.”

The important rule is:

> **Not re-observed is not resolved.**

Resolution requires positive current evidence from the same physical context.

## Verification

Run Phase 12 against State v2 → State v3.

Locked success target:

```text
Verified.

Emergency exit access obstructed
RESOLVED

1 resolved
0 remaining
0 inconclusive
0 new
```

The current image should positively show the exit area clear and unobstructed, anchored by the same durable exit context.

## Final recording strategy

For the submission video, prefer the already-proven persisted **Office Lounge Test 4** states rather than creating another high-variance environment during the final take.

You may re-run Ask / Action / Verification on those immutable states and cut inference waiting time in editing.

If you want a fresh Observe interaction as B-roll, use a disposable rehearsal environment. Do not create State v4 in Office Lounge Test 4.

## Demo narration idea

**Opening**

> Physical places usually have no persistent machine memory. SENTINEL gives them one.

**Memory**

> This office is now an immutable remembered environmental state grounded to visual evidence.

**Reality Diff**

> I changed reality, not a database. SENTINEL compared two remembered states and found the new exit obstruction.

**Ask**

> Because it remembers the environment, I can ask which change matters most.

**Action**

> SENTINEL recommends the smallest grounded next step, but never pretends the work already happened.

**Verification**

> After the correction, SENTINEL does not treat disappearance as proof. It verifies that the same exit area is visibly clear.

**Close**

> SENTINEL turns the physical world into persistent, queryable, verifiable memory.

## Recording rule

The official submission video must be publicly visible on YouTube and under three minutes. Keep the working product on screen immediately; avoid long title screens, setup, login, or waiting.

Do not use copyrighted music or third-party material unless you have permission.
