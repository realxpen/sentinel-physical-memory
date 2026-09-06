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

The deployed backend uses a server-only `DATABASE_URL`. Database credentials never enter browser/Vite variables.

A dedicated `sentinel_app` login was created for the runtime surface. Validation showed that Neon API-created roles in this project inherit the platform `neon_superuser` role, so an explicit table `REVOKE` does not make that API-created login truly least-privileged. This limitation is recorded rather than hidden.

For the hackathon MVP:

- database credentials remain server-only;
- persistent tables remain in `sentinel_private`;
- application code uses only the locked get/save functions;
- no database credential is exposed to the browser.

Before production, create a custom login that does not inherit Neon platform privileges and grant only schema usage + execution on the locked functions. Track that under reliability/security hardening rather than falsely treating it as already enforced.

## Storage shape

The Phase 3 model remains:

1. canonical aggregate `EnvironmentalMemory` JSONB for deterministic repository reads;
2. normalized environment/state/object/observation/issue/evidence/relation/diff/source records;
3. immutable per-state object/issue snapshots.

The database save function now rejects any attempt to rewrite a snapshot that was already persisted for a historical state. This protects both the normalized state row and the canonical aggregate from historical drift.

## Why Neon

- keeps SENTINEL isolated from MONIFlow and Hustle;
- preserves the existing Postgres-centered architecture rather than redesigning persistence;
- fits Vercel/serverless deployment;
- supports cold-start durability;
- lets future provider changes remain isolated behind `EnvironmentalMemoryRepository`.

## Consequences

- `DATABASE_URL` replaces Supabase URL/secret variables for the active runtime;
- `NeonEnvironmentalMemoryRepository` is the durable repository implementation;
- the Supabase Phase 3 implementation is retained only as superseded project history;
- Phase 3 durability still requires deployed Vercel runtime activation and end-to-end API verification;
- strict least-privilege database login hardening remains a pre-production security task.
