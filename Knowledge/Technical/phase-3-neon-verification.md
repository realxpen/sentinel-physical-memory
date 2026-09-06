# Phase 3 Neon Verification Record

Date: 2026-09-06
Status: **COMPLETE**

## Project

- Provider: Neon / Lakebase Postgres
- Project: `sentinel-physical-memory`
- Region: `aws-us-east-2`
- Runtime database: `neondb`

No database password or connection string is recorded in repo knowledge.

## Schema activation

`infrastructure/neon/phase-3-environmental-memory.sql` is active on the main Neon branch. The private `sentinel_private` schema contains the canonical environmental memory plus normalized environment/state/object/observation/issue/evidence/relation/diff/source records.

## Database durability proof

Verification environment: `phase3-verification`.

### State A

A memory document was saved with one state and an immutable snapshot placing `object_ext` at `Wall A`.

Readback returned:

- current state: `state_a`
- state count: `1`
- State A snapshot: `Wall A`

### State B

A second document retained State A and added State B with the object at `Wall B`, plus one diff.

Readback returned:

- current state: `state_b`
- state count: `2`
- diff count: `1`
- aggregate State A: `Wall A`
- aggregate State B: `Wall B`
- normalized State A row: `Wall A`
- normalized State B row: `Wall B`

### Mutation rejection

A deliberate later save attempted to change State A's snapshot to `Wall C`.

Postgres rejected it with:

`immutable environmental state snapshot mismatch`

A read immediately afterward still returned State A = `Wall A` and State B = `Wall B`.

## Production runtime proof

Production persistence is configured through server-only `DATABASE_URL` and reports `persistence: "neon"`.

A second, fully deployed verification environment `phase3-runtime-34027093828` passed the real scan path:

`Scan A → Nebius perception → Neon → fresh GET /api/memory → Scan B → Neon → fresh GET /api/memory → Reality Diff`

Results:

- Scan A: `scan_f0a2e99a-c850-4f71-97ae-820b1aa2e98a`
- State A: `state_81c0c92d-9354-4fde-aeb8-656c514615ac`
- Scan B: `scan_774fa2d3-def2-4f39-ab7e-9993dba56948`
- State B: `state_6ec21382-b657-48b4-876b-1f3d2e5a349b`
- final state count: `2`
- final snapshot count: `2`
- diff: `diff_ddb287af-709e-4c67-a514-d252dc828d4c`
- diff changes: `2`
- State A immutable after Scan B: `true`

GitHub Actions printed:

`PHASE 3 PRODUCTION SCAN PERSISTENCE VERIFIED`

## Model/runtime note

The production scan used Nebius Token Factory at `https://api.tokenfactory.us-central1.nebius.com/v1`.

Perception routes to `openbmb/MiniCPM-V-4_5`. Nemotron reasoning defaults to `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. DEC-006 records the live-catalog reason for this split route.

## Security note

Database credentials remain server-only and are never placed in browser/Vite variables.

The API-created `sentinel_app` login inherits Neon's platform role in this project, so strict least-privilege login hardening remains pre-production security debt. This does not invalidate the durability or server-authority proof.

## Conclusion

Neon durability, historical immutability, production serverless restoration, and the real two-scan persistence/diff path are all verified.

**Phase 3 persistence exit gate: PASSED.**
