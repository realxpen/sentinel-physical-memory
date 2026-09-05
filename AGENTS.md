# SENTINEL Agent Instructions

## Product north star

SENTINEL is **AI memory for the physical world**. The MVP must prove the closed loop:

`SCAN → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

## Non-negotiable product constraints

- Preserve the persistent environmental-memory concept.
- Change detection and verification are first-class capabilities, not optional reporting screens.
- Prefer evidence-backed observations over unsupported claims.
- Clearly distinguish observed facts, model inferences, and recommendations.
- Do not claim professional engineering, medical, legal, or safety certification from visual inference.
- Keep the hackathon MVP focused on a controlled office environment.
- Do not expand into a contractor marketplace, payments, robotics, IoT fleet, or full facility-management SaaS before the core loop works.

## Locked UI/UX direction

The product design direction is **Living Spatial Intelligence** and is documented in `docs/product/uiux-direction.md`. Treat that document as the design contract unless the project owner explicitly changes it.

The interface personality is **Quiet. Alive. Precise.**

Non-negotiable visual/product rules:

- Live observation and active reasoning use a near-black cinematic state with restrained luminous emerald intelligence cues.
- Environmental memory/history uses the light editorial state where appropriate.
- The environment is the visual center of the product; do not regress to a generic SaaS dashboard with dense metric cards and permanent chrome.
- Primary navigation is **Memory / Observe / Changes**. `Ask this environment` is contextual and should not become a generic standalone chat page.
- Use **Observe environment**, **Conditions**, **What changed**, and memory-oriented product language instead of generic upload/issue/report terminology when accurate.
- **Reality Diff** is the signature change-comparison experience and verification remains first-class.
- Recognition overlays should be restrained; avoid noisy object-detection bounding boxes unless evidence requires them.
- Large editorial typography, negative space, cinematic environmental imagery, contextual translucent layers, and deliberate motion define the visual language.
- Green means active intelligence, recognition, relationship or verified success; do not use neon green decoratively on every surface.
- Preserve `prefers-reduced-motion` support.
- Do not fabricate detected events for visual completeness. Static examples must be explicitly labelled as demo/interaction previews.

## NVIDIA / Nebius requirements

The final application must make a real runtime call to Nebius Token Factory or run on Nebius AI Cloud and use at least one NVIDIA open-source model. Model usage should be central to the product architecture.

Preferred model responsibilities:

- Nano Omni: multimodal perception.
- Nano: fast specialist analysis.
- Super: orchestration and agentic reasoning.
- Ultra: difficult long-horizon reasoning when justified.

Do not fabricate model outputs in production paths. Mock/demo fixtures are allowed only where explicitly identified as demo data and must not obscure the real inference path.

## Engineering principles

- Build the smallest end-to-end vertical slice first.
- Keep components replaceable and interfaces explicit.
- Validate risky assumptions early, especially multimodal inference, state persistence, and scan-to-scan comparison.
- Favor deterministic structured schemas for environmental state.
- Store evidence references for important claims.
- Avoid unnecessary dependencies.
- Keep secrets out of source control; use environment variables and documented `.env.example` files.
- Add tests for parsing, state comparison, confidence handling, and agent/tool contracts.

## Git discipline

Use small, descriptive commits. Avoid mixing unrelated changes. Every milestone should leave the repository runnable.

## Demo discipline

The eventual demo must make the central insight obvious quickly: **SENTINEL does not just see a room; it remembers the room and knows when it changes.**
