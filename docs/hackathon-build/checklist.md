# SENTINEL Build Checklist

## Build mode

- Mode: autonomous implementation with verification checkpoints.
- Verification: stop after major vertical slices and validate before proceeding.
- Git cadence: small commits at each completed milestone.
- Priority: de-risk the real multimodal/Nebius path early.

## Wow moment

The judge watches SENTINEL scan an office, build persistent environmental memory, answer a question about the environment, then process a second scan and show a clear **NEW / RESOLVED / MOVED / CHANGED** physical-world diff.

## Build sequence

- [ ] **1. Bootstrap the application shell**
  Spec ref: `spec.md > System boundary > Web client`
  What to build: Create the initial web app structure, environment configuration, typed API/client boundary, health endpoint, and a clean SENTINEL shell.
  Acceptance: The app starts locally, the landing/dashboard renders, and `/api/health` reports a healthy service.
  Verify: Run the documented dev command and manually load the dashboard and health endpoint.

- [ ] **2. Define environmental data contracts**
  Spec ref: `spec.md > Environmental state schema`
  What to build: Implement typed schemas for scans, spaces, entities, observations, evidence, issues, actions, relationships, and diff events.
  Acceptance: Valid records pass schema validation; malformed confidence, classification, timestamps, and diff types are rejected.
  Verify: Run schema/unit tests and inspect representative JSON fixtures.

- [ ] **3. Build persistent environmental memory**
  Spec ref: `spec.md > Memory model`
  What to build: Add storage for scans and normalized environmental state with historical retrieval by scan/time.
  Acceptance: A processed scan can create state, the state survives a restart, and previous scan state remains retrievable.
  Verify: Run persistence tests, create a fixture scan, restart the service, and retrieve it again.

- [ ] **4. Integrate the real Nebius/NVIDIA inference adapter**
  Spec ref: `spec.md > Model strategy > Nebius integration`
  What to build: Implement a provider adapter and real runtime path for the selected NVIDIA open-source model through Nebius Token Factory or Nebius AI Cloud.
  Acceptance: A configured credential produces a real model response; provider/model metadata is captured; missing credentials fail clearly without fabricated inference.
  Verify: Run the inference health/smoke test with a real configured environment and inspect logs/response metadata.

- [ ] **5. Implement multimodal scan processing**
  Spec ref: `spec.md > Model strategy > Nemotron 3 Nano Omni`
  What to build: Accept a short video/image set, sample useful frames, call multimodal inference, parse structured observations, and attach evidence references.
  Acceptance: A demo scan produces structured spaces/entities/conditions with confidence and evidence references.
  Verify: Process the controlled office fixture and inspect the persisted observation records.

- [ ] **6. Build the Environment Memory UI**
  Spec ref: `spec.md > Frontend experience`
  What to build: Show scan status, spaces, entities, issues, confidence, and evidence in a coherent product interface.
  Acceptance: A user can understand the current environment without seeing internal agent implementation details.
  Verify: Manually inspect the fixture scan on desktop/mobile viewport and confirm evidence can be opened.

- [ ] **7. Implement Ask the Building**
  Spec ref: `spec.md > Retrieval` and `spec.md > Agent contracts > Reasoning Agent`
  What to build: Add natural-language environment questions with current/history retrieval and evidence-backed reasoning using the Nebius/Nemotron path.
  Acceptance: Questions such as “What needs attention?”, “Where is the main electrical panel?”, and “What changed?” return grounded answers with supporting evidence.
  Verify: Run retrieval/reasoning integration tests and manually ask the demo questions.

- [ ] **8. Implement action planning**
  Spec ref: `spec.md > Agent contracts > Action Agent`
  What to build: Convert prioritized issues into an ordered action plan with specialist category, rationale, and assumptions.
  Acceptance: The plan is derived from identified issues, distinguishes recommendations from observations, and does not claim autonomous repair.
  Verify: Run action-plan tests and inspect the generated plan in the UI.

- [ ] **9. Build scan-to-scan comparison and verification**
  Spec ref: `spec.md > Comparison algorithm` and `spec.md > Agent contracts > Verification Agent`
  What to build: Match entities between scans and classify new, resolved, moved, changed, unchanged, or uncertain states with evidence.
  Acceptance: The controlled second scan produces at least one meaningful intentional change and does not falsely certify an unsupported resolution.
  Verify: Process fixture scan A and scan B, run comparison tests, and inspect the resulting diff.

- [ ] **10. Create the Physical Git Diff experience**
  Spec ref: `spec.md > Frontend experience` and `spec.md > Comparison algorithm`
  What to build: Create the signature visual diff/timeline showing NEW, RESOLVED, MOVED, CHANGED, and evidence.
  Acceptance: A judge can immediately understand what changed and why the highest-priority change matters.
  Verify: Replay the complete scan-A → intentional-change → scan-B flow and review the screen recording.

- [ ] **11. Harden, deploy, and prepare judging materials**
  Spec ref: `spec.md > Testing strategy` and `spec.md > Deployment requirements`
  What to build: Add end-to-end checks, error states, deployment configuration, README run instructions, NVIDIA/Nebius usage notes, and a reproducible demo path.
  Acceptance: A fresh tester can run the project using the README, the public deployment works, and the complete demo loop is reproducible.
  Verify: Perform a clean-environment setup, run tests, deploy, and execute the full judge journey.

- [ ] **12. Devpost handoff**
  Spec ref: `spec.md > Definition of done`
  What to build: Prepare final submission text, track selection, repository URL, working demo URL, testing instructions, video, NVIDIA/Nebius usage explanation, feedback, and any required pre-existing-project update explanation.
  Acceptance: Every required submission field has a concrete, truthful value and the final demo proves the product thesis within three minutes.
  Verify: Complete a submission dry run from the public Devpost page using only the final materials.
