# Phase 17 — Submission Readiness

Status: **COMPLETE — repository/judge package passed exact-main production readiness; YouTube recording handed to Phase 18**

## Goal

A judge should be able to:

1. discover the public project;
2. understand the idea quickly;
3. see exactly how Nebius and NVIDIA are used;
4. run the project locally;
5. open the live demo without credentials;
6. reproduce the core scenario;
7. understand limitations and trust rules.

The final external dependency is the public YouTube demo under three minutes.

## Official requirement mapping

| Requirement | SENTINEL artifact | State |
| --- | --- | --- |
| Working software using required platform/model | production app + Phase 16 runtime proof | Ready |
| Working demo URL | `https://sentinel-physical-memory.vercel.app` | Ready |
| Public source repository | GitHub `realxpen/sentinel-physical-memory` | Ready |
| Open-source license | `LICENSE` — MIT | Ready |
| README with setup guidance | `README.md` | Ready |
| Explain NVIDIA usage | README + Phase 16 architecture | Ready |
| Explain Nebius usage | README + Phase 16 architecture | Ready |
| Project text description | `SUBMISSION.md` | Ready |
| Identify track | Best Apps and Agents | Ready |
| Nebius/NVIDIA feedback | `SUBMISSION.md` | Ready |
| Testing access/instructions | `docs/JUDGE_TESTING.md` | Ready |
| Public YouTube video < 3 minutes | external upload | Pending Phase 18 |
| English submission materials | repository submission package | Ready |

## Judge-facing repository package

- `README.md` — complete product story, setup, architecture, demo, limitations and future direction;
- `docs/ARCHITECTURE.md` — system and sequence diagrams;
- `docs/JUDGE_TESTING.md` — no-login test path;
- `docs/DEMO_SCENARIO.md` — controlled three-scan rehearsal;
- `SUBMISSION.md` — Devpost-ready project copy;
- `SUBMISSION_CHECKLIST.md` — final external and smoke-test checklist;
- `.env.example` — safe configuration template;
- `LICENSE` — MIT.

## Automated gates

### Repository package

```bash
npm run check:phase17-submission
```

Checks:

- required README sections;
- demo/repo URLs;
- model/platform explanation;
- setup commands;
- architecture and judge docs;
- safe `.env.example`;
- detectable MIT license;
- Devpost draft sections;
- explicit YouTube TODO so the submission never pretends the external upload exists.

### Exact-main public readiness

```bash
npm run check:phase17-production
```

The production workflow waits for the exact deployed main commit and checks:

- GitHub repository is public;
- GitHub detects MIT license;
- hosted demo responds;
- exact deployment commit is live;
- Neon persistence is configured;
- Nebius is configured;
- health reports Nebius Token Factory;
- reasoning model is NVIDIA.

## Exit condition

Repository-side Phase 17 readiness closed on exact main commit `ed70f7b69c9c8aefedb40b300ce05bef1699cbf3`.

Production proof:

- **Phase 17 Production Judge Readiness** run `35992186998` — **SUCCESS**;
- repository verified public;
- GitHub detected the MIT license;
- public production app responded without judge credentials;
- exact deployed commit matched main;
- Neon + Nebius runtime configuration was healthy;
- Token Factory + NVIDIA reasoning model were visible in non-secret health diagnostics.

The first production-readiness run failed only because the harness issued a second health request during edge propagation after already seeing the exact deployment. PR #32 fixed the proof harness to reuse the exact matching health response; no product behavior was changed.

Phase 17 is **COMPLETE**.

The official submission still cannot be finalized until Phase 18 produces the public YouTube demo under three minutes and its link is inserted into `SUBMISSION.md`.
