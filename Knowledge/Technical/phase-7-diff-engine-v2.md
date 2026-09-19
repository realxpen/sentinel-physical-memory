# Phase 7 — Environmental Diff Engine v2

Date: 2026-09-19

Status: **IMPLEMENTED — CI + PRODUCTION DEPLOY PASS / REAL THREE-CHANGE PHONE PROOF PENDING**

## Goal

Make **What changed?** reliable enough to function as SENTINEL's **Git diff for reality**.

The locked vocabulary is:

- `added`
- `removed`
- `moved`
- `changed`
- `resolved`
- `uncertain`

The trust rule remains:

> Missing from one later scan is not proof of removal or resolution.

## Object identity hierarchy

Diff v2 matches in this order:

1. exact durable ID;
2. conservative semantic object family / compatible exact name;
3. distinctive grounded location and relationship context.

Confidence is a weak tie-breaker only.

It is never enough by itself to merge two repeated physical instances.

## Repeated-instance matching

A repeated object may be paired across states when semantic identity is compatible and grounded context makes one pairing mutually distinctive.

Useful context includes:

- semantic position;
- room anchor;
- relative object anchor;
- stable grounded relations such as `near`, `adjacent_to`, `located_in`, `on`, `left_of`, `right_of`, `in_front_of`.

Ambiguous repeated instances stay unresolved rather than being guessed.

Existing family-multiplicity suppression remains in place when the provider changes granularity between scans.

## Object changes

### Added

A current object has no supported previous identity.

### Removed

Removal requires explicit current evidence/state such as:

- `removed`;
- `absent`;
- `not present`;
- `no longer present`.

Simple non-observation remains `uncertain`.

### Changed

Direct visible object state changed, for example:

`closed → open`

State must be directly visually supportable; perception is instructed to omit hidden operational states rather than infer them.

### Moved

Movement may be established through:

- room ID change;
- relative-anchor change;
- semantic physical position change;
- grounded relation-anchor change.

Image/frame coordinate drift never counts as physical movement.

## Condition changes

Conditions are now first-class diff inputs.

Diff v2 can surface:

- new unpromoted operational condition;
- condition `present → uncertain`;
- condition kind change;
- condition basis/trust change;
- prior unpromoted condition not re-observed → `uncertain`.

When a current condition already promoted to a new operational issue, the issue owns the visible new-event card to avoid semantic duplication.

A previous issue that becomes explicitly `resolved` produces a `resolved` issue change.

## Change entity type

`Change.entityKind` is now:

- `object`
- `condition`
- `issue`

This lets later Reality Diff UI and verification logic reason about changes structurally.

## Storage

Every generated state-pair diff remains part of `EnvironmentalMemory.diffs`.

Historical diffs are immutable. Phase 7 changes apply only to future comparisons.

## Perception support

The MiniCPM contract now asks for diff-friendly grounded context:

- semantic physical position instead of image-coordinate tuples;
- stable visible relationships when useful;
- separate repeated-object instances;
- direct visible state only.

This is an input-quality improvement. It does not move operational policy back into the vision model.

## Automated regression

`npm run check:phase7-diff`

covers:

- Added;
- explicit Removed;
- Moved;
- Changed;
- Resolved;
- relationship-context matching;
- relationship-anchor movement;
- uncertainty for unsupported disappearance;
- first-class condition transitions;
- issue/condition duplicate suppression;
- ambiguous repeated-object safety;
- durable retention of generated diffs.

CI:

- Diff Engine v2 implementation: `238183d62a0c9a085269ff5725d0674e5e91298d`
- Sentinel CI: `35435198030` — PASS
- provider diff-context hardening: `2006cd7dab63bb964436c11957553fd959f32654`
- Sentinel CI: `35435260985` — PASS
- production observation contract: `35435260980` — PASS

## Production

The exact latest commit `2006cd7dab63bb964436c11957553fd959f32654` was detected at:

`https://sentinel-physical-memory.vercel.app`

and successfully completed the production observation contract with Neon persistence.

## Exit condition — PENDING REAL PHONE PROOF

Intentionally change three things in one controlled environment and get understandable supported changes back.

Recommended phone-only scenario:

- **Added**: place a visually distinctive box/cart/bag where none existed;
- **Moved**: move a clearly identifiable stable object from beside one anchor to beside another;
- **Changed**: use a directly visible state transition such as a cabinet/door being closed in baseline and open in comparison.

Do not rely on disappearance for the third change; absence must remain uncertain unless removal is explicitly grounded.

If the three changes are persisted cleanly and understandable in Reality Diff, Phase 7 can close and Phase 8 — Reality Diff UI becomes active.
