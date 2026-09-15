# Provider Boundary Canonicalization

Date: 2026-09-15
Status: **ACTIVE / CI VERIFIED**

## Decision

MiniCPM provider output is not treated as SENTINEL's canonical physical-memory schema directly.

All vision-model output now passes through one provider-boundary pipeline:

`provider text → JSON syntax repair → trusted scan identity stamping → provider canonicalization → strict adapter schema → SENTINEL-owned frame evidence grounding → strict scan invariants → durable memory`

The purpose is to tolerate harmless serialization/provider variance without weakening SENTINEL's evidence and trust rules.

## Why this exists

Real-phone walkthrough testing exposed several different provider-output variations across repeated runs of the same video:

- object categories outside the canonical taxonomy;
- scalar `evidenceIds` instead of arrays;
- numeric confidence values encoded as strings;
- relation synonyms such as `located_near`;
- relations with blank endpoints;
- numeric frame/geometry metadata encoded as strings;
- malformed JSON syntax;
- references such as `evidence_0` without a model-created matching evidence record.

Fixing those one at a time made the scan experience brittle. The correct boundary is therefore one consolidated canonicalizer plus strict downstream invariants.

## Trust rule

SENTINEL may repair **technical representation** when the repair is deterministic.

Examples:

- `"0.93" → 0.93`;
- scalar reference → one-item array;
- `located_near → near`;
- `desk → furniture` while preserving `name="Desk"`;
- blank optional geometry → omit the optional geometry;
- missing scan-local technical ID → generate a deterministic local alias.

SENTINEL must not invent **semantic facts**.

Examples that are not guessed:

- unknown relation meaning;
- a missing relation endpoint;
- an out-of-range frame/evidence reference;
- unsupported measurement or geometry;
- an object/condition with no grounded evidence;
- a diagnosis or operational conclusion not supported by the supplied frames.

Unsupported optional provider items are dropped rather than causing the entire otherwise-grounded walkthrough to fail.

## Canonicalization coverage

`src/ai/perception-normalization.ts` owns provider-shape canonicalization for:

- singleton vs array collections;
- scan-local technical IDs;
- confidence serialization;
- numeric metadata serialization;
- scalar/list reference fields;
- object category aliases;
- condition-kind aliases;
- modality aliases;
- evidence-type aliases;
- relation aliases;
- optional position and bounding-box cleanup;
- duplicate provider IDs;
- malformed or unsupported optional relations/items.

The canonicalizer is the sole provider-shape boundary. Nebius code stamps only trusted request identity/time before invoking it.

## SENTINEL-owned evidence

The provider does not own frame identity.

`src/ai/trusted-evidence.ts` creates canonical evidence from the exact frames SENTINEL selected and supplied to MiniCPM.

The model is instructed to use the supplied `FRAME_ID` directly whenever possible.

Provider placeholders such as `evidence_0`, `frame-1`, or `frame:2` are remapped only when their index identifies a frame actually supplied to the model.

Unknown/out-of-range references never create evidence.

After grounding:

- unknown evidence references are removed;
- observations/objects/conditions with no grounded evidence are dropped;
- dangling relations are dropped;
- retained conditions only reference retained objects;
- trusted scan capture time replaces provider temporal claims;
- trusted frame evidence is merged into the perception result.

## Strict final invariants

Tolerance at the provider boundary does not mean accepting arbitrary output.

`validatePerceptionForScan` still requires:

- authoritative scan source/environment identity;
- unique IDs in each retained collection;
- at least one grounded observation, object, or condition;
- at least one real evidence reference for each retained observation/object/condition/relation;
- all referenced evidence to exist;
- all condition object IDs to exist;
- all relation endpoints to exist;
- every evidence item to belong to the trusted scan source.

A payload that canonicalizes down to no grounded semantic content fails closed.

## Automatic bounded retry

`ScanPipeline` now permits at most two perception attempts for provider-output failures.

A second attempt is used only for output/schema failures such as:

- malformed/unrepairable model JSON;
- empty model content;
- invalid perception schema;
- a perception result that fails grounded scan invariants.

The retry reuses the same selected frames and adds a stricter instruction to return canonical JSON and omit unsupported optional claims.

Authentication, arbitrary network failures, and other unrelated failures are not converted into unlimited retries.

This removes the need for the user to manually re-upload a video because of ordinary model formatting drift.

## Prompt contract

Each supplied frame is now preceded by:

- `FRAME_INDEX`
- `FRAME_ID`

MiniCPM is explicitly told:

- SENTINEL owns frame evidence identity;
- use exact `FRAME_ID` in `evidenceIds` whenever possible;
- `evidence` may be empty for frame evidence;
- do not manufacture frame evidence records;
- omit unsupported optional claims instead of guessing;
- relation endpoints must reference objects actually returned.

## Automated verification

`npm run check:provider-boundary`

uses one deliberately messy provider payload containing the real classes of failure encountered during phone testing and verifies that deterministic variance is canonicalized while unsupported claims are dropped or rejected correctly.

`npm run check:perception-retry`

simulates a malformed first provider response followed by a valid second response and verifies that SENTINEL retries automatically, grounds the result to trusted frame evidence, and still creates State v1.

Sentinel CI runs:

1. Phase 4 poor-input quality gate;
2. comprehensive provider-boundary gate;
3. automatic perception-retry gate;
4. Phase 5 condition trust gate;
5. TypeScript/Vite build.

CI run `34974819474` passed the complete retry-capable pipeline before the final Nebius boundary simplification. The subsequent exact-main CI must remain green before this checkpoint is considered locked.

## Current real-phone gate

The next real test is one upload of `New Office Walkthrough.mp4` with **LCCI Ikeja** selected.

Expected behavior:

- ordinary MiniCPM serialization drift is handled automatically;
- unsupported optional provider items do not discard the whole scan;
- frame references are grounded to SENTINEL-owned evidence;
- one schema/output retry may occur automatically without another user upload;
- a successful first scan persists `LCCI Ikeja → State v1`;
- if both perception attempts contain no grounded semantic information, the scan still fails closed rather than inventing a memory.
