# SENTINEL Hackathon MVP Contract

Status: **LOCKED FOR PHASE 1 REVIEW**

## User

One primary user: **facility / operations manager**.

## Environment

One controlled **office** environment.

## Core scenario

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
5. Create an environmental state with objects, conditions, relationships and source/evidence references.
6. Persist environmental memory beyond browser/serverless process lifetime.
7. Retrieve current and historical memory for a question.
8. Answer evidence-grounded environmental questions.
9. Compare two states and classify meaningful changes.
10. Produce a lightweight evidence-backed action plan.
11. Process a later observation and verify whether the target condition is resolved, partial, failed, or inconclusive.

## Required demo questions

- What needs my attention?
- Where is the electrical panel?
- What did you see near the server room?
- What changed since the last scan?
- Which change matters most?
- What should I do?
- Has it been resolved?

If the available evidence does not support an answer, SENTINEL must say so rather than inventing one.

## Required change vocabulary

- `added`
- `removed`
- `moved`
- `changed`
- `resolved`
- `uncertain` when absence/change cannot be safely verified

## Trust contract

Every safety/maintenance conclusion should preserve three levels:

- **Observed** — directly supported by supplied evidence.
- **Inferred** — model interpretation of observed evidence.
- **Recommended** — suggested human action.

Do not present uncertain visual inference as professional certification.

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

## MVP definition of done

A judge can observe a real controlled office, see a persisted environmental memory, ask a meaningful grounded question, alter the environment, observe again, see an understandable Reality Diff, ask which change matters, receive an action plan, fix the staged condition, rescan, and see a grounded verification result.
