# DEC-004 — Durable Environmental Memory Storage

Date: 2026-09-06
Status: **Superseded by DEC-005**

## Original decision

Use **Supabase/Postgres** as SENTINEL's first durable environmental-memory store behind `EnvironmentalMemoryRepository`.

The important architectural parts of this decision remain valid:

- persistence is server-authoritative;
- the browser never carries the canonical memory back as source of truth;
- the canonical aggregate `EnvironmentalMemory` JSONB document coexists with normalized records;
- every historical state retains an immutable object/issue snapshot;
- storage-provider details stay behind `EnvironmentalMemoryRepository`.

## Why it was superseded

The connected Supabase free organization was already using its two active project slots for MONIFlow and Hustle, both under active development. Reusing either database or pausing either product would violate project isolation and interrupt unrelated work.

DEC-005 therefore changes the Phase 3 provider to Neon / Lakebase Postgres while preserving the same Postgres data model and persistence contract.
