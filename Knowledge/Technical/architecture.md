# Technical Architecture

## Objective

Support the smallest reliable closed loop:

`Media → Perception → Environmental State → Durable Memory → Retrieval → Reasoning → Diff → Action → Verification`

## Phase 2 architecture status

The core boundaries are now explicit in code. Phase 2 does not add durable storage yet; it makes persistence replaceable so Phase 3 can add Supabase/Postgres without changing domain behavior.

## Current boundaries

```text
Browser / React
      │
      ├── Observe media
      └── Ask / compare / verify
      │
Application API
      │
      ├── ScanPipeline
      ├── AskBuildingService
      ├── DiffEngine
      └── future VerificationService implementation
      │
      ├──────── ModelAdapter(s) ───────── Nebius Token Factory
      │
      └──────── EnvironmentalMemoryRepository
                         │
                         ├── InMemoryEnvironmentalMemoryRepository (Phase 2)
                         └── PersistentRepository / Supabase-Postgres (Phase 3)
```

## Required replaceable contracts

### ModelAdapter

Already implemented. Multimodal perception does not depend on provider response shapes outside the adapter.

### ReasoningModelAdapter

Already implemented. Ask/reasoning is provider-agnostic.

### EnvironmentalMemoryRepository

Implemented in Phase 2.

```text
get(environmentId)
save(memory)
```

`EnvironmentalMemoryStore` remains responsible for domain/state mutation, normalization, state creation and snapshot reconstruction. It is not the persistence provider.

### DiffEngine

Implemented as an interface and deterministic default implementation.

The Phase 2 engine now treats a previously observed entity that is simply missing from a later scan as `uncertain`, not automatically removed/resolved. Evidence-qualified absence semantics will be strengthened in Phase 7.

### VerificationService

The contract now exists. The full implementation remains Phase 12 work.

## Scan orchestration after Phase 2

```text
POST /api/scan
      │
      ├── validate request
      ├── obtain EnvironmentalMemoryRepository
      ├── ScanPipeline.run()
      │      ├── repository.get(environment)
      │      ├── hydrate EnvironmentalMemoryStore
      │      ├── perception via ModelAdapter
      │      ├── ingest state
      │      ├── compare via DiffEngine
      │      └── repository.save(updated memory)
      └── return response
```

This removes persistence ownership from the scan pipeline itself.

## Ask orchestration after Phase 2

```text
POST /api/ask-building
      │
      ├── validate request
      ├── obtain EnvironmentalMemoryRepository
      ├── AskBuildingService
      │      ├── repository.get(environment)
      │      ├── select state/history/diff/evidence
      │      └── ReasoningModelAdapter.reason()
      └── return grounded answer
```

`AskBuildingService` now consumes an asynchronous repository reader so a database-backed repository can replace the in-memory one directly.

## Transitional compatibility bridge

Until Phase 3 is complete, the web client still carries a serialized memory snapshot in scan/Ask requests. API handlers may reconcile that snapshot into the temporary in-memory repository so the existing prototype does not regress across separate serverless functions.

This bridge is explicitly temporary and is not considered durable environmental memory. Phase 3 removes client-carried memory as the source of persistence and makes the server-side persistent repository authoritative.

## Domain correctness rule

Historical environmental states remain immutable snapshots. Current normalized entities may evolve for lookup, but previous states must remain reconstructible.

Absence rule:

> A later scan failing to observe a previously observed object/condition is not enough to prove removal or resolution.

Until comparable evidence verifies absence, the diff state is `uncertain`.

## Infrastructure principle

Nebius/NVIDIA usage remains on the existing runtime inference path. Phase 2 deliberately does not rewrite the working provider adapter.

Phase 3 target: Supabase/Postgres persistence behind `EnvironmentalMemoryRepository`.
