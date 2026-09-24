# Phase 18 — Final Demo Video

## Goal

Produce one public YouTube video **under three minutes** that proves the working product and the Nebius/NVIDIA technology story without turning the recording into a feature tour.

Target runtime: **2:58**.

The story is:

```text
Give the place a memory
→ change reality
→ show Reality Diff
→ ask what matters
→ recommend action
→ correct the physical state
→ verify from new evidence
```

## Recording strategy

Record the raw product run first. Do the voiceover afterward.

Do **not** try to narrate live while waiting for inference.

### Capture setup

- Desktop capture: 1920×1080 or another 16:9 canvas.
- Browser zoom: **100%** before recording. Do not use the heavily zoomed-out view used during debugging.
- Hide bookmarks bar and unrelated tabs if possible.
- Use the production app only.
- Start already on the prepared SENTINEL location.
- Disable notifications/popups.
- Keep mouse movement deliberate.
- Preserve the real SENTINEL UI; do not add fake overlays that imply product behavior.
- Keep original system audio off unless needed.
- No copyrighted music.

### Raw capture

Record more than you need:

1. clean baseline/Memory;
2. Scan A flow;
3. Ask/evidence;
4. Scan B;
5. Reality Diff;
6. priority Ask;
7. Action Plan;
8. Scan C;
9. final Verification.

If an inference call takes 10–30 seconds, keep recording. Remove the waiting section in editing.

## Locked 2:58 timeline

The machine-readable timeline lives in `docs/demo-timeline.json`.

| Time | Product moment | What the viewer must understand |
| --- | --- | --- |
| 0:00–0:08 | Give this place a memory | SENTINEL is physical memory, not a dashboard |
| 0:08–0:25 | Observe | real visual input becomes grounded state |
| 0:25–0:38 | Remembered | state persists with history/evidence |
| 0:38–0:55 | Ask attention | reasoning is over remembered state |
| 0:55–1:10 | Evidence | claims remain grounded |
| 1:10–1:20 | Change reality | boxes + extinguisher change |
| 1:20–1:40 | Observe again | new immutable state |
| 1:40–1:56 | Reality Diff | signature “Git diff for reality” |
| 1:56–2:12 | Priority | exit obstruction becomes the important change |
| 2:12–2:28 | Action Plan | recommended, bounded, evidence-backed |
| 2:28–2:43 | Fix + Scan C | user changes physical world |
| 2:43–2:55 | Verified | positive current evidence closes the loop |
| 2:55–2:58 | Close | “AI memory for the physical world” |

## Voiceover script

### 0:00

**“Physical places usually have no persistent machine memory. SENTINEL gives them one.”**

### 0:08

**“I observe this hallway once. SENTINEL grounds visible evidence and turns the scene into a remembered environmental state.”**

### 0:25

**“Now the place remembers what was here, with evidence and immutable history behind it.”**

### 0:38

**“Ask is not a detached chatbot. It reasons over the selected physical state and can only cite evidence SENTINEL actually remembers.”**

### 0:55

**“Every answer stays connected to the state, object and evidence that support it.”**

### 1:10

**“Then I change reality itself: boxes enter the exit path and the extinguisher moves.”**

### 1:20

**“A second observation creates a new immutable state. SENTINEL compares it with what the space remembered before.”**

### 1:40

**“This is Reality Diff — a Git diff for the physical world. It separates supported physical changes from uncertainty and operational attention.”**

### 1:56

**“Because SENTINEL has memory, I can ask which change matters most. The answer is grounded in the remembered state, not generated from an isolated screenshot.”**

### 2:12

**“SENTINEL recommends bounded next steps, but it does not pretend the work happened. The final step is always to rescan and verify.”**

### 2:28

**“I clear the obstruction and observe the same area again.”**

### 2:43

**“Verification compares the old condition with positive current evidence. Missing is not enough. Here, the exit path is visibly clear, so the condition is Verified.”**

### 2:55

**“SENTINEL: the AI memory for the physical world.”**

## Editing rules

Cut:

- upload picker delay;
- model waiting time;
- repeated scrolling;
- accidental clicks;
- debug/test screens;
- browser chrome whenever it distracts from the product;
- dead air.

Keep:

- at least one real Observe interaction;
- Memory;
- a grounded Ask answer;
- before/after Reality Diff;
- Action Plan;
- Scan C;
- final Verified screen;
- enough UI continuity that the result does not look pre-rendered.

Do not speed through the final Verified result. Give it several seconds.

## Nebius / NVIDIA proof in the video

The product experience should remain the main story.

Add one very short technology proof near the architecture mention or in a lower-third/cutaway:

> **Nebius Token Factory · NVIDIA Nemotron 3 Nano**

Optional 2–3 second cutaway:

`/api/health` → provider/model role map.

Do not spend demo time reading implementation details.

## Final video quality gate

Before uploading:

- duration ≤ 2:59;
- no secrets in DevTools, URLs, console or environment files;
- no unrelated browser tabs/user data visible;
- product readable at normal zoom;
- voiceover audible and even;
- no copyrighted music;
- no false claims about automated physical work;
- final result visibly says **Verified**;
- NVIDIA/Nebius usage is stated at least once;
- YouTube visibility is **Public**;
- paste final URL into `SUBMISSION.md`.

## External handoff

Phase 18 cannot manufacture the final public YouTube URL from repository code.

After the video is uploaded, replace the TODO in `SUBMISSION.md` with the real URL and check the remaining boxes in `SUBMISSION_CHECKLIST.md`.
