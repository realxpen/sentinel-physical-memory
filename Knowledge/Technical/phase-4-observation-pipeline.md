# Phase 4 — Observation Pipeline Hardening

Date: 2026-09-14
Status: **ALL LOCAL EXIT GATES PASSED — LATEST-MAIN PRODUCTION VALID-SCAN GATE PENDING**

## Goal

Make normal phone walkthroughs produce compact, reliable, evidence-first perception requests without weakening Phase 3's server-authoritative memory guarantees.

Current practical target:

`30–60 second walkthrough → 8–12 useful browser evidence frames → max 10 Nebius perception images`

The product language remains:

`Observing → Understanding → Remembering`

## Browser ingestion

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
- structured recoverable ingestion errors;
- diagnostics for frame counts, duplicate/low-light exclusions, brightness, encoded bytes and duration guidance.

The original phone video stays in the browser. SENTINEL sends only selected evidence frames to `/api/scan`.

The evidence-selection policy is now exposed as a pure deterministic `assessVideoCandidates` gate so Phase 4 quality behavior can be continuously verified without browser/video decoder nondeterminism.

## Server / provider contract

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
- sanitized scan diagnostics.

MiniCPM-V accepts at most 10 images in one Token Factory prompt. `ScanPipeline` caps perception to 10 frame artifacts and samples across the full temporal range instead of truncating the end of the walkthrough.

## Trusted model boundary

SENTINEL treats scan identity and provenance as request/system-owned metadata, not visual inference.

The Nebius adapter normalizes authoritative:

- top-level `sourceId`;
- observation `sourceId` and `environmentId`;
- object `environmentId`;
- relation `environmentId`;
- evidence `sourceId`.

Provider-format hardening also:

- drops meaningless optional positions such as `{ "description": "" }`;
- maps model-specific categories such as `chair`, `sofa`, `desk`, `locker`, `logo`, `screen` and `monitor` into SENTINEL's taxonomy;
- maps unknown category strings to `other`;
- repairs malformed JSON syntax deterministically, then runs unchanged strict schema validation;
- reconciles model-local evidence placeholders only when an already-existing evidence item can be matched deterministically.

Evidence-reference reconciliation is deliberately bounded:

1. exact evidence ID wins;
2. `evidence_3` may map to the unique existing evidence item with `frameIndex: 3`;
3. if no frame index exists, it may map to the existing evidence item at array index 3;
4. unknown or ambiguous references remain unchanged and strict validation rejects them.

No evidence item, object, condition, relationship or confidence value is invented by normalization.

The first successful real-phone response also showed model-invented timestamps and reusable scan-local IDs. Commit `c750f3a` hardened durable provenance so:

- observation/evidence `capturedAt` are overridden by trusted `source.capturedAt`;
- new object `firstSeenAt` / `lastSeenAt` use trusted scan capture time;
- model evidence and observation IDs become source-scoped durable IDs;
- new canonical objects/relations receive SENTINEL-generated IDs;
- model object IDs are mapped to canonical object IDs before relations persist;
- evidence references are remapped consistently through persisted entities.

The memory store also deduplicates canonical objects/issues/relations within a state so repeated frame detections do not inflate snapshots or Reality Diff output.

The original State v1 remains immutable; its pre-hardening timestamps remain a known historical artifact.

## Local runtime hardening

Fresh-clone Ubuntu testing exposed local env/network issues. The runtime now:

- makes `.env.local` authoritative for SENTINEL local server-only runtime keys while deployed Vercel keeps platform-injected values authoritative;
- pins local development to Node 22 with `.nvmrc`;
- prefers IPv4-first DNS outside deployed Vercel runtimes;
- exposes safe DB/key diagnostics without credentials;
- provides `npm run dev:local`;
- provides `npm run check:neon` with DNS / raw HTTPS / SQL-over-HTTP / WebSocket probes;
- retries bounded transient Neon failures with fresh client recreation;
- local persistence can automatically fail over between WebSocket and SQL-over-HTTP.

The laptop route to Neon is intermittent. Direct Neon-side SQL remains healthy and durable `office-demo` memory survived all local transport failures.

## Provider/model blockers resolved

Real phone testing exposed and resolved:

1. stale Token Factory credential → fresh key verified;
2. MiniCPM-V max 10 images → max-10 temporal sampling (`9f7576d`);
3. empty optional `position.description` → drop meaningless optional geometry (`a3843e6`);
4. unsupported model-specific object category → canonical category normalization (`09136d3`);
5. malformed model JSON → deterministic syntax repair + strict validation (`18e5cdb`);
6. long multi-frame inference → bounded 120s perception timeout;
7. duplicate canonical scan entities → state-level canonical deduplication;
8. model evidence reference such as `evidence_0` not matching the emitted evidence item's ID → deterministic existing-evidence reconciliation (`c198276`).

## First real-phone baseline — PASS

On 2026-09-11, the browser Observe flow completed using `New Office Walkthrough.mp4`:

- source duration: **55,901 ms**;
- provider input: **10 frames**;
- real Nebius MiniCPM-V perception: **PASS**;
- objects: **8**;
- relations: **7**;
- issues: **0**;
- state version: **1**;
- state ID: `state_a6f0b67a-6905-45e1-9fd1-4143385ef11a`;
- Neon persistence + `/api/memory` restore: **PASS**;
- first-state `diffs: []`: expected;
- UI rendered `What SENTINEL observed.`.

This proved:

`real phone walkthrough → browser frame extraction → Nebius perception → validated environmental state → Neon persistence → memory restore`

## Repeat-scan / Reality Diff — PASS

By 2026-09-14, repeated same-environment scans persisted State v3 for `office-demo`.

Direct Neon verification:

- states: **3**;
- diffs: **2**;
- current/latest state: `state_efde5f1d-4e36-4baf-b8b2-17f311a1c2ef`;
- latest version: **3**;
- latest diff changes: **5**.

Rendered latest diff:

1. `added` — `New: desk` — 0.95;
2. `added` — `New: cable` — 0.90;
3. `added` — `New: person` — 0.80;
4. `uncertain` — `Not re-observed: HGC logo` — 0.50;
5. `uncertain` — `Not re-observed: sofa` — 0.50.

Missing prior objects remain `uncertain`; absence in one later walkthrough is not proof of removal.

The frontend rendered `What changed.` with the before/after comparison.

## Poor-input / regression gates — PASS

`npm run check:phase4-poor-inputs` deterministically verifies:

- dark walkthrough → `LOW_LIGHT_VIDEO`;
- duplicate-heavy walkthrough → `INSUFFICIENT_VISUAL_VARIETY`;
- too-few candidates → `INSUFFICIENT_VIDEO_EVIDENCE`;
- mixed-quality input excludes dark evidence while retaining a useful compact set;
- healthy input retains 8–12 useful frames.

`npm run check:phase4-evidence-refs` verifies:

- deterministic `frameIndex` placeholder repair;
- deterministic array-index fallback when frame indices are absent;
- exact evidence IDs are preserved;
- unknown references remain unchanged for strict validation;
- ambiguous frame-index references remain unchanged and fail closed.

Both gates run before the production TypeScript/Vite build in `Sentinel CI`. Latest tested adapter/build commit chain through `eb41ae3`: **PASS**.

## Production contract status

Production rejection guards are proven:

- unsupported video MIME → 415 `UNSUPPORTED_MEDIA_TYPE` — PASS;
- too-short walkthrough → 422 `VIDEO_TOO_SHORT` — PASS;
- too-few evidence frames → 422 `TOO_FEW_FRAMES` — PASS.

A valid production contract subsequently reached Nebius but failed because the model referenced `evidence_0` while the emitted evidence used a different ID. The latest adapter contains a bounded deterministic fix and CI regression coverage.

The production workflow now waits for `/api/health.deploymentCommit` to equal the exact GitHub commit under test before running the valid scan. This prevents stale production deployments from producing misleading failures.

Current blocker: Vercel reports a **build-rate-limit failure** on latest `main`. Therefore the latest adapter hardening is not yet considered deployed.

## Remaining Phase 4 exit gate

All local engineering gates are now **MET**:

- multiple real-phone walkthroughs;
- durable repeat state;
- rendered Reality Diff;
- trusted provenance;
- compact perception requests;
- dark/duplicate/too-few safe-failure behavior;
- model JSON/category/evidence-reference regression coverage.

Phase 4 remains open for one production gate only:

1. Vercel deploys latest `main` after the build-rate limit clears;
2. the production contract observes the matching deployment commit;
3. valid 8-frame walkthrough request returns HTTP 200 + `persistence: neon`.

## Non-goals

Phase 4 does not change:

- Neon durability semantics;
- immutable historical state snapshots;
- Diff Engine v2 semantics (Phase 7);
- condition/diagnosis semantics (Phase 5);
- full Reliability/Guardrails work (Phase 15);
- the locked Living Spatial Intelligence redesign (Phase 13).

## Exit condition

**Multiple normal phone videos produce stable, compact, provenance-safe states; repeat scans do not collide; poor inputs fail safely; and the exact latest-main production valid-video contract passes.**
