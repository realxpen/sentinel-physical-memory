# Phase 14 — Demo Scenario Engineering

Date: 2026-09-23

Status: **ACTIVE — REPRODUCIBLE DEMO HARNESS IMPLEMENTED / REAL THREE-SCAN REHEARSAL PENDING**

## Goal

Make the exact SENTINEL hackathon story repeatable rather than lucky.

The canonical physical sequence is:

`Scan A → remember → Scan B → Reality Diff → Ask → Action Plan → Scan C → Verification`.

The product must keep using real Nebius/NVIDIA inference and immutable Neon memory. Phase 14 does not introduce hard-coded production detections or demo-only fake model output.

## Canonical physical setup

Create a fresh office environment with a human-readable name such as **SENTINEL Demo Office**.

### Scan A — baseline

- emergency exit / egress path clearly visible and clear;
- fire extinguisher clearly visible at position A;
- one safe staged visible condition that can later be explicitly shown as resolved;
- stable room anchors and signage visible where possible.

### Scan B — changed state

Make exactly three intentional changes:

1. add a visually obvious obstruction at the exit/egress route;
2. move the same fire extinguisher to a distinctly different physical anchor;
3. explicitly resolve the safe staged baseline condition.

Keep lighting, camera height, route, and framing as similar as practical. The intended physical changes should be much larger than incidental scene noise.

### Scan C — verification

- clear the exit obstruction;
- re-observe the same exit area positively;
- preserve enough visual context for SENTINEL to identify the same physical place;
- run the Verification Agent against Scan B → Scan C.

## Automated demo gate

`npm run check:phase14-demo`

The deterministic CI contract proves that the demo readiness layer requires:

- one supported added obstruction grounded to exit/egress context;
- one supported moved fire extinguisher;
- one explicit resolved change;
- at most 2 uncertain changes;
- at most 2 unrelated supported changes;
- a `passed` Verification Agent result for the selected Scan B → Scan C pair.

Missing current evidence is never accepted as a fake resolution.

## Live rehearsal command

After Scan A and Scan B exist in production:

```bash
npm run check:phase14-live -- --environment-id=<environment-id>
```

For environments with older history, pin the state pair explicitly:

```bash
npm run check:phase14-live -- \
  --environment-id=<environment-id> \
  --baseline-state=<scan-a-state-id> \
  --changed-state=<scan-b-state-id>
```

Optional base URL:

```bash
SENTINEL_DEMO_BASE_URL=https://sentinel-physical-memory.vercel.app \
npm run check:phase14-live -- --environment-id=<environment-id>
```

The live command reads the real persisted `/api/memory` state. It does not synthesize detections.

## Rehearsal acceptance criteria

### Scan A → Scan B

Required:

- exit obstruction = PASS;
- extinguisher moved = PASS;
- prior condition resolved = PASS;
- uncertainty count ≤ 2;
- unrelated supported change count ≤ 2.

If the model returns signage/room labels as fake additions, object aliases, or a large set of not-re-observed objects, the rehearsal fails and the physical capture is repeated or the relevant perception/identity bug is fixed. The gate must not be weakened just to make the demo pass.

### Scan B → Scan C

Required:

- Verification Agent runs against the exact selected state pair;
- status = `passed`;
- current evidence positively re-observes the physical context;
- the emergency route is supported as clear again.

## Capture discipline

For all three scans:

- use the same phone orientation;
- keep a similar walking path and camera height;
- avoid people entering/leaving frame where possible;
- avoid moving unrelated furniture;
- keep lighting stable;
- keep important anchors visible for several frames;
- make the extinguisher movement spatially obvious, not a few centimetres;
- make the exit obstruction visually distinct and safe;
- do not rely on disappearance alone as proof of resolution.

## Exit condition

Phase 14 closes only when a fresh real office environment repeats the complete three-scan story cleanly:

`+ obstruction → ↔ extinguisher moved → ✓ prior condition resolved → action → rescan → Verified`

and the same sequence can be rehearsed again without changing code or weakening trust rules.
