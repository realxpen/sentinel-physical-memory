# Devpost Submission Draft — SENTINEL

## Project name

**SENTINEL**

## Elevator pitch

**The AI memory for the physical world — observe a place, remember its state, ask what changed, act on grounded evidence, and verify the result.**

## Track

**Best Apps and Agents**

## Working demo

https://sentinel-physical-memory.vercel.app

## Public source repository

https://github.com/realxpen/sentinel-physical-memory

## Demo video

**TODO before final submission:** add the public YouTube URL. The video must be under three minutes.

## About the project

### Inspiration

Software can remember almost everything digital: documents, source code, transactions, websites, and conversations. Physical environments are different. Their history is usually scattered across photos, inspection notes, spreadsheets, messages, and the memory of whoever happened to be there.

We wanted to answer a different question:

**What would it mean for a physical place to remember itself?**

That became SENTINEL.

### What it does

SENTINEL turns ordinary photos and walkthroughs into persistent environmental memory.

A user observes a space. SENTINEL grounds visible evidence, creates an immutable environmental state, and remembers objects, conditions and relationships. When the space is observed again, SENTINEL compares the new state with the old one and produces a **Reality Diff**.

Users can then ask the place:

- What changed?
- What needs my attention?
- Which change matters most?
- What should I do?
- Has it actually been resolved?

SENTINEL can generate a bounded evidence-backed Action Plan, then compare a later observation with the original condition and return **passed, partial, failed, or inconclusive** verification.

The core trust rule is:

**Not re-observed is not resolved.**

A condition only becomes Verified when positive current evidence supports the physical outcome.

### How we built it

The frontend is React + TypeScript + Vite and is deployed on Vercel.

Environmental memory is persisted in Neon Postgres. Every scan creates an immutable state snapshot, so updating a current object does not rewrite what an earlier state believed.

The AI runtime is Nebius Token Factory.

Production responsibilities are split deliberately:

- **MiniCPM-V** handles multimodal scene perception and paired temporal visual checks.
- **NVIDIA Nemotron 3 Nano 30B-A3B** handles Ask the Building reasoning and Action Planner reasoning.
- visual condition verification runs through Token Factory using the configured multimodal verification model.

Model output is wrapped in deterministic trust layers for evidence grounding, schema validation, condition promotion, object identity, Reality Diff and verification.

Every Token Factory call records non-secret provider/model/role/latency telemetry. Our exact-main production proof executed a real Ask request through Nebius Token Factory using NVIDIA Nemotron and measured 15,904 ms latency.

### Challenges

The hardest problem was not generating a description of an image. It was deciding what SENTINEL was allowed to believe over time.

Examples:

- the same door can receive different provider object IDs across scans;
- a missing object may be outside the camera view rather than removed;
- duplicate perception/audit passes can describe one physical condition twice;
- visually similar structural details can create noisy diffs;
- a model may optimistically call something resolved even when the current image does not prove it.

We solved these by keeping immutable history and adding conservative server-owned rules around identity, evidence, condition deduplication and verification.

### Accomplishments

- persistent Neon-backed environmental memory;
- immutable state history;
- evidence-grounded perception;
- deterministic Reality Diff;
- Ask the Building over bounded environmental memory;
- evidence-backed Action Planner;
- closed-loop positive/negative Verification Agent behavior;
- repeated controlled Scan A → B → C demo;
- reliability guards for timeouts, malformed output, missing state/evidence, network failure, duplicate conditions and cold start;
- live Nebius/NVIDIA model-role/latency runtime proof.

### What we learned

Persistent AI for physical environments needs a different trust model from a normal assistant.

The important distinction is between:

- **Observed** — directly visible evidence;
- **Inferred** — model interpretation;
- **Recommended** — proposed human action;
- **Verified** — outcome supported by a later physical observation.

Keeping those layers separate made the product more useful and much harder to fool into false certainty.

### What's next

- richer multi-room memory;
- stronger cross-view identity;
- sensor/document evidence;
- organization-level environment fleets;
- event-driven monitoring;
- approved external actions;
- edge/continuous observation;
- learning from verified physical outcomes.

## How NVIDIA is used

**NVIDIA Nemotron 3 Nano 30B-A3B** is used for core environmental reasoning and action planning. It is not a cosmetic chatbot. Ask and Action Plan are fed server-bounded state/evidence context, and returned references are checked before presentation.

## How Nebius is used

SENTINEL makes runtime inference calls to **Nebius Token Factory**.

The same inference layer powers multimodal perception, temporal verification, Nemotron reasoning, action planning and physical verification.

The application exposes non-secret inference traces so judges can see which model handled which role and how long the request took.

## Nebius / NVIDIA feedback

What worked well:

- the Token Factory chat-completions style interface made it practical to keep one adapter around several inference roles;
- explicit model selection let us separate multimodal work from reasoning work;
- it was straightforward to put NVIDIA Nemotron on the critical reasoning path rather than bolt it on at the end.

What we had to engineer around:

- multimodal and reasoning latency can be long enough that request budgets matter;
- transient upstream failures/timeouts need bounded retry rather than blind repeated inference;
- structured-output consumers still need normalization, repair and strict server-side grounding.

What would improve the builder experience:

- clearer model-by-model capability guidance for multimodal inputs;
- stronger examples for production timeout/latency expectations;
- first-class request tracing/latency observability in the builder workflow;
- very explicit region/base-URL guidance when moving from examples to production.

## Significant update during the submission period

SENTINEL was started during the hackathon submission period. The submission does not rely on a pre-hackathon SENTINEL product version.

## Testing instructions

No login is required.

1. Open the working demo.
2. Create a location.
3. Upload a baseline photo.
4. Upload a second photo after making one obvious physical change.
5. Inspect Changes / Reality Diff.
6. Ask a grounded question.
7. If an actionable condition exists, create an Action Plan.
8. Correct the condition, rescan, and verify.

Detailed guide: `docs/JUDGE_TESTING.md`.

## Built with

- React
- TypeScript
- Vite
- Vercel
- Neon Postgres
- Nebius Token Factory
- NVIDIA Nemotron 3 Nano 30B-A3B
- MiniCPM-V
