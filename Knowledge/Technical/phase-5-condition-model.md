# Phase 5 — Perception Quality & Condition Model

Date: 2026-09-18
Status: **ACTIVE — FOURTH FRESH PROOF PASSED ACCESS REASONING + ISSUE PROMOTION / CONDITION + DIFF MULTIPLICITY HARDENING CI PASS / FIFTH FRESH PROOF NEXT**

## Goal

Make SENTINEL distinguish direct physical observations from interpretations, persist those interpretations as explicit environmental conditions, and prevent weak model inference from silently becoming an operational issue.

Phase 5 sharpens the trust boundary established in Phase 1:

- **Observed** = directly supported by supplied evidence.
- **Inferred** = an interpretation of evidence, not a directly visible fact.
- **Recommended** remains outside perception and belongs to the later Action Planner.

## Domain model

The physical-memory domain includes:

- `ClaimBasis = observed | inferred`
- `ConditionKind = normal | attention | hazard | damage | maintenance | access | compliance | unknown`
- `ConditionStatus = present | uncertain`
- `EnvironmentalCondition`
- `EnvironmentalState.conditionIds`
- `EnvironmentalStateSnapshot.conditions`
- `EnvironmentalMemory.conditions`

Every `Observation` is explicitly `basis: observed`.

A condition carries environment identity, kind, title/description, status, basis, confidence, related object IDs, evidence IDs, and trusted observation time.

## Perception contract

The Nebius perception contract returns:

`sourceId + observations + objects + conditions + relations + evidence`

Prompt rules:

1. observations are direct visible facts only;
2. diagnosis, cause, risk prediction, and recommendations must not appear as observations;
3. conditions describe states of the environment;
4. `basis=observed` is used only when the condition itself is directly visible;
5. `basis=inferred` is used when interpreting what evidence may mean;
6. inferred conditions should normally be `uncertain` unless evidence is unusually direct;
7. every observation, object, and condition must reference existing evidence;
8. conditions may reference only objects emitted in the same perception result.

Trusted scan `capturedAt` overrides model-provided condition time at the adapter/memory boundary.

## Condition audit

A benign scene pass no longer suppresses a facility-condition review. When the scene contains no operational condition candidate, SENTINEL runs one targeted condition audit over the same trusted frames.

The audit explicitly checks access routes, doors/exits, walking surfaces, boxes/furniture, cables/electrical items, equipment placement, visible damage, and maintenance state. It is still instructed not to force a condition when evidence does not support one.

## Deterministic grounded condition derivation

Real controlled warehouse testing exposed an important model behavior: MiniCPM correctly described the relevant physical facts but failed to compose them into an operational condition.

The persisted comparison scan contained grounded observations equivalent to:

- `orange pallet jack` — “An orange pallet jack in front of the green door.”
- `emergency exit sign` — “An emergency exit sign above the green door.”

The model still returned only a benign `normal` condition.

SENTINEL owns a narrow deterministic derivation layer in `src/perception/condition-derivation.ts`.

It may derive an inferred `access` condition only when:

- an evidence-backed door is explicitly associated with **independent** emergency-exit signage or another separate grounded exit fact;
- an evidence-backed physical obstacle is explicitly described in front of/across/blocking that same named door, or a grounded structured `in_front_of` relation connects obstacle → door;
- the obstacle-to-door direction is explicit (reversed spatial wording or reversed relations do not qualify);
- both facts belong to the same grounded perception result;
- confidence remains above the inferred-condition threshold after SENTINEL applies a downward confidence bound;
- no equivalent access condition already exists.

A door object's own name or description — for example `green emergency exit door` — cannot self-ground its emergency-exit role for this derivation. The separate exit-sign observation/object is required. A bounded color-anchored door alias may connect `green emergency exit door` to grounded text that says `green door`, but that alias does not replace the independent exit fact.

The derivation may use grounded observations and objects, but it cannot reuse another inferred condition as if it were direct grounding. The derived claim remains **Inferred**, not Observed. SENTINEL does not increase source confidence or invent evidence.

For the controlled warehouse evidence, source facts at 1.00 confidence produce a bounded derived confidence of 0.90. The inferred threshold remains 0.85; the warehouse fix does **not** weaken the trust threshold.

## Issue-promotion policy

The model does **not** decide whether a condition becomes an operational issue. `src/perception/condition-model.ts` owns that policy.

A condition cannot auto-promote when:

- kind is `normal`;
- status is `uncertain`;
- it has no evidence;
- confidence is below its trust threshold.

Thresholds:

- observed condition: **0.65** minimum confidence;
- inferred condition: **0.85** minimum confidence;
- explicitly grounded observed access cue: **0.60** minimum confidence.

The 0.60 exception is limited to directly observed, explicitly grounded access-route obstruction wording. It does not apply to SENTINEL-derived inferred conditions.

Severity policy:

- observed hazard → at most `high`;
- observed damage / maintenance / access / compliance → `medium`;
- observed attention / unknown → `low`;
- inferred conditions → at most `medium`;
- perception alone can never create a `critical` issue.

## Conservative semantic object identity

The same controlled warehouse test exposed provider naming drift that inflated Reality Diff:

- `shelf` / `shelves` / `shelving` / `rack` / `racking` / `metal shelving` / `orange metal shelves`
- `cardboard boxes` ↔ `boxes` / `brown boxes` / `boxed items`
- `green emergency exit door` ↔ `green door`
- `concrete floor` ↔ `warehouse floor`
- `white ceiling` ↔ `warehouse ceiling`
- `fire extinguisher` moving between `equipment` and `safety`
- generic exit signage descriptions ↔ `emergency exit sign`

`src/memory/object-identity.ts` provides a deliberately small semantic identity whitelist for those durable families. It is used by both memory upsert and the deterministic diff engine.

This is **not** general fuzzy matching. Family classification remains name-led so a nearby object mentioned only in a description cannot redefine identity. Cross-scan aliases must still be unique in both directions; repeated ambiguous objects remain separate instead of one candidate being reused for several instances.

Doors are not generically fuzzy-matched. Only a visible color anchor such as `green ... door` may form a door alias family, and the normal one-to-one uniqueness rule still applies. Thus `green emergency exit door` ↔ `green door` is supported while unanchored `emergency exit door` ↔ `service door` is not.

Provider scene/audit passes can also emit semantic duplicates inside the **same scan**. Memory now consolidates those aliases only when all of the following hold:

- they already satisfy the conservative semantic identity rule;
- they share at least one trusted frame evidence ID;
- their structured/semantic positions do not conflict;
- exact same-name/category detections collapse only across distinct SENTINEL-controlled scene / audit / identity / geometry passes; same-pass exact duplicates remain separate.

This lets obvious duplicate labels such as `shelves` + `orange metal shelves`, or `green emergency exit door` + `green door`, resolve to one durable object when grounded to the same physical evidence. Repeated objects without shared grounding or with conflicting positions remain distinct. Richer repeated-instance identity remains Phase 7 work.

## Memory behavior

Conditions are durable physical memory:

- scan-local condition IDs become source-scoped IDs;
- evidence IDs map to durable source-scoped evidence IDs;
- condition object IDs map to canonical durable object IDs;
- `observedAt` uses trusted scan capture time;
- conditions are included in states and immutable snapshots;
- only policy-qualified conditions become operational issues.

Object alias consolidation applies only while ingesting future scans. Older Phase 3/4/5 snapshots and already-persisted noisy diffs are not rewritten.

## Ask the Building integration

Reasoning context contains `RELEVANT CONDITIONS` with explicit trust labels:

- `trust=Observed`
- `trust=Inferred`

Nemotron must treat inferred conditions as lower-authority interpretation rather than direct physical fact.

## Automated gates

`npm run check:phase5-conditions` verifies the core trust/promotion policy.

`npm run check:condition-derivation` verifies:

- independently grounded exit signage + grounded obstacle placement derives exactly one inferred access condition;
- `green emergency exit door` can bind to grounded `green door` wording without lowering the inferred threshold;
- derived evidence contains both supporting fact sources;
- confidence remains below source confidence;
- the strong derived condition promotes only through SENTINEL policy;
- safe placement does not create an access condition;
- grounded `in_front_of` obstacle→door relations can supply placement when text omits it;
- reversed spatial wording or reversed structured relations do not invert the obstruction relation;
- a door name cannot self-ground emergency-exit identity;
- inferred conditions are not reused as direct grounding facts.

`npm run check:object-identity` verifies:

- the conservative warehouse alias families match;
- color-anchored door aliases match while unanchored generic doors do not;
- secondary description mentions do not redefine the primary object family;
- same-scan aliases consolidate only with shared evidence and compatible position;
- repeated ambiguous objects retain separate durable identities;
- unique aliases reuse canonical durable shelf/door IDs;
- a baseline/comparison alias-drift scenario collapses to one real added pallet jack instead of many false additions/removals.

`npm run check:diff-position` continues to verify that image-coordinate drift cannot create false physical movement.

Sentinel CI run `35331412827` passed the full repository gate suite on commit `dcda069cf0005c34685a6a8f1bde0ddde00c92b5`, including Phase 4 quality gates, provider grounding, perception retry, sharpened condition audit, Phase 5 trust, independent exit derivation, Reality Diff position semantics, conservative cross-pass object identity, and the TypeScript/Vite production build.

## Controlled warehouse checkpoint

Environment: `env_warehouse_6dba83ca`

State v1 persisted a clean warehouse baseline with visible shelving, boxes, concrete floor, emergency-exit door/signage, fire extinguisher, and normal conditions. It also exposed provider duplication such as `green emergency exit door` and `green door` in the same historical snapshot.

State v2 persisted the comparison scan and correctly detected a new `orange pallet jack` in front of the green door plus a separate emergency-exit-sign observation, but the pre-fix build produced no operational condition and an inflated Reality Diff dominated by naming drift.

Those historical states/diffs remain immutable. Current `main` now contains deterministic fixes for the two root causes plus the same-scan duplicate alias pattern exposed by the persisted warehouse data.

## Fresh warehouse proof attempt — 2026-09-18

Environment: `env_warehouse1_1bd4a50c`

A fresh baseline/comparison run after the earlier policy hardening **did not pass the Phase 5 real-scan gate**.

Persisted evidence showed:

- v2 contained **2 normal conditions and 0 issues**;
- the emergency-exit sign was directly observed at confidence 1.00;
- the intended movable obstruction was labeled **`green door ramp`** with description **“An orange and green ramp in front of the door.”** rather than pallet jack;
- the clean baseline labeled the portable wall-mounted safety device **`fire hydrant`**;
- scene and condition-audit passes produced exact duplicate objects with the same trusted evidence;
- the resulting v1→v2 Reality Diff contained **20 changes**, dominated by duplicate add/not-reobserved noise.

SENTINEL correctly did **not** convert the ramp label into an access issue. A ramp is not on the deterministic obstruction whitelist, and the trust policy was not weakened to force the demo result.

The failure produced three bounded hardening changes:

1. **Cross-pass exact duplicate consolidation** — exact name/category detections may merge only across the controlled scene↔`audit_` boundary, with shared evidence and compatible position. Same-pass exact duplicates stay separate.
2. **Warehouse taxonomy guidance** — scene and audit prompts now distinguish wheeled/forked pallet jacks/carts/trolleys from ramps and portable fire extinguishers from hydrants/standpipes; uncertain cases should use conservative generic equipment names.
3. **Naming continuity without memory leakage** — latest durable object names are supplied as naming context only. Prior memory is explicitly not evidence and cannot establish current presence.

The audit pass also independently re-checks scene taxonomy, visible exit signage is requested as a durable signage object, and telemetry now distinguishes provider audit output from final SENTINEL policy through:

- `SENTINEL_CONDITION_DERIVATION_COMPLETED`
- `SENTINEL_SCAN_POLICY_RESULT`

The failed environment and its 20-change diff remain immutable.

## Second fresh warehouse proof — 2026-09-18

Environment: `env_warehouse2_6a1cb840`

This run produced a much cleaner A/B result than the prior proof:

- cross-pass duplication no longer dominated memory;
- fire-extinguisher taxonomy remained stable;
- emergency-exit signage persisted as a durable object;
- Reality Diff dropped from 20 changes to **2**.

The remaining changes were:

1. `New: orange ramp` — 1.00;
2. `Not re-observed: cardboard boxes` — 0.50.

The final persisted comparison state contained one benign normal condition and zero issues. The post-derivation telemetry reported zero derived/operational conditions.

The remaining blocker was therefore isolated to perception taxonomy: scene/audit grounded the orange access-adjacent object as a **ramp**, not as pallet jack/trolley/cart. SENTINEL correctly stayed fail-closed and did not reinterpret a ramp into a hazard merely to satisfy the demo scenario.

A smaller identity bug also remained: singular `cardboard box` did not share the plural durable box family with `cardboard boxes`.

Current `main` now:

- treats singular/plural box/carton forms as one conservative semantic family;
- invokes one targeted physical-object identity audit only when exit context + ambiguous access-adjacent equipment exists and no operational condition has been established;
- asks the targeted pass to classify from visible morphology and explicitly forbids filename/metadata inference;
- distinguishes wheeled/forked/handled material-handling equipment from a true ramp;
- preserves a conservative generic label when morphology is insufficient;
- still does not force an access condition.

Sentinel CI run `35333800689` passed on commit `f835b64f4957c2053e48787a812eb7067d2724e6`, including a regression where broad passes say `orange ramp`, the targeted identity audit visually resolves `orange pallet jack`, deterministic derivation then creates the inferred access condition, and policy promotes exactly one issue.

## Third fresh warehouse proof — 2026-09-18

Environment: `env_warehouse3_64751084`

The third fresh A/B scan materially improved again:

- the comparison correctly persisted `orange pallet jack`;
- the extinguisher, exit sign, door, shelving, and boxes retained durable identity;
- Reality Diff contained exactly **one** change: `New: orange pallet jack`;
- no false box/shelf/door non-observation remained.

The state still contained one benign normal condition and zero issues because the model did **not** ground the pallet-jack-to-door placement. The pallet jack description was **“orange and green pallet jack with wheels”**. Exit context was independently grounded, but there was no explicit `in front of` wording tied to that pallet jack and no `in_front_of` relation.

This is a trust-preserving failure. SENTINEL did not infer obstruction from:

- both entities appearing near the center of the image;
- generic proximity;
- the video's filename;
- prior memory;
- the door's own emergency-exit name.

Current `main` therefore adds one narrow access-geometry verification pass. It runs only when a visible material-handling/obstruction candidate and independently grounded exit context exist but explicit placement remains absent.

The pass may establish placement only by current trusted frame evidence. It is instructed to emit a structured `in_front_of` relation in the exact direction **obstacle → door** when visually supported. `near`, beside, left/right, or shared image center are explicitly insufficient. If geometry is unclear, no relation or condition should be emitted.

The deterministic derivation layer now accepts that grounded structured relation as equivalent placement evidence while preserving:

- independent exit-sign grounding;
- evidence inheritance;
- bounded 0.90 confidence from 1.00 source facts;
- the unchanged 0.85 inferred threshold;
- medium maximum severity;
- fail-closed behavior for reversed or missing relations.

Sentinel CI run `35335200200` passed on commit `3e1046c88d7a2156aff666d412412e5c60f37d67`, including a warehouse3-shaped regression where pallet-jack identity is correct but placement text is absent, the targeted geometry audit supplies grounded obstacle→door `in_front_of`, deterministic derivation creates the inferred access condition, and policy promotes one medium access issue.

## Fourth fresh warehouse proof — 2026-09-18

Environment: `env_warehouse4_4a96a4d1`

This run passed the actual condition-policy objective:

- pallet jack taxonomy was correct;
- direct placement was grounded as **“Orange pallet jack in front of the door.”**;
- exit signage was independently grounded;
- deterministic derivation produced `Emergency exit access obstructed` as **Inferred / Present / 0.90**;
- policy promoted exactly one **medium access issue** at 0.90 confidence.

This is the first fresh realistic proof where the complete Phase 5 trust chain succeeded:

`Observed facts → deterministic inference → policy-owned issue promotion`.

Neon also exposed two non-policy cleanup defects:

1. three pass-local door aliases caused the same semantic derived access condition to be persisted three times after all three aliases canonicalized to the same durable door;
2. baseline cross-frame provider repetition produced unresolved multiplicity for green doors, fire extinguishers and shelving, inflating Reality Diff despite no evidence for physical additions/removals inside those families.

Current `main` fixes both without rewriting warehouse4 history:

- conditions are semantically consolidated after canonical durable object mapping using kind + basis + status + normalized title + sorted canonical object IDs;
- duplicate conditions union grounded evidence and preserve the strongest confidence;
- Reality Diff suppresses add/not-reobserved claims only when a whitelisted semantic family is present on both sides but instance multiplicity is unresolved;
- the system does **not** merge those ambiguous instances in durable memory and does **not** claim a removal/addition it cannot ground;
- genuinely new objects outside that unresolved family still surface;
- singular `shelf` and `rack` join the shelving family;
- the scene prompt now treats all frames as one walkthrough and asks for one object per physical entity across frames;
- the overall environment label itself should not be emitted as a SpatialObject without a distinct bounded room/area identity.

Sentinel CI run `35339258094` passed on commit `9f5fbb2f2e2aa55ce0c5f173acb8f56a8715bf9c`. The regression suite now proves:

- multiple pass-local derived access aliases persist as **one semantic condition** after canonical object mapping;
- one issue is promoted;
- unresolved repeated-family multiplicity creates no fake object diff;
- a real new pallet jack remains visible in Reality Diff;
- all existing trust, grounding, derivation and position gates remain green.

## Next Phase 5 proof

Pull latest `main` and run a **fifth fresh** warehouse baseline/comparison through the updated build. Do not reuse any warehouse1–warehouse4 proof environment.

Expected new proof:

1. the obstruction is stably identified as a pallet jack/cart/trolley rather than a ramp, and the wall safety device is not mislabeled as a hydrant;
2. direct pallet-jack and exit-sign facts remain Observed and visible exit signage has a durable signage object;
3. SENTINEL emits one derived Inferred access condition only because the exit role is independently grounded;
4. the condition retains both grounded evidence sources and promotes to a medium access issue at the unchanged inferred threshold;
5. exact cross-pass duplicates and obvious provider aliases — including the green door, shelving, boxes, floor, ceiling, extinguisher and exit-sign families — no longer dominate Reality Diff;
6. the pallet jack remains the meaningful added object;
7. post-derivation/post-persistence telemetry confirms derived-condition and issue counts;
8. Ask Building preserves the Observed/Inferred distinction.

For a clean demo-quality A/B, create a fresh warehouse validation environment after pulling the fix, then scan the baseline and comparison videos once each. Existing historical states should not be rewritten.

## Phase 5 exit condition

**Real or controlled realistic scans consistently produce evidence-grounded observations and conditions with correct trust labels; weak inference does not become an operational issue; strong supported conditions persist across memory and are available to reasoning without collapsing observation, interpretation, and recommendation into one claim.**
