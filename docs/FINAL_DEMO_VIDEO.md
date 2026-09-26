# Phase 18 — Final Demo Video

## Goal

Produce one public YouTube video **under three minutes** that proves the working product and the Nebius/NVIDIA technology story without turning the recording into a feature tour.

Target runtime: **2:58**.

The final story is:

```text
give the place a memory
→ show a real physical change
→ Reality Diff
→ ask what matters
→ grounded Action Plan
→ show the corrected state
→ verify from positive current evidence
```

## Locked environment

Use the already-proven **Office Lounge Test 4** as the core presentation environment.

Its persisted production proof is:

```text
State v1 — exit clear
State v2 — cardboard boxes obstruct exit
Reality Diff — obstruction + New: Cardboard Boxes
Ask — exit obstruction matters most
Action Plan — clear obstruction + rescan to verify
State v3 — boxes removed / same exit area visible
Verification — 1 resolved / 0 remaining / 0 inconclusive
```

Do **not** create State v4 during final recording.

This is demo hardening, not fakery: every state and verdict shown came from the real production loop and immutable environmental memory.

## Recording strategy

Record the product footage first. Do the voiceover afterward.

The final take should avoid depending on another full perception run. Use the persisted State v1/v2/v3 history for the core story, then re-run only bounded interactions such as Ask, Action Plan or Verification when useful.

If a live inference call takes 10–30 seconds, keep recording and remove the waiting section in editing.

### Capture setup

- Desktop capture: 1920×1080 or another 16:9 canvas.
- Browser zoom: **100%** before recording.
- Hide bookmarks bar and unrelated tabs if possible.
- Use the production app only.
- Start already inside Office Lounge Test 4.
- Disable notifications/popups.
- Keep mouse movement deliberate.
- Preserve the real SENTINEL UI; do not add fake overlays that imply product behavior.
- Keep original system audio off unless needed.
- No copyrighted music.
- Show no secrets, API keys, private console output, email, or unrelated browser content.

## Raw clips to capture

Capture more than the final edit needs:

1. Office Lounge Test 4 Memory / State v1.
2. State history showing immutable v1/v2/v3.
3. State v1 → v2 Reality Diff with before/after images.
4. Ask: **Which change matters most?**
5. Grounded Action Plan.
6. State v2 → v3 physical comparison.
7. Final **Verified** result.
8. A 2–3 second `/api/health` technology proof showing Nebius Token Factory + model role map.
9. Clean Memory / product close.

Optional B-roll:

- a separate disposable-environment Observe/file-selection interaction;
- never mutate Office Lounge Test 4 for B-roll.

## Locked 2:58 timeline

The machine-readable timeline lives in `docs/demo-timeline.json`.

| Time | Product moment | What the viewer must understand |
| --- | --- | --- |
| 0:00–0:08 | Give this place a memory | SENTINEL is persistent physical memory |
| 0:08–0:24 | Observe | visual evidence becomes an immutable state |
| 0:24–0:38 | Remembered | the place now has state history |
| 0:38–0:50 | Evidence | claims stay connected to grounded evidence |
| 0:50–1:08 | Change reality | boxes appear in the exit area |
| 1:08–1:30 | Reality Diff | signature state-to-state physical diff |
| 1:30–1:48 | Priority | Ask identifies the obstruction as most important |
| 1:48–2:06 | Action Plan | one corrective action + deterministic verification handoff |
| 2:06–2:25 | Fix and rescan | State v3 shows the corrected physical context |
| 2:25–2:45 | Verified | positive current evidence closes the loop |
| 2:45–2:55 | Nebius/NVIDIA proof | runtime model/provider map |
| 2:55–2:58 | Close | AI memory for the physical world |

## Voiceover script

### 0:00

**“Physical places usually have no persistent machine memory. SENTINEL gives them one.”**

### 0:08

**“A visual observation becomes an immutable environmental state, grounded to evidence rather than a disposable image description.”**

### 0:24

**“Now this office remembers what was here and keeps the earlier state intact.”**

### 0:38

**“Objects, conditions and answers stay connected to the evidence that supports them.”**

### 0:50

**“Then reality changes: cardboard boxes enter the exit access area.”**

### 1:08

**“SENTINEL compares remembered states. This is Reality Diff — a Git diff for the physical world.”**

### 1:30

**“Because the system has memory, I can ask which change matters most. It prioritizes the blocked exit from the current grounded state.”**

### 1:48

**“The Action Plan stays recommendation-only: clear the obstruction, then rescan. SENTINEL never pretends the work happened.”**

### 2:06

**“After the boxes are removed, the same exit context is observed again.”**

### 2:25

**“Verification requires positive current evidence. Missing is not enough. The path is visibly clear, so the earlier obstruction is Verified as resolved.”**

### 2:45

**“The live inference path runs through Nebius Token Factory, with NVIDIA Nemotron handling grounded reasoning and action planning.”**

### 2:55

**“SENTINEL: AI memory for the physical world.”**

## Editing rules

Cut:

- inference waiting time;
- upload picker delay;
- repeated scrolling;
- accidental clicks;
- debug/test screens;
- dead air;
- unrelated browser chrome.

Keep:

- Memory / immutable state history;
- before/after Reality Diff;
- grounded Ask;
- Action Plan;
- State v3 corrected physical context;
- final Verified result;
- a very short Nebius/NVIDIA runtime proof;
- enough UI continuity that the result does not look pre-rendered.

Do not speed through the final Verified result. Give it several seconds.

## Nebius / NVIDIA proof in the video

Keep the technology proof short:

> **Nebius Token Factory · NVIDIA Nemotron 3 Nano**

Preferred visual proof:

- open `/api/health` for 2–3 seconds;
- show provider + role → model mapping;
- return immediately to the product.

Do not show API keys, environment variables, request payloads, or private infrastructure pages.

## Final video quality gate

Before uploading:

- duration ≤ 2:59;
- Browser zoom is 100%;
- no secrets in DevTools, URLs, console or environment files;
- no unrelated browser tabs/user data visible;
- product text is readable without zooming the final export;
- voiceover is audible and even;
- no copyrighted music;
- no false claims about automated physical work;
- final result visibly says **Verified**;
- Verification shows positive current evidence, not disappearance-only reasoning;
- NVIDIA/Nebius usage is stated at least once;
- YouTube visibility is **Public**;
- paste final URL into `SUBMISSION.md`.

## External handoff

The repository cannot manufacture the final public YouTube URL.

After the video is uploaded, replace the TODO in `SUBMISSION.md` with the real URL and check the remaining boxes in `SUBMISSION_CHECKLIST.md`.
