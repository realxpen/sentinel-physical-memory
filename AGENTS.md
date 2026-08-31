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
