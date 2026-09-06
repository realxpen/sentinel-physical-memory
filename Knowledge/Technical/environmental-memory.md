# Environmental Memory

## Purpose

Environmental memory is the core product primitive. SENTINEL must remember a physical environment across scans, browser reloads and serverless process restarts.

## Domain and persistence split

`EnvironmentalMemoryStore` owns state mutation and historical correctness inside an execution:

- create environment
- hydrate persisted memory
- ingest scan
- upsert source/evidence/object/issue/relation
- create versioned state
- create immutable state snapshots
- compare historical states
- retain generated diffs

`EnvironmentalMemoryRepository` owns persistence:

```text
EnvironmentalMemoryRepository
├── InMemoryEnvironmentalMemoryRepository   # local/dev fallback
└── SupabaseEnvironmentalMemoryRepository   # durable runtime
```

The store does not know about Supabase. The Supabase repository does not implement environmental-state rules.

## Persistent runtime

When `SUPABASE_URL` and a server secret are configured, API handlers use `SupabaseEnvironmentalMemoryRepository`.

The browser is no longer a persistence mechanism:

- scan requests do not include previous memory;
- Ask requests do not include previous memory;
- `/api/memory` restores the authoritative server memory after reload.

Without Supabase configuration, local development falls back to an explicitly reported `volatile` mode.

## Minimum durable records

Phase 3 persists:

- environments
- states
- immutable state snapshots
- objects
- observations
- conditions/issues
- evidence
- relations
- sources/media references
- diffs
- canonical aggregate environmental memory

Action plans and verification results join this persistence model in their later implementation phases.

## Historical correctness

A state is an immutable historical claim. Updating a remembered object's current normalized record must not alter what State v1 believed.

Phase 3 therefore adds `EnvironmentalStateSnapshot`:

```text
stateId
  ├── object snapshots
  └── issue snapshots
```

Each accepted scan captures the object/issue values that belonged to that state. `hydrate()` restores these exact snapshots after a database round-trip. Historical Ask and Diff use them rather than today's mutable entity values.

A legacy fallback can reconstruct snapshots from older serialized memory that predates Phase 3, but that fallback is not considered proof of exact historical preservation.

## Supabase shape

The database uses private normalized tables plus a canonical aggregate JSONB document.

Why both:

- aggregate memory gives deterministic, low-complexity repository reads;
- normalized records support indexing, auditing and later targeted retrieval;
- state rows retain immutable snapshot JSONB;
- a single server RPC persists the aggregate + normalized records in one database transaction.

## Security

- persistent tables live in `sentinel_private`;
- RLS is enabled on all tables;
- anon/authenticated table access is revoked;
- only locked public RPC functions are reachable through the Data API;
- RPC execution is granted to the backend service role only;
- modern Supabase secret keys remain server-only and are sent as `apikey`, not exposed to browser code.

## Core queries

- current memory for environment
- state by ID/version
- previous/current state pair
- immutable state snapshot
- diffs by state pair
- evidence by ID
- current/historical facts for Ask

The Phase 3 repository initially retrieves the canonical aggregate. Later performance phases may specialize these queries without changing the application contract.

## Phase 3 exit condition

1. Scan A persists to a dedicated SENTINEL Supabase project.
2. A fresh server invocation/browser reload restores the same environment, state, evidence and snapshots without client resubmission.
3. Scan B creates State v2 while State v1 remains unchanged after another database reload.
4. Reality Diff still compares the correct historical snapshots.
5. Supabase security/performance checks have no unaddressed critical finding.

Until this remote test passes, Phase 3 remains **engineering implemented / remote verification pending**.
