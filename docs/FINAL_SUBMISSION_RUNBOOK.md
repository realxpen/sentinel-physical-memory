# SENTINEL Final Submission Runbook

## Purpose

This is the execution checklist from a green production build to a complete Devpost submission.

The product loop is now frozen for presentation. Do not add new trust behavior, new demo conditions, or extra model tiers unless a blocking defect is discovered.

## 1. Product freeze

Before recording:

1. Confirm `main` is green.
2. Confirm production `/api/health` reports the exact deployed commit.
3. Confirm Nebius Token Factory is configured.
4. Confirm the perception role maps to the proven configured multimodal model.
5. Confirm Ask + Action Plan map to NVIDIA Nemotron.
6. Confirm Office Lounge Test 4 still renders:
   - State v1 clean baseline;
   - State v2 exit obstruction;
   - State v3 corrected scene;
   - final Verification = Verified.

Do not create State v4.

## 2. Final demo source

Use **Office Lounge Test 4** for the core video because it is already a successful generalization proof on a scene different from the original hallway.

The single story:

```text
State v1
clean office lounge
        ↓
State v2
cardboard boxes obstruct exit
        ↓
Reality Diff
Emergency exit access obstructed
New: Cardboard Boxes
        ↓
Ask
Which change matters most?
        ↓
Action Plan
Clear obstruction
Rescan to verify
        ↓
State v3
same exit area visibly clear
        ↓
Verification
1 resolved
0 remaining
0 inconclusive
```

## 3. What the judges should remember

One sentence:

> **SENTINEL gives physical spaces persistent AI memory, so they can be observed, queried, changed, and verified over time.**

One technical phrase:

> **Reality Diff — a Git diff for the physical world.**

One trust rule:

> **Not re-observed is not resolved.**

One technology proof:

> **Nebius Token Factory runs the inference path; NVIDIA Nemotron handles grounded reasoning and action planning.**

## 4. Four judging criteria

### Technological implementation

Show:

- real production application;
- Nebius Token Factory runtime;
- NVIDIA Nemotron on Ask / Action Plan;
- multimodal visual perception;
- Neon-backed immutable memory;
- deterministic grounding and verification rules.

Do not spend the video reading code.

### Design

Show:

- Memory;
- Reality Diff;
- Ask;
- Action Plan;
- Verification.

The visual story should feel like one product, not five backend endpoints.

### Potential impact

Use one user:

> facility / operations manager responsible for a commercial environment.

Use one pain:

> physical changes are normally remembered through photos, notes and people rather than durable machine-readable state.

Use one consequence:

> important changes can be missed, acted on late, or marked resolved without proof.

### Quality of idea

Keep the conceptual difference clear:

SENTINEL is not just image analysis.

```text
see once
→ remember
→ compare later
→ reason
→ recommend
→ observe again
→ verify
```

## 5. Final video capture order

Record in this order so editing is easy:

1. Memory / State v1.
2. State history v1 → v2 → v3.
3. Reality Diff v1 → v2.
4. Ask: Which change matters most?
5. Grounded Action Plan.
6. State v2 → v3 physical context.
7. Final Verified result.
8. `/api/health` technology proof.
9. Clean product close.

Record long takes. Cut waiting in post.

## 6. Devpost screenshot set

Use four screenshots only:

1. **Memory** — State history + remembered objects.
2. **Reality Diff** — before/after with obstruction + boxes.
3. **Action Plan** — Clear obstruction + Rescan to verify.
4. **Verification** — Verified / 1 resolved / positive current evidence.

Avoid debug browser chrome, unrelated tabs, bookmarks, private email, and infrastructure consoles.

## 7. Devpost copy order

Lead with:

> Software remembers the digital world. SENTINEL gives the physical world memory.

Then explain:

1. persistent environmental state;
2. Reality Diff;
3. Ask over remembered evidence;
4. recommendation-only Action Plan;
5. positive-evidence Verification.

Do not lead with model names.

Put Nebius/NVIDIA proof in the build/technology section.

## 8. Final external dependencies

Repository work can be green while these are still pending:

- record the final video;
- edit to < 3:00;
- upload publicly to YouTube;
- verify playback signed out;
- add the YouTube URL to `SUBMISSION.md`;
- upload the four screenshots to Devpost;
- paste/review submission copy;
- submit before the deadline.

## 9. Final smoke after video upload

Open the production site in a private window and check:

- app loads without login;
- Office Lounge Test 4 can be restored;
- Memory loads;
- Reality Diff loads;
- Ask works;
- Action Plan works;
- Verification works;
- `/api/health` reports the deployed commit;
- no secrets appear in responses.

Then stop changing the product unless the smoke test reveals a blocker.
