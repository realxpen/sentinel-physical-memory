# Environmental Memory

## Purpose

Environmental memory is the core product primitive. SENTINEL must remember a physical environment across scans, browser reloads and serverless process restarts.

## Current implementation

`EnvironmentalMemoryStore` currently keeps:

- memories in an in-process `Map`
- per-state object/issue snapshots in an in-process `Map`

It supports:

- create environment
- hydrate serialized memory
- ingest scan
- upsert source/evidence/object/issue/relation
- create versioned state
- rebuild immutable snapshots during hydration
- compare historical states
- store generated diffs in the in-memory memory object

This is a useful domain implementation but **not durable persistence** by itself.

## Target repository boundary

```text
EnvironmentalMemoryRepository
├── InMemoryRepository      # tests/dev
└── PersistentRepository    # hackathon runtime
```

Recommended first durable store: Postgres/Supabase.

A dedicated graph database is unnecessary for the MVP. Use relational records plus JSONB where useful.

## Minimum durable records

- environments
- states
- objects
- observations
- conditions/issues
- evidence
- relations
- sources/media
- diffs
- action plans
- verification results

## Historical correctness

A state is an immutable historical claim. Updating a remembered object's current record must not alter what State v1 believed.

The persistent design must therefore support either:

- true versioned entities/observations per state, or
- immutable state snapshots that can reconstruct exact past objects/conditions/relations.

## Core queries

- current memory for environment
- all states for environment
- state by ID
- previous state
- diffs by state pair
- evidence by ID
- relevant current/historical facts for Ask

## Exit condition for persistence phase

Observe once, close/reload/restart, reopen SENTINEL, and the same environment/state/evidence remains queryable without the browser resending the entire memory object as the source of truth.
