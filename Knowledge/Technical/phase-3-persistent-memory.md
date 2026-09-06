# Phase 3 — Persistent Environmental Memory

Date: 2026-09-06
Status: **ENGINEERING IMPLEMENTED — REMOTE DATABASE VERIFICATION PENDING**

## Goal

Make environmental memory server-authoritative and durable across browser reloads and serverless cold starts without changing the locked SENTINEL product loop.

## What Phase 3 implements in code

1. `SupabaseEnvironmentalMemoryRepository` implements `EnvironmentalMemoryRepository` using server-side PostgREST RPC calls.
2. Runtime repository selection lives in `server/memory-repository.ts`; Supabase secrets never enter browser/Vite code.
3. `/api/scan` no longer accepts client-carried environmental memory as persistence input.
4. `/api/ask-building` no longer accepts client-carried memory; it reads the authoritative repository.
5. `GET /api/memory?environmentId=...` restores server memory after a reload.
6. The React shell restores `office-demo` memory on mount and sends only scan/question inputs back to the API.
7. `.env.example` documents `SUPABASE_URL` + modern `SUPABASE_SECRET_KEY`, with legacy service-role fallback only for compatibility.
8. `infrastructure/supabase/phase-3-environmental-memory.sql` defines the persistent schema and server-only RPC surface.

## Historical correctness fix

Phase 3 adds `EnvironmentalStateSnapshot` to the domain and persists snapshots inside `EnvironmentalMemory`.

Normalized objects/issues may evolve as current memory changes, but a historical state must not inherit a later object's new position/status after a cold start. Each accepted state therefore retains immutable object/issue values.

`EnvironmentalMemoryStore.hydrate()` prefers persisted state snapshots. A legacy reconstruction fallback remains only for old serialized memory created before Phase 3.

`AskBuildingService` reads the selected state's snapshot rather than today's normalized entity values when answering a historical question.

## Database shape

The SQL uses a non-exposed `sentinel_private` schema containing:

- `sentinel_environments`
- `sentinel_environmental_memories`
- `sentinel_states` with immutable `snapshot` JSONB
- `sentinel_objects`
- `sentinel_observations`
- `sentinel_issues`
- `sentinel_evidence`
- `sentinel_relations`
- `sentinel_diffs`
- `sentinel_sources`

The aggregate memory document gives deterministic repository reads. Normalized records preserve queryability/audit structure and a clean path for later specialized retrieval. A single RPC writes both inside one database transaction.

## Database security

- persistent tables live in `sentinel_private`;
- RLS is enabled as defense in depth;
- public/anon/authenticated table access is revoked;
- only `public.sentinel_get_environmental_memory(text)` and `public.sentinel_save_environmental_memory(jsonb)` are exposed as RPC functions;
- both use `SECURITY DEFINER`, an empty `search_path`, revoked default public execution, and service-role-only execution;
- modern `sb_secret_*` credentials remain server-only and are sent as `apikey` rather than exposed in browser code.

## Runtime modes

### `supabase`

Selected only when both server variables exist:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_ROLE_KEY` (legacy fallback)

This is the required hackathon durable-memory mode.

### `volatile`

If no Supabase variables exist, local/server development falls back to `InMemoryEnvironmentalMemoryRepository`. API responses identify this mode. It does **not** satisfy the Phase 3 durability gate.

A partially configured Supabase setup fails explicitly instead of silently falling back.

## Remote activation pending

The connected Supabase account has no dedicated SENTINEL project. Existing Personal OS and MONIFlow projects are intentionally untouched.

Before Phase 3 can be marked complete:

1. provision/select a dedicated SENTINEL Supabase project;
2. apply `infrastructure/supabase/phase-3-environmental-memory.sql`;
3. configure Vercel `SUPABASE_URL` and `SUPABASE_SECRET_KEY`;
4. run Scan A and confirm database persistence;
5. reload/fresh invocation and confirm `/api/memory` restores identical state/evidence/snapshots;
6. run Scan B and confirm State v1 remains immutable after a database round-trip;
7. confirm Reality Diff compares persisted historical snapshots;
8. run Supabase security/performance advisors and resolve actionable findings.

## Phase 3 gate

Engineering implementation: **MET**.

Vercel build/deployment compilation: **MET**.

Remote durability/cold-start verification: **PENDING dedicated SENTINEL Supabase project activation**.
