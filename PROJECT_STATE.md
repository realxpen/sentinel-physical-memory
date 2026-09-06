# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 1 — Freeze the MVP contract: COMPLETE**

Phase 1 locked:

- one primary user: facility / operations manager;
- one reference environment: controlled office;
- one three-scan demo: Scan A baseline → Scan B diff → Scan C verification;
- seven required environmental questions;
- required Reality Diff vocabulary including `uncertain`;
- evidence/uncertainty rules;
- explicit supported and unsupported scope;
- implementation acceptance criteria and a truthful current-capability audit.

Canonical Phase 1 files:

- `Knowledge/Product/mvp.md`
- `Knowledge/Product/acceptance-criteria.md`
- `Knowledge/Technical/phase-1-implementation-audit.md`
- `Knowledge/Decisions/DEC-002-mvp-scope.md`

## Next phase

**Phase 2 — Core architecture cleanup**

Immediate objective: create the persistence/service boundaries required by the locked MVP **without rewriting working capabilities**.

Priority work:

1. introduce an `EnvironmentalMemoryRepository` interface;
2. keep environmental state/domain behavior separated from durable storage;
3. provide an in-memory repository implementation for development/testing;
4. make API routes depend on repository/service contracts rather than client-supplied memory as the persistence mechanism;
5. align the domain contract with `uncertain` change classification;
6. define clean verification/diff service boundaries needed by later phases;
7. keep the real Nebius adapter intact.

Phase 2 exit target: clean build, explicit replaceable contracts, no duplicated environmental-memory logic in API routes, and an architecture ready for a persistent repository in Phase 3.

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite application.
- Primary product views use **Memory / Observe / Changes**.
- Browser-side frame extraction is connected to the scan flow.
- UI includes environmental memory presentation, evidence drawer, contextual Ask control, and Reality Diff view.
- Static change examples are labelled as interaction previews when no real diff exists.

### Scan / observation pipeline

- `src/scan/video-ingestion.ts` extracts selected frames from walkthrough video.
- `src/scan/pipeline.ts` orchestrates scan processing.
- Current UI targets up to 12 evidence frames at reduced resolution/quality before inference.
- `/api/scan` is the current serverless scan endpoint.

### AI / Nebius

- `src/ai/nebius.ts` contains a real Nebius Token Factory adapter.
- Default base URL: `https://api.tokenfactory.nebius.com/v1`.
- Default model: `nvidia/nemotron-3-nano-omni`.
- Adapter calls `/chat/completions`, supports multimodal frame content, validates perception JSON, and supports grounded reasoning.
- `src/ai/perception-schema.ts` validates structured perception output.

### Environmental memory

- `src/memory/store.ts` implements `EnvironmentalMemoryStore`.
- Memories/snapshots are currently process-local `Map` structures.
- It supports environment creation, scan ingestion, state versioning, evidence/source upsert, object/issue/relation normalization, hydration, and comparison.
- Historical snapshots are used for diffing.
- Durable persistence is not yet implemented.

### Diff / Ask

- `src/memory/diff-engine.ts` provides deterministic environmental comparison.
- `src/memory/ask-building.ts` provides memory-grounded questions.
- `/api/ask-building` is the reasoning endpoint.
- Current diff behavior has a correctness gap: missing previous issues are treated as resolved without sufficient absence verification.
- Current domain `ChangeType` does not yet include required `uncertain`.

### Action / verification

- Domain types for action plans and verification already exist.
- Full Action Planner and Verification Agent/service/UI loops are not implemented yet.

### Repository / delivery

- MIT `LICENSE` exists.
- `.env.example` exists.
- Vercel configuration exists.
- Build command: `tsc -b && vite build`.
- No automated test script is currently defined.

## Locked decisions

- Position SENTINEL as **persistent environmental memory + change verification**, not generic building inspection.
- Primary user: facility / operations manager.
- Demo environment: one office.
- Primary hackathon track: Best Apps and Agents.
- Avoid full metric 3D reconstruction in MVP; use semantic spatial grounding.
- Use evidence-first safety language.
- Keep the visual direction **Living Spatial Intelligence**.
- Do not interpret one missed detection as proof of resolution.

See `Knowledge/Decisions/` and `Knowledge/Product/acceptance-criteria.md`.

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [x] Phase 1 — Freeze the MVP contract
- [ ] Phase 2 — Core architecture cleanup
- [ ] Phase 3 — Persistent Environmental Memory
- [ ] Phase 4 — Observation pipeline hardening
- [ ] Phase 5 — Perception quality and condition model
- [ ] Phase 6 — Environmental state history
- [ ] Phase 7 — Environmental Diff Engine v2
- [ ] Phase 8 — Reality Diff UI
- [ ] Phase 9 — Spatial Memory experience
- [ ] Phase 10 — Ask the Building product layer
- [ ] Phase 11 — Action Planner
- [ ] Phase 12 — Verification Agent
- [ ] Phase 13 — Living Spatial Intelligence UI rebuild/polish
- [ ] Phase 14 — Demo scenario engineering
- [ ] Phase 15 — Reliability and guardrails
- [ ] Phase 16 — Nebius/NVIDIA architecture hardening
- [ ] Phase 17 — Submission readiness
- [ ] Phase 18 — Final demo polish

## Phase 1 exit check

A coding agent can now answer, without inventing scope:

- exactly who the MVP serves;
- exactly which environment is supported;
- what Scan A, B and C must prove;
- which seven questions the demo must support;
- which features are explicitly forbidden from the hackathon MVP;
- which existing capabilities are real versus partial/missing;
- what correctness gaps must be fixed later.

**Exit condition: met.**
