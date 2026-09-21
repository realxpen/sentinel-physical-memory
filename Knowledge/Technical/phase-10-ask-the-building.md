# Phase 10 — Ask the Building

Status: **COMPLETE**

## Objective

Finish the signature interactive reasoning experience without turning SENTINEL into a generic chatbot.

Source product contract:

`Question → Intent/state selection → Memory retrieval → objects / conditions / evidence / relations / diff → Nemotron reasoning → schema validation → grounded answer`

The product keeps the permanently integrated **Ask this environment…** intelligence bar. The environment responds with an editorial conclusion and visible grounding rather than a chat transcript.

## Seven MVP questions

The source-defined MVP questions are now first-class product prompts:

1. What needs my attention?
2. Where is the electrical panel?
3. What did you see near the server room?
4. What changed since the last scan?
5. Which change matters most?
6. What should I do?
7. Has it been resolved?

A deterministic intent classifier maps those questions to:

`attention | location | nearby | change | priority | action | resolution`

The classifier guides retrieval; it does not decide the physical-world answer.

## Reasoning retrieval

`AskBuildingService` now resolves the requested immutable state and builds a bounded evidence-first reasoning context containing selected state, state history, relevant objects, grounded relations, trust-labelled conditions, issues, durable object history, historical conditions/issues, evidence, selected-state Reality Diff, and bounded diff history.

Historical questions fail closed temporally: selecting State v2 excludes State v3 and later diffs from the model context.

Current-state Ask resolves `environment.currentStateId` rather than assuming array order.

## Grounding boundary

The model still returns the compact reasoning schema, but SENTINEL now owns the grounding envelope. Model-returned evidence, object and issue IDs are filtered to the bounded context.

The API enriches accepted answers with deterministic intent, selected state/version/time, history state IDs, evidence metadata + source-state mapping, related physical objects + state appearances, and related operational issues + state appearances.

If no evidence ID survives validation, confidence is capped at **0.35**.

## Reasoning rules

Nemotron is instructed to lead with a concise conclusion, provide a short rationale, distinguish Observed from Inferred, avoid invented distance/geometry, avoid future-state leakage into historical questions, treat not-reobserved as uncertainty rather than automatic resolution, and keep recommendations explicitly recommendations.

Phase 11 will add structured Action Plans. Phase 10 may answer “What should I do?” in grounded prose but does not create or persist an ActionPlan.

## Product UI

Ask remains spatial and contextual, not a chat page.

The Memory screen now adds a current/historical reasoning-state control, all seven core prompts, the state-aware floating Ask bar, editorial conclusion, **Why this matters**, confidence, **Current vs previous**, related physical objects, operational issues and expandable evidence.

Related current objects illuminate inside Spatial Memory. Historical-only references open the corresponding immutable state. Historical state drawers can promote that state into the Ask scope. Object/change contextual Ask reasons from its relevant state immediately.

## Deterministic gate

`npm run check:phase10-ask-building` verifies all seven intents, authoritative current-state selection, immutable history/object continuity/diff history context, historical future-state exclusion, fail-closed IDs, confidence bounding, and the product UI grounding contract.

## Production gate

`.github/workflows/phase10-ask-building.yml` waits for the exact Vercel deployment on main and sends all seven source-defined MVP questions through production `/api/ask-building` against the existing real multi-state Neon warehouse.

The production gate validates integration/schema/grounding, not exact stochastic wording.

### Production bundle freshness hardening

The first exact-deployment smoke on commit `81433a819bbe644ba872f2489f3e529e6bf835db` detected that production returned a response whose grounding intent did not match the server-owned Phase 10 contract even though deterministic CI was green.

To make the serverless boundary fail closed and observable:

- `api/ask-building.ts` explicitly imports the Phase 10 TypeScript service source;
- HTTP 200 is refused if the server-owned grounding envelope is absent;
- successful responses include `reasoningContract: phase10-grounded-v1`;
- the production smoke logs only sanitized contract/grounding metadata before assertions.

This does not relax any reasoning or evidence rule. It makes stale/mismatched serverless bundling detectable rather than silently acceptable.

## Production proof

Phase 10 closed on exact deployed commit:

`1b5b00e77bd6fa6f0d30458d4c08b43f85e01309`

Production workflow:

- **Phase 10 Production Ask Smoke**
- run `35617092565`
- result: **SUCCESS**
- production persistence: **Neon**
- reasoning contract: **phase10-grounded-v1**
- real environment: `env_warehouse_73266674`
- immutable history supplied to every question: **3 states**

The seven source-defined MVP questions all passed through real production Nemotron reasoning:

| Intent | Question | Confidence | Evidence | Related objects | Related issues |
| --- | --- | ---: | ---: | ---: | ---: |
| attention | What needs my attention? | 80% | 10 | 2 | 1 |
| location | Where is the electrical panel? | 100% | 10 | 6 | 0 |
| nearby | What did you see near the server room? | 90% | 3 | 6 | 0 |
| change | What changed since the last scan? | 50% | 10 | 2 | 1 |
| priority | Which change matters most? | 85% | 3 | 2 | 1 |
| action | What should I do? | 75% | 5 | 2 | 1 |
| resolution | Has it been resolved? | 60% | 10 | 2 | 1 |

These figures are production response metadata, not hand-authored answer scores. The gate intentionally does not require deterministic wording from Nemotron; it verifies the reasoning contract, Neon grounding, state scope, evidence/object/issue grounding, and confidence constraints.

The smoke first detected a serverless bundle mismatch on commit `81433a819bbe644ba872f2489f3e529e6bf835db`. Phase 10 was not closed on that run. The API boundary was then hardened so a successful response must contain the server-owned grounding envelope and `phase10-grounded-v1` marker. The exact-deployment rerun passed all seven questions.

## Exit status

**COMPLETE.**

Ask the Building is now the first-class evidence-grounded reasoning surface over Spatial Memory. The next build phase is **Phase 11 — Action Planner**.
