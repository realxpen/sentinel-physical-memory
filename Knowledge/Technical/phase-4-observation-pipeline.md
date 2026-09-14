# Phase 4 — Observation Pipeline Hardening

Date: 2026-09-14
Status: **IMPLEMENTATION ACTIVE — REAL-PHONE BASELINE + REPEAT-SCAN REALITY DIFF PASSED; PRODUCTION RE-VERIFICATION PENDING**

## Goal

Make normal phone walkthroughs produce compact, reliable, evidence-first perception requests without weakening Phase 3's server-authoritative memory guarantees.

Current practical target:

`30–60 second walkthrough → 8–12 useful browser evidence frames → max 10 Nebius perception images`

The product language remains:

`Observing → Understanding → Remembering`

## Implemented browser ingestion

`src/scan/video-ingestion.ts` performs local video analysis before anything is sent to the server:

- target walkthrough duration: 30–60 seconds;
- hard accepted duration: 5–90 seconds;
- browser source-file ceiling: 300 MB;
- MP4, MOV/M4V and WebM support;
- MIME fallback from filename extension when the browser omits `File.type`;
- wider candidate sampling (24 by default);
- 32×18 luminance signatures for fast local frame comparison;
- low-light candidate rejection;
- scene/novelty selection with temporal spread;
- duplicate/low-novelty frame filtering;
- 8–12 selected evidence frames by default;
- resize before upload;
- adaptive JPEG compression;
- encoded evidence-frame budget of about 3.2 MB;
- metadata and seek timeouts;
- structured, recoverable ingestion errors;
- diagnostics for frame counts, rejected duplicates, low-light exclusions, average brightness, encoded bytes and duration guidance.

The original phone video stays in the browser. SENTINEL sends only selected evidence frames to `/api/scan`.

## Implemented server / provider contract

`api/scan.ts` independently validates the request instead of trusting the browser:

- SENTINEL request budget: 4 MB;
- API video frame maximum: 12;
- API minimum evidence frames: 4;
- video duration: 5–90 seconds;
- source video metadata ceiling: 300 MB;
- per-frame data URL budget: 700 KB;
- accepted image evidence: JPEG, PNG, WebP;
- accepted video metadata MIME: MP4, MOV/M4V, WebM;
- server MIME fallback from media filename;
- unique frame IDs and ordered/in-duration timestamps;
- explicit 413 / 415 / 422 request errors;
- sanitized `SENTINEL_SCAN_REJECTED` / `SENTINEL_SCAN_FAILED` diagnostics.

MiniCPM-V currently accepts at most 10 images in one Token Factory prompt. `ScanPipeline` therefore caps the perception boundary to 10 frame artifacts and samples across the full temporal range instead of simply truncating the final frames. Older/stale clients can still submit up to the API's 12-frame contract without violating the provider limit.

## Trusted model boundary

SENTINEL treats scan identity and provenance as request/system-owned metadata, not visual inference.

The Nebius adapter normalizes authoritative:

- top-level `sourceId`;
- observation `sourceId` and `environmentId`;
- object `environmentId`;
- relation `environmentId`;
- evidence `sourceId`.

Provider-format hardening now also:

- drops meaningless optional positions such as `{ "description": "" }`;
- maps model-specific category labels such as `chair`, `sofa`, `desk`, `locker`, `logo`, `screen` and `monitor` into SENTINEL's canonical object taxonomy;
- maps unknown category strings to `other` rather than failing the full scan;
- attempts deterministic syntax repair when model output is malformed JSON, then runs the same strict perception schema validation afterward.

JSON repair is syntax-only. It does not invent semantic objects, evidence, relationships or confidence values.

The first successful real-phone response also showed that the model can invent timestamps such as `2023-10-10T10:00:00Z` and can reuse scan-local IDs such as `obj_1`, `obs_1`, `evidence_1` and `rel_1`. Those values are unsafe as durable provenance / global database primary keys.

Commit `c750f3a` (`fix: trust scan provenance in memory`) hardens the memory boundary for scans after the baseline:

- observation and evidence `capturedAt` are overridden by trusted `source.capturedAt`;
- new object `firstSeenAt` / `lastSeenAt` come from trusted scan capture time;
- model evidence and observation IDs become source-scoped durable IDs;
- new canonical objects receive SENTINEL-generated IDs while existing objects are matched by category + normalized name;
- model object IDs are mapped to canonical object IDs before relations are persisted;
- new relations receive SENTINEL-generated durable IDs;
- evidence references are remapped consistently across objects, observations, issues and relations.

The memory store also deduplicates canonical objects/issues/relations within a state so repeated detections across multiple frames do not inflate state snapshots or Reality Diff output.

The already-persisted State v1 snapshot is intentionally not rewritten. Phase 3 historical snapshot immutability remains authoritative; its pre-hardening model timestamps are retained as a known baseline provenance artifact.

## Local runtime hardening

Fresh-clone Ubuntu testing exposed local env and network issues. The runtime now:

- makes `.env.local` authoritative for SENTINEL's local server-only runtime keys while deployed Vercel keeps platform-injected values authoritative;
- pins local development to Node 22 with `.nvmrc`;
- prefers IPv4-first DNS only outside deployed Vercel runtimes;
- exposes safe DB/key source diagnostics without exposing credentials;
- provides `npm run dev:local` to start the correct Node 22 + IPv4-first Vercel runtime;
- provides `npm run check:neon` with DNS / raw HTTPS / SQL-over-HTTP / WebSocket transport probes;
- retries bounded transient Neon network failures with fresh client recreation;
- local persistence can automatically fail over between WebSocket and SQL-over-HTTP;
- keeps local secrets/build artifacts out of Git.

The local laptop's route to Neon is intermittent. Direct Neon-side SQL remains healthy, and the durable `office-demo` memory has survived the local transport failures. The runtime's failover is a resilience mechanism; it does not change the database durability contract.

## Nebius / provider blockers resolved

Real phone testing exposed and resolved successive provider/model boundary issues:

1. stale/invalid local Token Factory credential → explicit 401; fresh Token Factory API key restored authentication;
2. MiniCPM-V maximum of 10 images per prompt → perception boundary capped to 10 while preserving temporal coverage (`9f7576d`);
3. empty optional `position.description` → harmless optional geometry is normalized away while strict semantic validation remains (`a3843e6`);
4. model-specific unsupported object category → canonical object-category normalization (`09136d3`);
5. malformed vision-model JSON → deterministic JSON syntax repair followed by unchanged strict schema validation (`18e5cdb`);
6. long multi-frame inference → perception timeout increased to a bounded 120s default while Ask/Reasoning retains the shorter path.

## First real-phone baseline — PASS

On 2026-09-11, the actual browser Observe flow completed end-to-end using `New Office Walkthrough.mp4`:

- source duration: **55,901 ms** (~55.9 seconds), inside the preferred 30–60 second window;
- browser evidence / provider input: **10 frames**;
- real Nebius MiniCPM-V perception: **PASS**;
- environmental objects persisted: **8**;
- relations persisted: **7**;
- issues: **0**;
- state version: **1**;
- state ID: `state_a6f0b67a-6905-45e1-9fd1-4143385ef11a`;
- Neon persistence: **PASS** (`persistence: neon`);
- `/api/memory` restored populated environmental memory: **PASS**;
- first-state `diffs: []`: expected baseline behavior;
- UI rendered the populated `What SENTINEL observed.` state.

This is the first complete proof of:

`real phone walkthrough → browser frame extraction → Nebius perception → validated environmental state → Neon persistence → memory restore`

## Repeat-scan / Reality Diff proof — PASS

By 2026-09-14, the hardened local Observe path had completed repeated same-environment scans and persisted **State v3** for `office-demo`.

Direct Neon verification:

- states: **3**;
- diffs: **2**;
- current/latest state: `state_efde5f1d-4e36-4baf-b8b2-17f311a1c2ef`;
- latest version: **3**;
- previous compared state: `state_730e488f-211d-48f1-9f94-406e2e43caab`;
- latest diff change count: **5**.

Latest rendered Reality Diff:

1. `added` — `New: desk` — confidence **0.95**;
2. `added` — `New: cable` — confidence **0.90**;
3. `added` — `New: person` — confidence **0.80**;
4. `uncertain` — `Not re-observed: HGC logo` — confidence **0.50**;
5. `uncertain` — `Not re-observed: sofa` — confidence **0.50**.

The two missing prior objects remain `uncertain` because absence in a later walkthrough is not sufficient evidence of removal. This is the intended Phase 1 trust rule.

The frontend rendered `What changed.` with the before/after state comparison and all five changes. This proves:

`persistent prior state → new real-phone observation → validated/persisted new state → evidence-qualified Reality Diff → rendered Changes UI`

## Production contract status

`.github/workflows/phase4-observation-contract.yml` previously verified:

- unsupported video MIME → 415 `UNSUPPORTED_MEDIA_TYPE` — PASS;
- too-short walkthrough → 422 `VIDEO_TOO_SHORT` — PASS;
- too-few evidence frames → 422 `TOO_FEW_FRAMES` — PASS.

The latest production valid-video contract remains pending because Vercel has been rejecting newer deployments due to the project's build-rate limit. Do not treat the latest local hardening as deployed until that limit clears and the latest `main` is verified in production.

## Remaining Phase 4 exit gate

Phase 4 must not be marked complete until all of the following are true:

1. run additional normal 30–60 second phone walkthroughs and confirm stable compact perception requests;
2. confirm poor/dark/duplicate-heavy/unsupported inputs fail safely with actionable guidance;
3. deploy the latest `main` after the Vercel build-rate limit clears;
4. rerun the Phase 4 production observation contract and receive HTTP 200 + `persistence: neon` for the valid walkthrough request.

The baseline, repeat-scan, persistent-state and rendered Reality-Diff gates are now **MET**.

## Non-goals

Phase 4 does not change:

- Neon memory durability semantics;
- immutable historical state snapshots;
- Diff Engine v2 semantics (Phase 7);
- condition/diagnosis semantics (Phase 5);
- full Reliability/Guardrails work (Phase 15);
- the locked Living Spatial Intelligence redesign (Phase 13).

## Exit condition

**Multiple normal phone videos produce stable, compact, provenance-safe perception states; repeat scans do not collide; poor inputs fail safely; and the latest production valid-video contract passes.**
