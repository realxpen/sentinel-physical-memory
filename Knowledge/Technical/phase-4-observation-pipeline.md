# Phase 4 — Observation Pipeline Hardening

Date: 2026-09-10
Status: **IMPLEMENTATION ACTIVE — NEBIUS AUTH + PRODUCTION RE-VERIFICATION + REAL-PHONE GATE PENDING**

## Goal

Make normal phone walkthroughs produce compact, reliable, evidence-first perception requests without weakening Phase 3's server-authoritative memory guarantees.

Locked target from the build plan:

`30–60 second walkthrough → 8–12 useful frames → Nebius perception`

The product language remains:

`Observing → Understanding → Remembering`

## Implemented browser ingestion

`src/scan/video-ingestion.ts` now performs local video analysis before anything is sent to the server:

- target walkthrough duration: 30–60 seconds;
- hard accepted duration: 5–90 seconds;
- browser source-file ceiling: 300 MB;
- supported formats: MP4, MOV/M4V and WebM;
- MIME fallback from filename extension when the browser omits `File.type`;
- wider candidate sampling (24 by default);
- 32×18 luminance signatures for fast local frame comparison;
- low-light candidate rejection;
- scene/novelty selection with temporal spread;
- duplicate/low-novelty frame filtering;
- 8–12 selected evidence frames by default;
- resize before upload;
- adaptive JPEG compression from the preferred profile down through smaller/lower-quality passes;
- encoded evidence-frame budget of about 3.2 MB;
- metadata and seek timeouts;
- structured, recoverable ingestion errors;
- diagnostics for frame counts, rejected duplicates, low-light exclusions, average brightness, encoded bytes and duration guidance.

The original phone video stays in the browser. SENTINEL sends only selected evidence frames to `/api/scan`.

## Implemented server contract

`api/scan.ts` independently validates the request instead of trusting the browser:

- SENTINEL request budget: 4 MB, intentionally below the current Vercel Function request-body ceiling;
- video frame maximum: 12;
- API minimum evidence frames: 4;
- video duration: 5–90 seconds;
- source video metadata ceiling: 300 MB;
- per-frame data URL budget: 700 KB;
- accepted image evidence: JPEG, PNG, WebP;
- accepted video metadata MIME: MP4, MOV/M4V, WebM;
- server MIME fallback from the media filename when a browser omits `File.type`;
- unique frame IDs;
- timestamp ordering;
- timestamps must remain inside the declared video duration;
- explicit 413 / 415 / 422 errors for size, media and evidence-contract failures;
- sanitized `SENTINEL_SCAN_REJECTED` / `SENTINEL_SCAN_FAILED` terminal diagnostics for local debugging without logging credentials.

These guards make malformed or oversized walkthroughs fail in SENTINEL instead of falling through to opaque platform failures.

## Multi-frame perception identity

A valid 8-frame production request reached Nebius but the vision model returned the wrong nested `evidence.sourceId`.

That field is not visual inference. It is trusted scan metadata supplied by SENTINEL. The adapter therefore now normalizes authoritative scan identity before schema validation:

- top-level `sourceId`;
- observation `sourceId` and `environmentId`;
- object `environmentId`;
- relation `environmentId`;
- evidence `sourceId`.

Semantic content remains model-generated and strictly validated: object/observation meaning, evidence IDs, categories, confidence, relationships and environmental consistency are not fabricated to make a scan pass.

## Local Neon runtime hardening

Fresh-clone local testing on Ubuntu exposed two infrastructure/runtime issues without changing the Phase 3 persistence contract:

1. `.env.local` could exist while a local serverless process did not receive a usable `DATABASE_URL`.
2. On one local network, Node could resolve Neon through an address path that timed out even though direct IPv4 HTTPS access succeeded.

The runtime now:

- makes `.env.local` authoritative for SENTINEL's local server-only runtime keys while deployed Vercel keeps platform-injected values authoritative;
- pins local development to Node 22 with `.nvmrc`;
- prefers IPv4-first DNS ordering only outside deployed Vercel runtimes;
- exposes safe DB host/source diagnostics in `/api/health` without exposing credentials;
- retries only transient Neon network failures (`ETIMEDOUT`, connection reset/refused, temporary DNS/network-unreachable failures) up to three attempts with short backoff;
- provides `npm run dev:local`, which sources nvm when available, forces Node 22, enables IPv4-first DNS, and launches Vercel on the local port;
- preserves production Vercel networking behavior;
- keeps `.env.local`, `.env`, `.vercel`, `node_modules` and `dist` out of Git.

Local Neon proof on 2026-09-10:

- Node `v22.23.2` direct test — PASS;
- `.env.local` loaded — PASS;
- `/api/health` reported `persistenceConfigured: true`, `nebiusConfigured: true`, and `dnsResultOrder: ipv4first` — PASS;
- direct Neon SQL `select 1 as ok` succeeds when IPv4 is preferred — PASS;
- `/api/memory?environmentId=office-demo` returned `persistence: neon` — PASS;
- `memory: null` is expected for an environment with no stored state yet.

Hardening commits include:

- `7bb5615` — `fix: prefer ipv4 for local neon runtime`
- `7e30a08` — `fix: retry transient neon network timeouts`
- `939916e` — `chore: expose local dns preference in health`
- `7d455bc` / `e0fb431` — local Node 22 Vercel launcher work
- `fce9e08` — `fix: harden local phone video scan diagnostics`
- `7ce7ceb` / `7b685f8` — local `.env.local` authority + safe DB diagnostics

## Local Nebius authentication checkpoint

A real browser phone-video Observe attempt now passes browser ingestion and reaches the Nebius inference request. The current failure is an explicit Token Factory authentication response:

`401 {"detail":"Couldn't authenticate. Reason: Unable authenticate"}`

This proves the remaining local failure is no longer video extraction, scan request validation, or Neon persistence. `NEBIUS_API_KEY` is present but the key currently loaded from local runtime configuration is not accepted by Token Factory.

The repo now:

- records the safe source of `NEBIUS_API_KEY` in `/api/health` without exposing the key;
- exposes the configured Token Factory base URL safely;
- provides `npm run check:nebius`, which calls Token Factory `/models` with the configured key and prints only authentication status/model count, never the credential.

A valid Token Factory key must be restored/generated and placed in `.env.local` before the real-phone Phase 4 gate can continue.

## Verification status

Engineering commit:

- `7f795c4` — `feat: harden phase 4 observation ingestion`
- GitHub CI: **PASS**
- Vercel deployment for this commit: **PASS**

Production contract workflow:

- `.github/workflows/phase4-observation-contract.yml`
- unsupported video MIME → 415 `UNSUPPORTED_MEDIA_TYPE` — **PASS**
- too-short walkthrough → 422 `VIDEO_TOO_SHORT` — **PASS**
- too-few evidence frames → 422 `TOO_FEW_FRAMES` — **PASS**
- valid 30-second / 8-frame request → reached real Nebius, then exposed nested evidence source-identity drift.

Identity fix:

- `7afc36d` — `fix: normalize trusted scan identity for multi-frame perception`
- GitHub CI: **PASS**
- later commits include the identity fix and local runtime hardening;
- Vercel is currently rejecting new builds because the project hit its build-rate limit, so the production valid-video contract has not yet been rerun against the latest main.

## Remaining Phase 4 exit gate

Phase 4 must not be marked complete until all of the following are true:

1. restore a valid local Token Factory API key and pass `npm run check:nebius`;
2. rerun the real browser phone walkthrough locally and receive a successful `/api/scan` result persisted to Neon;
3. deploy the latest `main` containing the identity and runtime hardening fixes;
4. rerun the Phase 4 production observation contract and receive HTTP 200 for the valid 8-frame walkthrough request with `persistence: neon`;
5. run multiple normal 30–60 second phone walkthroughs through the actual browser ingestion path;
6. confirm those walkthroughs consistently produce roughly 8–12 useful frames within the request budget;
7. confirm dark, duplicate-heavy, unsupported or otherwise poor walkthroughs fail with actionable user-facing guidance rather than fabricated environmental memory.

## Non-goals

Phase 4 does not change:

- Neon memory persistence semantics;
- immutable state snapshots;
- Diff semantics;
- condition/diagnosis semantics (Phase 5);
- full Reliability/Guardrails work (Phase 15);
- the locked Living Spatial Intelligence redesign (Phase 13).

## Exit condition

**Multiple normal phone videos produce stable, compact perception requests and poor inputs fail safely.**
