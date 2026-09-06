# Phase 2 — Core Architecture Cleanup

Date: 2026-09-06
Status: **COMPLETE**

## Goal

Make SENTINEL ready for durable memory and later verification without rewriting working perception, diff, or Ask capabilities.

## Changes completed

1. Added `EnvironmentalMemoryRepository` as the storage boundary.
2. Added `InMemoryEnvironmentalMemoryRepository` for local/transitional runtime use.
3. Refactored `ScanPipeline` to load/save memory through the repository rather than owning long-lived memory state.
4. Refactored `AskBuildingService` to read asynchronously through the repository boundary.
5. Added the `DiffEngine` contract and kept `EnvironmentalDiffEngine` as the default deterministic implementation.
6. Added the `VerificationService` interface for the later closed-loop implementation.
7. Added `uncertain` to the domain `ChangeType`.
8. Changed unmatched previous objects/conditions from automatic removal/resolution to `uncertain` until absence is evidence-qualified.
9. Kept API handlers focused on validation/orchestration.
10. Preserved the existing Nebius/Nemotron adapter and perception schemas.

## Deliberately not done

- Supabase/Postgres persistence — Phase 3.
- Strong object matching / comparable-view absence proof — Phase 7.
- Action planner implementation — Phase 11.
- Verification implementation — Phase 12.
- UI redesign — later product/UI phases.

## Temporary compatibility

The current frontend still sends serialized environmental memory with requests. During Phase 2, API routes reconcile this into the temporary repository so separate serverless function instances do not break the existing demo.

This is a compatibility bridge only. It does not satisfy durable-memory acceptance and must be removed once Phase 3 persistent storage is authoritative.

## Phase 2 exit condition

- persistence is behind a repository interface;
- scan and Ask depend on that interface;
- diff behavior no longer overclaims missing observations as resolved;
- verification has a stable service contract;
- existing product behavior remains compatible;
- affected TypeScript contracts type-check.

**Exit condition: met.**
