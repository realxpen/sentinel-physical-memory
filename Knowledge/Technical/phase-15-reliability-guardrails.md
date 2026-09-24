# Phase 15 — Reliability and Guardrails

Status: **ACTIVE — Slice 1 implemented**

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

## Reliability matrix

| Failure path | Expected behavior | Current deterministic coverage | Phase 15 state |
| --- | --- | --- | --- |
| Zero grounded observations/entities | Reject/fail closed; never persist an empty invented scene | `check:provider-boundary` | Covered |
| Poor video / too dark | Reject with explicit quality error | `check:phase4-poor-inputs` | Covered |
| Duplicate-heavy video | Reject insufficient visual variety | `check:phase4-poor-inputs` | Covered |
| Model timeout / transient provider failure | Bounded retry, then structured 502/504 without duplicate state | `check:perception-retry`, `api/scan.ts` | Covered; production replay still monitored |
| Invalid provider JSON/schema | Repair/normalize only when deterministic; otherwise retry/fail closed | `check:perception-retry`, `check:provider-boundary` | Covered |
| Missing/unknown evidence references | Drop unsupported references; never present fabricated grounding | `check:provider-boundary`, `check:phase10-ask-building` | Covered |
| Missing prior/current state | Reject verification/history request with explicit input error | `check:phase12-verification` + state/snapshot guards | Covered; Phase 15 adds dedicated matrix assertion next |
| No material changes | Render stable-state outcome; do not invent a change | Phase 8 presentation + deployed UI | Covered; dedicated Phase 15 assertion next |
| Wrong environment/source identity | Reject mismatched scan identity / unknown memory | `api/scan.ts` environment mismatch guard | Covered in code; dedicated route test pending |
| Reload / cold start | Restore Neon-authoritative memory; no browser-carried authority | Phase 3 Neon production proof | Covered; dedicated Phase 15 replay pending |
| Incomplete immutable memory/snapshot | Fail closed instead of synthesizing missing history | verification state/snapshot guards | Covered; dedicated assertion next |
| Reasoning references non-existent evidence | Filter references and cap unsupported confidence | `check:phase10-ask-building` | Covered |
| Huge request body | Reject before inference with 413 safety budget | `api/scan.ts`, `api/verify.ts` | Implemented; dedicated route test pending |
| Network failure | Retry only safe scan transport cases; surface readable failure | `postScanWithRetry` + defensive API response parsing | Implemented; deterministic browser-network test pending |
| Duplicate semantic condition | One physical problem → one verification candidate/verdict | Phase 12 regression + semantic projection | **Covered in Slice 1** |
| Conflicting duplicate model verdicts | Fail closed to one inconclusive verdict | Phase 12 regression | **Covered in Slice 1** |

## Exit condition

Phase 15 closes only when every row above has a deterministic test or production proof and the product exposes a graceful fallback instead of an opaque crash, false-green state, or fabricated answer.

Canonical fallback language:

> I couldn't verify this condition from the available evidence. A clearer observation is needed.
