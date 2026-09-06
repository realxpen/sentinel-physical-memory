# Phase 3 — Persistent Environmental Memory

Date: 2026-09-06
Status: **ENGINEERING IMPLEMENTED — REMOTE DATABASE VERIFICATION PENDING**

## Goal

Make environmental memory server-authoritative and durable across browser reloads and serverless cold starts without changing the locked SENTINEL product loop.

## What Phase 3 implements in code

1. `SupabaseEnvironmentalMemoryRepository` implements the existing `EnvironmentalMemoryRepository` contract using server-side PostgREST RPC calls.
2. Runtime repository selection lives only in `api/_memory-repository.ts`; Supabase secrets never enter browser/Vite code.
3. `/api/scan` no longer accepts client-carried environmental memory as persistence input.
4. `/api/ask-building` no longer accepts client-carried memory; it reads the authoritative repository.
5. `GET /api/memory?environmentId=...` restores server memory after a reload.
6. The React shell restores `office-demo` memory on mount and sends only scan/question inputs back to the API.
7. `.env.example` documents `SUPABASE_URL` + modern `SUPABASE_SECRET_KEY`, with legacy service-role fallback only for compatibility.
8. `infrastructure/supabase/phase-3-environmental-memory.sql` defines the persistent schema and server-only RPC surface.

## Historical correctness fix

Phase 3 adds `EnvironmentalStateSnapshot` to the domain and persists snapshots inside `EnvironmentalMemory`.

Why this is required:

- normalized `SpatialObject` / `Issue` records are allowed to evolve as current memory changes;
- a historical state must not inherit a later object's new position/status after a cold start;
- therefore each accepted state retains an immutable object/issue snapshot.

`EnvironmentalMemoryStore.hydrate()` now prefers persisted state snapshots. A legacy snapshot reconstruction fallback remains only for old serialized memories created before this phase.

`AskBuildingService` also reads the selected state's immutable snapshot rather than blindly using today's normalized object/issue record for a historical question.

## Database shape

The SQL uses a non-exposed `sentinel_private` schema containing:

- `sentinel_environments`
- `sentinel_environmental_memories`
- `sentinel_states` (including immutable `snapshot` JSONB)
- `sentinel_objects`
- `sentinel_observations`
- `sentinel_issues`
- `sentinel_evidence`
- `sentinel_relations`
- `sentinel_diffs`
- `sentinel_sources`

The canonical aggregate memory document makes repository reads simple and deterministic. The normalized records preserve queryability, history/audit structure, and a clean path for later specialized retrieval.

## Database security

- tables live in `sentinel_private`, not the exposed public data schema;
- Row Level Security is enabled as defense in depth;
- public/anon/authenticated table access is revoked;
- only `public.sentinel_get_environmental_memory(text)` and `public.sentinel_save_environmental_memory(jsonb)` are exposed as RPC functions;
- both are `SECURITY DEFINER`, use an empty `search_path`, revoke default public execution, and grant execution only to `service_role`;
- server code supports modern `sb_secret_*` keys without sending them as Bearer JWTs;
- no Supabase secret is exposed in `VITE_*` variables.

## Runtime modes

### `supabase`

Selected only when both server variables exist:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_ROLE_KEY` (legacy fallback)

This is the required hackathon durable-memory mode.

### `volatile`

If no Supabase variables exist, the server uses the in-memory repository so local development can continue. API responses identify this mode; it does **not** satisfy the Phase 3 durability gate.

A partially configured Supabase setup fails explicitly rather than silently falling back.

## Provisioning state

The connected Supabase account currently contains Personal OS and MONIFlow projects, but no dedicated SENTINEL project. This phase deliberately does not write SENTINEL tables into an unrelated project.

Therefore the following remain pending before Phase 3 can be marked fully complete:

1. provision/select a dedicated SENTINEL Supabase project;
2. apply `infrastructure/supabase/phase-3-environmental-memory.sql`;
3. configure `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel;
4. run Scan A and confirm database write;
5. reload/new invocation and confirm `/api/memory` restores exactly the same state/evidence/snapshot;
6. run Scan B and confirm historical snapshot correctness + diff after database round-trip;
7. run Supabase security/performance advisors and fix actionable findings.

## Phase 3 gate

Engineering implementation: **MET**.

Remote durability/cold-start verification: **PENDING dedicated SENTINEL Supabase project activation**.

Do not mark Phase 3 complete or start relying on database persistence in the demo until the remote verification list above passes.
