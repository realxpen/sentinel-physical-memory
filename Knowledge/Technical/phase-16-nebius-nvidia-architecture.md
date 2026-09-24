# Phase 16 — Nebius / NVIDIA Architecture Hardening

Status: **COMPLETE — deterministic telemetry + exact-main production Token Factory/NVIDIA trace passed**

## Goal

Make the hackathon technology story explicit and provable:

- runtime inference goes through **Nebius Token Factory**;
- NVIDIA Nemotron is a core reasoning dependency, not a decorative chatbot;
- model responsibilities are visible in code, health diagnostics, API responses, and production telemetry;
- model name, request role, latency, outcome, and HTTP status are recorded without exposing credentials.

## Actual deployed model responsibility map

| SENTINEL responsibility | Runtime role | Default model | Provider |
| --- | --- | --- | --- |
| Scene perception / evidence extraction | `perception` | `openbmb/MiniCPM-V-4_5` | Nebius Token Factory |
| Paired temporal object verification | `temporal-verification` | `openbmb/MiniCPM-V-4_5` | Nebius Token Factory |
| Ask the Building reasoning / prioritization | `reasoning` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Nebius Token Factory |
| Action Planner | `action` | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Nebius Token Factory |
| Visual condition verification | `verification` | `NEBIUS_VERIFICATION_MODEL` or perception model fallback | Nebius Token Factory |

This is intentionally smaller and more honest than the early concept that listed multiple Nemotron sizes. SENTINEL uses the model that is actually wired into each production role.

## Runtime flow

```text
Browser photo/video
      |
      v
/api/scan
      |
      +--> MiniCPM-V via Nebius Token Factory
      |      perception + temporal visual verification
      |
      v
Neon persistent environmental memory
      |
      +--> /api/ask-building
      |      NVIDIA Nemotron 3 Nano via Nebius Token Factory
      |
      +--> /api/action-plan
      |      NVIDIA Nemotron 3 Nano via Nebius Token Factory
      |
      +--> /api/verify
             visual verification model via Nebius Token Factory
```

Nebius Token Factory is therefore on the critical runtime path for perception, reasoning, planning, and verification. Neon is the durable state layer; neither replaces the other.

## Trace contract

Every Token Factory completion emits a non-secret trace:

```ts
{
  provider: "nebius-token-factory",
  model: "...",
  role: "perception" | "temporal-verification" | "reasoning" | "action" | "verification",
  latencyMs: 1234,
  outcome: "success" | "error",
  completedAt: "...",
  httpStatus?: 200,
  errorCode?: "..."
}
```

The trace is:

1. logged as `SENTINEL_NEBIUS_INFERENCE` for runtime evidence;
2. collected per API request;
3. returned in successful Scan / Ask / Action Plan / Verification responses as `inference`;
4. free of API keys, authorization headers, prompts, images, and user evidence contents.

## Health architecture contract

`GET /api/health` exposes only non-secret runtime architecture metadata:

- provider;
- Token Factory base URL;
- perception model;
- reasoning model;
- verification model;
- role → model mapping;
- deployment commit.

This lets a judge verify the architecture without access to environment secrets.

## Phase 16 production closure

Exit gates:

- deterministic `check:phase16-telemetry` passed;
- README shows the actual model responsibility map;
- exact deployed main reports `provider=nebius-token-factory`;
- exact deployed main reports `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` as the reasoning model;
- a real production Ask request returned a successful `reasoning` trace with model + latency.

Exact main commit: `19673c690d034a7f6ffbeb63c672b3d0987d50ed`.

Production proof:

- **Phase 16 Production Nebius NVIDIA Trace** run `35991108585` — **SUCCESS**;
- production deployment commit matched exact main;
- Nebius Token Factory was reported as the AI runtime;
- Ask + Action Plan mapped to NVIDIA Nemotron 3 Nano 30B-A3B;
- real production Ask completed through Token Factory with measured latency **15,904 ms**.

Phase 16 is **COMPLETE**.
