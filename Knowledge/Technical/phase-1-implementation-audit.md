# Phase 1 Implementation Audit

Date: 2026-09-06
Status: **Baseline audited against locked MVP contract**

This audit records what the repository actually supports before Phase 2. It is not a product claim or completion claim.

## Capability matrix

| MVP capability | Current status | Evidence in repo | Gap / next work |
| --- | --- | --- | --- |
| Short walkthrough video | Implemented baseline | `src/main.tsx`, `src/scan/video-ingestion.ts` | Harden normal phone videos in Phase 4 |
| Selected evidence frames | Implemented baseline | UI requests up to 12 frames; scan ingestion modules exist | Scene/duplicate/quality hardening later |
| Real Nebius/Nemotron runtime adapter | Implemented baseline | `src/ai/nebius.ts` | Runtime credentials/deployment validation remains |
| Structured perception schema | Implemented baseline | `src/ai/perception-schema.ts` | Improve condition semantics/evidence rules in Phase 5 |
| Environmental state creation | Implemented baseline | `src/memory/store.ts` | Repository abstraction + durable persistence missing |
| Durable memory across cold start | **Missing** | current store uses process-local `Map`s; client can send serialized memory back | Phase 2 interface, Phase 3 persistent repository |
| Historical immutable state logic | Partial | state versions + in-memory snapshots + hydration exist | Must survive persistence and independent historical queries |
| Grounded Ask | Implemented baseline | `src/memory/ask-building.ts`, `/api/ask-building` | Seven demo-question acceptance not yet automated/tested |
| Reality Diff | Partial | `src/memory/diff-engine.ts` | Matching/absence semantics need hardening |
| `uncertain` change type | **Missing** | domain `ChangeType` currently lacks `uncertain` | Add to domain + diff logic before demo reliability gate |
| Safe resolution semantics | **Mismatch** | current diff marks missing prior issue as `resolved` | Absence must be evidence-qualified; otherwise `uncertain` |
| Action plan | Contract only / domain types exist | `ActionPlan`, `ActionStep` domain types exist | No complete service/API/product loop yet; Phase 11 |
| Verification | Contract only / domain type exists | `VerificationResult`, `VerificationRequest` types exist | No verification service/API/UI loop yet; Phase 12 |
| Automated tests | **Missing** | no test script in `package.json` | Add focused domain/integration coverage during hardening |

## Existing architecture worth preserving

- provider-specific Nebius code is already behind model adapter contracts;
- perception responses are schema validated;
- environmental memory has explicit domain types;
- historical state snapshots exist conceptually;
- diff logic is deterministic/model-agnostic;
- Ask is separated from raw perception;
- UI already uses Memory / Observe / Changes and labels fake change examples as previews.

Do not rewrite these capabilities merely for architectural novelty.

## Phase 2 architecture priorities

Phase 2 should clean boundaries only where they unblock the locked MVP:

1. Introduce `EnvironmentalMemoryRepository` as the persistence boundary.
2. Keep `EnvironmentalMemoryStore` as domain/state logic rather than the durable storage provider.
3. Provide an in-memory repository implementation for local/test use.
4. Define clean read/write contracts needed by API routes before the Supabase/Postgres implementation.
5. Add/clarify `DiffEngine` and `VerificationService` contracts where useful.
6. Align domain vocabulary with the locked contract, including `uncertain`.
7. Keep API routes thin: validate/orchestrate, do not become the domain layer.

## Explicit non-priorities for Phase 2

- new product screens
- marketplace/payments
- 3D reconstruction
- auth systems
- additional verticals
- unnecessary framework migration
- replacing the working Nebius adapter without evidence it is required

## Critical correctness issue to remember

A later scan failing to observe a previous issue is **not sufficient evidence of resolution by itself**. The current implementation automatically converts a missing prior issue into `resolved`; this must change before the Reality Diff/verification path is considered trustworthy.
