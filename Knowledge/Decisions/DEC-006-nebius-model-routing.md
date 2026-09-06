# DEC-006 — Nebius model routing

Date: 2026-09-06
Status: Accepted

## Context

SENTINEL originally targeted `nvidia/nemotron-3-nano-omni` for multimodal perception through Nebius Token Factory.

During the Phase 3 production gate, the live Token Factory catalog available to the deployed `NEBIUS_API_KEY` did not expose that model. The current regional Token Factory endpoint did expose:

- `openbmb/MiniCPM-V-4_5`
- `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
- `nvidia/nemotron-3-super-120b-a12b`
- `nvidia/Nemotron-3-Ultra-550b-a55b`
- `nvidia/Nemotron-3_5-Lightning`

The production runtime must use model IDs that are actually available to the connected account rather than preserving an unavailable design-time assumption.

## Decision

SENTINEL uses a split model route on Nebius Token Factory:

- **Perception:** `openbmb/MiniCPM-V-4_5`
- **Reasoning / Ask:** `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
- **Token Factory base:** `https://api.tokenfactory.us-central1.nebius.com/v1`

The adapter remains provider-generic. The perception boundary supplies the exact SENTINEL JSON contract and normalizes only provider-format differences and trusted scan metadata. Required semantic fields, evidence links, confidence values, categories, and scan identity are still validated.

## Why

1. Both models are available to the deployed Nebius account.
2. MiniCPM-V supplies the visual input capability needed by the Observe pipeline.
3. Nemotron remains in the reasoning path where grounded environmental-memory reasoning is required.
4. This avoids falsely claiming use of an unavailable model.
5. It preserves the architecture boundary so future catalog changes can swap models without rewriting the domain/memory layer.

## Consequences

- `NEBIUS_PERCEPTION_MODEL` configures the visual model and defaults to `openbmb/MiniCPM-V-4_5`.
- `NEBIUS_NEMOTRON_REASONING_MODEL` configures reasoning and defaults to `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`.
- The older global Token Factory URL is treated as legacy and resolves to the current regional endpoint.
- Production verification must report the actual configured model path rather than the earlier Nano Omni assumption.
- Phase 16 may revisit model selection, cost, latency, quality, and routing after the MVP loop is complete.
