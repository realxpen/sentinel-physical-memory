# Phase 3 Production Proof

Date: 2026-09-06
Status: **PASSED**

## Production path verified

The deployed SENTINEL production runtime completed the full persistent-memory gate:

`Scan A → Nebius perception → Neon persist → fresh memory read → Scan B → Neon persist → fresh memory read → Reality Diff`

Production URL: `https://sentinel-physical-memory.vercel.app`

Verification environment: `phase3-runtime-34027093828`

## Result

- Persistence mode: `neon`
- Scan A: `scan_f0a2e99a-c850-4f71-97ae-820b1aa2e98a`
- State A: `state_81c0c92d-9354-4fde-aeb8-656c514615ac`
- Scan B: `scan_774fa2d3-def2-4f39-ab7e-9993dba56948`
- State B: `state_6ec21382-b657-48b4-876b-1f3d2e5a349b`
- State count after Scan B: `2`
- Snapshot count after Scan B: `2`
- Diff: `diff_ddb287af-709e-4c67-a514-d252dc828d4c`
- Diff changes: `2`
- State A immutable after Scan B: `true`

The GitHub Actions production verification printed:

`PHASE 3 PRODUCTION SCAN PERSISTENCE VERIFIED`

## Model path used

- Perception: `openbmb/MiniCPM-V-4_5`
- Reasoning / Ask default: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
- Nebius Token Factory: `https://api.tokenfactory.us-central1.nebius.com/v1`

The perception boundary provides the exact SENTINEL JSON contract and normalizes provider-format differences only. Required identity, evidence references, categories, confidence values, and environmental consistency remain validated.

## What this proves

1. Production `/api/scan` reaches real Nebius inference.
2. Scan A creates durable server-authoritative environmental memory in Neon.
3. A fresh request restores that memory without browser-carried state.
4. Scan B creates a second immutable environmental state.
5. State A remains unchanged after Scan B.
6. SENTINEL persists an A→B Reality Diff from immutable snapshots.
7. Vercel serverless cold/fresh invocation boundaries no longer break memory continuity.

This satisfies the Phase 3 production exit gate.
