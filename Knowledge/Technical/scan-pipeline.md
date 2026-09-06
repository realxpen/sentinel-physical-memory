# Observation / Scan Pipeline

## Current path

```text
walkthrough video
  ↓
browser-side frame extraction
  ↓
selected JPEG evidence frames
  ↓
POST /api/scan
  ↓
Nebius/Nemotron multimodal inference
  ↓
validated PerceptionResult
  ↓
EnvironmentalMemoryStore.ingestScan
  ↓
new EnvironmentalState
  ↓
optional diff against previous state
```

The current frontend uses a maximum of roughly 12 extracted frames, constrains width, and reduces JPEG quality before the API call.

## Target MVP behavior

Input target: **30–60 second phone walkthrough**.

Evidence target: **8–12 useful frames**.

Hardening should add:

- scene-difference/key-frame selection
- duplicate-frame filtering
- stable resizing/compression
- MIME validation
- low-light/poor-input handling
- body/upload limit handling
- deterministic evidence IDs
- useful timeout/retry/error states

## Perception contract

Perception should return supported:

- areas/rooms
- objects/assets
- conditions
- approximate locations
- relationships
- evidence
- confidence

Every important returned object/observation must reference valid evidence.

## Product status language

Use cognitive stages rather than arbitrary percentages:

`Observing → Understanding → Remembering`

## Reliability rule

If perception cannot support a claim from the selected evidence, the pipeline should return uncertainty/insufficient evidence rather than fabricate a complete room model.
