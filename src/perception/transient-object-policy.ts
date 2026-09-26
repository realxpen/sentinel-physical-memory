import type { PerceptionResult } from '../domain/sentinel.js'
import { isTransientEnvironmentalObject } from '../domain/object-policy.js'

const PERSON_OBSERVATION_LABEL = /^(?:a |an |the )?(?:person|people|human|occupant|occupants|worker|workers|employee|employees|staff member|staff)(?:\s+(?:visible|present|seen|standing|sitting|walking))?$/i

export function stripTransientEnvironmentalPeople(result: PerceptionResult): {
  result: PerceptionResult
  droppedObjectIds: string[]
  droppedObservationIds: string[]
} {
  const droppedObjects = result.objects.filter(isTransientEnvironmentalObject)
  if (droppedObjects.length === 0) {
    return { result, droppedObjectIds: [], droppedObservationIds: [] }
  }

  const droppedObjectIds = new Set(droppedObjects.map((item) => item.id))
  const droppedObservations = result.observations.filter((item) => PERSON_OBSERVATION_LABEL.test(item.label.trim()))
  const droppedObservationIds = new Set(droppedObservations.map((item) => item.id))

  const conditions = result.conditions.flatMap((item) => {
    if (item.objectIds.some((id) => droppedObjectIds.has(id))) return []
    return [item]
  })

  const relations = result.relations.filter((item) =>
    !droppedObjectIds.has(item.fromId) && !droppedObjectIds.has(item.toId),
  )

  return {
    result: {
      ...result,
      observations: result.observations.filter((item) => !droppedObservationIds.has(item.id)),
      objects: result.objects.filter((item) => !droppedObjectIds.has(item.id)),
      conditions,
      relations,
    },
    droppedObjectIds: [...droppedObjectIds],
    droppedObservationIds: [...droppedObservationIds],
  }
}
