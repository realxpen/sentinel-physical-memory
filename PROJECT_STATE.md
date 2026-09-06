# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 0 — Repo knowledge system and project state: COMPLETE**

Phase 0 established the canonical AED project layer:

- `AGENTS.md`
- `PROJECT_STATE.md`
- `Raw/`
- `Knowledge/`
- `Archive/`
- locked product, UX, technical, and decision records

## Next phase

**Phase 1 — Freeze the MVP contract**

Immediate objective: verify that the current implementation and every planned task obey the exact supported/unsupported MVP boundary in `Knowledge/Product/mvp.md`. No new feature category should be added before this gate is complete.

## Verified implementation baseline

The repository is not starting from zero.

### Frontend

- React + TypeScript + Vite application.
- Primary product views already use **Memory / Observe / Changes**.
- Video selection triggers browser-side frame extraction.
- Existing UI includes environmental memory presentation, evidence drawer, contextual Ask control, and a Reality Diff view.
- Static change examples are explicitly labelled as interaction previews when no real diff exists.

### Scan / observation pipeline

- `src/scan/video-ingestion.ts` extracts selected frames from walkthrough video.
- `src/scan/pipeline.ts` orchestrates scan processing.
- Current UI targets up to 12 evidence frames at reduced resolution/quality before inference.
- `/api/scan` is the current serverless scan endpoint.

### AI / Nebius

- `src/ai/nebius.ts` contains a real Nebius Token Factory adapter.
- Default Token Factory base URL: `https://api.tokenfactory.nebius.com/v1`.
- Default model: `nvidia/nemotron-3-nano-omni`.
- The adapter calls `/chat/completions`, supports multimodal frame content, validates perception JSON, and supports grounded reasoning responses.
- `src/ai/perception-schema.ts` validates structured perception output.

### Environmental memory

- `src/memory/store.ts` implements `EnvironmentalMemoryStore`.
- It currently stores memories and historical snapshots in process-local `Map` structures.
- It supports environment creation, scan ingestion, state versioning, evidence/source upsert, object/issue/relation normalization, hydration, and scan-to-scan comparison.
- Historical snapshots are rebuilt on hydration and used for diffing.
- This is **not yet durable storage** across serverless cold starts unless the client sends serialized memory back into the API.

### Diff / Ask

- `src/memory/diff-engine.ts` exists for environmental comparison.
- `src/memory/ask-building.ts` exists for memory-grounded questions.
- `/api/ask-building` is the current reasoning endpoint.

### Repository / delivery

- MIT `LICENSE` exists.
- `.env.example` exists.
- Vercel configuration exists.
- Build command: `tsc -b && vite build`.
- No automated test script is currently defined in `package.json`.

## Highest-priority gaps

1. **Durable environmental memory** — current core storage is process-local.
2. **MVP contract freeze** — prevent feature drift before deeper implementation.
3. **Historical correctness under persistence** — immutable states/snapshots must survive reload/cold start.
4. **Diff reliability** — matching must become robust enough for the controlled demo.
5. **Action + verification loop** — current product reaches Ask/Diff, but the closed loop still needs explicit action-plan and verification product contracts.
6. **Reliability/testing** — schema, diff, persistence, and failure paths need automated coverage.
7. **Submission proof** — later README/demo must clearly prove live Nebius/NVIDIA usage.

## Locked decisions

- Position SENTINEL as **persistent environmental memory + change verification**, not generic building inspection.
- Primary user: facility / operations manager.
- Demo environment: one office.
- Primary hackathon track: Best Apps and Agents.
- Avoid full metric 3D reconstruction in the MVP; use spatially grounded semantic memory.
- Use evidence-first safety language.
- Keep the visual direction **Living Spatial Intelligence**.

See `Knowledge/Decisions/`.

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [ ] Phase 1 — Freeze the MVP contract
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

## Phase 0 exit check

A new coding agent should now be able to read `AGENTS.md` + this file and answer:

- What is SENTINEL?
- Who is the MVP for?
- What is already implemented?
- What is explicitly out of scope?
- Which source files are canonical?
- What is the next engineering gate?

**Exit condition: met.**
