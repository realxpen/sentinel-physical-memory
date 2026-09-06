# Phase 3 — Persistent Environmental Memory

Date: 2026-09-06
Status: **NEON DATABASE VERIFIED — VERCEL RUNTIME ACTIVATION PENDING**

## Goal

Make environmental memory server-authoritative and durable across browser reloads and serverless cold starts without changing the locked SENTINEL product loop.

## Active implementation

1. `NeonEnvironmentalMemoryRepository` implements `EnvironmentalMemoryRepository` using Neon's serverless Postgres driver.
2. Runtime repository selection lives in `server/memory-repository.ts`; database credentials never enter browser/Vite code.
3. `DATABASE_URL` is the active Phase 3 persistence credential contract.
4. `/api/scan` and `/api/ask-building` read/write the server-authoritative repository.
5. `GET /api/memory?environmentId=...` restores memory after reload.
6. `infrastructure/neon/phase-3-environmental-memory.sql` defines the active durable schema.
7. The save function requires snapshots for every state and rejects historical snapshot rewrites.

## Provider switch

The earlier Supabase implementation is superseded because the connected free Supabase organization is actively occupied by MONIFlow and Hustle. Those projects remain untouched. DEC-005 records the provider switch to the dedicated SENTINEL Neon project while preserving the same Postgres/domain architecture.

## Verified Neon database proof

A dedicated Neon project named `sentinel-physical-memory` is active in `aws-us-east-2`.

A Phase 3 verification environment was written directly through the same database functions used by the repository:

- State `state_a`: extinguisher at `Wall A`;
- State `state_b`: extinguisher at `Wall B`;
- canonical memory restored with 2 states and 1 diff;
- normalized State A snapshot remained `Wall A`;
- normalized State B snapshot remained `Wall B`;
- canonical aggregate snapshots also remained `Wall A` / `Wall B`;
- a deliberate attempt to rewrite State A as `Wall C` failed with `immutable environmental state snapshot mismatch`;
- a subsequent read proved the rejected write did not alter the stored history.

This verifies database durability semantics and historical integrity independent of the browser process.

## Build verification

Commit `a46f85f` (`refactor: migrate phase 3 persistence to neon`) passed the connected Vercel Git build check.

## Security note

Database credentials remain server-only. Persistent tables live in `sentinel_private` and application code uses the locked get/save function surface.

The API-created `sentinel_app` role inherits Neon's platform `neon_superuser` role in this project, so it is not truly least-privileged. Production hardening must replace it with a non-inheriting custom login. This does not block the hackathon durability proof, but it is explicitly tracked as security debt.

## Remaining Phase 3 deployment gate

1. configure Vercel `DATABASE_URL` with the Neon server connection;
2. trigger/redeploy production so the variable is present;
3. confirm `/api/memory` reports `persistence: "neon"`;
4. run the real Observe path for Scan A and confirm database persistence;
5. reload/fresh invocation and confirm the same memory restores without client resubmission;
6. run Scan B and confirm the persisted Reality Diff uses the immutable snapshots.

Engineering implementation: **MET**.

Database durability/integrity verification: **MET**.

Vercel runtime activation / end-to-end scan proof: **PENDING**.
