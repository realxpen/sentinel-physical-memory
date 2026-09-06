# Phase 3 — Persistent Environmental Memory

Date: 2026-09-06
Status: **NEON MIGRATION IMPLEMENTED — REMOTE VERIFICATION PENDING**

## Goal

Make environmental memory server-authoritative and durable across browser reloads and serverless cold starts without changing the locked SENTINEL product loop.

## Active implementation

1. `NeonEnvironmentalMemoryRepository` implements `EnvironmentalMemoryRepository` using Neon's serverless Postgres driver.
2. Runtime repository selection lives in `server/memory-repository.ts`; database credentials never enter browser/Vite code.
3. `DATABASE_URL` is the only active Phase 3 persistence credential contract.
4. `/api/scan` and `/api/ask-building` read/write the server-authoritative repository.
5. `GET /api/memory?environmentId=...` restores memory after reload.
6. `infrastructure/neon/phase-3-environmental-memory.sql` defines the active durable schema.
7. A least-privilege `sentinel_app` login role is used for runtime access and receives function execution only.

## Historical correctness

`EnvironmentalMemory` contains immutable `EnvironmentalStateSnapshot` records. Normalized objects/issues may evolve, but a historical state must never inherit later values after a cold start.

`EnvironmentalMemoryStore.hydrate()` prefers persisted snapshots, and historical Ask/Diff paths use those state snapshots.

## Database shape

The private `sentinel_private` schema contains environments, aggregate memories, states, objects, observations, issues, evidence, relations, diffs and sources. State rows include immutable `snapshot` JSONB.

The aggregate memory document gives deterministic reads. Normalized records preserve queryability/audit structure. A single Postgres function writes the canonical aggregate plus normalized records atomically.

## Security

- tables stay in `sentinel_private`;
- RLS is enabled as defense in depth;
- `sentinel_app` has no direct table privileges;
- `sentinel_app` can execute only the locked get/save functions;
- functions use `SECURITY DEFINER`, empty `search_path`, and fully qualified table references;
- no database credential is exposed through `VITE_*`.

## Provider switch

The earlier Supabase implementation is superseded because the connected free Supabase organization is actively occupied by MONIFlow and Hustle. Those projects remain untouched. DEC-005 records the provider switch to the dedicated SENTINEL Neon project while retaining the same Postgres/domain architecture.

## Remaining remote gate

Before Phase 3 can be marked complete:

1. apply the Neon schema to the dedicated SENTINEL database;
2. configure Vercel `DATABASE_URL` with the `sentinel_app` connection;
3. confirm the deployed API reports `neon` persistence;
4. persist Scan A / equivalent environmental memory fixture;
5. restore it through a fresh invocation;
6. persist State v2 and prove State v1's snapshot remains unchanged;
7. confirm the persisted diff still compares the correct state snapshots;
8. verify the runtime role cannot directly read private tables.

Engineering implementation: **MET**.

Remote durability/cold-start verification: **PENDING**.
