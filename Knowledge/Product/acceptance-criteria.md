# Phase 1 Acceptance Criteria — SENTINEL MVP

Status: **LOCKED**

This file is the executable product contract for the hackathon demo. Later phases may improve implementation, but they must not weaken these acceptance conditions.

## Controlled three-scan scenario

### Scan A — Baseline memory

The user records a short walkthrough of one controlled office.

Expected outcome:

- a new environmental state is created;
- useful objects/areas/conditions are represented with evidence IDs;
- the state remains available after reload/cold start once persistence is implemented;
- Ask can retrieve facts from this state.

### Scan B — Change observation

Make three safe, visually obvious changes in the controlled demo space:

1. **Added** — place boxes/objects in a designated demo egress/exit area without creating a real-world safety hazard.
2. **Moved** — move a clearly identifiable non-dangerous object such as a fire extinguisher prop/demo object or another stable asset.
3. **Resolved/removed condition** — remove a safe staged visible condition from Scan A.

Expected outcome:

- a second immutable environmental state is created;
- Reality Diff links Scan A → Scan B;
- the system reports supported `added`, `moved`, and `resolved/removed` changes;
- unsupported absence is classified `uncertain`, not automatically resolved.

### Scan C — Verification

Remove the priority staged obstruction/condition and observe the relevant area again.

Expected outcome:

- a third immutable state is created;
- verification evaluates the target action against current evidence;
- result is one of `passed | partial | failed | inconclusive`;
- the result retains evidence references and does not erase prior state history.

## Seven required questions

### Q1 — What needs my attention?

Must use the current state and current conditions.

Pass when:

- response identifies only grounded current conditions;
- includes relevant evidence IDs;
- communicates uncertainty when evidence is weak;
- does not present interpretation as direct observation.

### Q2 — Where is the electrical panel?

Must retrieve the remembered object and its semantic spatial context.

Pass when:

- response is grounded in a remembered object/location relationship;
- evidence references support the object/location claim;
- if the object was not observed, SENTINEL says it cannot locate it from memory.

Exact metric distance is not required.

### Q3 — What did you see near the server room?

Must reason over area/object/relation context.

Pass when:

- answer is limited to objects/conditions/relations represented in environmental memory;
- supporting evidence is returned;
- the answer does not invent proximity beyond stored semantic spatial context.

### Q4 — What changed since the last scan?

Must use the latest stored diff between historical states.

Pass when:

- answer cites the correct from/to states;
- returns meaningful supported changes;
- distinguishes added/removed/moved/changed/resolved/uncertain;
- does not infer resolution from non-observation without sufficient evidence.

### Q5 — Which change matters most?

Must reason over the latest diff plus current environmental context.

Pass when:

- the selected priority corresponds to an actual change/condition;
- rationale is grounded in stored evidence and context;
- severity language is cautious and operational, not professional certification.

### Q6 — What should I do?

Must create a lightweight action plan from grounded conditions/changes.

Pass when the plan contains:

- ordered steps;
- priority;
- related condition/change IDs;
- evidence IDs;
- assumptions/limitations where needed;
- a final rescan/verification step when appropriate.

No contractor marketplace, payment or autonomous repair action is required.

### Q7 — Has it been resolved?

Must use Scan C/current state against the target prior condition/action.

Pass when:

- result is `passed | partial | failed | inconclusive`;
- resolved, remaining and new conditions are distinguished;
- current evidence supports the conclusion;
- historical evidence remains available.

## Evidence and uncertainty rules

A product path fails acceptance if it:

- fabricates environmental observations;
- references evidence IDs that do not exist;
- silently changes historical states;
- marks a condition resolved solely because it was not detected in one later scan;
- claims exact measurements the system cannot support;
- hides model/inference failure behind fake success data.

## Experience acceptance

The demo product should expose the loop through the locked Living Spatial Intelligence language:

- **Observe environment**
- **This space is now remembered**
- **Ask this environment**
- **What changed**
- **What should I do?**
- **Verified** / clear inconclusive state

The environment remains the visual center. Do not replace the experience with a generic chat/dashboard flow.

## Phase 1 gate

Phase 1 is complete when:

- user, environment and three-scan scenario are fixed;
- supported and unsupported scope is explicit;
- the seven questions have measurable pass/fail criteria;
- current implementation gaps are documented without pretending they are complete;
- later implementation phases can reference this file as the acceptance contract.

**Gate status: MET.**
