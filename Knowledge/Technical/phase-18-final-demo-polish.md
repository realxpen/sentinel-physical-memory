# Phase 18 — Final Demo Polish

Status: **ACTIVE — repository recording package ready / external recording + YouTube upload pending**

## Goal

Turn the already-proven SENTINEL product into one clear public demonstration under three minutes without adding risky demo-only product behavior.

## Locked story

```text
Give this place a memory
→ Observe
→ Remember
→ Ask
→ Ground in evidence
→ Change reality
→ Observe again
→ Reality Diff
→ Prioritize
→ Action Plan
→ Fix + rescan
→ Verified
```

Target runtime: **178 seconds / 2:58**.

## Repository package

- `docs/demo-timeline.json` — machine-readable 2:58 choreography;
- `docs/FINAL_DEMO_VIDEO.md` — shot plan, narration and edit rules;
- `docs/RECORDING_CHECKLIST.md` — capture/edit/upload checklist;
- `docs/YOUTUBE_COPY.md` — upload title, description and thumbnail text;
- `scripts/check-phase18-demo-package.mjs` — deterministic timing/package gate.

## Recording decisions

- record the complete product run first;
- narrate afterward;
- cut provider wait time rather than pretending inference is instant;
- browser zoom must be 100% so the product remains readable;
- keep the working product on screen from the opening;
- show the real Scan → state → Reality Diff → Ask → Action Plan → Scan C → Verification flow;
- show Nebius/NVIDIA briefly, but do not turn the video into an architecture presentation;
- preserve trust language: recommendation is not execution, and not re-observed is not resolved;
- show the final **Verified** result long enough to read;
- use no copyrighted music or third-party material without permission.

## Exit condition

Repository-side demo polish is ready when `check:phase18-demo` passes.

Phase 18 itself closes only after the user:

1. records/edits the final video;
2. confirms final exported duration < 3:00;
3. uploads it publicly to YouTube;
4. verifies playback while signed out;
5. inserts the real URL into `SUBMISSION.md`;
6. completes the external items in `SUBMISSION_CHECKLIST.md`.

The project must never invent a YouTube URL or claim the submission is complete before those external steps happen.
