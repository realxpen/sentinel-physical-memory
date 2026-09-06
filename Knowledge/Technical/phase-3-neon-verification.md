# Phase 3 Neon Verification Record

Date: 2026-09-06

## Project

- Provider: Neon / Lakebase Postgres
- Project: `sentinel-physical-memory`
- Region: `aws-us-east-2`
- Runtime database: `neondb`

No database password or connection string is recorded in repo knowledge.

## Schema activation

`infrastructure/neon/phase-3-environmental-memory.sql` was applied to the main Neon branch. The active private schema contains the aggregate environmental memory plus normalized environment/state/object/observation/issue/evidence/relation/diff/source records.

## Persistence proof

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

## Vercel build

The Neon repository migration commit `a46f85f` passed the connected Vercel build status.

## Remaining proof

The connected Vercel tool available in ChatGPT can inspect deployments but does not expose environment-variable writes. `DATABASE_URL` therefore still has to be placed in the Vercel project server environment before the deployed API can be tested in `neon` mode.

Phase 3 is not marked complete until that deployed end-to-end proof is finished.
