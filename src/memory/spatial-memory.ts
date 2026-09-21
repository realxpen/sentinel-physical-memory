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

interface SpatialIdentityCandidate {
  label: string
  normalized: string
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

export function buildSpatialObjectDisplayNames(snapshot: EnvironmentalStateSnapshot): Map<string, string> {
  const displayNames = new Map(snapshot.objects.map((item) => [item.id, item.name]))
  const repeatedByName = new Map<string, SpatialObject[]>()

  for (const item of snapshot.objects) {
    if (item.category === 'room') continue
    const normalizedName = normalizeIdentityText(item.name)
    if (!normalizedName) continue
    const group = repeatedByName.get(normalizedName) ?? []
    group.push(item)
    repeatedByName.set(normalizedName, group)
  }

  for (const repeated of repeatedByName.values()) {
    if (repeated.length < 2) continue

    const candidatesByObject = new Map(repeated.map((item) => [item.id, spatialIdentityCandidates(item, snapshot)]))
    const ownersByCandidate = new Map<string, Set<string>>()

    for (const [objectId, candidates] of candidatesByObject) {
      for (const candidate of candidates) {
        const owners = ownersByCandidate.get(candidate.normalized) ?? new Set<string>()
        owners.add(objectId)
        ownersByCandidate.set(candidate.normalized, owners)
      }
    }

    for (const item of repeated) {
      const uniqueCandidate = (candidatesByObject.get(item.id) ?? [])
        .find((candidate) => ownersByCandidate.get(candidate.normalized)?.size === 1)
      if (uniqueCandidate) displayNames.set(item.id, item.name + ' · ' + uniqueCandidate.label)
    }
  }

  return displayNames
}

function spatialIdentityCandidates(item: SpatialObject, snapshot: EnvironmentalStateSnapshot): SpatialIdentityCandidate[] {
  const candidates: SpatialIdentityCandidate[] = []
  const objectsById = new Map(snapshot.objects.map((object) => [object.id, object]))
  const nameCounts = new Map<string, number>()
  for (const object of snapshot.objects) {
    const normalized = normalizeIdentityText(object.name)
    nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1)
  }

  for (const relation of snapshot.relations) {
    if (relation.fromId !== item.id && relation.toId !== item.id) continue
    const outgoing = relation.fromId === item.id
    const otherId = outgoing ? relation.toId : relation.fromId
    const other = objectsById.get(otherId)
    if (!other) continue

    if (other.category === 'room') {
      const isMembership =
        (relation.type === 'located_in' && outgoing) ||
        (relation.type === 'contains' && !outgoing)
      if (isMembership) pushIdentityCandidate(candidates, other.name, item.name)
      continue
    }

    if ((nameCounts.get(normalizeIdentityText(other.name)) ?? 0) !== 1) continue
    const relationLabel = identityRelationQualifier(relation.type, outgoing, other.name)
    if (relationLabel) pushIdentityCandidate(candidates, relationLabel, item.name)
  }

  const roomId = item.position?.roomId
  if (roomId) {
    const room = objectsById.get(roomId)
    if (room?.category === 'room') pushIdentityCandidate(candidates, room.name, item.name)
  }

  if (item.position?.description) {
    const position = compactGroundedPosition(item.position.description)
    if (position) pushIdentityCandidate(candidates, position, item.name)
  }

  return candidates
}

function identityRelationQualifier(type: EnvironmentRelation['type'], outgoing: boolean, otherName: string): string | undefined {
  if (type === 'near') return 'near ' + otherName
  if (type === 'adjacent_to') return 'adjacent to ' + otherName
  if (!outgoing) return undefined
  if (type === 'attached_to') return 'attached to ' + otherName
  if (type === 'part_of') return 'part of ' + otherName
  if (type === 'on') return 'on ' + otherName
  if (type === 'above') return 'above ' + otherName
  if (type === 'below') return 'below ' + otherName
  if (type === 'in_front_of') return 'in front of ' + otherName
  if (type === 'behind') return 'behind ' + otherName
  if (type === 'left_of') return 'left of ' + otherName
  if (type === 'right_of') return 'right of ' + otherName
  return undefined
}

function compactGroundedPosition(value: string): string | undefined {
  const compact = value.replace(/\s+/g, ' ').trim().replace(/[.;,:]+$/, '')
  const normalized = normalizeIdentityText(compact)
  if (!normalized) return undefined
  if (['unknown', 'unspecified', 'not specified', 'visible', 'present', 'same position', 'no grounded position'].includes(normalized)) return undefined
  return compact
}

function pushIdentityCandidate(candidates: SpatialIdentityCandidate[], label: string, objectName: string): void {
  const normalized = normalizeIdentityText(label)
  if (!normalized || normalized === normalizeIdentityText(objectName)) return
  if (candidates.some((candidate) => candidate.normalized === normalized)) return
  candidates.push({ label: label.trim(), normalized })
}

function normalizeIdentityText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
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

export function describeSpatialRelations(item: SpatialObject, snapshot: EnvironmentalStateSnapshot, displayNames = buildSpatialObjectDisplayNames(snapshot)): SpatialRelationDescription[] {
  return snapshot.relations
    .filter((relation) => relation.fromId === item.id || relation.toId === item.id)
    .map((relation) => {
      const outgoing = relation.fromId === item.id
      const otherId = outgoing ? relation.toId : relation.fromId
      const otherName = displayNames.get(otherId) ?? snapshot.objects.find((object) => object.id === otherId)?.name ?? 'remembered entity'
      const relationLabel = relationTypeLabel(relation.type)
      return {
        id: relation.id,
        label: outgoing ? relationLabel + ' → ' + otherName : otherName + ' → ' + relationLabel,
        confidence: relation.confidence,
      }
    })
}

export function buildSpatialRelationEdges(item: SpatialObject, snapshot: EnvironmentalStateSnapshot, displayNames = buildSpatialObjectDisplayNames(snapshot)): SpatialRelationEdge[] {
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
        otherName: displayNames.get(other.id) ?? other.name,
        otherCategory: other.category,
      }]
    })
    .sort((a, b) => b.confidence - a.confidence || a.typeLabel.localeCompare(b.typeLabel) || a.otherName.localeCompare(b.otherName))
}

function relationTypeLabel(type: EnvironmentRelation['type']): string {
  return type.replace(/_/g, ' ')
}
