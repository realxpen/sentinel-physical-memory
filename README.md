# SENTINEL — AI Memory for the Physical World

SENTINEL gives physical spaces a persistent AI memory. It observes an environment from video, builds a structured environmental state, answers questions about what it saw, reasons about issues, and verifies what changed across scans.

## Hackathon

Built for the **Nebius × NVIDIA Global AI Hackathon 2026**.

**Track:** Best Apps and Agents

**Core loop:**

`SCAN → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`

## Why SENTINEL

Software has persistent memory for documents, databases, websites, and APIs. Physical environments usually do not. Their operational history is fragmented across photos, inspection notes, messages, spreadsheets, and human memory.

SENTINEL turns observations of a physical environment into a persistent, queryable state and compares new observations against previous states.

## NVIDIA / Nebius architecture

SENTINEL makes runtime inference calls through **Nebius Token Factory**. The production model split is intentionally explicit:

| Responsibility | Request role | Default model |
| --- | --- | --- |
| Scene perception / evidence extraction | `perception` | `openbmb/MiniCPM-V-4_5` |
| Paired temporal visual verification | `temporal-verification` | `openbmb/MiniCPM-V-4_5` |
| Ask the Building reasoning / prioritization | `reasoning` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` |
| Action Planner | `action` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` |
| Physical condition verification | `verification` | configured verification model, falling back to the perception model |

The NVIDIA requirement is satisfied by **NVIDIA Nemotron 3 Nano 30B-A3B**, which is on SENTINEL's core reasoning and action-planning path through Nebius Token Factory.

Every Token Factory completion records non-secret runtime telemetry: **provider, model, request role, latency, outcome, completion time, and HTTP status/error code**. Successful Scan, Ask, Action Plan, and Verification API responses expose their per-request inference traces so the working product can demonstrate the model/runtime path directly.

`GET /api/health` exposes the non-secret role → model architecture map and deployment commit. API keys, prompts, images, and evidence content are never included in telemetry.

Canonical technical record: `Knowledge/Technical/phase-16-nebius-nvidia-architecture.md`.

## MVP

The first version intentionally focuses on one controlled environment and the core closed loop:

1. Upload or capture a walkthrough video.
2. Extract structured observations and environmental entities.
3. Persist the environmental state and evidence.
4. Ask natural-language questions about the environment.
5. Generate evidence-backed priorities and an action plan.
6. Capture a second observation.
7. Compare the two states.
8. Verify resolved, new, moved, and changed conditions.

## Trust principles

SENTINEL distinguishes between:

- **Observed** — directly supported by visual/audio evidence.
- **Inferred** — a model conclusion based on observations.
- **Recommended** — an operational suggestion requiring human judgment.

The system will avoid presenting uncertain visual observations as professional engineering or safety certification.

## Repository structure

```text
docs/
  hackathon-build/
    spec.md
    checklist.md
    build-notes.md
  product/
    prd.md
AGENTS.md
LICENSE
README.md
```

## Status

SENTINEL is in late-stage hackathon hardening. The deployed product already supports persistent Neon-backed environmental memory, immutable state history, Reality Diff, Ask the Building, evidence-backed Action Plans, and closed-loop visual Verification.

Current roadmap phase: **Phase 16 — Nebius / NVIDIA architecture hardening**.

The implementation preserves the core product thesis: **SENTINEL remembers the physical world, reasons over that memory, and verifies what changed.**

## License

MIT. See [LICENSE](LICENSE).
