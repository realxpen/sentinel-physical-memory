# Multi-Environment Physical Memory

Date: 2026-09-15
Status: **IMPLEMENTED FOR LOCAL PRODUCT FLOW**

## Product rule

SENTINEL memory is scoped to a physical environment.

A rescan of the same office must extend that office's history. A scan of a different office, warehouse, clinic, retail floor, or other location must create or update a different environmental memory.

Canonical behavior:

`Location A → State A1 → State A2 → Reality Diff A1→A2`

`Location B → State B1 → State B2 → Reality Diff B1→B2`

Location A and Location B must never share state histories, diffs, questions, or current-state pointers simply because the same browser is being used.

## Current implementation

The frontend now has a location switcher and an `Add another location` control.

Each location profile has:

- a stable environment ID;
- a user-facing name;
- an `EnvironmentType`;
- an independent active memory read through `/api/memory?environmentId=...`.

The existing Phase 3/4 demo memory remains available as:

- ID: `office-demo`
- display name: `Office 01`

New locations receive IDs like:

`env_head-office_<short-uuid>`

The browser keeps the location directory and selected-location preference in local storage. The actual environmental memory for every scanned location remains server-authoritative through the existing `EnvironmentalMemoryRepository` and Neon persistence path.

## Scan behavior

When a walkthrough is submitted, the selected location's ID is sent as `environmentId`.

The scan source also carries safe metadata:

- `name`
- `environmentType`

If the selected environment has no prior memory, `ScanPipeline` creates a new `Environment` using that metadata and the first successful scan becomes State v1.

If prior memory exists, the scan continues that environment's state history and may generate a Reality Diff against its previous state.

## Important UX semantics

Seeing prior scans after opening SENTINEL is correct only when the same environment is selected.

To scan a different physical place:

1. add or select another location;
2. confirm the new location shows no saved memory yet;
3. upload/record its walkthrough;
4. SENTINEL creates State v1 for that location;
5. switching back to the old location restores the old history unchanged.

## Current limitation

The location directory itself is currently browser-local. This is sufficient for the local hackathon/demo workflow because the underlying memories are still isolated and durable in Neon by environment ID.

A later server-side environment directory can make all known locations discoverable across devices/accounts without depending on local storage. That should be added when authentication/organization ownership is introduced; it should not weaken the existing environment-scoped memory contract.
