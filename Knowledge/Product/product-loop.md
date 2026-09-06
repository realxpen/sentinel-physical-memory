# Product Loop

The entire MVP is organized around one stateful loop.

## 1. Observe

User records/selects a short walkthrough. SENTINEL captures a constrained evidence set rather than sending every video frame.

## 2. Understand

Multimodal inference extracts supported areas, objects, conditions, relationships, visible text and evidence references.

## 3. Remember

Structured observations are normalized into an immutable environmental state and durable environment memory.

## 4. Ask

The user asks a contextual question about the environment rather than interacting with a generic chatbot.

## 5. Reason

SENTINEL retrieves the relevant current state, history, relations, conditions, diffs and evidence, then returns a grounded conclusion.

## 6. Act

SENTINEL produces a small ordered action plan tied to the relevant condition/evidence. Execution remains human-controlled.

## 7. Rescan

The environment is observed again after a change or action.

## 8. Verify

SENTINEL compares the new state with prior state, classifies changes, checks the target condition, and writes the new state/diff/verification back to memory.

## Closed-loop invariant

Every new scan must create a new historical state. New state must not overwrite what a prior state believed.

## Signature proof

> **The same environment can be understood at time A, changed, understood at time B, and SENTINEL can explain the supported difference.**
