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

## Planned NVIDIA / Nebius architecture

- **Nemotron 3 Nano Omni** — multimodal video/image/audio understanding and evidence extraction.
- **Nemotron 3 Nano** — efficient specialist analysis and verification tasks.
- **Nemotron 3 Super** — agent orchestration and operational reasoning.
- **Nemotron 3 Ultra** — difficult long-horizon planning and high-value reasoning.
- **Nebius AI Cloud / Token Factory** — GPU-backed inference and scalable processing.

Model usage will be implemented as a functional part of the application, not as a decorative chatbot layer.

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

🚧 Early implementation / hackathon build.

The repository will evolve through small, verifiable milestones. The implementation should preserve the core product thesis: **SENTINEL remembers the physical world and can explain what changed.**

## License

MIT. See [LICENSE](LICENSE).
