# SENTINEL Build Notes

## 2026-08-31 — Repository foundation

- Repository: `realxpen/sentinel-physical-memory`
- Track target: Best Apps and Agents
- Product thesis: persistent environmental memory + change verification.
- Core loop: `SCAN → UNDERSTAND → REMEMBER → ASK → REASON → ACT → RESCAN → VERIFY`.
- Reference demo environment: controlled office.
- Primary wow moment: a physical-world diff that reveals what changed between scans.

## Scope decisions

Keep the MVP focused on the closed loop. Do not build contractor marketplace, payments, robotics, IoT fleet management, full BIM, autonomous physical repair, or enterprise facility-management features before the core demo works.

## Technical decisions

- Provider integration is isolated behind a model adapter.
- Environmental state is structured and temporal.
- Evidence/provenance is retained for important AI claims.
- The first implementation can use relational storage with JSON/vector capabilities; a dedicated graph database is not required.
- Expensive reasoning should be reserved for tasks that need it.

## Risk register

### R1 — Multimodal inference availability/latency
Mitigation: implement the provider adapter early and keep a deterministic fixture for UI development.

### R2 — Hallucinated visual defects
Mitigation: confidence + evidence fields and explicit observed/inferred/recommended classifications.

### R3 — Unreliable physical localization
Mitigation: use approximate spatial context rather than unsupported metric coordinates.

### R4 — False “resolved” claims
Mitigation: absence alone should not always mean resolution; use uncertain state when evidence is insufficient.

### R5 — Scope explosion
Mitigation: enforce the MVP definition of done in `spec.md` and the 12-item checklist.

## Next checkpoint

Bootstrap the application shell and typed data contracts, then validate the real Nebius/NVIDIA inference path as early as possible.

## 2026-09-05 — Vercel deployment sync

- Living Spatial Intelligence UI direction is locked and implemented.
- `/api/scan` now returns serialized environmental memory and real scan-to-scan diffs.
- The client sends previous memory back on rescans so the existing memory engine can hydrate and compare states.
- The Ask interface is wired to `/api/ask-building` using the current grounded environmental memory.
- Reality Diff now renders actual diff results after a second observation.
- This commit intentionally triggers the Git-connected Vercel project to deploy the latest `main` state.
