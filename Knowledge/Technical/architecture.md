# Technical Architecture

## Objective

Support the smallest reliable closed loop:

`Media → Perception → Environmental State → Durable Memory → Retrieval → Reasoning → Diff → Action → Verification`

## Current code boundaries

```text
src/scan/      browser/media ingestion and scan orchestration
src/ai/        model contracts, Nebius adapter, perception schema
src/domain/    SENTINEL domain types
src/memory/    memory store, diff engine, Ask logic
api/           serverless request handlers
src/main.tsx   current React product shell
```

## Target boundaries

```text
Browser / React
      │
      ├── observe media
      └── ask / compare / verify
      │
Application API
      │
      ├── ScanPipeline
      ├── Retrieval / Reasoning
      ├── DiffEngine
      └── VerificationService
      │
      ├──────── ModelAdapter(s) ──────── Nebius Token Factory
      │
      └──────── EnvironmentalMemoryRepository ── durable store
```

## Required replaceable contracts

- `ModelAdapter`
- `ReasoningModelAdapter`
- `EnvironmentalMemoryRepository`
- `DiffEngine`
- `VerificationService`

Current implementation already has model-adapter concepts and an in-memory memory store. The next architecture work should introduce repository boundaries around persistence without rewriting working domain logic unnecessarily.

## Model strategy

Use the cheapest reliable specialization, not one giant model for every call.

- Nano Omni: perception.
- Nano: normalization/specialist classification where useful.
- Super: grounded reasoning/orchestration.
- Ultra: only for genuinely difficult reasoning if access/latency justify it.

## API principle

API handlers validate/orchestrate. They should not become the source of truth for environmental-state rules.

## Data principle

Historical environmental states are immutable. Current entities may be normalized for lookup, but old state snapshots must remain reconstructible after persistence/restart.

## Infrastructure principle

Nebius/NVIDIA usage must be real and visible in runtime behavior/metadata. Durable storage can begin with relational Postgres/Supabase plus JSONB; a graph database is not required for the MVP.
