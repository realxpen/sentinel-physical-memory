# SENTINEL Project State

Last updated: 2026-09-06

## North star

**SENTINEL gives physical spaces a persistent AI memory so they can be observed, queried, compared, acted upon, and verified over time.**

Core loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

Hackathon track: **Best Apps and Agents**.

## Current phase

**Phase 2 — Core architecture cleanup: COMPLETE**

Phase 2 established replaceable application boundaries without rewriting the working product:

- `EnvironmentalMemoryRepository`
- `InMemoryEnvironmentalMemoryRepository`
- repository-backed `ScanPipeline`
- repository-backed `AskBuildingService`
- `DiffEngine`
- `VerificationService` contract
- `uncertain` diff vocabulary and safer absence semantics

## Next phase

**Phase 3 — Persistent Environmental Memory**

Immediate objective: implement the authoritative Supabase/Postgres-backed repository and stop depending on client-carried memory or serverless process memory.

Phase 3 must persist at minimum:

- environments
- states
- objects
- observations
- conditions/issues
- evidence
- relations
- diffs
- scan sources required to reconstruct history

The persistent repository must satisfy the existing `EnvironmentalMemoryRepository` contract.

## Verified implementation baseline

### Frontend

- React + TypeScript + Vite.
- Primary views: Memory / Observe / Changes.
- Browser-side video frame extraction.
- Contextual Ask and Reality Diff presentation exist.

### Scan / observation

- `src/scan/video-ingestion.ts` extracts selected frames.
- `src/scan/pipeline.ts` now loads and saves memory through `EnvironmentalMemoryRepository`.
- `/api/scan` remains the serverless scan endpoint.

### AI / Nebius

- Real Nebius Token Factory adapter remains in `src/ai/nebius.ts`.
- Default model remains `nvidia/nemotron-3-nano-omni` unless configured otherwise.
- Structured perception validation remains in place.

### Environmental memory

- `EnvironmentalMemoryStore` remains the domain/state engine.
- It supports environment creation, scan ingestion, state versioning, evidence/source upsert, object/issue/relation normalization, hydration and comparison.
- Persistence is now abstracted behind `EnvironmentalMemoryRepository`.
- Phase 2 implementation is still in-memory and therefore **not durable across serverless cold starts**.
- Client-carried serialized memory is retained only as a temporary compatibility bridge until Phase 3.

### Diff / Ask

- `EnvironmentalDiffEngine` implements `DiffEngine`.
- `ChangeType` now includes `uncertain`.
- Missing prior observations no longer automatically prove removal/resolution.
- `AskBuildingService` reads through the async memory repository.

### Action / verification

- Domain types for action plans and verification exist.
- `VerificationService` interface now exists.
- Full action and verification implementations remain Phase 11/12 work.

## Highest-priority gaps

1. **Durable environmental memory** — Phase 3 blocker.
2. **Historical correctness after database round-trip** — immutable snapshots must survive reload/cold start.
3. **Observation pipeline hardening** — real phone video reliability.
4. **Condition model quality** — observation vs interpretation semantics.
5. **Diff v2** — stable matching and evidence-qualified absence/removal.
6. **Action + verification** — complete the closed loop.
7. **Automated tests/reliability** — schema, persistence, diff and failure paths.

## Locked decisions

- SENTINEL = persistent environmental memory + change verification.
- Primary user = facility / operations manager.
- Demo environment = one controlled office.
- Track = Best Apps and Agents.
- No full metric 3D/BIM requirement for MVP.
- Evidence-first safety language.
- UI direction = Living Spatial Intelligence.
- All durable memory access goes through `EnvironmentalMemoryRepository`.

See `Knowledge/Decisions/`.

## Phase roadmap

- [x] Phase 0 — Repo knowledge system and project state
- [x] Phase 1 — Freeze the MVP contract
- [x] Phase 2 — Core architecture cleanup
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

## Phase 2 exit check

A new implementation should now be able to replace in-memory persistence with a database-backed repository without changing the scan pipeline, Ask service, or domain memory rules.

**Exit condition: met.**
