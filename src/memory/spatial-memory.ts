import type { EnvironmentalStateSnapshot, EnvironmentRelation, SpatialObject } from '../domain/sentinel'

export interface SpatialGroup {
  id: string
  name: string
  kind: 'room' | 'environment'
  objects: SpatialObject[]
}

export interface SpatialRelationDescription {
  id: string
  label: string
  confidence: number
}

export interface SpatialRelationEdge {
  id: string
  type: EnvironmentRelation['type']
  typeLabel: string
  confidence: number
  outgoing: boolean
  otherId: string
  otherName: string
  otherCategory: SpatialObject['category']
}

export function buildSpatialGroups(snapshot: EnvironmentalStateSnapshot, environmentName: string): SpatialGroup[] {
  const rooms = snapshot.objects.filter((item) => item.category === 'room')
  const objects = snapshot.objects.filter((item) => item.category !== 'room')
  const assigned = new Set<string>()

  const groups: SpatialGroup[] = rooms.map((room) => {
    const roomObjects = objects.filter((item) => {
      if (item.position?.roomId === room.id) return true
      return snapshot.relations.some((relation) =>
        (relation.type === 'located_in' && relation.fromId === item.id && relation.toId === room.id) ||
        (relation.type === 'contains' && relation.fromId === room.id && relation.toId === item.id),
      )
    })
    roomObjects.forEach((item) => assigned.add(item.id))
    return { id: room.id, name: room.name, kind: 'room', objects: sortSpatialObjects(roomObjects, snapshot) }
  })

  const unassigned = objects.filter((item) => !assigned.has(item.id))
  if (rooms.length === 0 || unassigned.length > 0) {
    groups.push({
      id: 'environment:' + snapshot.environmentId,
      name: rooms.length === 0 ? environmentName : 'Other remembered objects',
      kind: 'environment',
      objects: sortSpatialObjects(unassigned.length > 0 ? unassigned : objects, snapshot),
    })
  }

  if (groups.every((group) => group.objects.length === 0) && objects.length > 0) {
    return [{
      id: 'environment:' + snapshot.environmentId,
      name: environmentName,
      kind: 'environment',
      objects: sortSpatialObjects(objects, snapshot),
    }]
  }

  return groups
}

export function focusSpatialGroups(groups: SpatialGroup[], selectedAreaId: string): SpatialGroup[] {
  if (selectedAreaId === 'all') return groups
  const selected = groups.find((group) => group.id === selectedAreaId)
  return selected ? [selected] : groups
}

export function spatialGroupForObject(groups: SpatialGroup[], objectId: string): string | undefined {
  return groups.find((group) => group.id === objectId || group.objects.some((object) => object.id === objectId))?.id
}

export function sortSpatialObjects(objects: SpatialObject[], snapshot: EnvironmentalStateSnapshot): SpatialObject[] {
  const score = (item: SpatialObject) => {
    if (snapshot.issues.some((issue) => issue.objectIds.includes(item.id) && issue.status !== 'resolved' && issue.status !== 'dismissed')) return 0
    if (snapshot.conditions.some((condition) => condition.objectIds.includes(item.id) && condition.kind !== 'normal')) return 1
    if (['safety', 'electrical', 'equipment', 'door', 'obstruction'].includes(item.category)) return 2
    return 3
  }
  return [...objects].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
}

export function spatialObjectTone(item: SpatialObject, snapshot: EnvironmentalStateSnapshot): 'attention' | 'condition' | 'normal' {
  if (snapshot.issues.some((issue) => issue.objectIds.includes(item.id) && issue.status !== 'resolved' && issue.status !== 'dismissed')) return 'attention'
  if (snapshot.conditions.some((condition) => condition.objectIds.includes(item.id) && condition.kind !== 'normal')) return 'condition'
  return 'normal'
}

export function spatialObjectSubtitle(item: SpatialObject): string {
  const parts: string[] = [item.category]
  if (item.state) parts.push(item.state)
  else if (item.position?.description) parts.push(item.position.description)
  return parts.join(' · ')
}

export function describeSpatialRelations(item: SpatialObject, snapshot: EnvironmentalStateSnapshot): SpatialRelationDescription[] {
  const names = new Map(snapshot.objects.map((object) => [object.id, object.name]))
  return snapshot.relations
    .filter((relation) => relation.fromId === item.id || relation.toId === item.id)
    .map((relation) => {
      const outgoing = relation.fromId === item.id
      const otherId = outgoing ? relation.toId : relation.fromId
      const otherName = names.get(otherId) ?? 'remembered entity'
      const relationLabel = relationTypeLabel(relation.type)
      return {
        id: relation.id,
        label: outgoing ? relationLabel + ' → ' + otherName : otherName + ' → ' + relationLabel,
        confidence: relation.confidence,
      }
    })
}

export function buildSpatialRelationEdges(item: SpatialObject, snapshot: EnvironmentalStateSnapshot): SpatialRelationEdge[] {
  const objects = new Map(snapshot.objects.map((object) => [object.id, object]))
  return snapshot.relations
    .flatMap((relation): SpatialRelationEdge[] => {
      if (relation.fromId !== item.id && relation.toId !== item.id) return []
      const outgoing = relation.fromId === item.id
      const otherId = outgoing ? relation.toId : relation.fromId
      const other = objects.get(otherId)
      if (!other) return []
      return [{
        id: relation.id,
        type: relation.type,
        typeLabel: relationTypeLabel(relation.type),
        confidence: relation.confidence,
        outgoing,
        otherId,
        otherName: other.name,
        otherCategory: other.category,
      }]
    })
    .sort((a, b) => b.confidence - a.confidence || a.typeLabel.localeCompare(b.typeLabel) || a.otherName.localeCompare(b.otherName))
}

function relationTypeLabel(type: EnvironmentRelation['type']): string {
  return type.replace(/_/g, ' ')
}
