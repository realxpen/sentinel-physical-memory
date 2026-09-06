# SENTINEL Agent Instructions

## Read this first

Before changing SENTINEL, read in this order:

1. `AGENTS.md`
2. `PROJECT_STATE.md`
3. `Knowledge/Product/mvp.md`
4. The relevant documents under `Knowledge/`
5. Existing implementation only after the product/decision context is clear

`PROJECT_STATE.md` is the live execution checkpoint. `Knowledge/` is the canonical project knowledge layer. `Raw/` preserves unprocessed source material and `Archive/` holds superseded project documents. Existing `docs/` material remains reference history until deliberately archived; when it conflicts with `Knowledge/`, the newer explicit decision in `Knowledge/Decisions/` wins.

## Product north star

SENTINEL is **AI memory for the physical world**. The MVP must prove the closed loop:

`OBSERVE → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

The central proof is not object detection. It is **persistent environmental memory + change verification**.

## Non-negotiable product constraints

- Primary hackathon user: facility / operations manager.
- Reference environment: one controlled office.
- Persistent environmental memory is first-class.
- Reality Diff / change detection is first-class.
- Verification is first-class.
- Prefer evidence-backed observations over unsupported claims.
- Distinguish `observed`, `inferred`, and `recommended` content.
- Do not claim professional engineering or safety certification from visual inference.
- Do not expand into contractor marketplaces, payments, robotics, IoT fleets, full BIM, complex auth, or enterprise SaaS before the core loop is reliable.

## Locked UI/UX direction

The design contract is **Living Spatial Intelligence**.

Personality: **Quiet. Alive. Precise.**

- Live observation/reasoning: near-black cinematic state with restrained luminous emerald intelligence cues.
- Memory/history: light editorial state where appropriate.
- The environment is the visual center; avoid generic SaaS dashboard density.
- Primary navigation: **Memory / Observe / Changes**.
- `Ask this environment` is contextual, not a standalone chat product.
- Prefer `Observe environment`, `Conditions`, `What changed`, `This space is now remembered`, and `Verified` when accurate.
- Reality Diff is the signature visual experience.
- Do not fabricate detected events for visual completeness. Static examples must be explicitly labelled as previews/demo data.
- Preserve responsive behavior and `prefers-reduced-motion`.

See `Knowledge/UX/design-direction.md` and `Knowledge/UX/information-architecture.md`.

## NVIDIA / Nebius requirements

The final submission must make a real runtime call to Nebius Token Factory or run on Nebius AI Cloud and use at least one NVIDIA open-source model.

Current implementation already contains a real Token Factory adapter. Preserve that path while improving model specialization.

Preferred responsibilities:

- Nemotron 3 Nano Omni: multimodal perception.
- Nemotron 3 Nano: fast specialist analysis.
- Nemotron 3 Super: orchestration and reasoning.
- Nemotron 3 Ultra: difficult long-horizon reasoning only when justified.

Never fabricate production model output. Mock fixtures are allowed only when explicitly labelled and must not replace the real inference path.

## Engineering principles

- Build the smallest end-to-end vertical slice first.
- Keep provider, persistence, diff, and reasoning contracts replaceable.
- Treat persistence, multimodal inference, and scan-to-scan matching as high-risk assumptions to validate early.
- Use deterministic structured schemas for environmental state.
- Important claims retain evidence references.
- Historical states must be immutable snapshots.
- API handlers orchestrate; domain modules own domain behavior.
- Keep secrets in environment variables and maintain `.env.example`.
- Add tests as new domain behavior is hardened.
- Do not silently introduce dependencies or architecture that the MVP does not need.

## AED knowledge protocol

When meaningful project knowledge changes:

`Capture → Organize → Validate → Apply → Test → Learn → Update → Reuse`

Update the appropriate `Knowledge/` document and then update `PROJECT_STATE.md` if execution state, risks, decisions, or the next action changed.

## Git discipline

Use small, descriptive commits. Do not mix unrelated implementation work. Every milestone should leave the repository runnable.

## Demo discipline

The judge takeaway must be obvious:

> **SENTINEL does not just see a room; it remembers the room and knows when it changes.**
