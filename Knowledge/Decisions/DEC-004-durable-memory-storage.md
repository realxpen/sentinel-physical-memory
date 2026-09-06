# DEC-004 — Durable Environmental Memory Storage

Date: 2026-09-06
Status: Accepted

## Decision

Use **Supabase/Postgres** as SENTINEL's first durable environmental-memory store behind `EnvironmentalMemoryRepository`.

The persistent contract is server-authoritative:

```text
Browser
  ↓ inputs only
SENTINEL API
  ↓
EnvironmentalMemoryRepository
  ↓
Supabase/Postgres
```

The browser may receive memory for presentation, but it must not resend the entire memory document as the source of truth.

## Storage shape

Phase 3 stores both:

1. a canonical aggregate `EnvironmentalMemory` JSONB document for deterministic repository reads; and
2. normalized records for environments, states, objects, observations, issues, evidence, relations, diffs and sources.

Every state also persists an immutable object/issue snapshot so later normalized entity updates cannot rewrite historical meaning.

## Security decision

Persistent tables live in `sentinel_private`. The public Data API exposes only two server-only RPCs:

- `sentinel_get_environmental_memory`
- `sentinel_save_environmental_memory`

Execution is restricted to the backend service role/secret key. Browser clients never receive Supabase privileged credentials.

## Why

- fits the MVP without introducing a graph database;
- preserves historical correctness;
- survives Vercel/serverless cold starts;
- keeps the domain and model adapters independent from infrastructure;
- supports later indexed retrieval without forcing an early architecture rewrite.

## Consequences

- Phase 3 is not complete until a dedicated SENTINEL Supabase project is provisioned and cold-start persistence is verified;
- local development may use a clearly identified volatile repository fallback;
- state snapshots become part of the persistent domain contract;
- future storage changes remain isolated behind `EnvironmentalMemoryRepository`.
