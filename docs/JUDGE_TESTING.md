# Judge Testing Guide

## Fastest path

Open:

https://sentinel-physical-memory.vercel.app

No account or login is required.

SENTINEL is designed for normal desktop/mobile browsers. A phone camera is useful, but judges can also select existing images.

## 1. Create a location

Use **+ New location** and create a simple test space, for example:

`Judge Office`

Each location has an independent environment ID and memory history.

## 2. Create the first memory

Open **Observe** and choose a clear photo.

Good test images have:

- a stable room/hallway viewpoint;
- a few easy-to-identify objects;
- good lighting;
- no extreme motion blur.

SENTINEL should create **State v1** and return to Memory.

## 3. Create a physical change

Change something visually obvious. Examples:

- add a cardboard box to a walkway;
- move a chair;
- move a portable safety item;
- open/close a clearly visible door.

Capture/upload a new photo from roughly the same viewpoint.

SENTINEL creates the next immutable state and opens **Changes** when a Reality Diff exists.

## 4. Inspect Reality Diff

Look for the **What changed.** experience.

SENTINEL deliberately distinguishes:

- supported physical changes;
- attention-worthy conditions;
- resolved changes;
- items that only need verification.

Missing an item in one image is not automatically treated as removal.

## 5. Ask the Building

Try:

- **What changed since the last scan?**
- **Which change matters most?**
- **What should I do?**
- **Has it been resolved?**

The answer should expose confidence and grounded evidence rather than an untraceable chat response.

## 6. Action Plan

When the selected state contains an actionable grounded condition, use **What should I do?**

The Action Plan should remain **Recommended**, not claim that work happened, and end with a rescan/verification handoff.

## 7. Verify

Correct the physical condition and upload a new observation.

If SENTINEL has enough positive current evidence from the same physical object/area, use **Verify prior condition**.

Expected final states are:

- Verified;
- Partially resolved;
- Not resolved;
- Verification inconclusive.

An inconclusive result is intentional when evidence is insufficient.

## What to expect from inference

Nebius Token Factory is on the live inference path. Model latency varies. The exact-main Phase 16 production proof measured one Ask request at about 15.9 seconds.

Do not interpret a conservative/inconclusive result as a frontend failure. SENTINEL is designed to preserve uncertainty rather than fabricate certainty.

## Reliability checks

Useful product behaviors to inspect:

- reload the page after creating memory: the environment is restored from Neon;
- upload the same/similar state again: **No material change detected** is a valid result;
- request a missing historical state: the product fails with a readable message;
- disconnect/reconnect networking: incomplete inference is not presented as completed.

## API/runtime inspection

`GET /api/health` exposes non-secret diagnostics including:

- persistence configuration;
- Nebius configuration;
- deployment commit;
- Token Factory provider;
- role → model mapping.

Successful Scan / Ask / Action Plan / Verification responses also expose a request-local `inference` array with model, role, latency and outcome.

No secrets are included.

## Test constraints

SENTINEL is not a safety certification tool. It should not be used as the sole basis for professional fire, electrical, structural, regulatory, or medical decisions.

The hackathon demo is free to access for judging.
