# Phase 4 Transition Note

Date: 2026-09-15

Phase 4 — Observation Pipeline Hardening is closed for the current AED build track.

## What passed

The implementation and local/engineering exit gates are complete:

- real-phone baseline walkthrough completed end-to-end;
- repeated same-environment scans persisted State v2/v3;
- Reality Diff was generated, persisted, and rendered;
- uncertain absence semantics remained conservative;
- low-light, duplicate-heavy, too-few-evidence, and mixed-quality input handling are regression-tested;
- MiniCPM-V provider constraints, malformed JSON, category normalization, evidence-reference reconciliation, trusted provenance, canonical entity deduplication, and local Neon transport resilience are hardened;
- Phase 4 regression gates and TypeScript/Vite build pass in Sentinel CI.

## Deferred production re-verification

The latest-main Vercel valid-video contract was **not** passed before this transition.

Vercel was rejecting newer Git deployments because of the project build-rate limit. The user explicitly chose not to block the AED build cycle on that infrastructure limit and will pull/test the GitHub branch locally instead.

Therefore:

- do **not** rewrite history to claim latest Phase 4 code was production-verified;
- do **not** reopen Phase 4 solely because Vercel has not rerun the latest contract;
- keep the production latest-main valid-scan proof as tracked deployment/reliability debt;
- when deployment capacity is available, rerun `.github/workflows/phase4-observation-contract.yml` against a matching `deploymentCommit` and record the result.

## Transition

Active implementation moves to:

**Phase 5 — Perception Quality & Condition Model**

The Phase 5 objective is to separate directly observed facts from inferred environmental conditions and prevent weak perception inference from silently becoming operational issues.

Canonical Phase 4 technical record remains:

`Knowledge/Technical/phase-4-observation-pipeline.md`
