# SENTINEL Hackathon MVP Contract

Status: **LOCKED**
Phase gate: **Phase 1 complete**
Last reviewed: 2026-09-06

## Product claim we must prove

> **SENTINEL does not just see a room; it remembers the room and knows when it changes.**

The MVP is successful only if the working product demonstrates persistent physical-world memory across time, not merely one-shot visual analysis.

## Primary user

One primary user: **facility / operations manager**.

## Reference environment

One controlled **office** environment.

Do not widen the demo to multiple verticals before the office loop is reliable.

## Locked core scenario

```text
Scan A
  ↓
Environment remembered
  ↓
Ask grounded questions
  ↓
Physical change
  ↓
Scan B
  ↓
Reality Diff
  ↓
Reason about priority
  ↓
Recommend action
  ↓
User fixes condition
  ↓
Scan C
  ↓
Verify resolution
```

## Required product capabilities

1. Accept a short office walkthrough video.
2. Extract a small set of useful evidence frames.
3. Run real NVIDIA/Nemotron inference through Nebius.
4. Produce structured observations with confidence and evidence.
5. Create an environmental state with objects, conditions, relationships, source references and evidence references.
6. Persist environmental memory beyond browser/serverless process lifetime.
7. Retrieve current and historical memory for a question.
8. Answer evidence-grounded environmental questions.
9. Compare two states and classify meaningful changes.
10. Produce a lightweight evidence-backed action plan.
11. Process a later observation and verify whether the target condition is `passed`, `partial`, `failed`, or `inconclusive`.

## Required demo questions

The working product must support these questions against grounded memory:

1. **What needs my attention?**
2. **Where is the electrical panel?**
3. **What did you see near the server room?**
4. **What changed since the last scan?**
5. **Which change matters most?**
6. **What should I do?**
7. **Has it been resolved?**

The system may answer that evidence is insufficient. It must never invent an environmental fact to satisfy the scripted question.

Detailed acceptance rules live in `Knowledge/Product/acceptance-criteria.md`.

## Required change vocabulary

Reality Diff must be able to express:

- `added`
- `removed`
- `moved`
- `changed`
- `resolved`
- `uncertain`

`uncertain` is required when an apparent absence or change is not sufficiently supported by current evidence. A missing observation alone is not automatically proof that a condition is resolved.

## Trust contract

Every safety/maintenance conclusion preserves three conceptual levels:

- **Observed** — directly supported by supplied evidence.
- **Inferred** — model interpretation of observed evidence.
- **Recommended** — suggested human action.

SENTINEL does not present uncertain visual inference as professional certification.

## In scope

- one controlled office
- short phone walkthroughs
- selected-frame multimodal perception
- structured evidence/provenance
- semantic spatial memory
- durable environmental state/history
- contextual Ask
- Reality Diff
- evidence-backed prioritization
- lightweight action plan
- Scan C verification
- real Nebius/NVIDIA runtime inference
- graceful uncertainty/failure states

## Explicitly out of scope

- contractor marketplace
- payments
- provider hiring
- robotics control
- IoT fleet management
- autonomous physical repair
- full BIM / professional 3D surveying
- exact metric spatial measurement unless independently supported
- complex authentication/role systems
- enterprise multi-tenancy
- complete facility-management SaaS
- dozens of integrations
- speculative features that do not improve the three-scan demo

## Scope-change rule

No new feature category may enter the hackathon MVP unless:

1. the complete Scan A → Scan B → Scan C loop is already reliable;
2. the feature directly improves one of the four judging dimensions; and
3. an explicit decision record is added under `Knowledge/Decisions/`.

## MVP definition of done

A judge can observe a real controlled office, see a **durably persisted** environmental memory, ask a meaningful grounded question, alter the environment, observe again, see an understandable Reality Diff, ask which change matters, receive an evidence-backed action plan, fix the staged condition, rescan, and see a grounded verification result.

The final path must use a real NVIDIA open-source model through Nebius infrastructure.
