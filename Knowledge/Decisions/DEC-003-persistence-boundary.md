# DEC-003 — Environmental Memory Persistence Boundary

Date: 2026-09-06
Status: Accepted

## Decision

All durable environmental-memory access will go through `EnvironmentalMemoryRepository`.

The domain `EnvironmentalMemoryStore` will remain responsible for environmental state mutation, normalization, immutable state snapshot reconstruction, and diff creation. It will not directly own database/network persistence.

## Contract

```text
EnvironmentalMemoryRepository
├── get(environmentId)
└── save(memory)
```

Phase 2 provides an in-memory implementation. Phase 3 will provide the authoritative Supabase/Postgres implementation behind the same contract.

## Why

The existing store mixed useful domain behavior with process-local state. Separating persistence allows serverless-safe durable memory without rewriting scan, Ask, diff, or future verification logic.

## Consequences

- application/domain services depend on repository contracts, not Supabase directly;
- API handlers do not implement environmental-memory rules;
- persistent storage can be replaced independently;
- historical state correctness remains a domain responsibility;
- the temporary client-carried memory bridge is deprecated and will be removed after Phase 3.
