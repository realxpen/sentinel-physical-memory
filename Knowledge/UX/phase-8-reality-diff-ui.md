# Phase 8 — Reality Diff UI

Date: 2026-09-19

Status: **IMPLEMENTED — CI PASS / PHONE VISUAL VALIDATION PENDING**

## Product framing

Reality Diff is the technical differentiator, but facility operations is the product.

The Changes experience now answers four manager questions:

1. What needs attention?
2. What physically changed?
3. What was resolved?
4. What still needs verification?

It must not feel like a developer event log.

## Implemented experience

The Changes view now presents:

- Facility Operations / Reality Diff context;
- previous remembered state → current remembered state;
- state-version labels rather than raw IDs as the primary display;
- summary counts for Needs attention / Physical changes / Resolved / Needs verification;
- grouped change sections;
- type + entity-kind labels;
- confidence per change;
- a detailed change drawer;
- persisted evidence references;
- previous/current state transition metadata;
- direct handoff to Ask SENTINEL what to do for attention/verification items;
- Observe-again action for the next physical state.

## Trust semantics

- Needs attention = operational issue/condition changes.
- Physical changes = supported object added/removed/moved/changed events.
- Resolved = only explicit supported resolved changes.
- Needs verification = uncertain changes.

Not re-observed is still not the same as resolved.

## Backward compatibility

Older persisted diffs may not contain Phase 7 entityKind. The UI falls back conservatively from existing titles instead of rewriting historical diffs.

## Facility-operations bridge

The change-detail drawer can prefill: `What should I do about: <change>?` into the existing grounded Ask experience.

This is not yet a full work-order system. Phase 11 remains responsible for Action Planner and lightweight task semantics.

## CI

Implementation commit: `937ce9c02ab5a1ee496540d2ce3ad830511e7399`

Sentinel CI: `35454475031` — PASS

The complete Phase 4/5/6/7 regression suite and production TypeScript/Vite build remained green.

## Exit condition — PENDING PHONE VISUAL PROOF

The original Phase 8 exit condition remains: someone unfamiliar with SENTINEL should understand the core innovation in five seconds.

Phone validation should confirm:

- layout is usable on the production mobile viewport;
- a real three-change Phase 7 proof is grouped correctly;
- operational issue/change is visibly distinct from physical-object change;
- uncertain disappearance is visibly Needs verification, not resolved;
- evidence/detail drawer is understandable;
- the manager can naturally move from a change into What should I do?

If that passes, Phase 8 can close and Phase 9 — Spatial Memory experience becomes active.
