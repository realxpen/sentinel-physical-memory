# Phase 8 — Reality Diff UI

Date: 2026-09-20

Status: **IMPLEMENTED — PHONE PROOF PARTIAL / DUPLICATE-SURFACE HARDENING CI PASS**

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

Historical diffs remain immutable. The UI now applies a bounded presentation projection for duplicate structural-surface verification cards: same-title wall/floor/ceiling uncertainties collapse only when they share trusted evidence. Evidence references are unioned, while independently grounded same-named surfaces remain separate.

Future comparisons also normalize duplicate grounded structural-surface segments at the memory/diff boundary. Conflicting room or directional anchors remain separate.

## Phone finding — 2026-09-20

A real office comparison correctly presented the added **green bag** as a physical change and kept the missing **closet door** / **white wall** as Needs verification rather than removal. It also exposed one presentation defect: the same grounded **white wall** uncertainty rendered twice, inflating the screen from three understandable changes to four cards.

The bounded hardening now makes that persisted result present as:

- 1 physical change — New: green bag;
- 2 verification items — closet door and white wall;
- 3 supported changes total.

The persisted historical diff is not modified.

## Facility-operations bridge

The change-detail drawer can prefill: `What should I do about: <change>?` into the existing grounded Ask experience.

This is not yet a full work-order system. Phase 11 remains responsible for Action Planner and lightweight task semantics.

## CI

Implementation commit: `937ce9c02ab5a1ee496540d2ce3ad830511e7399`

Sentinel CI: `35454475031` — PASS

The complete Phase 4/5/6/7 regression suite and production TypeScript/Vite build remained green.

Duplicate-surface hardening commit: `ec91d73a9438048188b644f854951bc3ed9c36e7`

Sentinel CI: `35509707873` — PASS

The added Phase 8 presentation regression, complete existing regression suite, and production build all passed on Node 22.

## Exit condition — PARTIAL PHONE VISUAL PROOF

The original Phase 8 exit condition remains: someone unfamiliar with SENTINEL should understand the core innovation in five seconds.

The real phone run confirmed mobile layout, physical-change grouping, and conservative non-observation semantics. A fresh deployed comparison must still confirm the duplicate-surface correction and the remaining exit checks:

- layout is usable on the production mobile viewport;
- a real three-change Phase 7 proof is grouped correctly;
- operational issue/change is visibly distinct from physical-object change;
- uncertain disappearance is visibly Needs verification, not resolved;
- evidence/detail drawer is understandable;
- the manager can naturally move from a change into What should I do?

If that passes, Phase 8 can close and Phase 9 — Spatial Memory experience becomes active.
