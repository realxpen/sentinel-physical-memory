# DEC-005 — Neon as SENTINEL Durable Memory Provider

Date: 2026-09-06
Status: Accepted

## Decision

Use a dedicated **Neon / Lakebase Postgres** project as SENTINEL's Phase 3 durable environmental-memory provider.

```text
Browser
  ↓ inputs only
SENTINEL API on Vercel
  ↓
EnvironmentalMemoryRepository
  ↓
NeonEnvironmentalMemoryRepository
  ↓
Neon / Lakebase Postgres
```

## Runtime access

The deployed backend uses a dedicated login role named `sentinel_app` through the server-only `DATABASE_URL` variable.

`sentinel_app` receives:

- `USAGE` on the private schema;
- execute permission on the two locked memory functions.

It receives no direct table privileges. The functions are `SECURITY DEFINER` and fully schema-qualified.

## Storage shape

The Phase 3 model remains unchanged:

1. canonical aggregate `EnvironmentalMemory` JSONB for deterministic repository reads;
2. normalized environment/state/object/observation/issue/evidence/relation/diff/source records;
3. immutable per-state object/issue snapshots.

## Why

- keeps SENTINEL isolated from MONIFlow and Hustle;
- preserves the existing Postgres-centered architecture rather than redesigning persistence;
- fits Vercel/serverless deployment;
- supports cold-start durability;
- lets future provider changes remain isolated behind `EnvironmentalMemoryRepository`.

## Consequences

- `DATABASE_URL` replaces Supabase URL/secret variables for the active runtime;
- `NeonEnvironmentalMemoryRepository` becomes the durable repository implementation;
- the Supabase Phase 3 implementation is retained only as superseded project history;
- Phase 3 is still not complete until the live Neon schema, Vercel configuration, cold-start restoration, immutable State v1 round-trip, and persisted diff checks pass.
