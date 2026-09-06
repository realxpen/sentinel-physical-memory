# Domain Model

## Environment

A remembered physical place.

Key fields:

- `id`
- name / label
- `currentStateId`
- state history
- object/room/condition references
- created/updated timestamps

## EnvironmentalState

Immutable snapshot created by each accepted scan.

Required concepts:

- `id`
- `environmentId`
- `capturedAt`
- `version`
- `sourceIds`
- `objectIds`
- `condition/issueIds`
- `relationIds`
- summary

A later scan must create a new state rather than mutating an old state's meaning.

## SpatialObject

Remembered entity/area/asset.

Key concepts:

- stable identity when possible
- category / normalized name
- approximate semantic location
- state
- confidence
- first/last seen
- evidence IDs

## Observation

A scan-specific evidence-backed statement about the environment.

Key concepts:

- source/scan identity
- environment identity
- label/description
- classification (`observed` where directly grounded)
- confidence
- position/context
- evidence IDs

## Condition / Issue

Operational condition derived from supported observations. The model must not collapse observation and diagnosis into one fact.

Use conceptual layers:

- observed condition
- inferred interpretation
- recommended action

## Evidence

Reference to the frame/media region that supports an observation/change/answer.

Important claims should retain one or more evidence IDs.

## Relation

Semantic connection between remembered entities, for example:

- located_in
- near
- adjacent_to
- contains

Metric geometry is not required for MVP.

## EnvironmentalDiff

Comparison between two immutable states.

Contains:

- `fromStateId`
- `toStateId`
- change list
- summary
- confidence/evidence references

Supported change types:

`added | removed | moved | changed | resolved | uncertain`

## ActionPlan

Minimal ordered human-action contract:

- priority
- description
- related condition IDs
- evidence IDs
- status

## VerificationResult

Outcome after a follow-up observation:

`passed | partial | failed | inconclusive`

Should include resolved, remaining and newly observed condition IDs plus evidence and summary.
