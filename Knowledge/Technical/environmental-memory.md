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
└── NeonEnvironmentalMemoryRepository       # durable server runtime
```

The store does not know about Neon. The Neon repository does not implement environmental-state rules.

## Persistent runtime

When server-only `DATABASE_URL` is configured, API handlers use `NeonEnvironmentalMemoryRepository`.

The browser is not a persistence mechanism:

- scan requests do not include previous memory;
- Ask requests do not include previous memory;
- `/api/memory` restores authoritative server memory after reload.

Without `DATABASE_URL`, local/server development falls back to an explicitly reported `volatile` mode.

## Minimum durable records

Phase 3 persists environments, states, immutable state snapshots, objects, observations, conditions/issues, evidence, relations, source/media references, diffs and the canonical aggregate environmental memory.

## Historical correctness

A state is an immutable historical claim. Updating a remembered object's current normalized record must not alter what State v1 believed.

Each accepted scan captures the object/issue values that belonged to that state. `hydrate()` restores these exact snapshots after a database round-trip. Historical Ask and Diff use them rather than today's mutable entity values.

The Neon save function additionally enforces two database invariants:

1. every persisted state must have a snapshot;
2. an already persisted state's snapshot cannot be replaced with a different value.

This prevents the canonical aggregate from silently rewriting history even if incorrect input reaches the repository.

## Neon database shape

The database uses private normalized tables plus a canonical aggregate JSONB document.

- aggregate memory gives deterministic repository reads;
- normalized records support indexing, auditing and later targeted retrieval;
- state rows retain immutable snapshot JSONB;
- one server-side Postgres function persists the aggregate and normalized records atomically.

## Security

- persistent tables live in `sentinel_private`;
- RLS is enabled as defense in depth for non-privileged roles;
- application code calls only the locked get/save functions;
- `DATABASE_URL` remains server-only and must never be exposed through `VITE_*` variables.

Neon API-created login roles in this project inherit `neon_superuser`, so the current API-created `sentinel_app` login is not a true least-privilege role even after explicit table revokes. This is a known security-hardening item, not a hidden assumption. A non-inheriting custom runtime login is required before production.

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

1. Neon database schema is active.
2. State A and State B persist and round-trip with immutable historical snapshots.
3. A historical snapshot rewrite attempt is rejected.
4. Vercel receives the server-only `DATABASE_URL`.
5. The deployed API reports `neon` persistence and restores memory after a fresh invocation/reload.
6. The actual scan path creates the next durable state and Reality Diff reads the persisted snapshots.

Database-level items 1–3 are verified. Items 4–6 remain the deployment gate.
