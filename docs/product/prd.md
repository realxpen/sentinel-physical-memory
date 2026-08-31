# SENTINEL Product Requirements Document

## 1. Product

**SENTINEL — AI Memory for the Physical World**

SENTINEL gives a physical environment persistent operational memory. A user provides a walkthrough video or images; SENTINEL extracts evidence, builds a structured environmental state, answers questions about the environment, identifies important conditions, proposes actions, and compares later observations against prior state.

## 2. Primary user

Facility / operations managers responsible for small-to-medium commercial spaces such as offices, schools, clinics, hotels, coworking spaces, or retail facilities.

For the hackathon MVP, the reference environment is a **single office**.

## 3. Core problem

Physical-space knowledge is fragmented across human memory, photos, inspection notes, messaging, spreadsheets, maintenance records, and separate systems. Managers need to know what exists, what matters, what changed, what should happen next, and whether a change was actually resolved.

## 4. Value proposition

> SENTINEL gives physical spaces a persistent AI memory — allowing them to be scanned, understood, queried, acted upon, and verified over time.

## 5. Core user journey

1. **Scan** — user uploads/captures a short walkthrough.
2. **Understand** — multimodal inference extracts spaces, objects, conditions, text, and evidence.
3. **Remember** — observations are normalized into a persistent environmental state.
4. **Ask** — user asks natural-language questions.
5. **Reason** — agents retrieve relevant state/history and prioritize issues.
6. **Act** — SENTINEL produces an actionable plan/work order draft.
7. **Rescan** — user provides a later observation.
8. **Verify** — SENTINEL compares states and reports new, resolved, moved, and changed entities.

## 6. Signature experience: Ask the Building

Users can ask questions such as:

- “What needs attention?”
- “Where is the main electrical panel?”
- “What did you see near it?”
- “What changed since the previous scan?”
- “Which unresolved issue should I handle first?”
- “Create a plan to resolve the issues.”

Answers should cite the underlying observation/evidence where practical.

## 7. Signature wow moment: Physical Git Diff

SENTINEL presents scan-to-scan environmental changes using a familiar diff metaphor:

- **NEW** — newly observed entity or condition.
- **RESOLVED** — previously observed condition no longer present.
- **MOVED** — entity location changed.
- **CHANGED** — relevant state changed.
- **UNCHANGED** — persistent observations remain stable.

The demo should intentionally alter a controlled office environment between two scans and show the resulting diff.

## 8. Functional requirements

### FR-1 Capture
Accept a short walkthrough video and/or image set for analysis.

### FR-2 Multimodal observation
Produce structured observations with entity type, approximate location/context, state, confidence, and evidence reference.

### FR-3 Environmental state
Persist normalized entities, relationships, observations, timestamps, and evidence references.

### FR-4 Retrieval
Retrieve relevant current and historical environmental facts for a user query.

### FR-5 Reasoning
Generate prioritized, evidence-backed explanations and action plans.

### FR-6 Natural-language interaction
Allow users to ask questions without requiring domain-specific query syntax.

### FR-7 Comparison
Compare a current environmental state with a previous state and classify meaningful differences.

### FR-8 Verification
After a follow-up scan, determine which previously identified conditions appear resolved, remain, or changed.

### FR-9 Confidence and provenance
Expose confidence/provenance for important observations and distinguish observed, inferred, and recommended content.

### FR-10 NVIDIA/Nebius runtime
Use at least one NVIDIA open-source model through a real Nebius Token Factory or Nebius AI Cloud runtime path in the working application.

## 9. Non-functional requirements

- The demo path must be reproducible.
- Core APIs should return structured JSON contracts.
- Inference failures should produce useful error states rather than silent fabrication.
- Secrets must be environment variables.
- Important AI claims should retain evidence references.
- The MVP should be deployable with documented setup instructions.

## 10. Out of scope for MVP

- Contractor marketplace.
- Payments.
- Autonomous physical repair.
- Robotics control.
- IoT fleet management.
- Professional building certification.
- Full BIM replacement.
- Enterprise multi-tenancy.
- Complex authentication/permissions.
- Full facility-management suite.

## 11. Hackathon positioning

**Track:** Best Apps and Agents.

The project should demonstrate a real application powered by NVIDIA/Nemotron models through Nebius infrastructure. NVIDIA models are core to multimodal perception, specialist analysis, orchestration, and difficult reasoning rather than a decorative chatbot.

## 12. Success criteria

The MVP succeeds when a judge can see, in one short flow:

1. A real environment is scanned.
2. SENTINEL builds a useful structured memory.
3. The user asks a meaningful question and receives an evidence-backed answer.
4. The environment is deliberately changed.
5. A second scan is processed.
6. SENTINEL identifies the meaningful change and explains why it matters.

The central product claim should be demonstrated, not merely described:

> **SENTINEL doesn't just see a room — it remembers the room and knows when it changes.**
