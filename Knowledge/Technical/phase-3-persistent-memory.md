# Phase 3 — Persistent Environmental Memory

Date: 2026-09-06
Status: **COMPLETE — PRODUCTION END-TO-END VERIFIED**

## Goal

Make environmental memory server-authoritative and durable across browser reloads and serverless cold starts without changing the locked SENTINEL product loop.

## Active implementation

1. `NeonEnvironmentalMemoryRepository` implements `EnvironmentalMemoryRepository` using Neon's serverless Postgres driver.
2. Runtime repository selection lives in `server/memory-repository.ts`; database credentials never enter browser/Vite code.
3. `DATABASE_URL` is the active persistence credential contract.
4. `/api/scan` and `/api/ask-building` read/write the server-authoritative repository.
5. `GET /api/memory?environmentId=...` restores memory after reload/fresh invocation.
6. `infrastructure/neon/phase-3-environmental-memory.sql` defines the durable schema.
7. The save function requires snapshots for every state and rejects historical snapshot rewrites.
8. Vercel production runs the serverless API on Node 22 with ESM-safe runtime imports.

## Provider switch

The earlier Supabase implementation is superseded because the connected free Supabase organization is actively occupied by MONIFlow and Hustle. Those projects remain untouched. DEC-005 records the provider switch to the dedicated SENTINEL Neon project while preserving the same Postgres/domain architecture.

## Verified Neon database proof

A dedicated Neon project named `sentinel-physical-memory` is active in `aws-us-east-2`.

The direct database verification proved:

- State `state_a`: extinguisher at `Wall A`;
- State `state_b`: extinguisher at `Wall B`;
- canonical memory restored with two states and one diff;
- normalized and aggregate State A remained `Wall A`;
- normalized and aggregate State B remained `Wall B`;
- an attempted rewrite of State A to `Wall C` failed with `immutable environmental state snapshot mismatch`;
- subsequent reads confirmed the rejected write did not alter history.

## Production end-to-end proof

The deployed product then passed the real Phase 3 gate against `https://sentinel-physical-memory.vercel.app`.

Verification environment: `phase3-runtime-34027093828`

Flow:

`Scan A → Nebius perception → Neon persist → fresh memory read → Scan B → Neon persist → fresh memory read → Reality Diff`

Observed result:

- persistence mode: `neon`;
- Scan A: `scan_f0a2e99a-c850-4f71-97ae-820b1aa2e98a`;
- State A: `state_81c0c92d-9354-4fde-aeb8-656c514615ac`;
- Scan B: `scan_774fa2d3-def2-4f39-ab7e-9993dba56948`;
- State B: `state_6ec21382-b657-48b4-876b-1f3d2e5a349b`;
- two states restored;
- two immutable snapshots restored;
- diff `diff_ddb287af-709e-4c67-a514-d252dc828d4c` persisted;
- diff contained two changes;
- State A remained identical after Scan B.

The production verification printed:

`PHASE 3 PRODUCTION SCAN PERSISTENCE VERIFIED`

Canonical run details are in `Knowledge/Technical/phase-3-production-proof.md`.

## Nebius model route used in production

The live Token Factory catalog for this deployment did not expose the earlier design-time target `nvidia/nemotron-3-nano-omni`.

DEC-006 therefore locks the production-accessible split route:

- Perception: `openbmb/MiniCPM-V-4_5`
- Reasoning / Ask: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
- Base URL: `https://api.tokenfactory.us-central1.nebius.com/v1`

The perception adapter supplies the exact SENTINEL contract and normalizes only trusted metadata and provider representation differences. Required identity, confidence, category, evidence, and cross-reference validation remains strict.

## Security note

Database credentials remain server-only. Persistent tables live in `sentinel_private` and application code uses the locked get/save function surface.

The API-created `sentinel_app` role inherits Neon's platform `neon_superuser` role in this project, so it is not truly least-privileged. Production hardening must replace it with a non-inheriting custom login. This did not block the hackathon durability proof and remains explicitly tracked security debt.

## Exit gate

Engineering implementation: **MET**.

Database durability/integrity verification: **MET**.

Vercel runtime activation: **MET**.

Real Scan A → fresh memory restoration → Scan B → immutable history → Reality Diff: **MET**.

**Phase 3 is complete. Phase 4 — Observation Pipeline Hardening is next.**
