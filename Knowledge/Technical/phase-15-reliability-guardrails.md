# Phase 15 — Reliability and Guardrails

Status: **ACTIVE — Slices 1–3 implemented / production cold-start proof pending merge**

Goal: prevent demo failure and unsafe overclaiming. Every major failure path must either recover safely or fail closed with a useful user-facing message. SENTINEL must never fabricate a smoother result.

## Slice 1 — Duplicate condition / duplicate verdict hardening

The Phase 14 repeatability replay exposed two semantically identical **Emergency exit access obstructed** conditions in one historical state. Verification correctly resolved both, but the UI showed duplicate resolved verdicts for one physical problem.

Phase 15 now treats this as a reliability defect rather than rewriting history.

Implemented:

- immutable historical snapshots remain untouched;
- verification projects grounded semantic duplicates into one canonical condition when they share the same title/kind/status and direct evidence or object grounding;
- merged verification conditions union grounded object/evidence references and retain the strongest supported confidence;
- direct prior-condition discovery uses the same projection, so the UI does not ask to verify the same physical problem twice;
- duplicate model verdicts with the same condition/status collapse to one candidate;
- contradictory model verdicts for one condition fail closed to one **inconclusive** result;
- one physical condition therefore produces one user-facing verification verdict.

## Slice 2 — Route, snapshot, and browser failure contracts

Implemented:

- Ask / Action Plan / Verification now distinguish unknown environments, missing states, and incomplete immutable snapshots with stable status/code pairs;
- Ask and Action Plan no longer reconstruct missing historical snapshots from today's mutable canonical records;
- Verification reports missing state as `404 STATE_NOT_FOUND` and missing immutable snapshot as `409 HISTORICAL_SNAPSHOT_UNAVAILABLE`;
- malformed request bodies now return structured `400 INVALID_REQUEST` instead of becoming opaque 500s;
- all inference routes enforce their request-size budget before any model call;
- memory restoration distinguishes invalid queries from persistence/read failure;
- the browser now uses one shared response parser for Memory / History / Scan / Ask / Action Plan / Verification;
- network interruption never exposes raw browser/provider error text and always states that no result was confirmed;
- HTML / malformed upstream failures are converted to stable product language rather than leaking a server page;
- memory restoration failure is no longer silently presented as a new empty location.

Deterministic gate:

`npm run check:phase15-routes`

## Slice 3 — Stable-state, fallback consistency, and production reload

Implemented:

- a deterministic stable-state contract proves two materially equivalent environmental snapshots produce zero Reality Diff changes;
- stable states retain the canonical summary **No material environmental changes detected.**;
- a stable normal environment cannot manufacture prior-condition verification work;
- Scan / Ask / Action Plan / Verification are statically asserted to use the same browser response parser;
- a dedicated production cold-start workflow waits for the exact deployed main commit, then performs independent no-cache reads from Memory and State History;
- the production reload proof requires Neon persistence, the same currentStateId across independent reads, consistent state counts, and an unchanged read-only fingerprint.

Deterministic gate:

`npm run check:phase15-stability`

Production gate after merge:

`npm run check:phase15-cold-start`

## Reliability matrix

| Failure path | Expected behavior | Current deterministic coverage | Phase 15 state |
| --- | --- | --- | --- |
| Zero grounded observations/entities | Reject/fail closed; never persist an empty invented scene | `check:provider-boundary` | Covered |
| Poor video / too dark | Reject with explicit quality error | `check:phase4-poor-inputs` | Covered |
| Duplicate-heavy video | Reject insufficient visual variety | `check:phase4-poor-inputs` | Covered |
| Model timeout / transient provider failure | Bounded retry, then structured 502/504 without duplicate state | `check:perception-retry`, `api/scan.ts` | Covered; production replay still monitored |
| Invalid provider JSON/schema | Repair/normalize only when deterministic; otherwise retry/fail closed | `check:perception-retry`, `check:provider-boundary` | Covered |
| Missing/unknown evidence references | Drop unsupported references; never present fabricated grounding | `check:provider-boundary`, `check:phase10-ask-building` | Covered |
| Missing prior/current state | Reject reasoning/history request with explicit typed error | `check:phase12-verification`, `check:phase15-routes` | **Covered in Slice 2** |
| No material changes | Render stable-state outcome; do not invent a change | `check:phase15-stability` + Reality Diff UI | **Covered in Slice 3** |
| Wrong environment/source identity | Reject mismatched scan identity / unknown memory | `api/scan.ts`, typed service guards, `check:phase15-routes` | **Covered in Slice 2** |
| Reload / cold start | Restore Neon-authoritative memory; surface read failure instead of pretending memory is empty | Phase 3 Neon proof + `phase15-cold-start.yml` | **Production proof pending merged deployment** |
| Incomplete immutable memory/snapshot | Fail closed instead of synthesizing missing history | Ask / Action / Verification + `check:phase15-routes` | **Covered in Slice 2** |
| Reasoning references non-existent evidence | Filter references and cap unsupported confidence | `check:phase10-ask-building` | Covered |
| Huge request body | Reject before inference with 413 safety budget | all inference routes + `check:phase15-routes` | **Covered in Slice 2** |
| Network failure | Retry only idempotent scan transport; other operations report no result confirmed | shared browser failure contract + `check:phase15-routes` | **Covered in Slice 2** |
| Duplicate semantic condition | One physical problem → one verification candidate/verdict | Phase 12 regression + semantic projection | **Covered in Slice 1** |
| Conflicting duplicate model verdicts | Fail closed to one inconclusive verdict | Phase 12 regression | **Covered in Slice 1** |

## Exit condition

Phase 15 closes only when every row above has a deterministic test or production proof and the product exposes a graceful fallback instead of an opaque crash, false-green state, or fabricated answer. After Slice 3, the only remaining closure gate is the exact-main production cold-start/reload workflow.

Canonical fallback language:

> I couldn't verify this condition from the available evidence. A clearer observation is needed.
