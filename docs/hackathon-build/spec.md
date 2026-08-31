# SENTINEL Technical Specification

## 1. Objective

Build a focused, demonstrable MVP for the Nebius × NVIDIA Global AI Hackathon: a web application that turns walkthrough media into persistent environmental memory and performs scan-to-scan change verification.

The technical north star is:

`SCAN → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

## 2. System boundary

The MVP has six logical layers:

1. **Web client** — upload/capture media, show processing state, environmental memory, Ask the Building, issue/action views, and environment diff.
2. **API/orchestrator** — validates requests, coordinates inference/retrieval/comparison, and exposes stable application APIs.
3. **Perception pipeline** — samples useful frames and sends multimodal evidence to the selected NVIDIA model through Nebius.
4. **Environmental memory** — stores normalized entities, relationships, observations, timestamps, confidence, and evidence references.
5. **Agent reasoning** — retrieves state/history and produces evidence-backed answers, priorities, and action plans.
6. **Verification pipeline** — processes a later scan, aligns it to the previous state, classifies differences, and updates memory.

## 3. Reference architecture

```text
Browser
  │
  ├── Scan upload
  └── Natural-language query
        │
        ▼
Application API
        │
        ├──────────────► Media/Frame Pipeline
        │                       │
        │                       ▼
        │                Nemotron multimodal inference
        │                       │
        │                       ▼
        │                Structured observations
        │                       │
        ├───────────────────────┤
        ▼                       ▼
Environmental Memory      Agent Orchestrator
        │                       │
        │                 ┌─────┼─────┐
        │                 ▼     ▼     ▼
        │              Memory Safety Planning
        │                 │     │     │
        └─────────────────┴─────┴─────┘
                          │
                          ▼
                   Reasoned response
                          │
                          ▼
                    User / Action Plan
                          │
                     follow-up scan
                          │
                          ▼
                    State Comparator
                          │
                          ▼
                    Environment Diff
                          │
                          ▼
                   Memory state update
```

## 4. Model strategy

Use model specialization rather than one model for every task.

### 4.1 Nemotron 3 Nano Omni

Primary multimodal perception candidate. Responsibilities:

- interpret sampled video/image evidence;
- extract visible entities and conditions;
- read visible text/signage when supported;
- produce evidence-grounded structured observations.

### 4.2 Nemotron 3 Nano

Efficient specialist tasks:

- normalize entity labels;
- classify issue types;
- extract structured fields;
- assist state matching/comparison;
- perform lightweight verification checks.

### 4.3 Nemotron 3 Super

Primary agentic orchestration/reasoning candidate:

- determine which memory is relevant;
- coordinate specialist tasks;
- answer environmental questions;
- prioritize issues;
- produce action-plan drafts.

### 4.4 Nemotron 3 Ultra

Reserved for high-value difficult reasoning, if available through the chosen Nebius runtime:

- long-horizon plan synthesis;
- conflicting evidence resolution;
- complex historical reasoning.

If Ultra access/cost/latency prevents a reliable MVP, Super remains the fallback. The product must remain functional without forcing Ultra into every request.

## 5. Nebius integration

The implementation must make a real runtime call to either Nebius Token Factory inference or run relevant workloads on Nebius AI Cloud, satisfying the hackathon requirement.

Create an inference adapter so application code does not depend directly on provider-specific response shapes:

```text
ModelProvider
  ├── inferMultimodal(input)
  ├── inferText(input)
  └── healthCheck()
```

The adapter should normalize responses into application schemas and expose model/provider metadata for debugging and hackathon documentation.

## 6. Environmental state schema

Conceptual observation:

```json
{
  "id": "obs_123",
  "entity_id": "entity_456",
  "entity_type": "electrical_panel",
  "label": "Main electrical panel",
  "space_id": "space_server_room",
  "approximate_location": "east_wall",
  "state": "visible_obstruction",
  "confidence": 0.87,
  "classification": "observed",
  "evidence": ["frame_183", "frame_191"],
  "observed_at": "2026-08-31T10:00:00Z",
  "scan_id": "scan_001"
}
```

Use a stable entity identity where possible so the same physical entity can be matched across scans.

## 7. Memory model

MVP storage may use a relational database with JSON fields plus vector search where needed. A full graph database is not required for the first vertical slice.

Minimum logical records:

- `scans`
- `media_assets`
- `spaces`
- `entities`
- `observations`
- `relationships`
- `issues`
- `actions`
- `evidence`

Historical observations must remain queryable by scan/time.

## 8. Retrieval

For a question, retrieve from three contexts:

1. Current environmental state.
2. Historical observations relevant to the query.
3. Evidence references supporting retrieved facts.

Use semantic retrieval for natural-language matching and structured filters for entity, space, issue, and time constraints.

## 9. Agent contracts

### Perception Agent

Input: media references + scan metadata.

Output: structured observations with confidence and evidence.

### Memory Agent

Input: observations + existing state.

Output: normalized entities, relationships, state updates, and retrieval records.

### Reasoning Agent

Input: user query + retrieved state/history.

Output: answer, evidence references, confidence/uncertainty, and optional priority.

### Action Agent

Input: issues + user constraints.

Output: ordered action-plan items, rationale, required specialist category, and assumptions.

### Verification Agent

Input: previous state + current observations.

Output: `new | resolved | moved | changed | unchanged | uncertain` changes with evidence.

## 10. Safety and trust

The system must distinguish:

- `observed`: directly supported by evidence;
- `inferred`: model conclusion based on observations;
- `recommended`: suggested action.

Potential hazards should be phrased as potential observations, not professional certification. Low-confidence claims should be marked uncertain and should not automatically trigger consequential actions.

## 11. Comparison algorithm

MVP comparison sequence:

1. Match current observations to prior entities using entity attributes, spatial context, and semantic similarity.
2. Identify unmatched current entities as candidates for `new`.
3. Identify unmatched prior entities as candidates for `resolved` only when absence is sufficiently evidenced; otherwise mark uncertain.
4. Compare state fields for matched entities.
5. Compare approximate location/context to detect `moved`.
6. Generate a human-readable diff with evidence.
7. Persist the new observation state.

Do not claim exact metric movement unless the perception pipeline supports reliable measurement.

## 12. API surface

Initial endpoints:

```text
POST /api/scans
POST /api/scans/:id/process
GET  /api/scans/:id
GET  /api/environments/:id/state
POST /api/environments/:id/ask
POST /api/environments/:id/plan
POST /api/environments/:id/compare
GET  /api/environments/:id/timeline
GET  /api/health
```

Exact framework and route naming can change during implementation, but contracts should remain simple and typed.

## 13. Frontend experience

Primary screens/components:

- Dashboard / environment list.
- Scan upload and processing state.
- Environment overview.
- Issue priority view.
- Ask the Building conversational panel.
- Evidence viewer.
- Action plan.
- Environment Diff / timeline.

The UI should emphasize the physical-memory metaphor rather than exposing internal agent infrastructure.

## 14. Demo fixture

Create a deterministic office demo fixture with a first scan and a second scan. The fixture should allow a real model-backed path while providing enough controlled data to make the demonstration reproducible.

The intentional physical change should be visually obvious and safe to stage, such as an obstruction near an emergency exit or movement of a non-hazardous object. Avoid staging dangerous electrical or physical safety conditions.

## 15. Testing strategy

Unit tests:

- schema validation;
- observation normalization;
- entity matching;
- diff classification;
- confidence handling;
- prompt/response parsing;
- action-plan constraints.

Integration tests:

- inference adapter;
- scan processing;
- memory persistence;
- question answering retrieval;
- compare/verify pipeline.

End-to-end acceptance:

- process scan A;
- ask a question;
- process scan B;
- produce a meaningful diff;
- retrieve evidence for the diff;
- update environmental memory.

## 16. Deployment requirements

The final deployment must be publicly reachable for judging and must run consistently on the declared platform. Secrets must be configured through environment variables. README instructions must explain setup, required credentials, model/provider configuration, local development, and deployment.

## 17. Performance strategy

- Sample video rather than sending every frame.
- Prefer efficient models for repetitive tasks.
- Cache scan-derived observations.
- Avoid recomputing unchanged state.
- Use background processing for long media jobs where supported.
- Reserve expensive reasoning for questions/action plans that need it.

## 18. Explicit non-goals

No marketplace, payments, robotics control, IoT fleet, full BIM system, professional certification, or autonomous physical repair in MVP.

## 19. Definition of done

A judge can upload/capture a controlled walkthrough, see SENTINEL build environmental memory, ask a question and receive an evidence-backed answer, submit a second observation after a deliberate change, and see a clear environment diff explaining what changed and why it matters. The path uses a real NVIDIA model through Nebius infrastructure.
